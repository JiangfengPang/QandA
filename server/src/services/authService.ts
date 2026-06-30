import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserRole, type UserRole as UserRoleType } from '../utils/roles.js';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { HttpError } from '../utils/http.js';
import { sendPasswordResetCode } from './mailService.js';
import { createCsrfToken, type ClientApp } from '../utils/cookie.js';
import { validatePasswordStrength } from '../utils/passwordPolicy.js';
import { assertQqEmail, checkEmailCode, sendEmailCode, verifyEmailCode } from './emailVerificationService.js';
import { removeLocalAvatarIfOwned, saveAvatarFromDataUrl } from './avatarStorage.js';
import { createVerificationCode } from '../utils/verificationCode.js';
import { assertAllowedNickname } from '../utils/nicknamePolicy.js';
import { assertUserLoginAllowed } from './systemControlService.js';

export type UserPreferences = {
  autoShowExplanation: boolean;
  autoAddWrong: boolean;
  autoAdvanceOnCorrect: boolean;
  questionFontSize: 'small' | 'standard' | 'large';
  showQuestionOverview: boolean;
  speechVoiceKey: string;
};

const questionFontSizes = ['small', 'standard', 'large'] as const;

export async function createToken(
  user: { id: string; username: string; role: UserRoleType; sessionVersion?: number },
  audience: ClientApp
) {
  const csrfToken = createCsrfToken();
  const token = jwt.sign(
    {
      userId: user.id,
      username: user.username,
      role: user.role,
      csrfToken,
      audience,
      sessionVersion: user.sessionVersion ?? 0
    },
    env.jwtSecret,
    { expiresIn: audience === 'admin' ? '4h' : '7d' }
  );
  return { token, csrfToken, audience };
}

function normalizeEmail(value?: string | null) {
  const email = String(value || '').trim().toLowerCase();
  return email || null;
}

function assertStrongPassword(password: string) {
  const message = validatePasswordStrength(password);
  if (message) throw new HttpError(message, 400);
}

function normalizePreferences(input: Partial<UserPreferences>): Partial<UserPreferences> {
  const data: Partial<UserPreferences> = {};
  if (typeof input.autoShowExplanation === 'boolean') data.autoShowExplanation = input.autoShowExplanation;
  if (typeof input.autoAddWrong === 'boolean') data.autoAddWrong = input.autoAddWrong;
  if (typeof input.autoAdvanceOnCorrect === 'boolean') data.autoAdvanceOnCorrect = input.autoAdvanceOnCorrect;
  if (typeof input.showQuestionOverview === 'boolean') data.showQuestionOverview = input.showQuestionOverview;
  if (input.questionFontSize && questionFontSizes.includes(input.questionFontSize)) data.questionFontSize = input.questionFontSize;
  if (typeof input.speechVoiceKey === 'string') data.speechVoiceKey = input.speechVoiceKey.trim().slice(0, 220);
  return data;
}

export async function sendRegisterCode(input: { email: string }) {
  await assertUserLoginAllowed();
  const email = assertQqEmail(input.email);
  const existed = await prisma.user.findFirst({ where: { OR: [{ email }, { username: email }] }, select: { id: true } });
  if (existed) throw new HttpError('该 QQ 邮箱已注册', 409);
  return sendEmailCode({ email, purpose: 'REGISTER' });
}

export async function registerUser(input: { nickname: string; email: string; code: string; password: string }) {
  await assertUserLoginAllowed();
  const email = assertQqEmail(input.email);
  const nickname = assertAllowedNickname(input.nickname, { emptyMessage: '请输入昵称' });
  assertStrongPassword(input.password);

  await verifyEmailCode({ email, purpose: 'REGISTER', code: input.code });

  const existed = await prisma.user.findFirst({ where: { OR: [{ email }, { username: email }] } });
  if (existed) throw new HttpError('该 QQ 邮箱已注册', 409);

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: {
      username: email, // 内部兼容旧数据结构；前端不再展示/要求用户名
      email,
      passwordHash,
      nickname,
      role: UserRole.STUDENT,
      lastActiveAt: new Date()
    }
  });
  const session = await createToken(user, 'user');
  return { ...session, user: publicUser(user) };
}

export async function loginUser(input: { email?: string; username?: string; password: string; adminOnly?: boolean }) {
  let user;

  if (input.adminOnly) {
    const account = String(input.username || input.email || '').trim();
    if (!account) throw new HttpError('请输入管理员账号', 400);

    user = await prisma.user.findFirst({
      where: account.includes('@')
        ? { email: account.toLowerCase(), role: UserRole.ADMIN }
        : { username: account, role: UserRole.ADMIN }
    });

    if (!user || !user.isActive) throw new HttpError('管理员账号或密码错误', 401);
  } else {
    await assertUserLoginAllowed();
    const email = assertQqEmail(String(input.email || ''));
    user = await prisma.user.findFirst({ where: { email, role: UserRole.STUDENT } });

    if (!user || !user.isActive) throw new HttpError('QQ 邮箱或密码错误', 401);
  }

  const matched = await bcrypt.compare(input.password, user.passwordHash);
  if (!matched) throw new HttpError(input.adminOnly ? '管理员账号或密码错误' : 'QQ 邮箱或密码错误', 401);

  if (user.role === UserRole.STUDENT) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() }
    });
  }

  const session = await createToken(user, input.adminOnly ? 'admin' : 'user');
  return { ...session, user: publicUser(user) };
}

export async function updateProfile(userId: string, input: { nickname?: string; avatarUrl?: string | null }) {
  const current = await prisma.user.findUnique({ where: { id: userId } });
  if (!current) throw new HttpError('用户不存在', 404);

  const data: { nickname?: string; avatarUrl?: string | null } = {};

  if (typeof input.nickname !== 'undefined') {
    data.nickname = assertAllowedNickname(input.nickname, { emptyMessage: '昵称不能为空' });
  }

  if (typeof input.avatarUrl !== 'undefined') {
    const avatarUrl = String(input.avatarUrl || '').trim();

    if (!avatarUrl) {
      await removeLocalAvatarIfOwned(userId, current.avatarUrl);
      data.avatarUrl = null;
    } else if (avatarUrl.startsWith('/uploads/avatars/')) {
      if (avatarUrl !== current.avatarUrl) throw new HttpError('不能使用其他账号的头像文件', 400);
      data.avatarUrl = avatarUrl;
    } else {
      const savedAvatarUrl = await saveAvatarFromDataUrl(userId, avatarUrl);
      await removeLocalAvatarIfOwned(userId, current.avatarUrl);
      data.avatarUrl = savedAvatarUrl;
    }
  }

  if (!Object.keys(data).length) throw new HttpError('没有需要更新的资料', 400);

  const user = await prisma.user.update({ where: { id: userId }, data });
  return publicUser(user);
}

export async function verifyPasswordChangeCode(userId: string, input: { code: string }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.email) throw new HttpError('请先绑定 QQ 邮箱', 400);
  await checkEmailCode({ email: user.email, purpose: 'PASSWORD_CHANGE', code: input.code });
  return { verified: true };
}

export async function sendPasswordChangeCode(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.email) throw new HttpError('请先绑定 QQ 邮箱', 400);
  return sendEmailCode({ email: user.email, purpose: 'PASSWORD_CHANGE' });
}

export async function sendCurrentEmailCode(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.email) throw new HttpError('当前账号尚未绑定 QQ 邮箱', 400);
  return sendEmailCode({ email: user.email, purpose: 'EMAIL_CHANGE_OLD' });
}

export async function sendNewEmailCode(userId: string, input: { email: string }) {
  const email = assertQqEmail(input.email);
  const existed = await prisma.user.findFirst({ where: { email, NOT: { id: userId } }, select: { id: true } });
  if (existed) throw new HttpError('该 QQ 邮箱已被其他账号绑定', 409);
  return sendEmailCode({ email, purpose: 'EMAIL_CHANGE_NEW' });
}

export async function bindEmail(userId: string, input: { email: string; newCode: string; oldCode?: string }) {
  const email = assertQqEmail(input.email);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError('用户不存在', 404);
  if (normalizeEmail(user.email) === email) throw new HttpError('新邮箱不能与当前邮箱相同', 400);

  const existed = await prisma.user.findFirst({ where: { email, NOT: { id: userId } }, select: { id: true } });
  if (existed) throw new HttpError('该 QQ 邮箱已被其他账号绑定', 409);

  const codeIds = [await checkEmailCode({ email, purpose: 'EMAIL_CHANGE_NEW', code: input.newCode })];
  if (user.email) {
    if (!input.oldCode) throw new HttpError('请输入当前邮箱验证码', 400);
    codeIds.push(await checkEmailCode({ email: user.email, purpose: 'EMAIL_CHANGE_OLD', code: input.oldCode }));
  }

  return prisma.$transaction(async (tx) => {
    const consumed = await tx.emailVerificationCode.updateMany({
      where: { id: { in: codeIds }, consumedAt: null },
      data: { consumedAt: new Date() }
    });
    if (consumed.count !== codeIds.length) throw new HttpError('验证码已使用，请重新获取', 400);

    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        email,
        username: email,
        resetCodeHash: null,
        resetCodeExpiresAt: null,
        resetCodeAttempts: 0
      }
    });
    return publicUser(updated);
  });
}

export async function changePassword(userId: string, input: { newPassword: string; code: string }) {
  assertStrongPassword(input.newPassword);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError('用户不存在', 404);
  if (!user.email) throw new HttpError('请先绑定 QQ 邮箱', 400);

  await verifyEmailCode({ email: user.email, purpose: 'PASSWORD_CHANGE', code: input.code });

  if (await bcrypt.compare(input.newPassword, user.passwordHash)) throw new HttpError('新密码不能与旧密码相同', 400);

  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      resetCodeHash: null,
      resetCodeExpiresAt: null,
      resetCodeAttempts: 0,
      sessionVersion: { increment: 1 }
    }
  });
  return { changed: true, ...(await createToken(updated, 'user')) };
}

export async function updatePreferences(userId: string, input: Partial<UserPreferences>) {
  const data = normalizePreferences(input);
  const user = await prisma.user.update({ where: { id: userId }, data });
  return publicUser(user);
}

export async function requestPasswordReset(input: { account: string }) {
  const email = assertQqEmail(input.account);
  const user = await prisma.user.findFirst({ where: { email } });

  if (!user || !user.email) {
    return { sent: true, message: '如果 QQ 邮箱已注册，验证码会发送到该邮箱' };
  }

  const code = createVerificationCode();
  const resetCodeHash = await bcrypt.hash(code, 12);
  const resetCodeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.user.update({
    where: { id: user.id },
    data: { resetCodeHash, resetCodeExpiresAt, resetCodeAttempts: 0 }
  });

  const mail = await sendPasswordResetCode(user.email, code);
  return {
    sent: true,
    devCode: mail.devCode,
    message: '如果 QQ 邮箱已注册，验证码会发送到该邮箱'
  };
}

export async function resetPassword(input: { account: string; code: string; newPassword: string }) {
  assertStrongPassword(input.newPassword);
  const email = assertQqEmail(input.account);
  const user = await prisma.user.findFirst({ where: { email } });
  if (!user || !user.resetCodeHash || !user.resetCodeExpiresAt) throw new HttpError('验证码无效或已过期', 400);
  if (user.resetCodeExpiresAt.getTime() < Date.now()) throw new HttpError('验证码已过期，请重新获取', 400);

  if ((user.resetCodeAttempts || 0) >= 5) {
    await prisma.user.update({ where: { id: user.id }, data: { resetCodeHash: null, resetCodeExpiresAt: null, resetCodeAttempts: 0 } });
    throw new HttpError('验证码错误次数过多，请重新获取', 400);
  }

  const matched = await bcrypt.compare(input.code.trim(), user.resetCodeHash);
  if (!matched) {
    const nextAttempts = (user.resetCodeAttempts || 0) + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: nextAttempts >= 5
        ? { resetCodeHash: null, resetCodeExpiresAt: null, resetCodeAttempts: 0 }
        : { resetCodeAttempts: nextAttempts }
    });
    throw new HttpError(nextAttempts >= 5 ? '验证码错误次数过多，请重新获取' : '验证码错误', 400);
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      resetCodeHash: null,
      resetCodeExpiresAt: null,
      resetCodeAttempts: 0,
      sessionVersion: { increment: 1 }
    }
  });
  return { reset: true };
}

export function publicUser(user: {
  id: string;
  username: string;
  nickname: string;
  email?: string | null;
  avatarUrl?: string | null;
  role: UserRoleType;
  isActive: boolean;
  autoShowExplanation?: boolean;
  autoAddWrong?: boolean;
  autoAdvanceOnCorrect?: boolean;
  questionFontSize?: string;
  showQuestionOverview?: boolean;
  speechVoiceKey?: string;
  createdAt: Date;
}) {
  return {
    id: user.id,
    username: user.email || user.username, // 兼容旧前端字段；业务展示以 email/nickname 为准
    nickname: user.nickname,
    email: user.email || '',
    avatarUrl: user.avatarUrl || '',
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    preferences: {
      autoShowExplanation: user.autoShowExplanation ?? true,
      autoAddWrong: user.autoAddWrong ?? true,
      autoAdvanceOnCorrect: user.autoAdvanceOnCorrect ?? true,
      questionFontSize: questionFontSizes.includes(user.questionFontSize as UserPreferences['questionFontSize'])
        ? user.questionFontSize
        : 'standard',
      showQuestionOverview: user.showQuestionOverview ?? true,
      speechVoiceKey: user.speechVoiceKey || ''
    }
  };
}
