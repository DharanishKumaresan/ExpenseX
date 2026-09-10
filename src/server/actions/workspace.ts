'use server';

import { revalidatePath } from 'next/cache';
import crypto from 'node:crypto';
import { db } from '../db';
import { requireUser, requireWorkspace, requireWorkspaceOwner } from '../scope';
import { actionFailure, forbidden, invalid, notFound, type ActionResult } from '../errors';
import { broadcastWorkspace, notifyUser, recordActivity } from '../activity';
import { publishChange, userChannel } from '../realtime';
import { enforce } from '../rate-limit';
import {
  createWorkspaceSchema,
  fieldErrorsFrom,
  invitationResponseSchema,
  inviteSchema,
  memberActionSchema,
  updateWorkspaceSchema,
} from '@/lib/validation';
import { normaliseText } from '@/lib/utils';

/**
 * Shared workspace lifecycle.
 *
 * The invitation flow is deliberately two-sided: sending an invite grants
 * nothing. Access begins only when the recipient signs in and accepts, at
 * which point a WorkspaceMember row is created. An invite token is stored as a
 * hash, exactly like a session token.
 */

const INVITATION_TTL_DAYS = 14;

/** One active shared space per person keeps the two-person UX unambiguous. */
async function assertNoActiveWorkspace(userId: string, message: string): Promise<void> {
  const existing = await db.workspaceMember.findFirst({
    where: { userId, status: 'ACTIVE' },
    select: { id: true },
  });
  if (existing) throw invalid(message);
}

export async function createWorkspace(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    await enforce('mutation', user.id);

    const parsed = createWorkspaceSchema.safeParse({
      name: formData.get('name'),
      description: formData.get('description'),
      currency: formData.get('currency') ?? 'INR',
    });
    if (!parsed.success) {
      throw invalid('Please check the form.', fieldErrorsFrom(parsed.error));
    }

    await assertNoActiveWorkspace(
      user.id,
      'You are already part of a shared space. Leave it before creating another.',
    );

    const name = normaliseText(parsed.data.name, 50);

    const workspace = await db.$transaction(async (tx) => {
      const created = await tx.workspace.create({
        data: {
          name,
          description: parsed.data.description,
          currency: parsed.data.currency,
          ownerId: user.id,
          members: { create: { userId: user.id, role: 'OWNER', status: 'ACTIVE' } },
        },
        select: { id: true },
      });

      await recordActivity(tx, {
        workspaceId: created.id,
        actorId: user.id,
        action: 'WORKSPACE_CREATED',
        entityType: 'workspace',
        entityId: created.id,
        metadata: { label: name },
      });

      return created;
    });

    revalidatePath('/', 'layout');
    revalidatePath('/shared');

    return { ok: true, data: { id: workspace.id } };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function updateWorkspaceSettings(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await enforce('mutation', user.id);

    const parsed = updateWorkspaceSchema.safeParse({
      workspaceId: formData.get('workspaceId'),
      name: formData.get('name'),
      description: formData.get('description'),
      currency: formData.get('currency'),
    });
    if (!parsed.success) {
      throw invalid('Please check the form.', fieldErrorsFrom(parsed.error));
    }

    // Membership check happens here; a tampered workspaceId fails.
    const workspace = await requireWorkspace(parsed.data.workspaceId, user.id);
    const name = normaliseText(parsed.data.name, 50);

    await db.$transaction(async (tx) => {
      await tx.workspace.update({
        where: { id: workspace.id },
        data: {
          name,
          description: parsed.data.description,
          currency: parsed.data.currency,
        },
      });

      await recordActivity(tx, {
        workspaceId: workspace.id,
        actorId: user.id,
        action: 'WORKSPACE_SETTINGS_UPDATED',
        entityType: 'workspace',
        entityId: workspace.id,
        metadata: {
          label: name,
          previousValue: workspace.name === name ? workspace.currency : workspace.name,
          newValue: workspace.name === name ? parsed.data.currency : name,
        },
      });
    });

    broadcastWorkspace(workspace.id, 'membership', user.id);
    revalidatePath('/', 'layout');
    revalidatePath('/shared/settings');

    return { ok: true };
  } catch (error) {
    return actionFailure(error);
  }
}

/* ------------------------------------------------------------------------ */
/* Invitations                                                               */
/* ------------------------------------------------------------------------ */

export async function inviteToWorkspace(
  formData: FormData,
): Promise<ActionResult<{ inviteUrl: string | null; recipientHasAccount: boolean }>> {
  try {
    const user = await requireUser();
    await enforce('invite', user.id);

    const parsed = inviteSchema.safeParse({
      workspaceId: formData.get('workspaceId'),
      email: formData.get('email'),
    });
    if (!parsed.success) {
      throw invalid('Enter a valid email address.', fieldErrorsFrom(parsed.error));
    }

    const workspace = await requireWorkspaceOwner(parsed.data.workspaceId, user.id);
    const email = parsed.data.email;

    if (email === user.email.toLowerCase()) {
      throw invalid('That is your own email address.', { email: 'Invite someone else.' });
    }

    if (workspace.members.length >= workspace.memberLimit) {
      throw invalid(
        `This space is designed for ${workspace.memberLimit} people and is already full.`,
      );
    }

    const recipient = await db.user.findUnique({ where: { email }, select: { id: true, name: true } });

    if (recipient) {
      const alreadyHere = workspace.members.some((member) => member.userId === recipient.id);
      if (alreadyHere) throw invalid('They are already in this shared space.', { email: 'Already a member.' });

      const elsewhere = await db.workspaceMember.findFirst({
        where: { userId: recipient.id, status: 'ACTIVE' },
        select: { id: true },
      });
      if (elsewhere) {
        throw invalid('That person already belongs to another shared space.', {
          email: 'Already in a shared space.',
        });
      }
    }

    const pending = await db.invitation.findFirst({
      where: { workspaceId: workspace.id, email, status: 'PENDING', expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    if (pending) {
      throw invalid('An invitation is already waiting for that address.', {
        email: 'Invitation already sent.',
      });
    }

    // The raw token is returned once, to the inviter, and never stored.
    const token = crypto.randomBytes(24).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    await db.$transaction(async (tx) => {
      await tx.invitation.create({
        data: {
          workspaceId: workspace.id,
          email,
          tokenHash,
          invitedById: user.id,
          expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000),
        },
      });

      await recordActivity(tx, {
        workspaceId: workspace.id,
        actorId: user.id,
        action: 'MEMBER_INVITED',
        entityType: 'invitation',
        metadata: { label: email, memberName: recipient?.name ?? email },
      });
    });

    if (recipient) {
      await notifyUser({
        userId: recipient.id,
        workspaceId: workspace.id,
        type: 'WORKSPACE_INVITATION',
        title: `${user.name} invited you to a shared space`,
        message: `Join "${workspace.name}" to budget together.`,
        href: '/shared',
      });
      publishChange(userChannel(recipient.id), 'membership', user.id);
    }

    revalidatePath('/shared');
    revalidatePath('/shared/settings');

    return {
      ok: true,
      data: {
        // No mail transport is configured in this build, so the invite link is
        // surfaced in the UI for the inviter to pass on. See README.
        inviteUrl: `/invite/${token}`,
        recipientHasAccount: Boolean(recipient),
      },
    };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function respondToInvitation(input: unknown): Promise<ActionResult<{ workspaceId: string | null }>> {
  try {
    const user = await requireUser();
    await enforce('mutation', user.id);

    const parsed = invitationResponseSchema.safeParse(input);
    if (!parsed.success) throw invalid('Could not respond to that invitation.');

    const invitation = await db.invitation.findUnique({
      where: { id: parsed.data.invitationId },
      select: {
        id: true,
        email: true,
        status: true,
        expiresAt: true,
        workspaceId: true,
        invitedById: true,
        workspace: { select: { id: true, name: true, memberLimit: true } },
      },
    });

    // The invitation is addressed to an email; only the signed-in owner of
    // that address may act on it.
    if (!invitation || invitation.email !== user.email.toLowerCase()) {
      throw notFound('That invitation is no longer available.');
    }
    if (invitation.status !== 'PENDING') {
      throw invalid('That invitation has already been answered.');
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      await db.invitation.update({ where: { id: invitation.id }, data: { status: 'EXPIRED' } });
      throw invalid('That invitation has expired. Ask for a new one.');
    }

    if (!parsed.data.accept) {
      await db.$transaction(async (tx) => {
        await tx.invitation.update({
          where: { id: invitation.id },
          data: { status: 'DECLINED', respondedAt: new Date() },
        });
        await recordActivity(tx, {
          workspaceId: invitation.workspaceId,
          actorId: user.id,
          action: 'INVITATION_DECLINED',
          entityType: 'invitation',
          entityId: invitation.id,
          metadata: { memberName: user.name },
        });
      });

      await notifyUser({
        userId: invitation.invitedById,
        workspaceId: invitation.workspaceId,
        type: 'WORKSPACE_MEMBERSHIP',
        title: `${user.name} declined your invitation`,
        message: `They will not be joining "${invitation.workspace.name}".`,
        href: '/shared/settings',
      });

      revalidatePath('/', 'layout');
      return { ok: true, data: { workspaceId: null } };
    }

    await assertNoActiveWorkspace(
      user.id,
      'You already belong to a shared space. Leave it before joining another.',
    );

    const activeCount = await db.workspaceMember.count({
      where: { workspaceId: invitation.workspaceId, status: 'ACTIVE' },
    });
    if (activeCount >= invitation.workspace.memberLimit) {
      throw invalid('That shared space is already full.');
    }

    await db.$transaction(async (tx) => {
      await tx.workspaceMember.upsert({
        where: {
          workspaceId_userId: { workspaceId: invitation.workspaceId, userId: user.id },
        },
        create: {
          workspaceId: invitation.workspaceId,
          userId: user.id,
          role: 'MEMBER',
          status: 'ACTIVE',
        },
        update: { status: 'ACTIVE', joinedAt: new Date() },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      });

      await recordActivity(tx, {
        workspaceId: invitation.workspaceId,
        actorId: user.id,
        action: 'MEMBER_JOINED',
        entityType: 'member',
        entityId: user.id,
        metadata: { memberName: user.name },
      });
    });

    await notifyUser({
      userId: invitation.invitedById,
      workspaceId: invitation.workspaceId,
      type: 'WORKSPACE_MEMBERSHIP',
      title: `${user.name} joined your shared space`,
      message: `You can now budget together in "${invitation.workspace.name}".`,
      href: '/shared',
    });

    broadcastWorkspace(invitation.workspaceId, 'membership', user.id);
    revalidatePath('/', 'layout');

    return { ok: true, data: { workspaceId: invitation.workspaceId } };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function revokeInvitation(invitationId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();

    const invitation = await db.invitation.findUnique({
      where: { id: invitationId },
      select: { id: true, workspaceId: true, status: true },
    });
    if (!invitation) throw notFound('That invitation no longer exists.');

    await requireWorkspaceOwner(invitation.workspaceId, user.id);

    if (invitation.status === 'PENDING') {
      await db.invitation.update({ where: { id: invitation.id }, data: { status: 'REVOKED' } });
    }

    revalidatePath('/shared/settings');
    return { ok: true };
  } catch (error) {
    return actionFailure(error);
  }
}

/* ------------------------------------------------------------------------ */
/* Membership                                                                */
/* ------------------------------------------------------------------------ */

export async function removeMember(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();

    const parsed = memberActionSchema.safeParse({
      workspaceId: formData.get('workspaceId'),
      memberUserId: formData.get('memberUserId'),
    });
    if (!parsed.success) throw invalid('Could not remove that person.');

    const workspace = await requireWorkspaceOwner(parsed.data.workspaceId, user.id);

    if (parsed.data.memberUserId === user.id) {
      throw invalid('You cannot remove yourself. Delete the space instead.');
    }

    const member = workspace.members.find((entry) => entry.userId === parsed.data.memberUserId);
    if (!member) throw notFound('They are not part of this shared space.');

    await db.$transaction(async (tx) => {
      // Soft-remove: the shared history they contributed to stays intact and
      // attributable, but their access ends immediately.
      await tx.workspaceMember.updateMany({
        where: { workspaceId: workspace.id, userId: member.userId },
        data: { status: 'REMOVED' },
      });

      await recordActivity(tx, {
        workspaceId: workspace.id,
        actorId: user.id,
        action: 'MEMBER_REMOVED',
        entityType: 'member',
        entityId: member.userId,
        metadata: { memberName: member.name },
      });
    });

    await notifyUser({
      userId: member.userId,
      type: 'WORKSPACE_MEMBERSHIP',
      title: 'You were removed from a shared space',
      message: `You no longer have access to "${workspace.name}".`,
    });

    publishChange(userChannel(member.userId), 'membership', user.id);
    broadcastWorkspace(workspace.id, 'membership', user.id);
    revalidatePath('/', 'layout');

    return { ok: true };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function leaveWorkspace(workspaceId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const workspace = await requireWorkspace(workspaceId, user.id);

    if (workspace.role === 'OWNER') {
      throw forbidden('You own this space. Delete it instead of leaving.');
    }

    await db.$transaction(async (tx) => {
      await tx.workspaceMember.updateMany({
        where: { workspaceId: workspace.id, userId: user.id },
        data: { status: 'REMOVED' },
      });

      await recordActivity(tx, {
        workspaceId: workspace.id,
        actorId: user.id,
        action: 'MEMBER_LEFT',
        entityType: 'member',
        entityId: user.id,
        metadata: { memberName: user.name },
      });
    });

    await notifyUser({
      userId: workspace.ownerId,
      workspaceId: workspace.id,
      type: 'WORKSPACE_MEMBERSHIP',
      title: `${user.name} left the shared space`,
      message: `They no longer have access to "${workspace.name}".`,
      href: '/shared/settings',
    });

    broadcastWorkspace(workspace.id, 'membership', user.id);
    revalidatePath('/', 'layout');

    return { ok: true };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function deleteWorkspace(workspaceId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const workspace = await requireWorkspaceOwner(workspaceId, user.id);

    const partnerIds = workspace.members
      .filter((member) => !member.isSelf)
      .map((member) => member.userId);

    // Everything scoped to the workspace cascades from this one delete.
    await db.workspace.delete({ where: { id: workspace.id } });

    for (const partnerId of partnerIds) {
      await notifyUser({
        userId: partnerId,
        type: 'WORKSPACE_MEMBERSHIP',
        title: 'A shared space was deleted',
        message: `"${workspace.name}" and everything in it has been removed.`,
      });
      publishChange(userChannel(partnerId), 'membership', user.id);
    }

    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (error) {
    return actionFailure(error);
  }
}
