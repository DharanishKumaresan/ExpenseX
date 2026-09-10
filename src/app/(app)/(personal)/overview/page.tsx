import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUserPage, resolveScope } from '@/server/scope';
import { loadOverview } from '@/server/queries/overview';
import { buildFormOptions } from '@/components/transactions/quick-add-server';
import { SpendingRadial, RadialLegend } from '@/components/charts/spending-radial';
import { TransactionList } from '@/components/transactions/transaction-list';
import { MonthNav, parseMonthParam } from '@/components/dashboard/month-nav';
import {
  BudgetStrip,
  GoalStrip,
  InsightRail,
  OverviewHero,
  SectionShell,
  StatRow,
  UpcomingStrip,
} from '@/components/dashboard/blocks';
import { DotGrid } from '@/components/brand';
import { Avatar, RuleLabel } from '@/components/ui/primitives';
import { formatMoney } from '@/lib/money';
import { monthLabel } from '@/lib/date';
import { pluralise } from '@/lib/utils';

export const metadata: Metadata = { title: 'Overview' };

/**
 * Personal dashboard.
 *
 * Laid out editorially rather than as a grid of equal cards: one dominant
 * figure, then the spending visualisation at full weight, then supporting
 * blocks at deliberately unequal sizes.
 */
export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const user = await requireUserPage('/overview');
  const params = await searchParams;
  const monthKey = parseMonthParam(params);

  const scope = await resolveScope(user, null);
  const [data, formOptions] = await Promise.all([
    loadOverview(scope, monthKey),
    buildFormOptions(scope, user.id),
  ]);

  const spentThisMonth = data.current.expenseMinor;

  return (
    <div className="flex flex-col gap-10 lg:gap-14">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar name={user.name} size="md" />
          <div>
            <p className="ex-label">Signed in</p>
            <p className="mt-1 text-[0.9375rem] font-semibold text-ink">{user.name}</p>
          </div>
        </div>
        <DotGrid className="mt-1 text-ink-faint" />
      </header>

      <OverviewHero
        monthKey={monthKey}
        cash={data.current}
        currency={data.currency}
        budget={data.budget}
        action={<MonthNav monthKey={monthKey} basePath="/overview" />}
      />

      {/* Spending visualisation — the widest element on the page. */}
      <section className="grid gap-8 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-7">
          <SectionShell over="Where it went" title={monthLabel(monthKey)}>
            <div className="flex justify-center py-2">
              <SpendingRadial
                slices={data.radial}
                totalMinor={spentThisMonth}
                currency={data.currency}
                caption="Total spent"
                size={460}
              />
            </div>
          </SectionShell>
        </div>

        <div className="flex flex-col gap-8 lg:col-span-5">
          {data.radial.length > 0 ? (
            <div className="flex flex-col gap-3">
              <RuleLabel>By category</RuleLabel>
              <RadialLegend slices={data.radial} currency={data.currency} limit={7} />
              <Link
                href="/analytics"
                className="mt-1 font-mono text-[0.6875rem] tracking-[0.14em] uppercase text-ink-3 transition-colors hover:text-ink"
              >
                Full analytics →
              </Link>
            </div>
          ) : null}

          <InsightRail insights={data.insights} />

          <StatRow
            className="grid-cols-2 border-t border-line pt-6"
            items={[
              {
                label: 'Avg daily spend',
                value:
                  data.stats.averageDailySpendMinor !== null
                    ? formatMoney(data.stats.averageDailySpendMinor, data.currency, { compactDecimals: true })
                    : '—',
              },
              {
                label: 'Transactions',
                value: String(data.current.transactionCount),
                note: `${data.totalTransactions} all time`,
              },
              {
                label: 'Largest category',
                value: data.stats.largestCategory?.name ?? '—',
              },
              {
                label: 'Top merchant',
                value: data.stats.topMerchant?.merchant ?? '—',
                note: data.stats.topMerchant
                  ? `${data.stats.topMerchant.count} ${pluralise(data.stats.topMerchant.count, 'visit')}`
                  : undefined,
              },
            ]}
          />
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-7">
          <SectionShell
            over="All recent"
            title="Transactions"
            action={
              <Link
                href="/transactions"
                className="font-mono text-[0.6875rem] tracking-[0.14em] uppercase text-ink-3 transition-colors hover:text-ink"
              >
                Show more
              </Link>
            }
          >
            <TransactionList
              transactions={data.recent}
              currency={data.currency}
              workspaceId={null}
              shared={false}
              currentUserId={user.id}
              options={formOptions}
              groupByDay={false}
              emptyHeadline="Your spending story starts here."
              emptyBody="Add your first expense and this page fills in — totals, categories, and the chart above."
            />
          </SectionShell>
        </div>

        <div className="flex flex-col gap-10 lg:col-span-5">
          <SectionShell
            over="This month"
            title="Budget"
            action={
              <Link
                href="/budgets"
                className="font-mono text-[0.6875rem] tracking-[0.14em] uppercase text-ink-3 transition-colors hover:text-ink"
              >
                Manage
              </Link>
            }
          >
            <BudgetStrip
              budget={data.budget}
              currency={data.currency}
              href="/budgets"
              monthKey={monthKey}
            />
          </SectionShell>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-7">
          <SectionShell
            over="Create and track"
            title="Your goals"
            action={
              <Link
                href="/goals"
                className="font-mono text-[0.6875rem] tracking-[0.14em] uppercase text-ink-3 transition-colors hover:text-ink"
              >
                All goals
              </Link>
            }
          >
            <GoalStrip goals={data.goals} currency={data.currency} href="/goals" />
          </SectionShell>
        </div>

        <div className="lg:col-span-5">
          <SectionShell
            over="Upcoming"
            title="Commitments"
            action={
              <Link
                href="/recurring"
                className="font-mono text-[0.6875rem] tracking-[0.14em] uppercase text-ink-3 transition-colors hover:text-ink"
              >
                Manage
              </Link>
            }
          >
            <UpcomingStrip items={data.upcoming} currency={data.currency} href="/recurring" />
          </SectionShell>
        </div>
      </section>
    </div>
  );
}
