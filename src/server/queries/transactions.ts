import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from '../db';
import type { Scope } from '../scope';
import { monthEnd, monthStart, type MonthKey } from '@/lib/date';

/**
 * Transaction reads.
 *
 * Every query starts from `scope.scopeKey`, which the caller can only obtain
 * from `resolveScope` after a membership check. There is no code path that
 * accepts a raw scope string from the client.
 */

export const TRANSACTION_SELECT = {
  id: true,
  type: true,
  amountMinor: true,
  currency: true,
  merchant: true,
  notes: true,
  date: true,
  paymentMethod: true,
  paidByUserId: true,
  userId: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true, slug: true, color: true, icon: true } },
  account: { select: { id: true, name: true, last4: true, type: true } },
  user: { select: { id: true, name: true } },
  paidByUser: { select: { id: true, name: true } },
  tags: { select: { tag: { select: { id: true, name: true } } } },
} satisfies Prisma.TransactionSelect;

export type TransactionRow = Prisma.TransactionGetPayload<{ select: typeof TRANSACTION_SELECT }>;

export interface TransactionFilters {
  search?: string;
  categoryIds?: string[];
  types?: ('EXPENSE' | 'INCOME' | 'TRANSFER')[];
  paymentMethods?: ('CASH' | 'UPI' | 'DEBIT_CARD' | 'CREDIT_CARD' | 'BANK_TRANSFER' | 'OTHER')[];
  accountIds?: string[];
  from?: Date;
  to?: Date;
  minMinor?: number;
  maxMinor?: number;
  paidByUserId?: string;
  sort?: 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc';
}

function whereFor(scope: Scope, filters: TransactionFilters): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = { scopeKey: scope.scopeKey };

  if (filters.search) {
    const term = filters.search.trim();
    if (term) {
      where.OR = [
        { merchant: { contains: term, mode: 'insensitive' } },
        { notes: { contains: term, mode: 'insensitive' } },
      ];
    }
  }
  if (filters.categoryIds?.length) where.categoryId = { in: filters.categoryIds };
  if (filters.types?.length) where.type = { in: filters.types };
  if (filters.paymentMethods?.length) where.paymentMethod = { in: filters.paymentMethods };
  if (filters.accountIds?.length) where.accountId = { in: filters.accountIds };
  if (filters.paidByUserId) where.paidByUserId = filters.paidByUserId;

  if (filters.from || filters.to) {
    where.date = {};
    if (filters.from) where.date.gte = filters.from;
    if (filters.to) where.date.lt = filters.to;
  }
  if (filters.minMinor !== undefined || filters.maxMinor !== undefined) {
    where.amountMinor = {};
    if (filters.minMinor !== undefined) where.amountMinor.gte = filters.minMinor;
    if (filters.maxMinor !== undefined) where.amountMinor.lte = filters.maxMinor;
  }

  return where;
}

function orderFor(sort: TransactionFilters['sort']): Prisma.TransactionOrderByWithRelationInput[] {
  switch (sort) {
    case 'date-asc':
      return [{ date: 'asc' }, { createdAt: 'asc' }];
    case 'amount-desc':
      return [{ amountMinor: 'desc' }, { date: 'desc' }];
    case 'amount-asc':
      return [{ amountMinor: 'asc' }, { date: 'desc' }];
    default:
      return [{ date: 'desc' }, { createdAt: 'desc' }];
  }
}

export interface TransactionPage {
  rows: TransactionRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export async function listTransactions(
  scope: Scope,
  filters: TransactionFilters = {},
  page = 1,
  pageSize = 25,
): Promise<TransactionPage> {
  const where = whereFor(scope, filters);
  const safePage = Math.max(1, page);

  // One round trip for the window, one for the count — never "fetch all and
  // slice in JS", which would degrade badly with a few years of history.
  const [rows, total] = await Promise.all([
    db.transaction.findMany({
      where,
      orderBy: orderFor(filters.sort),
      skip: (safePage - 1) * pageSize,
      take: pageSize,
      select: TRANSACTION_SELECT,
    }),
    db.transaction.count({ where }),
  ]);

  return {
    rows,
    total,
    page: safePage,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function recentTransactions(scope: Scope, take = 6): Promise<TransactionRow[]> {
  return db.transaction.findMany({
    where: { scopeKey: scope.scopeKey },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take,
    select: TRANSACTION_SELECT,
  });
}

export async function findTransaction(scope: Scope, id: string): Promise<TransactionRow | null> {
  // scopeKey in the WHERE, not checked after the fact: a mismatched id simply
  // returns nothing rather than leaking existence.
  return db.transaction.findFirst({
    where: { id, scopeKey: scope.scopeKey },
    select: TRANSACTION_SELECT,
  });
}

/** Lightweight rows for maths — no relations, no pagination. */
export interface AnalyticsTransaction {
  id: string;
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  amountMinor: number;
  date: Date;
  categoryId: string | null;
  merchant: string;
  paidByUserId: string | null;
}

export async function transactionsInRange(
  scope: Scope,
  from: Date,
  to: Date,
): Promise<AnalyticsTransaction[]> {
  return db.transaction.findMany({
    where: { scopeKey: scope.scopeKey, date: { gte: from, lt: to } },
    orderBy: { date: 'asc' },
    select: {
      id: true,
      type: true,
      amountMinor: true,
      date: true,
      categoryId: true,
      merchant: true,
      paidByUserId: true,
    },
  });
}

export async function transactionsForMonth(
  scope: Scope,
  monthKey: MonthKey,
): Promise<AnalyticsTransaction[]> {
  return transactionsInRange(scope, monthStart(monthKey), monthEnd(monthKey));
}

/** Earliest transaction date in a scope — bounds the analytics range picker. */
export async function firstTransactionDate(scope: Scope): Promise<Date | null> {
  const row = await db.transaction.findFirst({
    where: { scopeKey: scope.scopeKey },
    orderBy: { date: 'asc' },
    select: { date: true },
  });
  return row?.date ?? null;
}

export async function countTransactions(scope: Scope): Promise<number> {
  return db.transaction.count({ where: { scopeKey: scope.scopeKey } });
}

/** Merchant suggestions for the transaction form, most-used first. */
export async function merchantSuggestions(scope: Scope, take = 12): Promise<string[]> {
  const rows = await db.transaction.groupBy({
    by: ['merchant'],
    where: { scopeKey: scope.scopeKey },
    _count: { merchant: true },
    orderBy: { _count: { merchant: 'desc' } },
    take,
  });
  return rows.map((row) => row.merchant);
}
