import type { AuthUser } from '../utils/jwt';

declare global {
  namespace Express {
    interface Locals {
      user: AuthUser;
    }
  }
}

export {};
