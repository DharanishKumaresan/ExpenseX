import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { WorkspaceRole } from '@prisma/client';
import { db } from './db';
import { forbidden, notFound, unauthenticated } from './errors';
import { getCurrentUser, type SessionUser } from './auth/session';

/**
 * The single gate every read and write passes through.
 *
 * A caller NEVER hands us a userId. It hands us at most a workspaceId, and we
 * decide — from the session cookie and a membership lookup — whether that
 * workspace is theirs and what scopeKey their query is allowed to touch. A
 * request that tampers with the workspace id in a form field reaches
 * `requireWorkspace`, fails the membership check, and gets a 403 instead of
 * another couple's ledger.
 */

export function personalScopeKey(userId: string): string {
  return `u:${userId}`;
}

export function workspaceScopeKey(workspaceId: string): string {
  return `w:${workspaceId}`;
}

export interface WorkspaceMemberView {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: WorkspaceRole;
  isSelf: boolean;
}

export interface WorkspaceContext {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  memberLimit: number;
  ownerId: string;
  role: WorkspaceRole;
  members: WorkspaceMemberView[];
  /** The other person, when the workspace has been joined. */
  partner: WorkspaceMemberView | null;
}

export type Scope =
  | {
      kind: 'personal';
      scopeKey: string;
      userId: string;
      workspaceId: null;
      currency: string;
      workspace: null;
    }
  | {
      kind: 'shared';
      scopeKey: string;
      userId: string;
      workspaceId: string;
      currency: string;
      workspace: WorkspaceContext;
    };

/* ------------------------------------------------------------------------ */
/* Session                                                                   */
/* ------------------------------------------------------------------------ */

/** For Server Actions and route handlers: throws, so callers can report it. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthenticated();
  return user;
}

/** For pages: redirects to the login screen, preserving where they were going. */
export async function requireUserPage(returnTo?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : '/login');
  }
  return user;
}

/* ------------------------------------------------------------------------ */
/* Workspace membership                                                      */
/* ------------------------------------------------------------------------ */

/**
 * Load a workspace *only if* the current user is an ACTIVE member of it.
 * Returns null rather than throwing so callers can choose their own failure.
 */
export const loadWorkspaceForUser = cache(
  async (workspaceId: string, userId: string): Promise<WorkspaceContext | null> => {
    if (!workspaceId) return null;

    const workspace = await db.workspace.findFirst({
      where: {
        id: workspaceId,
        // The membership predicate lives in the WHERE clause, so a
        // non-member's query returns no row at all.
        members: { some: { userId, status: 'ACTIVE' } },
      },
      select: {
        id: true,
        name: true,
        description: true,
        currency: true,
        memberLimit: true,
        ownerId: true,
        members: {
          where: { status: 'ACTIVE' },
          orderBy: { joinedAt: 'asc' },
          select: {
            role: true,
            user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          },
        },
      },
    });

    if (!workspace) return null;

    const members: WorkspaceMemberView[] = workspace.members.map((member) => ({
      userId: member.user.id,
      name: member.user.name,
      email: member.user.email,
      avatarUrl: member.user.avatarUrl,
      role: member.role,
      isSelf: member.user.id === userId,
    }));

    const self = members.find((member) => member.isSelf);
    if (!self) return null;

    return {
      id: workspace.id,
      name: workspace.name,
      description: workspace.description,
      currency: workspace.currency,
      memberLimit: workspace.memberLimit,
      ownerId: workspace.ownerId,
      role: self.role,
      members,
      partner: members.find((member) => !member.isSelf) ?? null,
    };
  },
);

export async function requireWorkspace(workspaceId: string, userId: string): Promise<WorkspaceContext> {
  const workspace = await loadWorkspaceForUser(workspaceId, userId);
  if (!workspace) {
    // Deliberately indistinguishable from "does not exist": a probe must not
    // learn that some other couple's workspace id is real.
    throw forbidden('You no longer have access to this shared space.');
  }
  return workspace;
}

export async function requireWorkspaceOwner(
  workspaceId: string,
  userId: string,
): Promise<WorkspaceContext> {
  const workspace = await requireWorkspace(workspaceId, userId);
  if (workspace.role !== 'OWNER') {
    throw forbidden('Only the owner of this shared space can do that.');
  }
  return workspace;
}

/** The user's single active shared workspace, if they have one. */
export const loadActiveWorkspace = cache(async (userId: string): Promise<WorkspaceContext | null> => {
  const membership = await db.workspaceMember.findFirst({
    where: { userId, status: 'ACTIVE' },
    orderBy: { joinedAt: 'asc' },
    select: { workspaceId: true },
  });
  if (!membership) return null;
  return loadWorkspaceForUser(membership.workspaceId, userId);
});

/* ------------------------------------------------------------------------ */
/* Scope resolution                                                          */
/* ------------------------------------------------------------------------ */

/**
 * Turn an untrusted `workspaceId` from the client into a verified Scope.
 * Passing null (or omitting it) selects the caller's personal scope.
 */
export async function resolveScope(
  user: SessionUser,
  workspaceId?: string | null,
): Promise<Scope> {
  if (!workspaceId) {
    return {
      kind: 'personal',
      scopeKey: personalScopeKey(user.id),
      userId: user.id,
      workspaceId: null,
      currency: user.currency,
      workspace: null,
    };
  }

  const workspace = await requireWorkspace(workspaceId, user.id);
  return {
    kind: 'shared',
    scopeKey: workspaceScopeKey(workspace.id),
    userId: user.id,
    workspaceId: workspace.id,
    currency: workspace.currency,
    workspace,
  };
}

/**
 * Ownership columns for a NEW scoped row.
 *
 * Transaction/RecurringTransaction always record a creator, so `userId` stays
 * set in both scopes. Budget/Goal belong to the space itself, so a shared one
 * has no owning user — see the XOR CHECK constraint in the initial migration.
 */
export function ownershipForCreate(scope: Scope, entity: 'transaction' | 'budget' | 'goal') {
  if (scope.kind === 'personal') {
    return { userId: scope.userId, workspaceId: null, scopeKey: scope.scopeKey };
  }
  return {
    userId: entity === 'transaction' ? scope.userId : null,
    workspaceId: scope.workspaceId,
    scopeKey: scope.scopeKey,
  } as { userId: string | null; workspaceId: string; scopeKey: string };
}

/**
 * Confirm a `paidByUserId` submitted by the client is one of the two people in
 * the workspace. Without this a caller could attribute a payment to a stranger.
 */
export function assertPayerInWorkspace(scope: Scope, paidByUserId: string | null | undefined): string | null {
  if (!paidByUserId) return null;
  if (scope.kind !== 'shared') {
    // "Who paid" is meaningless on a personal row, and the DB rejects it too.
    return null;
  }
  const isMember = scope.workspace.members.some((member) => member.userId === paidByUserId);
  if (!isMember) throw forbidden('That person is not a member of this shared space.');
  return paidByUserId;
}

/** Assert a scoped row that was loaded by id really belongs to this scope. */
export function assertInScope<T extends { scopeKey: string }>(row: T | null, scope: Scope): T {
  if (!row || row.scopeKey !== scope.scopeKey) throw notFound();
  return row;
}
