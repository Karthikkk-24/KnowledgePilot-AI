import { z } from 'zod';

const envSchema = z.object({
  APP_NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_PORT: z.coerce.number().int().positive().default(3001),
  APP_WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  DB_DATABASE_URL: z
    .string()
    .min(1)
    .default('postgresql://postgres:postgres@localhost:5432/knowledgepilot?schema=public'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid environment configuration: ${JSON.stringify(details)}`);
  }
  return parsed.data;
}
