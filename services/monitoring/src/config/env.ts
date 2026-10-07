import { z } from 'zod';

const sharedSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MONGO_URL: z.string().regex(/^mongodb(\+srv)?:\/\//, 'must start with mongodb://'),
});

const apiSchema = sharedSchema.extend({
  PORT: z.coerce.number().int().positive().default(3002),
  JWT_SECRET: z.string().min(16, 'must be at least 16 characters'),
  INTERNAL_TOKEN: z.string().min(16, 'must be at least 16 characters'),
  ALLOW_PRIVATE_TARGETS: z.stringbool().default(false),
});

const workerSchema = sharedSchema
  .extend({
    CHECK_CONCURRENCY: z.coerce.number().int().min(1).max(1000).default(10),
    CHECK_INTERVAL_SECONDS: z.coerce.number().int().min(5).default(60),
    CHECK_TIMEOUT_MS: z.coerce.number().int().min(100).default(5000),
    WORKER_TICK_MS: z.coerce.number().int().min(100).default(1000),
    UV_THREADPOOL_SIZE: z.coerce.number().int().min(1).default(4),
  })
  .refine((env) => env.UV_THREADPOOL_SIZE >= env.CHECK_CONCURRENCY, {
    message: 'must be greater than or equal to CHECK_CONCURRENCY',
    path: ['UV_THREADPOOL_SIZE'],
  });

export type ApiEnv = z.infer<typeof apiSchema>;
export type WorkerEnv = z.infer<typeof workerSchema>;

export function loadApiEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  return parse(apiSchema, source);
}

export function loadWorkerEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  return parse(workerSchema, source);
}

function parse<T>(schema: z.ZodType<T>, source: NodeJS.ProcessEnv): T {
  const result = schema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${details}`);
  }
  return result.data;
}
