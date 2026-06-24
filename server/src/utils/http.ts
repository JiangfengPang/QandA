import type { Response } from 'express';

export class HttpError extends Error {
  status: number;
  code: number;

  constructor(message: string, status = 400, code = status) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function ok<T>(res: Response, data: T, message = 'ok') {
  return res.json({ code: 0, message, data });
}

export function fail(res: Response, message: string, status = 400, code = status) {
  return res.status(status).json({ code, message, data: null });
}

export function toInt(value: unknown, fallback = 1) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function pageMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    pages: Math.ceil(total / pageSize)
  };
}
