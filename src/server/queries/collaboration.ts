import 'server-only';
import { cache } from 'react';
import type { Prisma } from '@prisma/client';
import { db } from '../db';
import type { ActivityMetadata } from '@/lib/activity';

/**
 * Activity feed, notifications and invitations.
 */

const ACTIVITY_SELECT = {
  id: true,
  action: true,
  entityType: true,
  entityId: true,
  metadata: true,
  createdAt: true,
  actor: { select: { id: true, name: true } },
} satisfies Prisma.ActivitySelect;

export interface ActivityRow {
  id: string;
  action: Prisma.ActivityGetPayload<{ select: typeof ACTIVITY_SELECT }>['action'];
  entityType: string;
  entityId: string | null;
  metadata: ActivityMetadata;
  createdAt: Date;
  actor: { id: string; name: string };
}

export async function listActivity(
  workspaceId: string,
  take = 30,
  cursor?: string,
): Promise<{ rows: ActivityRow[]; nextCursor: string | null }> {
  const rows = await db.activity.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: ACTIVITY_SELECT,
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;

  return {
    rows: page.map((row) => ({
      ...row,
      metadata: (row.metadata ?? {}) as ActivityMetadata,
    })),
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  };
}

/* ------------------------------------------------------------------------ */
/* Notifications                                                             */
/* ------------------------------------------------------------------------ */

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  href: string | null;
  read: boolean;
  createdAt: Date;
}

export const loadNotifications = cache(
  async (userId: string, take = 12): Promise<{ rows: NotificationRow[]; unread: number }> => {
    const [rows, unread] = await Promise.all([
      db.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          type: true,
          title: true,
          message: true,
          href: true,
          read: true,
          createdAt: true,
        },
      }),
      db.notification.count({ where: { userId, read: false } }),
    ]);
    return { rows, unread };
  },
);

/* ------------------------------------------------------------------------ */
/* Invitations                                                               */
/* ------------------------------------------------------------------------ */

export interface PendingInvitation {
  id: string;
  email: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'REVOKED';
  expiresAt: Date;
  createdAt: Date;
  workspace: { id: string; name: string; description: string | null; currency: string };
  invitedBy: { id: string; name: string; email: string };
}

/** Invitations addressed to this user's email that are still actionable. */
export const loadIncomingInvitations = cache(async (email: string): Promise<PendingInvitation[]> => {
  const rows = await db.invitation.findMany({
    where: { email: email.toLowerCase(), status: 'PENDING', expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      status: true,
      expiresAt: true,
      createdAt: true,
      workspace: { select: { id: true, name: true, description: true, currency: true } },
      invitedBy: { select: { id: true, name: true, email: true } },
    },
  });
  return rows;
});

/** Invitations this workspace has sent — shown in shared settings. */
export async function loadWorkspaceInvitations(workspaceId: string): Promise<PendingInvitation[]> {
  return db.invitation.findMany({
    where: { workspaceId, status: { in: ['PENDING', 'DECLINED', 'EXPIRED'] } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      email: true,
      status: true,
      expiresAt: true,
      createdAt: true,
      workspace: { select: { id: true, name: true, description: true, currency: true } },
      invitedBy: { select: { id: true, name: true, email: true } },
    },
  });
}

/**
 * Expire stale invitations lazily on read. A cron job would be tidier, but
 * this keeps the deployment to a single process while still guaranteeing an
 * expired invite is never actionable (the accept path re-checks expiry too).
 */
export async function expireStaleInvitations(): Promise<void> {
  await db.invitation
    .updateMany({
      where: { status: 'PENDING', expiresAt: { lte: new Date() } },
      data: { status: 'EXPIRED' },
    })
    .catch(() => undefined);
}

/**
 * Resolve an invitation from the raw token in an invite link.
 *
 * The token itself is never stored — only its SHA-256 — so a leaked database
 * cannot be used to accept invitations, exactly as with session tokens.
 */
export async function findInvitationByToken(token: string): Promise<PendingInvitation | null> {
  if (!token || token.length > 200) return null;

  const crypto = await import('node:crypto');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  return db.invitation.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      email: true,
      status: true,
      expiresAt: true,
      createdAt: true,
      workspace: { select: { id: true, name: true, description: true, currency: true } },
      invitedBy: { select: { id: true, name: true, email: true } },
    },
  });
}
