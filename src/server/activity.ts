import 'server-only';
import type { ActivityAction, NotificationType, Prisma } from '@prisma/client';
import { db } from './db';
import { publishChange, userChannel } from './realtime';
import { workspaceScopeKey } from './scope';
import type { ActivityMetadata } from '@/lib/activity';
import { formatMoney } from '@/lib/money';

/**
 * Audit trail + notifications for shared workspaces.
 *
 * Every shared mutation records an Activity row inside the same database
 * transaction as the change itself, so the feed can never drift from reality.
 * Notifications fan out to the *other* member only — nobody is told about
 * their own action — and respect that member's preferences.
 */

export interface RecordActivityInput {
  workspaceId: string;
  actorId: string;
  action: ActivityAction;
  entityType: string;
  entityId?: string | null;
  metadata?: ActivityMetadata;
}

/**
 * Write the activity row. Accepts a transaction client so it commits atomically
 * with the change it describes.
 */
export async function recordActivity(
  client: Prisma.TransactionClient | typeof db,
  input: RecordActivityInput,
): Promise<void> {
  await client.activity.create({
    data: {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

type PreferenceKey =
  | 'sharedTransactions'
  | 'sharedBudgets'
  | 'sharedGoals'
  | 'budgetWarnings'
  | 'membership';

const PREFERENCE_FOR: Record<NotificationType, PreferenceKey> = {
  SHARED_TRANSACTION: 'sharedTransactions',
  SHARED_BUDGET_CHANGED: 'sharedBudgets',
  SHARED_BUDGET_EXCEEDED: 'budgetWarnings',
  SHARED_GOAL_CONTRIBUTION: 'sharedGoals',
  SHARED_GOAL_CREATED: 'sharedGoals',
  WORKSPACE_INVITATION: 'membership',
  WORKSPACE_MEMBERSHIP: 'membership',
};

export interface NotifyInput {
  workspaceId: string;
  /** Excluded from the fan-out; you are never notified of your own action. */
  actorId: string;
  type: NotificationType;
  title: string;
  message: string;
  href?: string;
}

/**
 * Notify the other members of a workspace. Runs after the write commits — a
 * failed notification must never roll back a saved transaction.
 */
export async function notifyWorkspace(input: NotifyInput): Promise<void> {
  try {
    const members = await db.workspaceMember.findMany({
      where: { workspaceId: input.workspaceId, status: 'ACTIVE', userId: { not: input.actorId } },
      select: { userId: true, user: { select: { notificationPrefs: true } } },
    });

    const preferenceKey = PREFERENCE_FOR[input.type];
    const recipients = members.filter((member) => {
      const prefs = member.user.notificationPrefs;
      // No row yet means defaults, and every default is on.
      return prefs ? prefs[preferenceKey] : true;
    });

    if (recipients.length === 0) return;

    await db.notification.createMany({
      data: recipients.map((member) => ({
        userId: member.userId,
        workspaceId: input.workspaceId,
        type: input.type,
        title: input.title,
        message: input.message,
        href: input.href ?? null,
      })),
    });

    for (const member of recipients) {
      publishChange(userChannel(member.userId), 'notification', input.actorId);
    }
  } catch (error) {
    console.error('[expensex] notification fan-out failed', error);
  }
}

/** Notify one specific user, used for invitations to people outside the space. */
export async function notifyUser(input: {
  userId: string;
  workspaceId?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  href?: string;
}): Promise<void> {
  try {
    const prefs = await db.notificationPreference.findUnique({ where: { userId: input.userId } });
    if (prefs && !prefs[PREFERENCE_FOR[input.type]]) return;

    await db.notification.create({
      data: {
        userId: input.userId,
        workspaceId: input.workspaceId ?? null,
        type: input.type,
        title: input.title,
        message: input.message,
        href: input.href ?? null,
      },
    });
    publishChange(userChannel(input.userId), 'notification', input.userId);
  } catch (error) {
    console.error('[expensex] notification failed', error);
  }
}

/**
 * Announce a shared change to every open client watching the workspace, and
 * mirror it onto each member's personal notification channel.
 */
export function broadcastWorkspace(
  workspaceId: string,
  entity: Parameters<typeof publishChange>[1],
  actorId: string,
): void {
  publishChange(workspaceScopeKey(workspaceId), entity, actorId);
}

/** Money formatted for a notification body. */
export function notifyAmount(minor: number, currency: string): string {
  return formatMoney(minor, currency, { compactDecimals: true });
}
