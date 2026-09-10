import 'server-only';
import { z } from 'zod';

/**
 * Fail fast, at boot, on a misconfigured deployment. A finance app that starts
 * with a weak or missing session secret is worse than one that refuses to
 * start at all.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters of high-entropy random data'),
  APP_URL: z.string().url().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

const parsed = schema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  SESSION_SECRET: process.env.SESSION_SECRET,
  APP_URL: process.env.APP_URL,
  NODE_ENV: process.env.NODE_ENV,
});

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `  · ${issue.path.join('.')}: ${issue.message}`);
  throw new Error(
    `Invalid environment configuration.\n${details.join('\n')}\n\n` +
      `Copy .env.example to .env and fill it in (see README → Environment variables).`,
  );
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';

const placeholderSecret = 'replace-me-with-a-long-random-string-at-least-32-chars';
if (isProduction && env.SESSION_SECRET === placeholderSecret) {
  throw new Error('SESSION_SECRET is still the .env.example placeholder. Generate a real one.');
}
