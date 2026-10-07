import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { AppError } from '../errors/app-error';

const claimsSchema = z.object({
  sub: z.uuid(),
  companyId: z.uuid(),
  email: z.string(),
});

export type AuthUser = z.infer<typeof claimsSchema>;

const verifiedTokenSchema = claimsSchema.extend({ iat: z.number(), exp: z.number() });

type ExpiresIn = `${number}${'s' | 'm' | 'h' | 'd'}`;

export class TokenService {
  constructor(
    private readonly secret: string,
    private readonly expiresIn: string,
  ) {}

  sign(user: AuthUser): string {
    return jwt.sign(user, this.secret, {
      algorithm: 'HS256',
      expiresIn: this.expiresIn as ExpiresIn,
    });
  }

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
