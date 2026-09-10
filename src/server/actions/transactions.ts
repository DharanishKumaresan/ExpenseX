'use server';

import { revalidatePath } from 'next/cache';
import type { Prisma } from '@prisma/client';
import { db } from '../db';
import { assertPayerInWorkspace, ownershipForCreate, requireUser, resolveScope, type Scope } from '../scope';
import { actionFailure, conflict, invalid, notFound, type ActionResult } from '../errors';
import { broadcastWorkspace, notifyAmount, notifyWorkspace, recordActivity } from '../activity';
import { publishChange } from '../realtime';
import { enforce } from '../rate-limit';
import {
  createTransactionSchema,
  deleteTransactionSchema,
  fieldErrorsFrom,
  quickExpenseSchema,
  updateTransactionSchema,
} from '@/lib/validation';
import { fromDateTimeInputs, monthKeyOf, monthEnd, monthStart } from '@/lib/date';
import { reparseMoney } from '@/lib/validation';
import { budgetLevel } from '@/lib/analytics';
import { normaliseText } from '@/lib/utils';

/**
 * Transaction mutations.
 *
 * Shape of every action: authenticate → validate → resolve scope (which is
 * where authorisation happens) → write inside one database transaction →
 * publish the change. The client's `workspaceId` is an *input to the check*,
 * never a trusted assertion.
 */

/* ------------------------------------------------------------------------ */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------ */

/** Categories are global presets or the caller's own — never another user's. */
async function assertCategory(categoryId: string | null, userId: string): Promise<string | null> {
  if (!categoryId) return null;
  const category = await db.category.findFirst({
    where: { id: categoryId, OR: [{ userId: null }, { userId }] },
    select: { id: true },
  });
  if (!category) throw invalid('Choose a category from the list.', { categoryId: 'Unknown category.' });
  return category.id;
}

/** An account may only ever be one of the caller's own. */
async function assertAccount(accountId: string | null, userId: string): Promise<string | null> {
  if (!accountId) return null;
  const account = await db.account.findFirst({
    where: { id: accountId, userId, archived: false },
    select: { id: true },
  });
  if (!account) throw invalid('Choose an account from the list.', { accountId: 'Unknown account.' });
  return account.id;
}

/** Resolve tag names to ids, creating the caller's missing ones. */
async function resolveTagIds(names: readonly string[], userId: string): Promise<string[]> {
  const cleaned = Array.from(
    new Set(names.map((name) => normaliseText(name, 24)).filter((name) => name.length > 0)),
  ).slice(0, 8);
  if (cleaned.length === 0) return [];

  await db.tag.createMany({
    data: cleaned.map((name) => ({ userId, name })),
    skipDuplicates: true,
  });

  const tags = await db.tag.findMany({
    where: { userId, name: { in: cleaned } },
    select: { id: true },
  });
  return tags.map((tag) => tag.id);
}

function revalidateScope(scope: Scope): void {
  if (scope.kind === 'shared') {
    revalidatePath('/shared');
    revalidatePath('/shared/transactions');
    revalidatePath('/shared/budget');
    revalidatePath('/shared/activity');
  } else {
    revalidatePath('/overview');
    revalidatePath('/transactions');
    revalidatePath('/budgets');
    revalidatePath('/analytics');
  }
}

function announce(scope: Scope, actorId: string): void {
  publishChange(scope.scopeKey, 'transaction', actorId);
  if (scope.kind === 'shared') broadcastWorkspace(scope.workspaceId, 'transaction', actorId);
}

/**
 * After a shared expense lands, check whether it pushed its category over the
 * allocation. If so, record it and tell the other person once.
 */
async function reportBudgetBreach(
  scope: Scope,
  actorId: string,
  categoryId: string | null,
  date: Date,
): Promise<void> {
  if (scope.kind !== 'shared' || !categoryId) return;

  const monthKey = monthKeyOf(date);
  const budget = await db.budget.findUnique({
    where: {
      scopeKey_year_month: { scopeKey: scope.scopeKey, year: monthKey.year, month: monthKey.month },
    },
    select: {
      categories: {
        where: { categoryId },
        select: { allocatedAmountMinor: true, category: { select: { name: true } } },
      },
    },
  });

  const allocation = budget?.categories[0];
  if (!allocation || allocation.allocatedAmountMinor <= 0) return;

  const spent = await db.transaction.aggregate({
    where: {
      scopeKey: scope.scopeKey,
      categoryId,
      type: 'EXPENSE',
      date: { gte: monthStart(monthKey), lt: monthEnd(monthKey) },
    },
    _sum: { amountMinor: true },
  });

  const spentMinor = spent._sum.amountMinor ?? 0;
  if (budgetLevel(spentMinor, allocation.allocatedAmountMinor) !== 'overrun') return;

  const overByMinor = spentMinor - allocation.allocatedAmountMinor;
  const categoryName = allocation.category.name;

  await recordActivity(db, {
    workspaceId: scope.workspaceId,
    actorId,
    action: 'BUDGET_EXCEEDED',
    entityType: 'budget',
    metadata: {
      categoryName,
      amountMinor: overByMinor,
      currency: scope.currency,
      percentUsed: (spentMinor / allocation.allocatedAmountMinor) * 100,
    },
  });

  await notifyWorkspace({
    workspaceId: scope.workspaceId,
    actorId,
    type: 'SHARED_BUDGET_EXCEEDED',
    title: `${categoryName} is over budget`,
    message: `Spending is ${notifyAmount(overByMinor, scope.currency)} past the ${categoryName} allocation.`,
    href: '/shared/budget',
  });
}

/* ------------------------------------------------------------------------ */
/* Create                                                                    */
/* ------------------------------------------------------------------------ */

export async function createTransaction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    await enforce('mutation', user.id);

    const parsed = createTransactionSchema.safeParse(input);
    if (!parsed.success) {
      throw invalid('Please check the form.', fieldErrorsFrom(parsed.error));
    }
    const data = parsed.data;

    const scope = await resolveScope(user, data.workspaceId);

    // Re-parse the amount against the scope's real currency: decimal places
    // differ by currency, and the client does not get to decide which applies.
    const amount = reparseMoney(data.amount, scope.currency);
    if (!amount.ok) throw invalid(amount.error, { amount: amount.error });
    if (amount.minor <= 0) throw invalid('Enter an amount greater than zero.', { amount: 'Required.' });

    const when = fromDateTimeInputs(data.date, data.time || null);
    if (!when) throw invalid('Choose a valid date.', { date: 'Choose a valid date.' });

    const [categoryId, accountId, tagIds] = await Promise.all([
      assertCategory(data.categoryId, user.id),
      assertAccount(data.accountId, user.id),
      resolveTagIds(data.tags, user.id),
    ]);

    const paidByUserId = assertPayerInWorkspace(scope, data.paidByUserId ?? user.id);
    const ownership = ownershipForCreate(scope, 'transaction');
    const merchant = normaliseText(data.merchant, 80);

    const created = await db.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          userId: ownership.userId ?? user.id,
          workspaceId: ownership.workspaceId,
          scopeKey: ownership.scopeKey,
          type: data.type,
          amountMinor: amount.minor,
          currency: scope.currency,
          merchant,
          notes: data.notes,
          categoryId,
          accountId,
          paymentMethod: data.paymentMethod,
          paidByUserId,
          date: when,
          tags: tagIds.length > 0 ? { create: tagIds.map((tagId) => ({ tagId })) } : undefined,
        },
        select: { id: true, category: { select: { name: true } } },
      });

      if (scope.kind === 'shared') {
        await recordActivity(tx, {
          workspaceId: scope.workspaceId,
          actorId: user.id,
          action: 'TRANSACTION_CREATED',
          entityType: 'transaction',
          entityId: transaction.id,
          metadata: {
            label: merchant,
            amountMinor: amount.minor,
            currency: scope.currency,
            categoryName: transaction.category?.name,
          },
        });
      }

      return transaction;
    });

    if (scope.kind === 'shared') {
      await notifyWorkspace({
        workspaceId: scope.workspaceId,
        actorId: user.id,
        type: 'SHARED_TRANSACTION',
        title: `${user.name} added an expense`,
        message: `${notifyAmount(amount.minor, scope.currency)} · ${merchant}`,
        href: '/shared/transactions',
      });
      await reportBudgetBreach(scope, user.id, categoryId, when);
    }

    announce(scope, user.id);
    revalidateScope(scope);

    return { ok: true, data: { id: created.id } };
  } catch (error) {
    return actionFailure(error);
  }
}

/** The one-handed mobile flow: amount, what, category, done. */
export async function quickAddExpense(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = quickExpenseSchema.safeParse(input);
    if (!parsed.success) {
      throw invalid('Please check the form.', fieldErrorsFrom(parsed.error));
    }

    return await createTransaction({
      workspaceId: parsed.data.workspaceId,
      type: 'EXPENSE',
      amount: parsed.data.amount,
      merchant: parsed.data.merchant,
      categoryId: parsed.data.categoryId,
      paidByUserId: parsed.data.paidByUserId,
      paymentMethod: 'UPI',
      date: parsed.data.date,
      tags: [],
    });
  } catch (error) {
    return actionFailure(error);
  }
}

/* ------------------------------------------------------------------------ */
/* Update                                                                    */
/* ------------------------------------------------------------------------ */

export async function updateTransaction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    await enforce('mutation', user.id);

    const parsed = updateTransactionSchema.safeParse(input);
    if (!parsed.success) {
      throw invalid('Please check the form.', fieldErrorsFrom(parsed.error));
    }
    const data = parsed.data;

    const scope = await resolveScope(user, data.workspaceId);

    const existing = await db.transaction.findFirst({
      where: { id: data.id, scopeKey: scope.scopeKey },
      select: { id: true, version: true, amountMinor: true, merchant: true },
    });
    if (!existing) throw notFound('That transaction no longer exists.');

    // Optimistic concurrency: the form carried the version it was opened with.
    if (existing.version !== data.version) {
      throw conflict(
        'Someone else edited this transaction while you were working. Reopen it to see the latest version.',
      );
    }

    const amount = reparseMoney(data.amount, scope.currency);
    if (!amount.ok) throw invalid(amount.error, { amount: amount.error });

    const when = fromDateTimeInputs(data.date, data.time || null);
    if (!when) throw invalid('Choose a valid date.', { date: 'Choose a valid date.' });

    const [categoryId, accountId, tagIds] = await Promise.all([
      assertCategory(data.categoryId, user.id),
      assertAccount(data.accountId, user.id),
      resolveTagIds(data.tags, user.id),
    ]);

    const paidByUserId = assertPayerInWorkspace(scope, data.paidByUserId);
    const merchant = normaliseText(data.merchant, 80);

    await db.$transaction(async (tx) => {
      // The version predicate makes the guard atomic: two concurrent saves
      // cannot both pass the check above and both write.
      const result = await tx.transaction.updateMany({
        where: { id: data.id, scopeKey: scope.scopeKey, version: data.version },
        data: {
          type: data.type,
          amountMinor: amount.minor,
          merchant,
          notes: data.notes,
          categoryId,
          accountId,
          paymentMethod: data.paymentMethod,
          paidByUserId,
          date: when,
          version: { increment: 1 },
        },
      });

      if (result.count === 0) {
        throw conflict('Someone else just changed this transaction. Reopen it and try again.');
      }

      await tx.transactionTag.deleteMany({ where: { transactionId: data.id } });
      if (tagIds.length > 0) {
        await tx.transactionTag.createMany({
          data: tagIds.map((tagId) => ({ transactionId: data.id, tagId })),
          skipDuplicates: true,
        });
      }

      if (scope.kind === 'shared') {
        await recordActivity(tx, {
          workspaceId: scope.workspaceId,
          actorId: user.id,
          action: 'TRANSACTION_UPDATED',
          entityType: 'transaction',
          entityId: data.id,
          metadata: {
            label: merchant,
            currency: scope.currency,
            previousAmountMinor: existing.amountMinor,
            newAmountMinor: amount.minor,
          },
        });
      }
    });

    if (scope.kind === 'shared') {
      await reportBudgetBreach(scope, user.id, categoryId, when);
    }

    announce(scope, user.id);
    revalidateScope(scope);

    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return actionFailure(error);
  }
}

/* ------------------------------------------------------------------------ */
/* Delete & duplicate                                                        */
/* ------------------------------------------------------------------------ */

export async function deleteTransaction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await enforce('mutation', user.id);

    const parsed = deleteTransactionSchema.safeParse(input);
    if (!parsed.success) throw invalid('Could not delete that transaction.');

    const scope = await resolveScope(user, parsed.data.workspaceId);

    const existing = await db.transaction.findFirst({
      where: { id: parsed.data.id, scopeKey: scope.scopeKey },
      select: { id: true, merchant: true, amountMinor: true },
    });
    if (!existing) throw notFound('That transaction no longer exists.');

    await db.$transaction(async (tx) => {
      await tx.transaction.deleteMany({ where: { id: existing.id, scopeKey: scope.scopeKey } });

      if (scope.kind === 'shared') {
        await recordActivity(tx, {
          workspaceId: scope.workspaceId,
          actorId: user.id,
          action: 'TRANSACTION_DELETED',
          entityType: 'transaction',
          entityId: existing.id,
          metadata: {
            label: existing.merchant,
            amountMinor: existing.amountMinor,
            currency: scope.currency,
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

export async function duplicateTransaction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    await enforce('mutation', user.id);

    const parsed = deleteTransactionSchema.safeParse(input);
    if (!parsed.success) throw invalid('Could not duplicate that transaction.');

    const scope = await resolveScope(user, parsed.data.workspaceId);

    const source = await db.transaction.findFirst({
      where: { id: parsed.data.id, scopeKey: scope.scopeKey },
      select: {
        type: true,
        amountMinor: true,
        currency: true,
        merchant: true,
        notes: true,
        categoryId: true,
        accountId: true,
        paymentMethod: true,
        paidByUserId: true,
        tags: { select: { tagId: true } },
      },
    });
    if (!source) throw notFound('That transaction no longer exists.');

    const ownership = ownershipForCreate(scope, 'transaction');

    const created = await db.$transaction(async (tx) => {
      const copy = await tx.transaction.create({
        data: {
          userId: ownership.userId ?? user.id,
          workspaceId: ownership.workspaceId,
          scopeKey: ownership.scopeKey,
          type: source.type,
          amountMinor: source.amountMinor,
          currency: source.currency,
          merchant: source.merchant,
          notes: source.notes,
          categoryId: source.categoryId,
          accountId: source.accountId,
          paymentMethod: source.paymentMethod,
          paidByUserId: source.paidByUserId,
          // A duplicate is a new occurrence: dated now, not backdated.
          date: new Date(),
          tags:
            source.tags.length > 0
              ? { create: source.tags.map((tag) => ({ tagId: tag.tagId })) }
              : undefined,
        } satisfies Prisma.TransactionUncheckedCreateInput,
        select: { id: true },
      });

      if (scope.kind === 'shared') {
        await recordActivity(tx, {
          workspaceId: scope.workspaceId,
          actorId: user.id,
          action: 'TRANSACTION_CREATED',
          entityType: 'transaction',
          entityId: copy.id,
          metadata: {
            label: source.merchant,
            amountMinor: source.amountMinor,
            currency: scope.currency,
          },
        });
      }

      return copy;
    });

    announce(scope, user.id);
    revalidateScope(scope);

    return { ok: true, data: { id: created.id } };
  } catch (error) {
    return actionFailure(error);
  }
}
