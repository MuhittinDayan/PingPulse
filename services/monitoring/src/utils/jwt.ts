import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { AppError } from '../errors/app-error';

const verifiedTokenSchema = z.object({
  sub: z.uuid(),
  companyId: z.uuid(),
  email: z.string(),
  iat: z.number(),
  exp: z.number(),
});

export type AuthUser = { sub: string; companyId: string; email: string };

export class TokenVerifier {
  constructor(private readonly secret: string) {}

  verify(token: string): AuthUser {
    let decoded: unknown;
    try {
      decoded = jwt.verify(token, this.secret, { algorithms: ['HS256'] });
    } catch {
      throw new AppError(401, 'INVALID_TOKEN', 'Invalid or expired token');
    }

    const result = verifiedTokenSchema.safeParse(decoded);
    if (!result.success) {
      throw new AppError(401, 'INVALID_TOKEN', 'Invalid token payload');
    }

    const { sub, companyId, email } = result.data;
    return { sub, companyId, email };
  }
}
