import { z } from 'zod';
import type { Plan } from '../config/retention';

export const setPlanSchema = z.object({
  plan: z.enum(['FREE', 'PRO', 'ENTERPRISE'] as const satisfies readonly Plan[]),
});
export type SetPlanInput = z.infer<typeof setPlanSchema>;

export const companyIdSchema = z.uuid();
