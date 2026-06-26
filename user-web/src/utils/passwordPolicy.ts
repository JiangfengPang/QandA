export const PASSWORD_MIN_LENGTH = 8;

export function passwordPolicyMessage(value: string, label = '密码') {
  if (value.length < PASSWORD_MIN_LENGTH) return `${label}至少 ${PASSWORD_MIN_LENGTH} 位`;
  const types = [/[a-z]/.test(value), /[A-Z]/.test(value), /\d/.test(value), /[^A-Za-z0-9]/.test(value)].filter(Boolean).length;
  if (types < 3) return `${label}需包含大写字母、小写字母、数字、特殊字符中的至少三类`;
  return '';
}
