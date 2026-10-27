import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { fail, HttpError } from '../utils/http.js';

export function notFound(_req: Request, res: Response) {
  return fail(res, '接口不存在', 404);
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof HttpError) {
    return fail(res, error.message, error.status, error.code);
  }

  if (error instanceof ZodError) {
    return fail(res, error.errors[0]?.message || '参数错误', 400);
  }

  const anyError = error as { message?: string; status?: number; code?: number | string };
  const status = Number(anyError.status || 500);
  const message = env.isProduction && status >= 500
    ? '服务器内部错误'
    : (anyError.message || '服务器内部错误');

  if (!env.isProduction) {
    console.error(error);
  }

  return fail(res, message, status, anyError.code || status);
}
