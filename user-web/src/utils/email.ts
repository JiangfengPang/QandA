const BASIC_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string) {
  return String(email || '').trim().toLowerCase();
}

export function isQqEmail(email: string) {
  const value = normalizeEmail(email);
  return BASIC_EMAIL_PATTERN.test(value) && value.endsWith('@qq.com');
}
