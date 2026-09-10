import 'server-only';
import { cache } from 'react';
import { db } from '../db';
import type { CategoryLike } from '@/lib/analytics';

/**
 * Reference data — categories, accounts, tags.
 *
 * Categories are global presets plus the caller's own; the WHERE clause never
 * widens to another user's custom categories.
 */

export interface CategoryOption extends CategoryLike {
  kind: 'EXPENSE' | 'INCOME' | 'BOTH';
  icon: string | null;
  isSystem: boolean;
}

export const loadCategories = cache(async (userId: string): Promise<CategoryOption[]> => {
  const rows = await db.category.findMany({
    where: { OR: [{ userId: null }, { userId }] },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      slug: true,
      color: true,
      icon: true,
      kind: true,
      isSystem: true,
    },
  });
  return rows;
});

export function categoriesForType(
  categories: readonly CategoryOption[],
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER',
): CategoryOption[] {
  if (type === 'TRANSFER') return categories.filter((category) => category.kind === 'BOTH');
  return categories.filter((category) => category.kind === type || category.kind === 'BOTH');
}

export interface AccountOption {
  id: string;
  name: string;
  type: 'CASH' | 'BANK' | 'WALLET' | 'CREDIT_CARD' | 'SAVINGS';
  last4: string | null;
  openingBalanceMinor: number;
  isDefault: boolean;
}

export const loadAccounts = cache(async (userId: string): Promise<AccountOption[]> => {
  return db.account.findMany({
    where: { userId, archived: false },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      name: true,
      type: true,
      last4: true,
      openingBalanceMinor: true,
      isDefault: true,
    },
  });
});

/**
 * Running balance per account = opening balance + income − expenses, counting
 * only the owner's personal rows so a shared expense never moves a personal
 * account balance.
 */
export async function loadAccountBalances(
  userId: string,
): Promise<{ accountId: string; balanceMinor: number }[]> {
  const rows = await db.transaction.groupBy({
    by: ['accountId', 'type'],
    where: { userId, workspaceId: null, accountId: { not: null } },
    _sum: { amountMinor: true },
  });

  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!row.accountId) continue;
    const sum = row._sum.amountMinor ?? 0;
    const delta = row.type === 'INCOME' ? sum : row.type === 'EXPENSE' ? -sum : 0;
    totals.set(row.accountId, (totals.get(row.accountId) ?? 0) + delta);
  }

  const accounts = await loadAccounts(userId);
  return accounts.map((account) => ({
    accountId: account.id,
    balanceMinor: account.openingBalanceMinor + (totals.get(account.id) ?? 0),
  }));
}

export const loadTags = cache(async (userId: string): Promise<{ id: string; name: string }[]> => {
  return db.tag.findMany({
    where: { userId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
    take: 100,
  });
});
