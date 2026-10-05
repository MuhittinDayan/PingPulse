import { z } from 'zod';
import { emailSchema, passwordSchema } from './common.schemas';

// companyId bilerek yok: yeni kullanıcı her zaman token'daki şirkete eklenir.
export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;
