import type { RequestHandler } from 'express';
import { AppError } from '../errors/app-error';
import type { TokenService } from '../utils/jwt';

export function requireAuth(tokens: TokenService): RequestHandler {
  return (req, res, next) => {
    const match = req.headers.authorization?.match(/^Bearer\s+(\S+)$/i);
    if (!match) {
      throw new AppError(401, 'MISSING_TOKEN', 'Missing bearer token');
    }
    res.locals.user = tokens.verify(match[1]);
    next();
  };
}
