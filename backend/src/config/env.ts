import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Server
  PORT: z.string().default('3000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // JWT
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  // Stack Overflow API
  SO_API_KEY: z.string().optional().default(''),
  SO_API_BASE: z.string().url().default('https://api.stackexchange.com/2.3'),
  SO_SITE: z.string().default('stackoverflow'),

  // Game Config
  QUESTION_POOL_MIN: z.string().default('50').transform(Number),
  QUESTION_POOL_REFRESH_HOURS: z.string().default('6').transform(Number),
  CACHE_TTL_SECONDS: z.string().default('86400').transform(Number),

  // Duel Config
  DUEL_ROUNDS: z.string().default('5').transform(Number),
  DUEL_TIME_LIMIT_SECS: z.string().default('30').transform(Number),
  DAILY_QUESTION_COUNT: z.string().default('10').transform(Number),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌  Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
