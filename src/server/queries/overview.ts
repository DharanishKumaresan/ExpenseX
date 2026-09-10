import 'server-only';
import type { Scope } from '../scope';
import { loadCategories, type CategoryOption } from './reference';
import { findBudget, listGoalSummaries, upcomingRecurring } from './planning';
import { recentTransactions, transactionsForMonth, countTransactions, type AnalyticsTransaction } from './transactions';
import {
  budgetStatus,
  buildInsights,
  cashFlow,
  categoryBreakdown,
  headlineStats,
  type BudgetStatus,
  type CashFlow,
  type CategorySlice,
  type Insight,
} from '@/lib/analytics';
import { addMonthsToKey, monthEnd, monthStart, type MonthKey } from '@/lib/date';
import { formatMoney } from '@/lib/money';
import { swatchFor, swatchForKey } from '@/lib/categories';
import type { RadialSlice } from '@/components/charts/spending-radial';
import { toClientRow } from '@/components/transactions/types';

/**
 * Everything the Overview screen needs, in one place.
 *
 * Both the personal dashboard and the shared "Our Finances" dashboard call
 * this with their own verified Scope, which is what keeps the two views
 * genuinely identical in behaviour while remaining completely separate in data.
 */

export interface OverviewData {
  monthKey: MonthKey;
  currency: string;
  current: CashFlow;
  previous: CashFlow | null;
  hasPreviousMonth: boolean;
  breakdown: CategorySlice[];
  radial: RadialSlice[];
  budget: BudgetStatus | null;
  insights: Insight[];
  recent: ReturnType<typeof toClientRow>[];
  goals: Awaited<ReturnType<typeof listGoalSummaries>>;
  upcoming: Awaited<ReturnType<typeof upcomingRecurring>>;
  categories: CategoryOption[];
  totalTransactions: number;
  stats: ReturnType<typeof headlineStats>;
  monthTransactions: AnalyticsTransaction[];
}

export async function loadOverview(scope: Scope, monthKey: MonthKey): Promise<OverviewData> {
  const previousMonth = addMonthsToKey(monthKey, -1);

  const [
    monthTransactions,
    previousTransactions,
    categories,
    budget,
    recent,
    goals,
    upcoming,
    totalTransactions,
  ] = await Promise.all([
    transactionsForMonth(scope, monthKey),
    transactionsForMonth(scope, previousMonth),
    loadCategories(scope.userId),
    findBudget(scope, monthKey),
    recentTransactions(scope, 6),
    listGoalSummaries(scope, 3),
    upcomingRecurring(scope, 45, 4),
    countTransactions(scope),
  ]);

  const current = cashFlow(monthTransactions);
  const previous = previousTransactions.length > 0 ? cashFlow(previousTransactions) : null;
  const breakdown = categoryBreakdown(monthTransactions, categories);

  const status = budgetStatus(
    budget
      ? {
          totalAmountMinor: budget.totalAmountMinor,
          categories: budget.categories.map((entry) => ({
            categoryId: entry.categoryId,
            allocatedAmountMinor: entry.allocatedAmountMinor,
          })),
        }
      : null,
    monthTransactions,
    categories,
  );

  const insights = buildInsights({
    current,
    previous,
    breakdown,
    budget: status,
    hasPreviousMonth: previousTransactions.length > 0,
    formatAmount: (minor) => formatMoney(minor, scope.currency, { compactDecimals: true }),
  });

  return {
    monthKey,
    currency: scope.currency,
    current,
    previous,
    hasPreviousMonth: previousTransactions.length > 0,
    breakdown,
    radial: buildRadialSlices(monthTransactions, categories, breakdown),
    budget: status,
    insights,
    recent: recent.map(toClientRow),
    goals,
    upcoming,
    categories,
    totalTransactions,
    stats: headlineStats(breakdown.length > 0 ? monthTransactions : [], breakdown, monthStart(monthKey), monthEnd(monthKey)),
    monthTransactions,
  };
}

/**
 * Attach the individual expense amounts behind each category so the radial
 * can draw one ray per real transaction rather than a synthetic distribution.
 */
export function buildRadialSlices(
  transactions: readonly AnalyticsTransaction[],
  categories: readonly CategoryOption[],
  breakdown: readonly CategorySlice[],
): RadialSlice[] {
  const amountsByCategory = new Map<string, number[]>();

  for (const transaction of transactions) {
    if (transaction.type !== 'EXPENSE') continue;
    const key = transaction.categoryId ?? '__uncategorised__';
    const list = amountsByCategory.get(key);
    if (list) list.push(transaction.amountMinor);
    else amountsByCategory.set(key, [transaction.amountMinor]);
  }

  const colourByCategory = new Map(categories.map((category) => [category.id, category.color]));

  return breakdown.map((slice) => {
    const key = slice.categoryId ?? '__uncategorised__';
    const amounts = (amountsByCategory.get(key) ?? []).sort((a, b) => b - a);
    const colour = slice.categoryId ? colourByCategory.get(slice.categoryId) : null;

    return {
      key,
      name: slice.name,
      color: colour ? swatchFor(colour) : swatchForKey(slice.name),
      spentMinor: slice.spentMinor,
      share: slice.share,
      transactionCount: slice.transactionCount,
      amounts,
    };
  });
}
