'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../db';
import { ownershipForCreate, requireUser, resolveScope, type Scope } from '../scope';
import { actionFailure, conflict, forbidden, invalid, notFound, type ActionResult } from '../errors';
import { broadcastWorkspace, notifyAmount, notifyWorkspace, recordActivity } from '../activity';
import { publishChange } from '../realtime';
import { enforce } from '../rate-limit';
import {
  contributeSchema,
  createGoalSchema,
  deleteGoalSchema,
  fieldErrorsFrom,
  reparseMoney,
  updateGoalSchema,
} from '@/lib/validation';
import { fromDateTimeInputs } from '@/lib/date';
import { normaliseText } from '@/lib/utils';

/**
 * Goal mutations.
 *
 * `Goal.currentAmountMinor` is a denormalised running total. Every write that
 * touches it happens in the same database transaction as the contribution row
 * that justifies it, so the two can never disagree — the alternative
 * (recomputing a SUM on every read) would be correct but would make the goals
 * list quadratic in contribution history.
 */

function revalidateScope(scope: Scope): void {
  if (scope.kind === 'shared') {
    revalidatePath('/shared');
    revalidatePath('/shared/goals');
    revalidatePath('/shared/activity');
  } else {
    revalidatePath('/overview');
    revalidatePath('/goals');
  }
}

function announce(scope: Scope, actorId: string): void {
  publishChange(scope.scopeKey, 'goal', actorId);
  if (scope.kind === 'shared') broadcastWorkspace(scope.workspaceId, 'goal', actorId);
}

export async function createGoal(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    await enforce('mutation', user.id);

    const parsed = createGoalSchema.safeParse(input);
    if (!parsed.success) {
      throw invalid('Please check the form.', fieldErrorsFrom(parsed.error));
    }
    const data = parsed.data;

    const scope = await resolveScope(user, data.workspaceId);

    const target = reparseMoney(data.target, scope.currency);
    if (!target.ok) throw invalid(target.error, { target: target.error });
    if (target.minor <= 0) throw invalid('Set a target above zero.', { target: 'Enter a target.' });

    let initialMinor = 0;
    if (data.initial) {
      const initial = reparseMoney(data.initial, scope.currency);
      if (!initial.ok) throw invalid(initial.error, { initial: initial.error });
      initialMinor = initial.minor;
    }

    const deadline = data.deadline ? fromDateTimeInputs(data.deadline) : null;
    if (data.deadline && !deadline) {
      throw invalid('Choose a valid deadline.', { deadline: 'Choose a valid date.' });
    }

    const count = await db.goal.count({ where: { scopeKey: scope.scopeKey, archived: false } });
    if (count >= 30) throw invalid('You can track up to 30 goals at a time.');

    const ownership = ownershipForCreate(scope, 'goal');
    const name = normaliseText(data.name, 60);

    const created = await db.$transaction(async (tx) => {
      const goal = await tx.goal.create({
        data: {
          userId: ownership.userId,
          workspaceId: ownership.workspaceId,
          scopeKey: ownership.scopeKey,
          name,
          targetAmountMinor: target.minor,
          currentAmountMinor: initialMinor,
          deadline,
          theme: data.theme,
          icon: data.icon ?? null,
          // A starting balance is recorded as a real contribution so the
          // history and the running total always agree.
          contributions:
            initialMinor > 0
              ? { create: { userId: user.id, amountMinor: initialMinor, note: 'Starting balance' } }
              : undefined,
        },
        select: { id: true },
      });

      if (scope.kind === 'shared') {
        await recordActivity(tx, {
          workspaceId: scope.workspaceId,
          actorId: user.id,
          action: 'GOAL_CREATED',
          entityType: 'goal',
          entityId: goal.id,
          metadata: { label: name, amountMinor: target.minor, currency: scope.currency },
        });
      }

      return goal;
    });

    if (scope.kind === 'shared') {
      await notifyWorkspace({
        workspaceId: scope.workspaceId,
        actorId: user.id,
        type: 'SHARED_GOAL_CREATED',
        title: `${user.name} created a shared goal`,
        message: `${name} · target ${notifyAmount(target.minor, scope.currency)}`,
        href: '/shared/goals',
      });
    }

    announce(scope, user.id);
    revalidateScope(scope);

    return { ok: true, data: { id: created.id } };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function updateGoal(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await enforce('mutation', user.id);

    const parsed = updateGoalSchema.safeParse(input);
    if (!parsed.success) {
      throw invalid('Please check the form.', fieldErrorsFrom(parsed.error));
    }
    const data = parsed.data;

    const scope = await resolveScope(user, data.workspaceId);

    const existing = await db.goal.findFirst({
      where: { id: data.id, scopeKey: scope.scopeKey },
      select: { id: true, version: true, targetAmountMinor: true, name: true },
    });
    if (!existing) throw notFound('That goal no longer exists.');
    if (existing.version !== data.version) {
      throw conflict('Someone else updated this goal while you were editing. Reopen it to continue.');
    }

    const target = reparseMoney(data.target, scope.currency);
    if (!target.ok) throw invalid(target.error, { target: target.error });
    if (target.minor <= 0) throw invalid('Set a target above zero.', { target: 'Enter a target.' });

    const deadline = data.deadline ? fromDateTimeInputs(data.deadline) : null;
    if (data.deadline && !deadline) {
      throw invalid('Choose a valid deadline.', { deadline: 'Choose a valid date.' });
    }

    const name = normaliseText(data.name, 60);

    await db.$transaction(async (tx) => {
      const result = await tx.goal.updateMany({
        where: { id: data.id, scopeKey: scope.scopeKey, version: data.version },
        data: {
          name,
          targetAmountMinor: target.minor,
          deadline,
          theme: data.theme,
          version: { increment: 1 },
        },
      });
      if (result.count === 0) {
        throw conflict('Someone else just changed this goal. Reopen it and try again.');
      }

      if (scope.kind === 'shared') {
        await recordActivity(tx, {
          workspaceId: scope.workspaceId,
          actorId: user.id,
          action: 'GOAL_UPDATED',
          entityType: 'goal',
          entityId: data.id,
          metadata: {
            label: name,
            currency: scope.currency,
            previousAmountMinor: existing.targetAmountMinor,
            newAmountMinor: target.minor,
          },
        });
      }
    });

    announce(scope, user.id);
    revalidateScope(scope);

    return { ok: true };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function deleteGoal(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await enforce('mutation', user.id);

    const parsed = deleteGoalSchema.safeParse(input);
    if (!parsed.success) throw invalid('Could not delete that goal.');

    const scope = await resolveScope(user, parsed.data.workspaceId);

    const existing = await db.goal.findFirst({
      where: { id: parsed.data.id, scopeKey: scope.scopeKey },
      select: { id: true, name: true },
    });
    if (!existing) throw notFound('That goal no longer exists.');

    await db.$transaction(async (tx) => {
      // Contributions cascade with the goal.
      await tx.goal.deleteMany({ where: { id: existing.id, scopeKey: scope.scopeKey } });

      if (scope.kind === 'shared') {
        await recordActivity(tx, {
          workspaceId: scope.workspaceId,
          actorId: user.id,
          action: 'GOAL_DELETED',
          entityType: 'goal',
          entityId: existing.id,
          metadata: { label: existing.name },
        });
      }
    });

    announce(scope, user.id);
    revalidateScope(scope);

    return { ok: true };
  } catch (error) {
    return actionFailure(error);
  }
}

/* ------------------------------------------------------------------------ */
/* Contributions                                                             */
/* ------------------------------------------------------------------------ */

export async function contributeToGoal(input: unknown): Promise<ActionResult<{ currentMinor: number }>> {
  try {
    const user = await requireUser();
    await enforce('mutation', user.id);

    const parsed = contributeSchema.safeParse(input);
    if (!parsed.success) {
      throw invalid('Please check the form.', fieldErrorsFrom(parsed.error));
    }
    const data = parsed.data;

    const scope = await resolveScope(user, data.workspaceId);

    const amount = reparseMoney(data.amount, scope.currency);
    if (!amount.ok) throw invalid(amount.error, { amount: amount.error });
    if (amount.minor <= 0) throw invalid('Enter an amount above zero.', { amount: 'Enter an amount.' });

    const goal = await db.goal.findFirst({
      where: { id: data.goalId, scopeKey: scope.scopeKey, archived: false },
      select: { id: true, name: true, currentAmountMinor: true, targetAmountMinor: true },
    });
    if (!goal) throw notFound('That goal no longer exists.');

    // Who the contribution is credited to must be a real member of the space.
    let contributorId = user.id;
    if (data.contributorId && data.contributorId !== user.id) {
      if (scope.kind !== 'shared') {
        throw forbidden('You can only record your own contributions here.');
      }
      const isMember = scope.workspace.members.some((member) => member.userId === data.contributorId);
      if (!isMember) throw forbidden('That person is not part of this shared space.');
      contributorId = data.contributorId;
    }

    const updated = await db.$transaction(async (tx) => {
      await tx.goalContribution.create({
        data: {
          goalId: goal.id,
          userId: contributorId,
          amountMinor: amount.minor,
          note: data.note,
          date: new Date(),
        },
      });

      // `increment` makes this read-modify-write atomic at the database level,
      // so two simultaneous contributions cannot lose one another.
      const result = await tx.goal.update({
        where: { id: goal.id },
        data: {
          currentAmountMinor: { increment: amount.minor },
          version: { increment: 1 },
        },
        select: { currentAmountMinor: true },
      });

      if (scope.kind === 'shared') {
        await recordActivity(tx, {
          workspaceId: scope.workspaceId,
          actorId: user.id,
          action: 'GOAL_CONTRIBUTION_ADDED',
          entityType: 'goal',
          entityId: goal.id,
          metadata: { label: goal.name, amountMinor: amount.minor, currency: scope.currency },
        });
      }

      return result;
    });

    if (scope.kind === 'shared') {
      await notifyWorkspace({
        workspaceId: scope.workspaceId,
        actorId: user.id,
        type: 'SHARED_GOAL_CONTRIBUTION',
        title: `${user.name} contributed to ${goal.name}`,
        message: `${notifyAmount(amount.minor, scope.currency)} added · now ${notifyAmount(updated.currentAmountMinor, scope.currency)} saved`,
        href: '/shared/goals',
      });
    }

    announce(scope, user.id);
    revalidateScope(scope);

    return { ok: true, data: { currentMinor: updated.currentAmountMinor } };
  } catch (error) {
    return actionFailure(error);
  }
}

/** Remove a contribution and roll the goal total back by the same amount. */
export async function removeContribution(
  contributionId: string,
  workspaceId?: string | null,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await enforce('mutation', user.id);

    const scope = await resolveScope(user, workspaceId ?? null);

    const contribution = await db.goalContribution.findFirst({
      where: { id: contributionId, goal: { scopeKey: scope.scopeKey } },
      select: { id: true, amountMinor: true, goalId: true, goal: { select: { name: true } } },
    });
    if (!contribution) throw notFound('That contribution no longer exists.');

    await db.$transaction(async (tx) => {
      await tx.goalContribution.delete({ where: { id: contribution.id } });
      await tx.goal.update({
        where: { id: contribution.goalId },
        data: {
          // Clamped by the Goal_current_non_negative CHECK constraint.
          currentAmountMinor: { decrement: contribution.amountMinor },
          version: { increment: 1 },
        },
      });

      if (scope.kind === 'shared') {
        await recordActivity(tx, {
          workspaceId: scope.workspaceId,
          actorId: user.id,
          action: 'GOAL_UPDATED',
          entityType: 'goal',
          entityId: contribution.goalId,
          metadata: {
            label: contribution.goal.name,
            previousValue: 'contribution',
            newValue: 'removed',
          },
        });
      }
    });

    announce(scope, user.id);
    revalidateScope(scope);

    return { ok: true };
  } catch (error) {
    return actionFailure(error);
  }
}
