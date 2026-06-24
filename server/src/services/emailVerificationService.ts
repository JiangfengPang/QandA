import bcrypt from 'bcryptjs';
import { prisma } from '../db/prisma.js';
import { HttpError } from '../utils/http.js';
import { createVerificationCode } from '../utils/verificationCode.js';
import { sendEmailVerificationCode } from './mailService.js';

export type EmailCodePurpose =
  | 'REGISTER'
  | 'PASSWORD_CHANGE'
  | 'EMAIL_CHANGE_OLD'
  | 'EMAIL_CHANGE_NEW';

const PURPOSE_SCENE: Record<EmailCodePurpose, string> = {
  REGISTER: '注册',
  PASSWORD_CHANGE: '修改密码',
  EMAIL_CHANGE_OLD: '旧邮箱验证',
  EMAIL_CHANGE_NEW: '新邮箱验证'
};

function normalizeEmail(email: string) {
  return String(email || '').trim().toLowerCase();
}

function isQqEmail(value: string) {
  return /^[1-9]\d{4,11}@qq\.com$/i.test(value.trim());
}

export function assertQqEmail(email: string) {
  const value = normalizeEmail(email);
  if (!value) throw new HttpError('请输入 QQ 邮箱', 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new HttpError('请输入正确的邮箱格式', 400);
  if (!isQqEmail(value)) throw new HttpError('当前仅支持 QQ 邮箱', 400);
  return value;
}

export async function sendEmailCode(input: { email: string; purpose: EmailCodePurpose }) {
  const email = assertQqEmail(input.email);
  const code = createVerificationCode();
  const codeHash = await bcrypt.hash(code, 12);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.emailVerificationCode.updateMany({
    where: { email, purpose: input.purpose, consumedAt: null },
    data: { consumedAt: new Date() }
  });

  await prisma.emailVerificationCode.create({
    data: { email, purpose: input.purpose, codeHash, expiresAt }
  });

  const mail = await sendEmailVerificationCode(email, code, PURPOSE_SCENE[input.purpose]);
  return {
    sent: mail.sent,
    devCode: mail.devCode,
    message: mail.sent ? '验证码已发送' : '未配置 QQ 邮箱授权码，已返回开发验证码'
  };
}

export async function verifyEmailCode(input: { email: string; purpose: EmailCodePurpose; code: string }) {
  const email = assertQqEmail(input.email);
  const code = String(input.code || '').trim();
  if (!/^\d{4,12}$/.test(code)) throw new HttpError('验证码格式不正确', 400);

  const record = await prisma.emailVerificationCode.findFirst({
    where: { email, purpose: input.purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' }
  });

  if (!record) throw new HttpError('验证码无效或已过期', 400);
  if (record.expiresAt.getTime() < Date.now()) throw new HttpError('验证码已过期，请重新获取', 400);

  if (record.attempts >= 5) {
    await prisma.emailVerificationCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
    throw new HttpError('验证码错误次数过多，请重新获取', 400);
  }

  const matched = await bcrypt.compare(code, record.codeHash);
  if (!matched) {
    const nextAttempts = record.attempts + 1;
    await prisma.emailVerificationCode.update({
      where: { id: record.id },
      data: nextAttempts >= 5 ? { attempts: nextAttempts, consumedAt: new Date() } : { attempts: nextAttempts }
    });
    throw new HttpError(nextAttempts >= 5 ? '验证码错误次数过多，请重新获取' : '验证码错误', 400);
  }

  await prisma.emailVerificationCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
  return true;
}

export async function checkEmailCode(input: { email: string; purpose: EmailCodePurpose; code: string }) {
  const email = assertQqEmail(input.email);
  const code = String(input.code || '').trim();
  if (!/^\d{4,12}$/.test(code)) throw new HttpError('验证码格式不正确', 400);

  const record = await prisma.emailVerificationCode.findFirst({
    where: { email, purpose: input.purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' }
  });

  if (!record) throw new HttpError('验证码无效或已过期', 400);
  if (record.expiresAt.getTime() < Date.now()) throw new HttpError('验证码已过期，请重新获取', 400);

  if (record.attempts >= 5) {
    await prisma.emailVerificationCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
    throw new HttpError('验证码错误次数过多，请重新获取', 400);
  }

  const matched = await bcrypt.compare(code, record.codeHash);
  if (!matched) {
    const nextAttempts = record.attempts + 1;
    await prisma.emailVerificationCode.update({
      where: { id: record.id },
      data: nextAttempts >= 5 ? { attempts: nextAttempts, consumedAt: new Date() } : { attempts: nextAttempts }
    });
    throw new HttpError(nextAttempts >= 5 ? '验证码错误次数过多，请重新获取' : '验证码错误', 400);
  }

  return record.id;
}
