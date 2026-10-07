import { z } from 'zod';
import { emailSchema, passwordSchema } from './common.schemas';

export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;
