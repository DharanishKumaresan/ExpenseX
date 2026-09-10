import 'server-only';
import { headers } from 'next/headers';
import { AppError } from './errors';

/**
 * Fixed-window rate limiting for the endpoints worth protecting: login,
 * signup, and invitation sending.
 *
 * The store is in-process, which means each instance enforces its own budget.
 * That is enough to stop credential stuffing from a single client and is
 * honest about its limits — a multi-instance deployment should point
 * `consume` at Redis or an edge rate limiter. It is deliberately NOT applied
 * to ordinary reads, where it would only add contention.
 */
interface Window {
  count: number;
  resetAt: number;
}

const globalForLimiter = globalThis as unknown as { rateLimitStore?: Map<string, Window> };
const store: Map<string, Window> = globalForLimiter.rateLimitStore ?? new Map();
if (process.env.NODE_ENV !== 'production') globalForLimiter.rateLimitStore = store;

let lastSweep = 0;
function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, window] of store) {
    if (window.resetAt <= now) store.delete(key);
  }
}

export interface RateLimitOptions {
  /** Requests permitted per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export const RATE_LIMITS = {
  login: { limit: 8, windowMs: 10 * 60 * 1000 },
  signup: { limit: 5, windowMs: 60 * 60 * 1000 },
  invite: { limit: 10, windowMs: 60 * 60 * 1000 },
  mutation: { limit: 240, windowMs: 60 * 1000 },
} as const satisfies Record<string, RateLimitOptions>;

/** Caller IP from proxy headers; falls back to a constant bucket. */
export async function clientKey(): Promise<string> {
  const headerList = await headers();
  const forwardedFor = headerList.get('x-forwarded-for');
  return (
    forwardedFor?.split(',')[0]?.trim() ||
    headerList.get('x-real-ip') ||
    'unknown'
  );
}

export function check(key: string, options: RateLimitOptions): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  sweep(now);

  const existing = store.get(key);
  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + options.windowMs });
    return { ok: true, retryAfterMs: 0 };
  }

  existing.count += 1;
  if (existing.count > options.limit) {
    return { ok: false, retryAfterMs: existing.resetAt - now };
  }
  return { ok: true, retryAfterMs: 0 };
}

/** Throws a user-safe AppError when the budget is exhausted. */
export async function enforce(scope: keyof typeof RATE_LIMITS, discriminator = ''): Promise<void> {
  const ip = await clientKey();
  const result = check(`${scope}:${ip}:${discriminator}`, RATE_LIMITS[scope]);
  if (!result.ok) {
    const minutes = Math.max(1, Math.ceil(result.retryAfterMs / 60_000));
    throw new AppError(
      'RATE_LIMITED',
      `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    );
  }
}

/** Reset a bucket after a legitimate success, so one typo does not cost the window. */
export async function reset(scope: keyof typeof RATE_LIMITS, discriminator = ''): Promise<void> {
  const ip = await clientKey();
  store.delete(`${scope}:${ip}:${discriminator}`);
}
