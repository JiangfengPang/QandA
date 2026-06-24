import type { NextFunction, Request, Response } from 'express';
import { fail } from '../utils/http.js';

type RateLimitRule = {
  windowMs: number;
  max: number;
  message: string;
  key: (req: Request) => string;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

function now() {
  return Date.now();
}

function cleanup() {
  const ts = now();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= ts) buckets.delete(key);
  }
}

setInterval(cleanup, 10 * 60 * 1000).unref();

export function clientIp(req: Request) {
  // Express only trusts X-Forwarded-For when trust proxy is explicitly enabled.
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function normalizeAccount(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export function rateLimit(rule: RateLimitRule) {
  return (req: Request, res: Response, next: NextFunction) => {
    const id = `${rule.key(req)}:${Math.floor(now() / rule.windowMs)}`;
    const ts = now();
    const current = buckets.get(id);
    const bucket = current && current.resetAt > ts ? current : { count: 0, resetAt: ts + rule.windowMs };
    bucket.count += 1;
    buckets.set(id, bucket);

    if (bucket.count > rule.max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - ts) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return fail(res, rule.message, 429);
    }

    return next();
  };
}

export function ipLimiter(scope: string, windowMs: number, max: number, message = '请求过于频繁，请稍后再试') {
  return rateLimit({ windowMs, max, message, key: (req) => `${scope}:ip:${clientIp(req)}` });
}

export function accountLimiter(
  scope: string,
  windowMs: number,
  max: number,
  field: string | string[] = 'username',
  message = '该账号请求过于频繁，请稍后再试'
) {
  return rateLimit({
    windowMs,
    max,
    message,
    key: (req) => {
      const fields = Array.isArray(field) ? field : [field];
      const account = fields.map((name) => normalizeAccount((req.body || {})[name])).find(Boolean);
      return `${scope}:account:${account || clientIp(req)}`;
    }
  });
}

export function passwordResetAccountLimiter(scope: string, windowMs: number, max: number, message = '验证码请求过于频繁，请稍后再试') {
  return rateLimit({
    windowMs,
    max,
    message,
    key: (req) => `${scope}:account:${normalizeAccount((req.body || {}).account) || clientIp(req)}`
  });
}
