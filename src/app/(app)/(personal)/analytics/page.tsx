import type { Metadata } from 'next';
import { requireUserPage, resolveScope } from '@/server/scope';
import { transactionsInRange, firstTransactionDate } from '@/server/queries/transactions';
import { loadCategories } from '@/server/queries/reference';
import { findBudget } from '@/server/queries/planning';
import { buildRadialSlices } from '@/server/queries/overview';
import { SpendingRadial, RadialLegend } from '@/components/charts/spending-radial';
import { IncomeExpenseChart, RankedBars, TrendChart } from '@/components/charts/series';
import { RangePicker, parseRange } from '@/components/analytics/range-picker';
import { InsightRail, SectionShell, StatRow } from '@/components/dashboard/blocks';
import { EmptyState, RuleLabel } from '@/components/ui/primitives';
import { StatBlock } from '@/components/ui/money-display';
import {
  budgetStatus,
  buildInsights,
  cashFlow,
  categoryBreakdown,
  dailySeries,
  headlineStats,
  monthlySeries,
} from '@/lib/analytics';
import { formatMoney, formatPercent } from '@/lib/money';
import {
  addMonthsToKey,
  currentMonthKey,
  formatDateShort,
  monthEnd,
  monthLabel,
  monthStart,
} from '@/lib/date';
import { swatchFor } from '@/lib/categories';
import { pluralise } from '@/lib/utils';

export const metadata: Metadata = { title: 'Analytics' };

/**
 * Analytics.
 *
 * Every figure is computed from the transactions in the selected window. When
 * the window holds too little to say anything, the page says so rather than
 * drawing an empty chart with confident axes.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const user = await requireUserPage('/analytics');
  const params = await searchParams;
  const scope = await resolveScope(user, null);

  const earliest = await firstTransactionDate(scope);
  const range = parseRange(params, earliest);

  const monthKey = currentMonthKey();
  const previousMonthKey = addMonthsToKey(monthKey, -1);

  // The month-by-month comparison always covers at least three months, so it
  // needs its own window — reusing the selected range would leave the earlier
  // bars empty and imply the user spent nothing in those months.
  const comparisonMonths = Math.max(3, Math.min(24, Math.ceil(range.days / 30)));
  const comparisonFrom = monthStart(addMonthsToKey(monthKey, -(comparisonMonths - 1)));

  const [transactions, categories, budget, previousMonthTransactions, comparisonTransactions] =
    await Promise.all([
      transactionsInRange(scope, range.from, range.to),
      loadCategories(user.id),
      findBudget(scope, monthKey),
      transactionsInRange(scope, monthStart(previousMonthKey), monthStart(monthKey)),
      transactionsInRange(scope, comparisonFrom, monthEnd(monthKey)),
    ]);

  const current = cashFlow(transactions);
  const breakdown = categoryBreakdown(transactions, categories);
  const stats = headlineStats(transactions, breakdown, range.from, range.to);

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
    // Budget-vs-actual is a statement about the current month only, so narrow
    // to that window using the same zoned bounds every other budget read uses.
    transactions.filter(
      (transaction) =>
        transaction.date >= monthStart(monthKey) && transaction.date < monthEnd(monthKey),
    ),
    categories,
  );

  const insights = buildInsights({
    current,
    previous: previousMonthTransactions.length > 0 ? cashFlow(previousMonthTransactions) : null,
    breakdown,
    budget: status,
    hasPreviousMonth: previousMonthTransactions.length > 0,
    formatAmount: (minor) => formatMoney(minor, scope.currency, { compactDecimals: true }),
  });

  // Daily buckets read well up to about three months; beyond that, monthly.
  const useDaily = range.days <= 92;
  const daily = useDaily
    ? dailySeries(transactions, range.from, range.to, (date) => formatDateShort(date))
    : [];

  /**
   * The income/expense comparison is always monthly, even for a short range.
   * Sampling every Nth day would silently drop the days in between and label
   * the result as if it covered the whole period; whole months are both
   * complete and the comparison people actually reason about.
   */
  const monthly = monthlySeries(comparisonTransactions, comparisonMonths, monthKey, (key) =>
    monthLabel(key, 'short'),
  );

  const toDatum = (point: { key: string; label: string; incomeMinor: number; expenseMinor: number }) => ({
    key: point.key,
    label: point.label,
    incomeMinor: point.incomeMinor,
    expenseMinor: point.expenseMinor,
  });

  const trendSeries = useDaily
    ? daily.map(toDatum)
    : monthlySeries(transactions, Math.max(1, Math.min(24, Math.ceil(range.days / 30))), monthKey, (key) =>
        monthLabel(key, 'short'),
      ).map(toDatum);
  const comparisonSeries = monthly.map(toDatum);

  const radial = buildRadialSlices(transactions, categories, breakdown);
  const hasData = transactions.length > 0;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[1.75rem] leading-[1.02] font-semibold tracking-[-0.03em] sm:text-[2.25rem]">
          <span className="block font-normal text-ink-faint">Where it goes</span>
          <span className="block font-bold text-ink">Analytics</span>
        </h1>
        <RangePicker basePath="/analytics" active={range.key} />
      </header>

      {!hasData ? (
        <EmptyState
          headline="Nothing to analyse yet."
          body={`There are no transactions between ${formatDateShort(range.from)} and ${formatDateShort(range.to)}. Try a wider range, or add some spending first.`}
        />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-6 border-y border-line py-6 sm:grid-cols-4">
            <StatBlock label="Total spent" minor={current.expenseMinor} currency={scope.currency} size="lg" hideFraction />
            <StatBlock label="Total income" minor={current.incomeMinor} currency={scope.currency} size="lg" hideFraction tone="muted" />
            <div>
              <p className="ex-label">Savings rate</p>
              <p className="ex-numeral mt-2 text-[1.5rem] text-ink">
                {current.savingsRate !== null ? formatPercent(current.savingsRate) : '—'}
              </p>
              {current.savingsRate === null ? (
                <p className="mt-1 text-[0.6875rem] text-ink-3">No income in range</p>
              ) : null}
            </div>
            <StatBlock
              label="Avg daily spend"
              minor={stats.averageDailySpendMinor ?? 0}
              currency={scope.currency}
              size="lg"
              hideFraction
              tone="muted"
            />
          </section>

          <InsightRail insights={insights} />

          <SectionShell over="Over time" title={useDaily ? 'Daily spending' : 'Monthly spending'}>
            <TrendChart data={trendSeries} currency={scope.currency} height={220} smooth={useDaily} />
          </SectionShell>

          <SectionShell over={`Last ${comparisonMonths} months`} title="Income vs expenses">
            <IncomeExpenseChart data={comparisonSeries} currency={scope.currency} height={240} />
          </SectionShell>

          <section className="grid gap-8 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-6">
              <SectionShell over="Distribution" title="By category">
                <div className="flex justify-center py-2">
                  <SpendingRadial
                    slices={radial}
                    totalMinor={current.expenseMinor}
                    currency={scope.currency}
                    caption="In range"
                    size={400}
                  />
                </div>
              </SectionShell>
            </div>

            <div className="flex flex-col gap-8 lg:col-span-6">
              <div className="flex flex-col gap-3">
                <RuleLabel>Ranked</RuleLabel>
                <RankedBars
                  currency={scope.currency}
                  rows={breakdown.slice(0, 8).map((slice) => ({
                    key: slice.categoryId ?? slice.slug,
                    label: slice.name,
                    valueMinor: slice.spentMinor,
                    color: slice.color ? swatchFor(slice.color) : undefined,
                    note: `${formatPercent(slice.share, 1)} · ${slice.transactionCount} ${pluralise(slice.transactionCount, 'transaction')}`,
                  }))}
                />
              </div>

              <div className="flex flex-col gap-3">
                <RuleLabel>Notable</RuleLabel>
                <StatRow
                  className="grid-cols-2"
                  items={[
                    {
                      label: 'Largest category',
                      value: stats.largestCategory?.name ?? '—',
                      note: stats.largestCategory
                        ? formatMoney(stats.largestCategory.spentMinor, scope.currency, { compactDecimals: true })
                        : undefined,
                    },
                    {
                      label: 'Largest transaction',
                      value: stats.largestTransaction
                        ? formatMoney(stats.largestTransaction.amountMinor, scope.currency, { compactDecimals: true })
                        : '—',
                      note: stats.largestTransaction?.merchant,
                    },
                    {
                      label: 'Most frequent merchant',
                      value: stats.topMerchant?.merchant ?? '—',
                      note: stats.topMerchant
                        ? `${stats.topMerchant.count} ${pluralise(stats.topMerchant.count, 'visit')}`
                        : 'Needs repeat visits',
                    },
                    {
                      label: 'Days with spending',
                      value: String(stats.activeDays),
                      note: `of ${range.days} in range`,
                    },
                  ]}
                />
              </div>
            </div>
          </section>

          {status ? (
            <SectionShell over="This month" title="Budget vs actual">
              <RankedBars
                currency={scope.currency}
                rows={status.categories.map((row) => ({
                  key: row.categoryId,
                  label: row.name,
                  valueMinor: row.spentMinor,
                  color: row.level === 'overrun' ? 'var(--ex-coral)' : swatchFor(row.color),
                  note: `${formatPercent(row.used)} of ${formatMoney(row.allocatedMinor, scope.currency, { compactDecimals: true })}`,
                }))}
              />
            </SectionShell>
          ) : null}
        </>
      )}
    </div>
  );
}
