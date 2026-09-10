import { BudgetActions } from './budget-actions';
import { MonthNav } from '@/components/dashboard/month-nav';
import { CategoryBudgetList } from '@/components/dashboard/blocks';
import { Money, StatBlock } from '@/components/ui/money-display';
import { BudgetLevelBadge, EmptyState, Progress, RuleLabel } from '@/components/ui/primitives';
import { Avatar } from '@/components/ui/primitives';
import { RankedBars } from '@/components/charts/series';
import { findBudget } from '@/server/queries/planning';
import { transactionsForMonth } from '@/server/queries/transactions';
import { loadCategories } from '@/server/queries/reference';
import type { Scope } from '@/server/scope';
import { budgetStatus, spendByMember } from '@/lib/analytics';
import { formatMoney, formatPercent } from '@/lib/money';
import { monthLabel, type MonthKey } from '@/lib/date';
import { swatchFor } from '@/lib/categories';
import { firstName } from '@/lib/utils';

/**
 * Budget screen, shared by /budgets and /shared/budget.
 *
 * In a shared workspace it additionally breaks each overrun down by who paid,
 * which is usually the first question the second person asks.
 */
export async function BudgetScreen({
  scope,
  userId,
  monthKey,
  basePath,
}: {
  scope: Scope;
  userId: string;
  monthKey: MonthKey;
  basePath: string;
}) {
  const [budget, transactions, categories] = await Promise.all([
    findBudget(scope, monthKey),
    transactionsForMonth(scope, monthKey),
    loadCategories(userId),
  ]);

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
    transactions,
    categories,
  );

  const shared = scope.kind === 'shared';
  const members = shared
    ? scope.workspace.members.map((member) => ({ userId: member.userId, name: member.name }))
    : [];

  const editorCategories = categories.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    kind: category.kind,
  }));

  const existing = budget
    ? {
        id: budget.id,
        month: budget.month,
        year: budget.year,
        totalAmountMinor: budget.totalAmountMinor,
        version: budget.version,
        allocations: budget.categories.map((entry) => ({
          categoryId: entry.categoryId,
          allocatedAmountMinor: entry.allocatedAmountMinor,
        })),
      }
    : null;

  return (
    <div className="flex flex-col gap-9">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[1.75rem] leading-[1.02] font-semibold tracking-[-0.03em] sm:text-[2.25rem]">
          <span className="block font-normal text-ink-faint">
            {shared ? 'Shared monthly' : monthLabel(monthKey)}
          </span>
          <span className="block font-bold text-ink">Budget</span>
        </h1>

        <div className="flex flex-wrap items-center gap-2">
          <MonthNav monthKey={monthKey} basePath={basePath} />
          <BudgetActions
            monthKey={monthKey}
            existing={existing}
            categories={editorCategories}
            currency={scope.currency}
            workspaceId={scope.workspaceId}
            shared={shared}
          />
        </div>
      </header>

      {!status ? (
        <EmptyState
          headline="Give your money a direction."
          body={`There is no budget for ${monthLabel(monthKey)} yet. Set a total, split it across the categories that matter, and every screen starts measuring against it.`}
          tone="accent"
          action={
            <BudgetActions
              monthKey={monthKey}
              existing={null}
              categories={editorCategories}
              currency={scope.currency}
              workspaceId={scope.workspaceId}
              shared={shared}
              variant="onAccent"
            />
          }
        />
      ) : (
        <>
          <section className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <StatBlock
                label={`${monthLabel(monthKey)} budget`}
                minor={status.totalMinor}
                currency={scope.currency}
                size="hero"
                hideFraction
              />
            </div>

            <div className="flex flex-col justify-end gap-5 lg:col-span-7">
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div>
                  <dt className="ex-label">Spent</dt>
                  <dd className="mt-2">
                    <Money minor={status.spentMinor} currency={scope.currency} size="lg" hideFraction className="text-ink" />
                  </dd>
                </div>
                <div>
                  <dt className="ex-label">Remaining</dt>
                  <dd className="mt-2">
                    <Money
                      minor={status.remainingMinor}
                      currency={scope.currency}
                      size="lg"
                      hideFraction
                      className={status.remainingMinor < 0 ? 'text-coral' : 'text-ink'}
                    />
                  </dd>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <dt className="ex-label">Unallocated</dt>
                  <dd className="mt-2">
                    <Money minor={status.unallocatedMinor} currency={scope.currency} size="lg" hideFraction className="text-ink-2" />
                  </dd>
                </div>
              </dl>

              <div className="flex flex-col gap-2">
                <Progress
                  value={status.used}
                  level={status.level}
                  label={`Budget used: ${formatPercent(status.used)}`}
                  height="lg"
                />
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[0.6875rem] tracking-[0.08em] text-ink-3">
                    {formatPercent(status.used)} of the monthly budget used
                  </span>
                  <BudgetLevelBadge level={status.level} />
                </div>
              </div>
            </div>
          </section>

          {status.overrunCategories.length > 0 ? (
            <section className="flex flex-col gap-4 rounded-[14px] bg-coral px-5 py-6 text-on-coral sm:px-7">
              <p className="flex items-center gap-2 font-mono text-[0.6875rem] font-medium tracking-[0.16em] uppercase">
                <svg width="12" height="12" viewBox="0 0 10 10" aria-hidden="true">
                  <path d="M5 1L9.33 8.5H0.67L5 1Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                  <path d="M5 4.1v1.7M5 6.9v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                Budget overrun
              </p>

              <ul className="flex flex-col gap-5">
                {status.overrunCategories.map((row) => {
                  const byMember = shared
                    ? spendByMember(transactions, members, row.categoryId).filter((entry) => entry.spentMinor > 0)
                    : [];

                  return (
                    <li key={row.categoryId} className="flex flex-col gap-3 border-t border-on-coral/20 pt-4 first:border-0 first:pt-0">
                      <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                          <p className="text-[1.35rem] leading-tight font-bold tracking-[-0.02em]">{row.name}</p>
                          <p className="ex-numeral mt-1.5 text-[0.875rem] text-on-coral/80">
                            {formatMoney(row.spentMinor, scope.currency, { compactDecimals: true })} of{' '}
                            {formatMoney(row.allocatedMinor, scope.currency, { compactDecimals: true })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="ex-label text-on-coral/70">Over by</p>
                          <Money
                            minor={row.overByMinor}
                            currency={scope.currency}
                            size="md"
                            hideFraction
                            className="mt-1 text-on-coral"
                            fractionClassName="text-on-coral/60"
                          />
                        </div>
                      </div>

                      {byMember.length > 0 ? (
                        <div className="flex flex-wrap gap-4 border-t border-on-coral/20 pt-3">
                          <span className="ex-label text-on-coral/70">Who spent</span>
                          {byMember.map((entry) => (
                            <span key={entry.userId} className="flex items-center gap-2">
                              <Avatar name={entry.name} size="xs" tone="coral" className="ring-1 ring-on-coral/30" />
                              <span className="text-[0.8125rem] font-medium">
                                {entry.userId === userId ? 'You' : firstName(entry.name)}
                              </span>
                              <span className="ex-numeral text-[0.8125rem] text-on-coral/85">
                                {formatMoney(entry.spentMinor, scope.currency, { compactDecimals: true })}
                              </span>
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <RuleLabel className="mb-4">Category allocations</RuleLabel>
              {status.categories.length > 0 ? (
                <CategoryBudgetList budget={status} currency={scope.currency} />
              ) : (
                <p className="py-6 text-[0.875rem] text-ink-3">
                  This budget has a total but no category splits yet. Edit it to allocate.
                </p>
              )}
            </div>

            <div className="lg:col-span-5">
              <RuleLabel className="mb-4">Allocated vs spent</RuleLabel>
              {status.categories.length > 0 ? (
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
              ) : null}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
