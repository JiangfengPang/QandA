export function validatePasswordStrength(password: string) {
  const value = String(password || '');
  if (value.length < 12) return '密码至少 12 位';
  if (value.length > 100) return '密码不能超过 100 位';

  const categories = [
    /[a-z]/.test(value),
    /[A-Z]/.test(value),
    /\d/.test(value),
    /[^A-Za-z0-9]/.test(value)
  ].filter(Boolean).length;

  if (categories < 3) {
    return '密码需包含大写字母、小写字母、数字、特殊字符中的至少三类';
  }

  const weakList = ['password', 'admin123456', 'qanda123456', '123456789', '111111111'];
  if (weakList.some((item) => value.toLowerCase().includes(item))) {
    return '密码过于常见，请更换更复杂的密码';
  }

  return '';
}

export function assertStrongPassword(password: string) {
  const message = validatePasswordStrength(password);
  if (message) {
    const error = new Error(message) as Error & { status?: number; code?: number };
    error.status = 400;
    error.code = 400;
    throw error;
  }
}
