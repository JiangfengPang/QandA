export const UserRole = {
  STUDENT: 'STUDENT',
  ADMIN: 'ADMIN'
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];
