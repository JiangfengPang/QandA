import type { UserRole as UserRoleType } from '../utils/roles.js';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: UserRoleType;
        username: string;
        csrfToken: string;
      };
    }
  }
}
