import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const passwordSchema = z
  .string()
  .min(8)
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Must be at most 72 bytes');
