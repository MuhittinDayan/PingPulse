import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '../errors/app-error';

export function validateBody(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      throw new AppError(400, 'VALIDATION_FAILED', 'Validation failed', details);
    }
    req.body = result.data;
    next();
  };
}
