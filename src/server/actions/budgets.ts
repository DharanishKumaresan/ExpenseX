'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../db';
import { ownershipForCreate, requireUser, resolveScope, type Scope } from '../scope';
import { actionFailure, conflict, invalid, notFound, type ActionResult } from '../errors';
import { broadcastWorkspace, notifyAmount, notifyWorkspace, recordActivity } from '../activity';
import { publishChange } from '../realtime';
import { enforce } from '../rate-limit';
import { deleteBudgetSchema, fieldErrorsFrom, reparseMoney, saveBudgetSchema } from '@/lib/validation';
import { monthLabel } from '@/lib/date';
import { sumMinor } from '@/lib/money';

/**
 * Budget mutations.
 *
 * A budget is one row per (scope, year, month) — enforced by a unique index on
 * scopeKey so a user cannot end up with two competing budgets for September.
 * Saving replaces the allocation set atomically: partial writes would leave a
 * budget whose categories no longer add up.
 */

function revalidateScope(scope: Scope): void {
  if (scope.kind === 'shared') {
    revalidatePath('/shared');
    revalidatePath('/shared/budget');
    revalidatePath('/shared/activity');
  } else {
    revalidatePath('/overview');
    revalidatePath('/budgets');
    revalidatePath('/analytics');
  }
}

export async function saveBudget(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    await enforce('mutation', user.id);

    const parsed = saveBudgetSchema.safeParse(input);
    if (!parsed.success) {
      throw invalid('Please check the form.', fieldErrorsFrom(parsed.error));
    }
    const data = parsed.data;

    const scope = await resolveScope(user, data.workspaceId);

    const total = reparseMoney(data.total, scope.currency);
    if (!total.ok) throw invalid(total.error, { total: total.error });
    if (total.minor <= 0) {
      throw invalid('Set a budget greater than zero.', { total: 'Enter a budget amount.' });
    }

    // Validate every category up front so a bad id fails before any write.
    const categoryIds = data.allocations.map((allocation) => allocation.categoryId);
    const uniqueIds = Array.from(new Set(categoryIds));
    if (uniqueIds.length !== categoryIds.length) {
      throw invalid('Each category can only be allocated once.');
    }

    const known = await db.category.findMany({
      where: { id: { in: uniqueIds }, OR: [{ userId: null }, { userId: user.id }] },
      select: { id: true, name: true },
    });
    if (known.length !== uniqueIds.length) {
      throw invalid('One of those categories is no longer available.');
    }

    const allocations = data.allocations.map((allocation) => {
      const amount = reparseMoney(allocation.amount, scope.currency);
      if (!amount.ok) throw invalid(amount.error);
      return { categoryId: allocation.categoryId, allocatedAmountMinor: amount.minor };
    });

    const allocatedMinor = sumMinor(allocations.map((allocation) => allocation.allocatedAmountMinor));
    if (allocatedMinor > total.minor) {
      throw invalid('Allocations add up to more than the total budget.', {
        allocations: 'Reduce a category or raise the total.',
      });
    }

    const ownership = ownershipForCreate(scope, 'budget');
    const label = monthLabel({ month: data.month, year: data.year });

    const existing = await db.budget.findUnique({
      where: {
        scopeKey_year_month: { scopeKey: scope.scopeKey, year: data.year, month: data.month },
      },
      select: { id: true, version: true, totalAmountMinor: true },
    });

    // Optimistic concurrency: only checked when the client says it was editing
    // a version it had already loaded.
    if (existing && data.version !== undefined && existing.version !== data.version) {
      throw conflict(
        `${label} was changed by someone else while you were editing. Reload to see the current allocations.`,
      );
    }

    const budgetId = await db.$transaction(async (tx) => {
      let id: string;

      if (existing) {
        const result = await tx.budget.updateMany({
          where: {
            id: existing.id,
            scopeKey: scope.scopeKey,
            ...(data.version !== undefined ? { version: data.version } : {}),
          },
          data: { totalAmountMinor: total.minor, version: { increment: 1 } },
        });
        if (result.count === 0) {
          throw conflict('Someone else just saved this budget. Reload and try again.');
        }
        id = existing.id;

        // Replace the allocation set wholesale — simpler and safer than
        // diffing, and it runs inside this transaction either way.
        await tx.budgetCategory.deleteMany({ where: { budgetId: id } });
      } else {
        const created = await tx.budget.create({
          data: {
            userId: ownership.userId,
            workspaceId: ownership.workspaceId,
            scopeKey: ownership.scopeKey,
            month: data.month,
            year: data.year,
            totalAmountMinor: total.minor,
          },
          select: { id: true },
        });
        id = created.id;
      }

      if (allocations.length > 0) {
        await tx.budgetCategory.createMany({
          data: allocations.map((allocation) => ({ budgetId: id, ...allocation })),
        });
      }

      if (scope.kind === 'shared') {
        await recordActivity(tx, {
          workspaceId: scope.workspaceId,
          actorId: user.id,
          action: existing ? 'BUDGET_UPDATED' : 'BUDGET_CREATED',
          entityType: 'budget',
          entityId: id,
          metadata: {
            label,
            amountMinor: total.minor,
            currency: scope.currency,
            ...(existing
              ? { previousAmountMinor: existing.totalAmountMinor, newAmountMinor: total.minor }
              : {}),
          },
        });
      }

      return id;
    });

    if (scope.kind === 'shared') {
      await notifyWorkspace({
        workspaceId: scope.workspaceId,
        actorId: user.id,
        type: 'SHARED_BUDGET_CHANGED',
        title: existing ? `${user.name} changed the budget` : `${user.name} created a budget`,
        message: `${label} · ${notifyAmount(total.minor, scope.currency)}`,
        href: '/shared/budget',
      });
      broadcastWorkspace(scope.workspaceId, 'budget', user.id);
    }

    publishChange(scope.scopeKey, 'budget', user.id);
    revalidateScope(scope);

    return { ok: true, data: { id: budgetId } };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function deleteBudget(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await enforce('mutation', user.id);

    const parsed = deleteBudgetSchema.safeParse(input);
    if (!parsed.success) throw invalid('Could not delete that budget.');

    const scope = await resolveScope(user, parsed.data.workspaceId);

    const existing = await db.budget.findFirst({
      where: { id: parsed.data.id, scopeKey: scope.scopeKey },
      select: { id: true, month: true, year: true },
    });
    if (!existing) throw notFound('That budget no longer exists.');

    // Allocations cascade with the budget row.
    await db.budget.deleteMany({ where: { id: existing.id, scopeKey: scope.scopeKey } });

    if (scope.kind === 'shared') {
      await recordActivity(db, {
        workspaceId: scope.workspaceId,
        actorId: user.id,
        action: 'BUDGET_UPDATED',
        entityType: 'budget',
        entityId: existing.id,
        metadata: {
          label: monthLabel(existing),
          previousValue: 'budget',
          newValue: 'removed',
        },
      });
      broadcastWorkspace(scope.workspaceId, 'budget', user.id);
    }

    publishChange(scope.scopeKey, 'budget', user.id);
    revalidateScope(scope);

    return { ok: true };
  } catch (error) {
    return actionFailure(error);
  }
}
