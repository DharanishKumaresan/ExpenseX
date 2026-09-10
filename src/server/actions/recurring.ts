'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../db';
import { requireUser, resolveScope, type Scope } from '../scope';
import { actionFailure, invalid, notFound, type ActionResult } from '../errors';
import { publishChange } from '../realtime';
import { broadcastWorkspace } from '../activity';
import { enforce } from '../rate-limit';
import { fieldErrorsFrom, recurringIdSchema, reparseMoney, saveRecurringSchema } from '@/lib/validation';
import { addDays, addMonths, fromDateTimeInputs, startOfDay } from '@/lib/date';
import { normaliseText } from '@/lib/utils';

/**
 * Recurring commitments.
 *
 * These describe an expected future payment; they are not themselves ledger
 * entries. `nextDate` rolls forward when the user records that a payment
 * happened, which also writes a real Transaction — keeping the projection and
 * the ledger explicitly separate rather than silently inventing spending.
 */

function revalidateScope(scope: Scope): void {
  if (scope.kind === 'shared') {
    revalidatePath('/shared');
    revalidatePath('/shared/transactions');
  } else {
    revalidatePath('/overview');
    revalidatePath('/recurring');
    revalidatePath('/transactions');
  }
}

function advance(from: Date, frequency: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY'): Date {
  switch (frequency) {
    case 'WEEKLY':
      return addDays(from, 7);
    case 'QUARTERLY':
      return addMonths(from, 3);
    case 'YEARLY':
      return addMonths(from, 12);
    default:
      return addMonths(from, 1);
  }
}

export async function saveRecurring(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    await enforce('mutation', user.id);

    const parsed = saveRecurringSchema.safeParse(input);
    if (!parsed.success) {
      throw invalid('Please check the form.', fieldErrorsFrom(parsed.error));
    }
    const data = parsed.data;

    const scope = await resolveScope(user, data.workspaceId);

    const amount = reparseMoney(data.amount, scope.currency);
    if (!amount.ok) throw invalid(amount.error, { amount: amount.error });
    if (amount.minor <= 0) throw invalid('Enter an amount above zero.', { amount: 'Enter an amount.' });

    const nextDate = fromDateTimeInputs(data.nextDate);
    if (!nextDate) throw invalid('Choose a valid date.', { nextDate: 'Choose a valid date.' });

    const [category, account] = await Promise.all([
      data.categoryId
        ? db.category.findFirst({
            where: { id: data.categoryId, OR: [{ userId: null }, { userId: user.id }] },
            select: { id: true },
          })
        : Promise.resolve(null),
      data.accountId
        ? db.account.findFirst({
            where: { id: data.accountId, userId: user.id, archived: false },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    if (data.categoryId && !category) throw invalid('Choose a category from the list.');
    if (data.accountId && !account) throw invalid('Choose an account from the list.');

    const merchant = normaliseText(data.merchant, 80);

    if (data.id) {
      const result = await db.recurringTransaction.updateMany({
        where: { id: data.id, scopeKey: scope.scopeKey },
        data: {
          merchant,
          amountMinor: amount.minor,
          type: data.type,
          frequency: data.frequency,
          categoryId: category?.id ?? null,
          accountId: account?.id ?? null,
          paymentMethod: data.paymentMethod,
          notes: data.notes,
          nextDate,
        },
      });
      if (result.count === 0) throw notFound('That commitment no longer exists.');

      publishChange(scope.scopeKey, 'recurring', user.id);
      if (scope.kind === 'shared') broadcastWorkspace(scope.workspaceId, 'recurring', user.id);
      revalidateScope(scope);
      return { ok: true, data: { id: data.id } };
    }

    const count = await db.recurringTransaction.count({ where: { scopeKey: scope.scopeKey } });
    if (count >= 60) throw invalid('You can track up to 60 recurring items.');

    const created = await db.recurringTransaction.create({
      data: {
        userId: user.id,
        workspaceId: scope.kind === 'shared' ? scope.workspaceId : null,
        scopeKey: scope.scopeKey,
        merchant,
        amountMinor: amount.minor,
        currency: scope.currency,
        type: data.type,
        frequency: data.frequency,
        categoryId: category?.id ?? null,
        accountId: account?.id ?? null,
        paymentMethod: data.paymentMethod,
        notes: data.notes,
        startDate: nextDate,
        nextDate,
      },
      select: { id: true },
    });

    publishChange(scope.scopeKey, 'recurring', user.id);
    if (scope.kind === 'shared') broadcastWorkspace(scope.workspaceId, 'recurring', user.id);
    revalidateScope(scope);

    return { ok: true, data: { id: created.id } };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function setRecurringActive(input: unknown, active: boolean): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await enforce('mutation', user.id);

    const parsed = recurringIdSchema.safeParse(input);
    if (!parsed.success) throw invalid('Could not update that commitment.');

    const scope = await resolveScope(user, parsed.data.workspaceId);

    const result = await db.recurringTransaction.updateMany({
      where: { id: parsed.data.id, scopeKey: scope.scopeKey },
      data: { active },
    });
    if (result.count === 0) throw notFound('That commitment no longer exists.');

    publishChange(scope.scopeKey, 'recurring', user.id);
    revalidateScope(scope);
    return { ok: true };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function deleteRecurring(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await enforce('mutation', user.id);

    const parsed = recurringIdSchema.safeParse(input);
    if (!parsed.success) throw invalid('Could not delete that commitment.');

    const scope = await resolveScope(user, parsed.data.workspaceId);

    const result = await db.recurringTransaction.deleteMany({
      where: { id: parsed.data.id, scopeKey: scope.scopeKey },
    });
    if (result.count === 0) throw notFound('That commitment no longer exists.');

    publishChange(scope.scopeKey, 'recurring', user.id);
    revalidateScope(scope);
    return { ok: true };
  } catch (error) {
    return actionFailure(error);
  }
}

/**
 * Record that a recurring payment went out: writes the real transaction and
 * rolls `nextDate` forward by one interval, both in one database transaction.
 */
export async function recordRecurringPayment(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await enforce('mutation', user.id);

    const parsed = recurringIdSchema.safeParse(input);
    if (!parsed.success) throw invalid('Could not record that payment.');

    const scope = await resolveScope(user, parsed.data.workspaceId);

    const item = await db.recurringTransaction.findFirst({
      where: { id: parsed.data.id, scopeKey: scope.scopeKey, active: true },
      select: {
        id: true,
        merchant: true,
        amountMinor: true,
        type: true,
        frequency: true,
        categoryId: true,
        accountId: true,
        paymentMethod: true,
        nextDate: true,
      },
    });
    if (!item) throw notFound('That commitment no longer exists.');

    await db.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          userId: user.id,
          workspaceId: scope.kind === 'shared' ? scope.workspaceId : null,
          scopeKey: scope.scopeKey,
          type: item.type,
          amountMinor: item.amountMinor,
          currency: scope.currency,
          merchant: item.merchant,
          categoryId: item.categoryId,
          accountId: item.accountId,
          paymentMethod: item.paymentMethod,
          paidByUserId: scope.kind === 'shared' ? user.id : null,
          date: item.nextDate,
          notes: 'Recorded from a recurring commitment',
        },
      });

      await tx.recurringTransaction.update({
        where: { id: item.id },
        data: { nextDate: advance(item.nextDate, item.frequency) },
      });
    });

    publishChange(scope.scopeKey, 'transaction', user.id);
    if (scope.kind === 'shared') broadcastWorkspace(scope.workspaceId, 'transaction', user.id);
    revalidateScope(scope);

    return { ok: true };
  } catch (error) {
    return actionFailure(error);
  }
}

/**
 * Catch up any commitment whose next date has already passed, so the
 * "upcoming" list never shows a date in the past. Called on the recurring
 * page load; cheap because it only touches overdue rows.
 */
export async function rollForwardOverdue(workspaceId?: string | null): Promise<void> {
  try {
    const user = await requireUser();
    const scope = await resolveScope(user, workspaceId ?? null);
    const today = startOfDay(new Date());

    const overdue = await db.recurringTransaction.findMany({
      where: { scopeKey: scope.scopeKey, active: true, nextDate: { lt: today } },
      select: { id: true, nextDate: true, frequency: true },
      take: 50,
    });

    for (const item of overdue) {
      let next = item.nextDate;
      let guard = 0;
      while (next < today && guard < 400) {
        next = advance(next, item.frequency);
        guard += 1;
      }
      await db.recurringTransaction.update({ where: { id: item.id }, data: { nextDate: next } });
    }
  } catch {
    // Best-effort housekeeping; never block a page render on it.
  }
}
