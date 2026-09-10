import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/server/auth/session';
import { resolveScope } from '@/server/scope';
import { AppError } from '@/server/errors';
import { db } from '@/server/db';
import { monthLabel } from '@/lib/date';
import { formatMoney } from '@/lib/money';
import type { SearchHit } from '@/components/shell/search-dialog';

/**
 * Global search, scoped to the caller's current workspace.
 *
 * `resolveScope` performs the membership check, so a crafted `?workspace=`
 * cannot reach another couple's data — it returns 403 instead.
 */

export const dynamic = 'force-dynamic';

const LIMIT = 8;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const url = new URL(request.url);
  const term = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
  const workspaceId = url.searchParams.get('workspace');

  if (term.length < 2) return NextResponse.json({ results: [] });

  try {
    const scope = await resolveScope(user, workspaceId);
    const shared = scope.kind === 'shared';
    const prefix = shared ? '/shared' : '';

    const [transactions, goals, budgets, categories] = await Promise.all([
      db.transaction.findMany({
        where: {
          scopeKey: scope.scopeKey,
          OR: [
            { merchant: { contains: term, mode: 'insensitive' } },
            { notes: { contains: term, mode: 'insensitive' } },
          ],
        },
        orderBy: { date: 'desc' },
        take: LIMIT,
        select: {
          id: true,
          merchant: true,
          amountMinor: true,
          type: true,
          date: true,
          category: { select: { name: true } },
        },
      }),
      db.goal.findMany({
        where: { scopeKey: scope.scopeKey, archived: false, name: { contains: term, mode: 'insensitive' } },
        take: 4,
        select: { id: true, name: true, targetAmountMinor: true, currentAmountMinor: true },
      }),
      db.budget.findMany({
        where: { scopeKey: scope.scopeKey },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        take: 24,
        select: { id: true, month: true, year: true, totalAmountMinor: true },
      }),
      db.category.findMany({
        where: {
          name: { contains: term, mode: 'insensitive' },
          OR: [{ userId: null }, { userId: user.id }],
        },
        take: 4,
        select: { id: true, name: true, kind: true },
      }),
    ]);

    const results: SearchHit[] = [
      ...transactions.map<SearchHit>((row) => ({
        kind: 'transaction',
        id: row.id,
        title: row.merchant,
        subtitle: row.category?.name ?? 'Uncategorised',
        amountMinor: row.type === 'EXPENSE' ? -row.amountMinor : row.amountMinor,
        date: row.date.toISOString(),
        href: `${prefix}/transactions?focus=${row.id}`,
      })),
      ...goals.map<SearchHit>((row) => ({
        kind: 'goal',
        id: row.id,
        title: row.name,
        subtitle: `${formatMoney(row.currentAmountMinor, scope.currency, { compactDecimals: true })} of ${formatMoney(row.targetAmountMinor, scope.currency, { compactDecimals: true })}`,
        href: `${prefix}/goals?focus=${row.id}`,
      })),
      // Budgets are matched by their month name client-side rather than in SQL,
      // since the label ("September 2026") is derived, not stored.
      ...budgets
        .filter((row) => monthLabel(row).toLowerCase().includes(term.toLowerCase()))
        .slice(0, 3)
        .map<SearchHit>((row) => ({
          kind: 'budget',
          id: row.id,
          title: monthLabel(row),
          subtitle: 'Monthly budget',
          amountMinor: row.totalAmountMinor,
          href: shared ? `/shared/budget?month=${row.month}&year=${row.year}` : `/budgets?month=${row.month}&year=${row.year}`,
        })),
      ...categories.map<SearchHit>((row) => ({
        kind: 'category',
        id: row.id,
        title: row.name,
        subtitle: 'Filter transactions by this category',
        href: `${prefix}/transactions?category=${row.id}`,
      })),
    ];

    return NextResponse.json({ results: results.slice(0, 14) });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: error.code === 'FORBIDDEN' ? 403 : 400 });
    }
    console.error('[expensex] search failed', error);
    return NextResponse.json({ error: 'Search is unavailable.' }, { status: 500 });
  }
}
