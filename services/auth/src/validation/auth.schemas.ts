import { z } from 'zod';
import { emailSchema, passwordSchema } from './common.schemas';

export const registerSchema = z.object({
  companyName: z.string().trim().min(2).max(100),
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

// Girişte şifre kuralları uygulanmaz: kurallar değişirse eski kullanıcılar dışarıda kalmasın.
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;
