import { percentOf, sumMinor } from './money';
import { addDays, daysBetween, monthKeyOf, startOfDay, type MonthKey } from './date';
import { FREQUENCY_PER_YEAR, type frequencySchema } from './validation';
import type { z } from 'zod';

/**
 * Derived financial figures.
 *
 * Every function here is pure: rows in, numbers out. Nothing reads the
 * database, nothing reads the clock unless the caller passes it in. That makes
 * the money maths independently testable and keeps a single definition of
 * "savings rate" or "budget utilisation" for personal and shared alike.
 *
 * All monetary inputs and outputs are integer minor units.
 */

export interface TransactionLike {
  id: string;
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  amountMinor: number;
  date: Date;
  categoryId: string | null;
  merchant: string;
  paidByUserId?: string | null;
}

export interface CategoryLike {
  id: string;
  name: string;
  color: string | null;
  slug: string;
}

/* ------------------------------------------------------------------------ */
/* Cash flow                                                                 */
/* ------------------------------------------------------------------------ */

export interface CashFlow {
  incomeMinor: number;
  expenseMinor: number;
  /** income − expense. Negative means the period ran at a loss. */
  netMinor: number;
  /** (income − expense) / income × 100. Null when there was no income. */
  savingsRate: number | null;
  transactionCount: number;
}

export function cashFlow(transactions: readonly TransactionLike[]): CashFlow {
  let incomeMinor = 0;
  let expenseMinor = 0;
  let counted = 0;

  for (const transaction of transactions) {
    // Transfers move money between the user's own accounts; counting them
    // would double-count both sides and distort every ratio below.
    if (transaction.type === 'TRANSFER') continue;
    if (transaction.type === 'INCOME') incomeMinor += transaction.amountMinor;
    else expenseMinor += transaction.amountMinor;
    counted += 1;
  }

  const netMinor = incomeMinor - expenseMinor;
  return {
    incomeMinor,
    expenseMinor,
    netMinor,
    savingsRate: incomeMinor > 0 ? (netMinor / incomeMinor) * 100 : null,
    transactionCount: counted,
  };
}

/* ------------------------------------------------------------------------ */
/* Category distribution                                                     */
/* ------------------------------------------------------------------------ */

export interface CategorySlice {
  categoryId: string | null;
  name: string;
  slug: string;
  color: string | null;
  spentMinor: number;
  share: number;
  transactionCount: number;
}

/** Expense-only breakdown, largest first. Drives the radial visualisation. */
export function categoryBreakdown(
  transactions: readonly TransactionLike[],
  categories: readonly CategoryLike[],
): CategorySlice[] {
  const index = new Map(categories.map((category) => [category.id, category]));
  const totals = new Map<string, { spentMinor: number; count: number }>();

  let overall = 0;
  for (const transaction of transactions) {
    if (transaction.type !== 'EXPENSE') continue;
    const key = transaction.categoryId ?? '__uncategorised__';
    const entry = totals.get(key) ?? { spentMinor: 0, count: 0 };
    entry.spentMinor += transaction.amountMinor;
    entry.count += 1;
    totals.set(key, entry);
    overall += transaction.amountMinor;
  }

  return Array.from(totals.entries())
    .map(([key, entry]) => {
      const category = key === '__uncategorised__' ? undefined : index.get(key);
      return {
        categoryId: category?.id ?? null,
        name: category?.name ?? 'Uncategorised',
        slug: category?.slug ?? 'uncategorised',
        color: category?.color ?? null,
        spentMinor: entry.spentMinor,
        share: percentOf(entry.spentMinor, overall),
        transactionCount: entry.count,
      };
    })
    .sort((a, b) => b.spentMinor - a.spentMinor);
}

/* ------------------------------------------------------------------------ */
/* Budgets                                                                   */
/* ------------------------------------------------------------------------ */

export type BudgetLevel = 'none' | 'healthy' | 'warning' | 'reached' | 'overrun';

/**
 * Thresholds are shared by the personal and shared budget screens so the two
 * never disagree about what "warning" means.
 */
export const BUDGET_WARNING_THRESHOLD = 80;

export function budgetLevel(spentMinor: number, allocatedMinor: number): BudgetLevel {
  if (allocatedMinor <= 0) return 'none';
  const used = percentOf(spentMinor, allocatedMinor);
  if (used > 100) return 'overrun';
  if (used === 100) return 'reached';
  if (used >= BUDGET_WARNING_THRESHOLD) return 'warning';
  return 'healthy';
}

/** Text for each level. Warnings are never communicated by colour alone. */
export const BUDGET_LEVEL_LABEL: Record<BudgetLevel, string> = {
  none: 'Not allocated',
  healthy: 'On track',
  warning: 'Close to limit',
  reached: 'Limit reached',
  overrun: 'Budget overrun',
};

export interface CategoryBudgetStatus {
  categoryId: string;
  name: string;
  slug: string;
  color: string | null;
  allocatedMinor: number;
  spentMinor: number;
  remainingMinor: number;
  /** Negative remaining expressed positively, for "+₹1,240 OVER". */
  overByMinor: number;
  used: number;
  level: BudgetLevel;
  transactionCount: number;
}

export interface BudgetStatus {
  totalMinor: number;
  allocatedMinor: number;
  unallocatedMinor: number;
  spentMinor: number;
  remainingMinor: number;
  used: number;
  level: BudgetLevel;
  categories: CategoryBudgetStatus[];
  overrunCategories: CategoryBudgetStatus[];
}

export function budgetStatus(
  budget: { totalAmountMinor: number; categories: { categoryId: string; allocatedAmountMinor: number }[] } | null,
  transactions: readonly TransactionLike[],
  categories: readonly CategoryLike[],
): BudgetStatus | null {
  if (!budget) return null;

  const categoryIndex = new Map(categories.map((category) => [category.id, category]));
  const spentByCategory = new Map<string, { minor: number; count: number }>();
  let spentMinor = 0;

  for (const transaction of transactions) {
    if (transaction.type !== 'EXPENSE') continue;
    spentMinor += transaction.amountMinor;
    if (!transaction.categoryId) continue;
    const entry = spentByCategory.get(transaction.categoryId) ?? { minor: 0, count: 0 };
    entry.minor += transaction.amountMinor;
    entry.count += 1;
    spentByCategory.set(transaction.categoryId, entry);
  }

  const rows: CategoryBudgetStatus[] = budget.categories.map((allocation) => {
    const category = categoryIndex.get(allocation.categoryId);
    const spent = spentByCategory.get(allocation.categoryId) ?? { minor: 0, count: 0 };
    const remaining = allocation.allocatedAmountMinor - spent.minor;
    return {
      categoryId: allocation.categoryId,
      name: category?.name ?? 'Category',
      slug: category?.slug ?? 'other',
      color: category?.color ?? null,
      allocatedMinor: allocation.allocatedAmountMinor,
      spentMinor: spent.minor,
      remainingMinor: Math.max(0, remaining),
      overByMinor: Math.max(0, -remaining),
      used: percentOf(spent.minor, allocation.allocatedAmountMinor),
      level: budgetLevel(spent.minor, allocation.allocatedAmountMinor),
      transactionCount: spent.count,
    };
  });

  rows.sort((a, b) => b.used - a.used);

  const allocatedMinor = sumMinor(budget.categories.map((entry) => entry.allocatedAmountMinor));

  return {
    totalMinor: budget.totalAmountMinor,
    allocatedMinor,
    unallocatedMinor: budget.totalAmountMinor - allocatedMinor,
    spentMinor,
    remainingMinor: budget.totalAmountMinor - spentMinor,
    used: percentOf(spentMinor, budget.totalAmountMinor),
    level: budgetLevel(spentMinor, budget.totalAmountMinor),
    categories: rows,
    overrunCategories: rows.filter((row) => row.level === 'overrun'),
  };
}

/** Per-person spend inside a shared category, for "WHO SPENT". */
export function spendByMember(
  transactions: readonly TransactionLike[],
  members: readonly { userId: string; name: string }[],
  categoryId?: string,
): { userId: string; name: string; spentMinor: number }[] {
  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.type !== 'EXPENSE') continue;
    if (categoryId && transaction.categoryId !== categoryId) continue;
    const payer = transaction.paidByUserId;
    if (!payer) continue;
    totals.set(payer, (totals.get(payer) ?? 0) + transaction.amountMinor);
  }
  return members.map((member) => ({
    userId: member.userId,
    name: member.name,
    spentMinor: totals.get(member.userId) ?? 0,
  }));
}

/* ------------------------------------------------------------------------ */
/* Goals                                                                     */
/* ------------------------------------------------------------------------ */

export interface ContributionLike {
  userId: string;
  amountMinor: number;
  date: Date;
}

export interface GoalProgress {
  targetMinor: number;
  currentMinor: number;
  remainingMinor: number;
  progress: number;
  complete: boolean;
  daysRemaining: number | null;
  overdue: boolean;
  /** Null when the contribution history is too thin to justify a projection. */
  estimatedCompletion: Date | null;
  averageMonthlyMinor: number | null;
  contributorTotals: { userId: string; amountMinor: number }[];
}

/**
 * Minimum evidence before projecting a completion date. Two contributions a
 * day apart imply a rate that would be nonsense to extrapolate, so we require
 * both a count and a time span — otherwise the UI says NOT ENOUGH DATA.
 */
const MIN_CONTRIBUTIONS_FOR_ESTIMATE = 2;
const MIN_HISTORY_DAYS_FOR_ESTIMATE = 14;

export function goalProgress(
  goal: { targetAmountMinor: number; currentAmountMinor: number; deadline: Date | null },
  contributions: readonly ContributionLike[],
  now: Date = new Date(),
): GoalProgress {
  const remainingMinor = Math.max(0, goal.targetAmountMinor - goal.currentAmountMinor);
  const complete = goal.currentAmountMinor >= goal.targetAmountMinor;

  const totals = new Map<string, number>();
  for (const contribution of contributions) {
    totals.set(contribution.userId, (totals.get(contribution.userId) ?? 0) + contribution.amountMinor);
  }

  const daysRemaining = goal.deadline ? daysBetween(now, goal.deadline) : null;

  let estimatedCompletion: Date | null = null;
  let averageMonthlyMinor: number | null = null;

  if (contributions.length >= MIN_CONTRIBUTIONS_FOR_ESTIMATE) {
    const sorted = [...contributions].sort((a, b) => a.date.getTime() - b.date.getTime());
    const first = sorted[0]?.date;
    if (first) {
      const spanDays = Math.max(1, daysBetween(first, now));
      if (spanDays >= MIN_HISTORY_DAYS_FOR_ESTIMATE) {
        const totalMinor = sumMinor(sorted.map((entry) => entry.amountMinor));
        const perDay = totalMinor / spanDays;
        averageMonthlyMinor = Math.round(perDay * 30.44);
        if (perDay > 0 && !complete) {
          const daysNeeded = Math.ceil(remainingMinor / perDay);
          // Beyond ~8 years the projection is noise, not information.
          if (daysNeeded <= 3000) {
            estimatedCompletion = startOfDay(addDays(now, daysNeeded));
          }
        }
      }
    }
  }

  return {
    targetMinor: goal.targetAmountMinor,
    currentMinor: goal.currentAmountMinor,
    remainingMinor,
    progress: Math.min(100, percentOf(goal.currentAmountMinor, goal.targetAmountMinor)),
    complete,
    daysRemaining,
    overdue: daysRemaining !== null && daysRemaining < 0 && !complete,
    estimatedCompletion,
    averageMonthlyMinor,
    contributorTotals: Array.from(totals.entries())
      .map(([userId, amountMinor]) => ({ userId, amountMinor }))
      .sort((a, b) => b.amountMinor - a.amountMinor),
  };
}

/* ------------------------------------------------------------------------ */
/* Recurring commitments                                                     */
/* ------------------------------------------------------------------------ */

export interface RecurringLike {
  amountMinor: number;
  frequency: z.infer<typeof frequencySchema>;
  active: boolean;
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
}

export interface RecurringTotals {
  monthlyMinor: number;
  yearlyMinor: number;
  activeCount: number;
  pausedCount: number;
}

/**
 * Normalise every cadence to a yearly figure first, then divide. Going the
 * other way (weekly × 4) would quietly lose four weeks a year.
 */
export function recurringTotals(items: readonly RecurringLike[]): RecurringTotals {
  let yearlyMinor = 0;
  let activeCount = 0;
  let pausedCount = 0;

  for (const item of items) {
    if (!item.active) {
      pausedCount += 1;
      continue;
    }
    activeCount += 1;
    if (item.type !== 'EXPENSE') continue;
    yearlyMinor += item.amountMinor * FREQUENCY_PER_YEAR[item.frequency];
  }

  return {
    yearlyMinor,
    monthlyMinor: Math.round(yearlyMinor / 12),
    activeCount,
    pausedCount,
  };
}

/* ------------------------------------------------------------------------ */
/* Time series                                                               */
/* ------------------------------------------------------------------------ */

export interface SeriesPoint {
  label: string;
  key: string;
  date: Date;
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
}

/** Daily buckets across an inclusive date range, gaps filled with zeroes. */
export function dailySeries(
  transactions: readonly TransactionLike[],
  from: Date,
  to: Date,
  formatLabel: (date: Date) => string,
): SeriesPoint[] {
  const buckets = new Map<string, SeriesPoint>();
  const totalDays = Math.max(0, daysBetween(from, to));

  for (let offset = 0; offset <= totalDays; offset += 1) {
    const date = startOfDay(addDays(from, offset));
    const key = date.toISOString().slice(0, 10);
    buckets.set(key, {
      key,
      date,
      label: formatLabel(date),
      incomeMinor: 0,
      expenseMinor: 0,
      netMinor: 0,
    });
  }

  for (const transaction of transactions) {
    if (transaction.type === 'TRANSFER') continue;
    const key = startOfDay(transaction.date).toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (transaction.type === 'INCOME') bucket.incomeMinor += transaction.amountMinor;
    else bucket.expenseMinor += transaction.amountMinor;
    bucket.netMinor = bucket.incomeMinor - bucket.expenseMinor;
  }

  return Array.from(buckets.values());
}

/** Monthly buckets over the last `months` months, oldest first. */
export function monthlySeries(
  transactions: readonly TransactionLike[],
  months: number,
  endMonth: MonthKey,
  formatLabel: (key: MonthKey) => string,
): (SeriesPoint & { monthKey: MonthKey })[] {
  const buckets = new Map<string, SeriesPoint & { monthKey: MonthKey }>();

  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const zeroBased = endMonth.year * 12 + (endMonth.month - 1) - offset;
    const monthKey = { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 };
    const key = `${monthKey.year}-${String(monthKey.month).padStart(2, '0')}`;
    buckets.set(key, {
      key,
      monthKey,
      date: new Date(Date.UTC(monthKey.year, monthKey.month - 1, 1)),
      label: formatLabel(monthKey),
      incomeMinor: 0,
      expenseMinor: 0,
      netMinor: 0,
    });
  }

  for (const transaction of transactions) {
    if (transaction.type === 'TRANSFER') continue;
    const { year, month } = monthKeyOf(transaction.date);
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (transaction.type === 'INCOME') bucket.incomeMinor += transaction.amountMinor;
    else bucket.expenseMinor += transaction.amountMinor;
    bucket.netMinor = bucket.incomeMinor - bucket.expenseMinor;
  }

  return Array.from(buckets.values());
}

/* ------------------------------------------------------------------------ */
/* Headline statistics                                                       */
/* ------------------------------------------------------------------------ */

export interface HeadlineStats {
  averageDailySpendMinor: number | null;
  largestCategory: CategorySlice | null;
  largestTransaction: TransactionLike | null;
  topMerchant: { merchant: string; count: number; totalMinor: number } | null;
  activeDays: number;
}

export function headlineStats(
  transactions: readonly TransactionLike[],
  breakdown: readonly CategorySlice[],
  from: Date,
  to: Date,
): HeadlineStats {
  const expenses = transactions.filter((transaction) => transaction.type === 'EXPENSE');
  const spanDays = Math.max(1, daysBetween(from, to) + 1);

  const merchants = new Map<string, { count: number; totalMinor: number }>();
  const activeDays = new Set<string>();
  let largest: TransactionLike | null = null;

  for (const expense of expenses) {
    const key = expense.merchant.trim().toLowerCase();
    const entry = merchants.get(key) ?? { count: 0, totalMinor: 0 };
    entry.count += 1;
    entry.totalMinor += expense.amountMinor;
    merchants.set(key, entry);
    activeDays.add(startOfDay(expense.date).toISOString().slice(0, 10));
    if (!largest || expense.amountMinor > largest.amountMinor) largest = expense;
  }

  let topMerchant: HeadlineStats['topMerchant'] = null;
  for (const [key, entry] of merchants) {
    if (!topMerchant || entry.count > topMerchant.count) {
      const original = expenses.find((expense) => expense.merchant.trim().toLowerCase() === key);
      topMerchant = { merchant: original?.merchant ?? key, count: entry.count, totalMinor: entry.totalMinor };
    }
  }

  const totalSpend = sumMinor(expenses.map((expense) => expense.amountMinor));

  return {
    averageDailySpendMinor: expenses.length > 0 ? Math.round(totalSpend / spanDays) : null,
    largestCategory: breakdown[0] ?? null,
    largestTransaction: largest,
    topMerchant: topMerchant && topMerchant.count > 1 ? topMerchant : null,
    activeDays: activeDays.size,
  };
}

/* ------------------------------------------------------------------------ */
/* Insights                                                                  */
/* ------------------------------------------------------------------------ */

export interface Insight {
  id: string;
  text: string;
  tone: 'neutral' | 'positive' | 'warning';
}

/**
 * Deterministic observations derived from the data in front of us. Nothing
 * here is generated, guessed, or padded: if a comparison lacks a baseline, the
 * insight is simply not produced.
 */
export function buildInsights(input: {
  current: CashFlow;
  previous: CashFlow | null;
  breakdown: readonly CategorySlice[];
  budget: BudgetStatus | null;
  formatAmount: (minor: number) => string;
  hasPreviousMonth: boolean;
}): Insight[] {
  const insights: Insight[] = [];
  const { current, previous, breakdown, budget, formatAmount } = input;

  if (previous && input.hasPreviousMonth && previous.expenseMinor > 0 && current.expenseMinor > 0) {
    const delta = current.expenseMinor - previous.expenseMinor;
    const change = Math.abs(percentOf(delta, previous.expenseMinor));
    // Below 3% is noise, not a trend.
    if (change >= 3) {
      insights.push({
        id: 'month-over-month',
        text:
          delta > 0
            ? `Your spending is ${change.toFixed(0)}% higher than last month.`
            : `Your spending is ${change.toFixed(0)}% lower than last month.`,
        tone: delta > 0 ? 'warning' : 'positive',
      });
    }
  }

  const largest = breakdown[0];
  if (largest && largest.share >= 15) {
    insights.push({
      id: 'largest-category',
      text: `${largest.name} accounts for ${largest.share.toFixed(0)}% of your spending.`,
      tone: 'neutral',
    });
  }

  if (budget && budget.totalMinor > 0) {
    if (budget.level === 'overrun') {
      insights.push({
        id: 'budget-overrun',
        text: `You are ${formatAmount(Math.abs(budget.remainingMinor))} over your monthly budget.`,
        tone: 'warning',
      });
    } else if (budget.remainingMinor > 0) {
      insights.push({
        id: 'budget-remaining',
        text: `You are ${formatAmount(budget.remainingMinor)} below your monthly budget.`,
        tone: 'positive',
      });
    }

    const overrun = budget.overrunCategories[0];
    if (overrun) {
      insights.push({
        id: 'category-overrun',
        text: `${overrun.name} is ${formatAmount(overrun.overByMinor)} over its allocation.`,
        tone: 'warning',
      });
    }
  }

  if (current.savingsRate !== null && current.incomeMinor > 0) {
    insights.push({
      id: 'savings-rate',
      text:
        current.savingsRate >= 0
          ? `You kept ${current.savingsRate.toFixed(0)}% of what you earned.`
          : `You spent ${Math.abs(current.savingsRate).toFixed(0)}% more than you earned.`,
      tone: current.savingsRate >= 20 ? 'positive' : current.savingsRate < 0 ? 'warning' : 'neutral',
    });
  }

  return insights;
}
