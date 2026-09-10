import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import crypto from 'node:crypto';
import { db } from '../db';
import { env, isProduction } from '../env';

/**
 * Server-side sessions.
 *
 * The browser holds an opaque 256-bit random token in an httpOnly cookie. The
 * database stores only a keyed SHA-256 of that token, so a dump of the Session
 * table cannot be replayed as a login. Revocation is real: deleting the row
 * ends the session immediately, which a stateless JWT could not offer.
 */
export const SESSION_COOKIE = 'ex_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
/** Refresh the row at most once an hour to avoid a write on every request. */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

function hashToken(token: string): string {
  return crypto.createHmac('sha256', env.SESSION_SECRET).update(token).digest('hex');
}

/** IPs are hashed, never stored raw — we only need "did this change". */
function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return crypto.createHmac('sha256', env.SESSION_SECRET).update(ip).digest('hex').slice(0, 32);
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  currency: string;
  theme: string;
}

export async function createSession(userId: string): Promise<void> {
  const token = crypto.randomBytes(32).toString('base64url');
  const headerList = await headers();
  const forwardedFor = headerList.get('x-forwarded-for');
  const ip = forwardedFor?.split(',')[0]?.trim() ?? headerList.get('x-real-ip');

  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      userAgent: headerList.get('user-agent')?.slice(0, 255) ?? null,
      ipHash: hashIp(ip),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    // deleteMany: a token that is already gone is not an error worth throwing.
    await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  cookieStore.delete(SESSION_COOKIE);
}

/** Sign out every device — used after a password change. */
export async function destroyAllSessions(userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } });
}

/**
 * Resolve the signed-in user, or null. Memoised per request so a page that
 * checks auth in the layout and again in three components issues one query.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      lastSeenAt: true,
      user: {
        select: { id: true, name: true, email: true, avatarUrl: true, currency: true, theme: true },
      },
    },
  });

  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session
      .update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
      })
      .catch(() => undefined);
  }

  return session.user;
});

/** Best-effort housekeeping; safe to call from any request path. */
export async function pruneExpiredSessions(): Promise<void> {
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => undefined);
}
