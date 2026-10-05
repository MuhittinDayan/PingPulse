import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

// bcrypt ilk 72 byte'tan sonrasını yok sayar; sınır karakter değil byte üzerinden.
export const passwordSchema = z
  .string()
  .min(8)
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Must be at most 72 bytes');
