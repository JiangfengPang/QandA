const API_BASE = import.meta.env.VITE_API_BASE || '/api';

type ApiResponse<T> = { code: number; message: string; data: T };

export class ApiError extends Error {
  status: number;
  code: number;
  payload: unknown;

  constructor(message: string, status: number, code: number, payload: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

function readCookie(name: string) {
  if (typeof document === 'undefined') return '';
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : '';
}

function isUnsafeMethod(method?: string) {
  const value = String(method || 'GET').toUpperCase();
  return !['GET', 'HEAD', 'OPTIONS'].includes(value);
}

export function getToken() {
  return readCookie('qanda_user_csrf') ? 'cookie-session' : '';
}

export function setToken(_token?: string) {
  // JWT 已迁移到 HttpOnly Cookie，前端不再持久化 token。
}

export function clearToken() {
  localStorage.removeItem('qanda_user_token');
}

async function parseResponse<T>(res: Response): Promise<ApiResponse<T>> {
  const text = await res.text();
  if (!text) return { code: res.ok ? 0 : res.status, message: res.statusText || '请求失败', data: null as T };
  try {
    return JSON.parse(text) as ApiResponse<T>;
  } catch {
    return { code: res.ok ? 0 : res.status, message: text || '请求失败', data: text as T };
  }
}

export async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  const method = String(options.method || 'GET').toUpperCase();
  const hasBody = options.body !== undefined && options.body !== null;

  headers.set('X-Qanda-Client', 'user');
  if (hasBody && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (isUnsafeMethod(method)) {
    const csrfToken = readCookie('qanda_user_csrf');
    if (csrfToken) headers.set('X-CSRF-Token', csrfToken);
  }

  const res = await fetch(`${API_BASE}${url}`, { ...options, method, headers, credentials: 'include' });
  const payload = await parseResponse<T>(res);
  if (!res.ok || payload.code !== 0) {
    throw new ApiError(payload.message || '请求失败', res.status, payload.code, payload);
  }
  return payload.data;
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, data?: unknown) => request<T>(url, { method: 'POST', body: JSON.stringify(data || {}) }),
  put: <T>(url: string, data?: unknown) => request<T>(url, { method: 'PUT', body: JSON.stringify(data || {}) }),
  patch: <T>(url: string, data?: unknown) => request<T>(url, { method: 'PATCH', body: JSON.stringify(data || {}) }),
  delete: <T>(url: string) => request<T>(url, { method: 'DELETE' })
};
