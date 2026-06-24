import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { env } from '../config/env.js';

export type ClientApp = 'user' | 'admin';

export const USER_AUTH_COOKIE = 'qanda_user_auth';
export const USER_CSRF_COOKIE = 'qanda_user_csrf';
export const ADMIN_AUTH_COOKIE = 'qanda_admin_auth';
export const ADMIN_CSRF_COOKIE = 'qanda_admin_csrf';

export const USER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const ADMIN_MAX_AGE_MS = 4 * 60 * 60 * 1000;

export function createCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function getClientFromRequest(req: Request): ClientApp {
  return String(req.headers['x-qanda-client'] || '').toLowerCase() === 'admin' ? 'admin' : 'user';
}

export function cookieNames(client: ClientApp) {
  return client === 'admin'
    ? { auth: ADMIN_AUTH_COOKIE, csrf: ADMIN_CSRF_COOKIE }
    : { auth: USER_AUTH_COOKIE, csrf: USER_CSRF_COOKIE };
}

function baseCookieOptions(httpOnly: boolean, client: ClientApp) {
  return {
    httpOnly,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    domain: env.cookieDomain,
    path: '/',
    maxAge: client === 'admin' ? ADMIN_MAX_AGE_MS : USER_MAX_AGE_MS
  } as const;
}

export function setAuthCookies(res: Response, token: string, csrfToken: string, client: ClientApp) {
  const names = cookieNames(client);
  res.cookie(names.auth, token, baseCookieOptions(true, client));
  res.cookie(names.csrf, csrfToken, baseCookieOptions(false, client));
}

export function clearAuthCookies(res: Response, client: ClientApp) {
  const names = cookieNames(client);
  const options = {
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    domain: env.cookieDomain,
    path: '/'
  } as const;
  res.clearCookie(names.auth, options);
  res.clearCookie(names.csrf, options);
}

export function readCookie(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return '';
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const index = pair.indexOf('=');
    if (index === -1) continue;
    const key = pair.slice(0, index).trim();
    if (key === name) return decodeURIComponent(pair.slice(index + 1).trim());
  }
  return '';
}
