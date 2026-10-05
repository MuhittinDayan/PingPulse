import { z } from 'zod';

export const createMonitorSchema = z.object({
  url: z.string().trim().max(2048).pipe(z.url({ protocol: /^https?$/ })),
  name: z.string().trim().min(1).max(100).optional(),
});
export type CreateMonitorInput = z.infer<typeof createMonitorSchema>;
