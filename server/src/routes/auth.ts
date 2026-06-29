import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { authRequired } from '../middleware/auth.js';
import {
  bindEmail,
  changePassword,
  loginUser,
  publicUser,
  registerUser,
  requestPasswordReset,
  resetPassword,
  sendCurrentEmailCode,
  sendNewEmailCode,
  sendPasswordChangeCode,
  verifyPasswordChangeCode,
  sendRegisterCode,
  updatePreferences,
  updateProfile
} from '../services/authService.js';
import { fail, ok, HttpError } from '../utils/http.js';
import { validatePasswordStrength } from '../utils/passwordPolicy.js';
import { clearAuthCookies, getClientFromRequest, setAuthCookies } from '../utils/cookie.js';
import { accountLimiter, ipLimiter, passwordResetAccountLimiter } from '../middleware/rateLimit.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { recordAdminOperation } from '../services/adminAuditService.js';
import { isQqEmail } from '../utils/email.js';
import { NICKNAME_MAX_CHARS } from '../utils/nicknamePolicy.js';

const router = Router();

const qqEmailSchema = z.string().email('请输入正确的邮箱格式').max(191).refine((value) => isQqEmail(value), '当前仅支持 QQ 邮箱');
const passwordRule = z.string()
  .min(8, '密码至少 8 位')
  .max(100, '密码不能超过 100 位')
  .refine((value) => !validatePasswordStrength(value), (value) => ({ message: validatePasswordStrength(value) || '密码强度不足' }));

const avatarUrlSchema = z.string().max(800000, '头像图片过大，请选择较小图片').refine(
  (value) => {
    if (value === '') return true;
    if (/^data:image\/(png|jpe?g|webp);base64,/i.test(value)) return true;
    return /^\/uploads\/avatars\/[A-Za-z0-9._-]+$/i.test(value);
  },
  '头像格式仅支持 PNG、JPG、WEBP'
);

const registerCodeSchema = z.object({ email: qqEmailSchema });
const registerSchema = z.object({
  nickname: z.string().min(1, '请输入昵称').max(NICKNAME_MAX_CHARS, `昵称不能超过 ${NICKNAME_MAX_CHARS} 个字符`),
  email: qqEmailSchema,
  code: z.string().min(4, '请输入验证码').max(12),
  password: passwordRule
});
const loginSchema = z.object({
  email: z.string().min(1).max(191).optional(),
  username: z.string().min(1).max(64).optional(),
  password: z.string().min(1, '请输入密码').max(100),
  adminOnly: z.boolean().optional()
}).superRefine((value, ctx) => {
  if (value.adminOnly) {
    if (!value.username && !value.email) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '请输入管理员账号', path: ['username'] });
    }
    return;
  }

  if (!value.email) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '请输入 QQ 邮箱', path: ['email'] });
    return;
  }

  if (!isQqEmail(value.email)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '当前仅支持 QQ 邮箱', path: ['email'] });
  }
});
const profileSchema = z.object({
  nickname: z.string().min(1, '昵称不能为空').max(NICKNAME_MAX_CHARS, `昵称不能超过 ${NICKNAME_MAX_CHARS} 个字符`).optional(),
  avatarUrl: avatarUrlSchema.optional().nullable()
});
const emailCodeSchema = z.object({ email: qqEmailSchema });
const emailSchema = z.object({
  email: qqEmailSchema,
  newCode: z.string().min(4, '请输入新邮箱验证码').max(12),
  oldCode: z.string().min(4, '请输入当前邮箱验证码').max(12).optional()
});
const passwordCodeVerifySchema = z.object({
  code: z.string().min(4, '请输入邮箱验证码').max(12)
});
const passwordSchema = z.object({
  newPassword: passwordRule,
  code: z.string().min(4, '请输入邮箱验证码').max(12)
});
const preferencesSchema = z.object({
  autoShowExplanation: z.boolean().optional(),
  autoAddWrong: z.boolean().optional(),
  autoAdvanceOnCorrect: z.boolean().optional(),
  questionFontSize: z.enum(['small', 'standard', 'large']).optional(),
  showQuestionOverview: z.boolean().optional(),
  speechVoiceKey: z.string().max(220).optional()
});
const passwordResetRequestSchema = z.object({ account: qqEmailSchema });
const passwordResetConfirmSchema = z.object({
  account: qqEmailSchema,
  code: z.string().min(4).max(12),
  newPassword: passwordRule
});

function failFromError(res: Parameters<typeof fail>[0], error: unknown, fallback: string, fallbackStatus = 400) {
  if (error instanceof HttpError) return fail(res, error.message, error.status, error.code);
  if (error instanceof z.ZodError) return fail(res, error.errors[0]?.message || fallback, fallbackStatus);
  if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'production') console.error(error);
  return fail(res, '服务器内部错误', 500);
}

router.post(
  '/register/code',
  ipLimiter('auth:register-code', 60 * 60 * 1000, 10, '验证码请求过于频繁，请稍后再试'),
  accountLimiter('auth:register-code', 60 * 60 * 1000, 5, 'email', '该 QQ 邮箱验证码请求过于频繁，请稍后再试'),
  accountLimiter('auth:register-code-minute', 60 * 1000, 1, 'email', '验证码已发送，请 60 秒后再试'),
  async (req, res) => {
    try {
      const input = registerCodeSchema.parse(req.body);
      return ok(res, await sendRegisterCode(input));
    } catch (error) {
      return failFromError(res, error, '验证码发送失败');
    }
  }
);

router.post(
  '/register',
  ipLimiter('auth:register', 60 * 60 * 1000, 20, '注册请求过于频繁，请稍后再试'),
  accountLimiter('auth:register', 60 * 60 * 1000, 5, 'email', '该 QQ 邮箱注册请求过于频繁，请稍后再试'),
  async (req, res) => {
    try {
      const input = registerSchema.parse(req.body);
      const data = await registerUser(input);
      setAuthCookies(res, data.token, data.csrfToken, 'user');
      return ok(res, { user: data.user }, '注册成功');
    } catch (error) {
      return failFromError(res, error, '注册失败');
    }
  }
);

router.post(
  '/login',
  ipLimiter('auth:login', 15 * 60 * 1000, 30, '登录请求过于频繁，请 15 分钟后再试'),
  accountLimiter('auth:login', 15 * 60 * 1000, 10, ['email', 'username'], '该账号登录失败次数过多，请 15 分钟后再试'),
  async (req, res) => {
    try {
      const input = loginSchema.parse(req.body);
      const data = await loginUser(input);
      setAuthCookies(res, data.token, data.csrfToken, data.audience);
      if (data.audience === 'admin') {
        void recordAdminOperation({
          adminId: data.user.id,
          action: 'LOGIN',
          summary: '登录管理后台',
          method: req.method,
          path: req.originalUrl.split('?')[0],
          targetType: 'admin',
          targetId: data.user.id,
          ipAddress: req.ip || req.socket.remoteAddress,
          userAgent: req.get('user-agent'),
          statusCode: 200,
          durationMs: 0
        }).catch((auditError) => {
          if (process.env.NODE_ENV !== 'production') console.error('管理员登录日志写入失败', auditError);
        });
      }
      return ok(res, { user: data.user }, '登录成功');
    } catch (error) {
      return failFromError(res, error, '登录失败', 401);
    }
  }
);

router.post('/logout', authRequired, async (req, res) => {
  const client = getClientFromRequest(req);
  if (client === 'admin' && req.auth) {
    void recordAdminOperation({
      adminId: req.auth.userId,
      action: 'LOGOUT',
      summary: '退出管理后台',
      method: req.method,
      path: req.originalUrl.split('?')[0],
      targetType: 'admin',
      targetId: req.auth.userId,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
      statusCode: 200,
      durationMs: 0
    }).catch((auditError) => {
      if (process.env.NODE_ENV !== 'production') console.error('管理员退出日志写入失败', auditError);
    });
  }
  clearAuthCookies(res, client);
  return ok(res, { logout: true }, '已退出登录');
});

router.post(
  '/password-reset/request',
  ipLimiter('password-reset:request', 60 * 60 * 1000, 10, '验证码请求过于频繁，请稍后再试'),
  passwordResetAccountLimiter('password-reset:request', 60 * 60 * 1000, 5, '该 QQ 邮箱验证码请求过于频繁，请稍后再试'),
  passwordResetAccountLimiter('password-reset:request-minute', 60 * 1000, 1, '验证码已发送，请 60 秒后再试'),
  async (req, res) => {
    try {
      const input = passwordResetRequestSchema.parse(req.body);
      return ok(res, await requestPasswordReset(input));
    } catch (error) {
      return failFromError(res, error, '验证码发送失败');
    }
  }
);

router.post(
  '/password-reset/confirm',
  ipLimiter('password-reset:confirm', 60 * 60 * 1000, 20, '验证码验证请求过于频繁，请稍后再试'),
  passwordResetAccountLimiter('password-reset:confirm', 60 * 60 * 1000, 10, '该 QQ 邮箱验证码验证过于频繁，请稍后再试'),
  async (req, res) => {
    try {
      const input = passwordResetConfirmSchema.parse(req.body);
      return ok(res, await resetPassword(input), '密码已重置');
    } catch (error) {
      return failFromError(res, error, '密码重置失败');
    }
  }
);

router.get('/me', authRequired, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  if (!user) return fail(res, '用户不存在', 404);
  return ok(res, publicUser(user));
}));

router.put('/profile', authRequired, async (req, res) => {
  try {
    const input = profileSchema.parse(req.body);
    return ok(res, await updateProfile(req.auth!.userId, input), '资料已更新');
  } catch (error) {
    return failFromError(res, error, '资料更新失败');
  }
});

router.post(
  '/password/code',
  authRequired,
  ipLimiter('auth:password-code', 60 * 60 * 1000, 10, '验证码请求过于频繁，请稍后再试'),
  ipLimiter('auth:password-code-minute', 60 * 1000, 1, '验证码已发送，请 60 秒后再试'),
  async (req, res) => {
    try {
      return ok(res, await sendPasswordChangeCode(req.auth!.userId));
    } catch (error) {
      return failFromError(res, error, '验证码发送失败');
    }
  }
);


router.post('/password/code/verify', authRequired, async (req, res) => {
  try {
    const input = passwordCodeVerifySchema.parse(req.body);
    return ok(res, await verifyPasswordChangeCode(req.auth!.userId, input), '验证码已验证');
  } catch (error) {
    return failFromError(res, error, '验证码验证失败');
  }
});

router.put('/password', authRequired, async (req, res) => {
  try {
    const input = passwordSchema.parse(req.body);
    const data = await changePassword(req.auth!.userId, input);
    setAuthCookies(res, data.token, data.csrfToken, 'user');
    return ok(res, { changed: data.changed }, '密码已修改');
  } catch (error) {
    return failFromError(res, error, '密码修改失败');
  }
});

router.post(
  '/email/code/current',
  authRequired,
  ipLimiter('auth:email-current-code', 60 * 60 * 1000, 10, '验证码请求过于频繁，请稍后再试'),
  ipLimiter('auth:email-current-code-minute', 60 * 1000, 1, '验证码已发送，请 60 秒后再试'),
  async (req, res) => {
    try {
      return ok(res, await sendCurrentEmailCode(req.auth!.userId));
    } catch (error) {
      return failFromError(res, error, '验证码发送失败');
    }
  }
);

router.post(
  '/email/code/new',
  authRequired,
  ipLimiter('auth:email-new-code', 60 * 60 * 1000, 10, '验证码请求过于频繁，请稍后再试'),
  accountLimiter('auth:email-new-code', 60 * 60 * 1000, 5, 'email', '该 QQ 邮箱验证码请求过于频繁，请稍后再试'),
  accountLimiter('auth:email-new-code-minute', 60 * 1000, 1, 'email', '验证码已发送，请 60 秒后再试'),
  async (req, res) => {
    try {
      const input = emailCodeSchema.parse(req.body);
      return ok(res, await sendNewEmailCode(req.auth!.userId, input));
    } catch (error) {
      return failFromError(res, error, '验证码发送失败');
    }
  }
);

router.put('/email', authRequired, async (req, res) => {
  try {
    const input = emailSchema.parse(req.body);
    return ok(res, await bindEmail(req.auth!.userId, input), '邮箱已绑定');
  } catch (error) {
    return failFromError(res, error, '邮箱绑定失败');
  }
});

router.put('/preferences', authRequired, async (req, res) => {
  try {
    const input = preferencesSchema.parse(req.body);
    return ok(res, await updatePreferences(req.auth!.userId, input), '偏好已保存');
  } catch (error) {
    return failFromError(res, error, '偏好保存失败');
  }
});

export default router;
