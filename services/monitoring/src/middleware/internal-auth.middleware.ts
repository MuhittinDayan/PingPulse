import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { AppError } from '../errors/app-error';

const sha256 = (value: string) => createHash('sha256').update(value).digest();

export function requireInternalToken(expectedToken: string): RequestHandler {
  const expected = sha256(expectedToken);
  return (req, _res, next) => {
    const provided = req.headers['x-internal-token'];
    if (typeof provided !== 'string' || !timingSafeEqual(sha256(provided), expected)) {
      throw new AppError(401, 'INVALID_INTERNAL_TOKEN', 'Invalid internal token');
    }
    next();
  };
}
