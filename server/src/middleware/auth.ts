import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole, type UserRole as UserRoleType } from '../utils/roles.js';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { fail, HttpError } from '../utils/http.js';
import { clearAuthCookies, cookieNames, getClientFromRequest, readCookie, type ClientApp } from '../utils/cookie.js';
import { assertUserAccessAllowed, USER_LOGIN_DISABLED } from '../services/systemControlService.js';

type JwtPayload = {
  userId: string;
  role: UserRoleType;
  username: string;
  csrfToken: string;
  audience: ClientApp;
  sessionVersion?: number;
  iat?: number;
};

function isUnsafeMethod(method: string) {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

function timingSafeEqualString(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export async function authRequired(req: Request, res: Response, next: NextFunction) {
  const client = getClientFromRequest(req);
  const names = cookieNames(client);
  const token = readCookie(req.headers.cookie, names.auth);
  if (!token) return fail(res, '未登录或登录已失效', 401);

  try {
    const payload = jwt.verify(token, env.jwtSecret) as JwtPayload;
    if (payload.audience !== client) return fail(res, '登录已失效，请重新登录', 401);

    if (isUnsafeMethod(req.method)) {
      const csrfHeader = String(req.headers['x-csrf-token'] || '');
      const csrfCookie = readCookie(req.headers.cookie, names.csrf);
      if (!timingSafeEqualString(csrfHeader, payload.csrfToken) || !timingSafeEqualString(csrfCookie, payload.csrfToken)) {
        return fail(res, '请求安全校验失败，请刷新页面后重试', 403);
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, username: true, isActive: true, sessionVersion: true, lastActiveAt: true }
    });
    if (!user || !user.isActive) return fail(res, '账号不存在或已停用', 401);
    if ((payload.sessionVersion ?? 0) !== user.sessionVersion) {
      return fail(res, '登录已失效，请重新登录', 401);
    }
    await assertUserAccessAllowed({ role: user.role, tokenIssuedAt: payload.iat });

    req.auth = { userId: user.id, username: user.username, role: user.role, csrfToken: payload.csrfToken };
    if (
      user.role === UserRole.STUDENT
      && (!user.lastActiveAt || Date.now() - user.lastActiveAt.getTime() >= 60_000)
    ) {
      await prisma.user.update({
        where: { id: user.id },
        data: { lastActiveAt: new Date() }
      });
    }
    return next();
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.code === USER_LOGIN_DISABLED && client === 'user') clearAuthCookies(res, 'user');
      return fail(res, error.message, error.status, error.code);
    }
    return fail(res, '登录已失效，请重新登录', 401);
  }
}

export function adminRequired(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) return fail(res, '未登录或登录已失效', 401);
  if (getClientFromRequest(req) !== 'admin') return fail(res, '需要管理员端登录状态', 403);
  if (req.auth.role !== UserRole.ADMIN) return fail(res, '需要管理员权限', 403);
  return next();
}
