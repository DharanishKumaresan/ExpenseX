import Link from 'next/link';
import { Money, StatBlock } from '@/components/ui/money-display';
import { Badge, BudgetLevelBadge, HatchField, Progress, RuleLabel } from '@/components/ui/primitives';
import { CategoryIcon } from '@/components/category-icon';
import { formatMoney, formatPercent, percentOf } from '@/lib/money';
import { formatDayLabel, monthLabel, type MonthKey } from '@/lib/date';
import { FREQUENCY_LABELS } from '@/lib/validation';
import { cn, pluralise } from '@/lib/utils';
import type { BudgetStatus, CashFlow, Insight } from '@/lib/analytics';

/**
 * Dashboard building blocks.
 *
 * These are the reference's stacked colour slabs rather than floating cards:
 * full-bleed blocks, hairline rules, oversized figures, and hatched texture
 * carrying the proportion. Shared by the personal and the shared dashboards.
 */

/* ------------------------------------------------------------------------ */
/* Hero                                                                      */
/* ------------------------------------------------------------------------ */

export function OverviewHero({
  monthKey,
  cash,
  currency,
  budget,
  label = 'Available',
  action,
}: {
  monthKey: MonthKey;
  cash: CashFlow;
  currency: string;
  budget: BudgetStatus | null;
  label?: string;
  action?: React.ReactNode;
}) {
  // "Available" is what a budget leaves, or simply what is left of income.
  const availableMinor = budget ? budget.remainingMinor : cash.netMinor;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="ex-label ex-label-lg">{monthLabel(monthKey).toUpperCase()}</p>
          <p className="ex-label mt-3">{label}</p>
          <Money
            minor={availableMinor}
            currency={currency}
            size="hero"
            className={cn('mt-2 block', availableMinor < 0 ? 'text-coral' : 'text-ink')}
          />
        </div>
        {action}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-6 border-t border-line pt-6 sm:grid-cols-3">
        <div>
          <dt className="ex-label">Total income</dt>
          <dd className="mt-2">
            <Money minor={cash.incomeMinor} currency={currency} size="lg" hideFraction className="text-ink" />
          </dd>
        </div>
        <div>
          <dt className="ex-label">Total spent</dt>
          <dd className="mt-2">
            <Money minor={cash.expenseMinor} currency={currency} size="lg" hideFraction className="text-ink" />
          </dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="ex-label">{budget ? 'Budget remaining' : 'Net'}</dt>
          <dd className="mt-2 flex items-baseline gap-3">
            <Money
              minor={budget ? budget.remainingMinor : cash.netMinor}
              currency={currency}
              size="lg"
              hideFraction
              className={cn(
                (budget ? budget.remainingMinor : cash.netMinor) < 0 ? 'text-coral' : 'text-ink',
              )}
            />
            {cash.savingsRate !== null ? (
              <span className="font-mono text-[0.6875rem] tracking-[0.08em] text-ink-3">
                {formatPercent(cash.savingsRate)} saved
              </span>
            ) : null}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Budget                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Budget status slab. When a category is over its allocation the block turns
 * coral AND says "BUDGET OVERRUN" in words — the colour never carries the
 * meaning on its own.
 */
export function BudgetStrip({
  budget,
  currency,
  href,
  monthKey,
}: {
  budget: BudgetStatus | null;
  currency: string;
  href: string;
  monthKey: MonthKey;
}) {
  if (!budget) {
    return (
      <div className="flex flex-col gap-4 rounded-[12px] bg-accent px-5 py-6 text-on-accent sm:px-6">
        <p className="ex-label text-on-accent/70">No budget for {monthLabel(monthKey)}</p>
        <p className="max-w-[26ch] text-[1.35rem] leading-[1.1] font-bold tracking-[-0.02em] uppercase">
          Give your money a direction.
        </p>
        <Link
          href={href}
          className="mt-1 inline-flex h-11 w-fit items-center rounded-[8px] bg-on-accent px-5 font-mono text-[0.6875rem] tracking-[0.14em] uppercase text-accent transition-opacity hover:opacity-90"
        >
          Create budget
        </Link>
      </div>
    );
  }

  const overrun = budget.overrunCategories[0];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="ex-label">Monthly budget</p>
          <Money minor={budget.totalMinor} currency={currency} size="lg" hideFraction className="mt-2 text-ink" />
        </div>
        <div className="text-right">
          <p className="ex-label">Spent</p>
          <Money minor={budget.spentMinor} currency={currency} size="md" hideFraction className="mt-2 text-ink-2" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Progress
          value={budget.used}
          level={budget.level}
          label={`Budget used: ${formatPercent(budget.used)}`}
          height="lg"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[0.6875rem] tracking-[0.08em] text-ink-3">
            {formatPercent(budget.used)} used
          </span>
          <BudgetLevelBadge level={budget.level} />
        </div>
      </div>

      {overrun ? (
        <div className="flex flex-col gap-3 rounded-[10px] bg-coral px-4 py-4 text-on-coral">
          <p className="flex items-center gap-2 font-mono text-[0.6875rem] font-medium tracking-[0.14em] uppercase">
            <svg width="11" height="11" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M5 1L9.33 8.5H0.67L5 1Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              <path d="M5 4.1v1.7M5 6.9v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            Budget overrun
          </p>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[1.125rem] leading-tight font-bold">{overrun.name}</p>
              <p className="mt-1 font-mono text-[0.75rem] tracking-[0.04em] text-on-coral/75">
                {formatMoney(overrun.spentMinor, currency, { compactDecimals: true })} of{' '}
                {formatMoney(overrun.allocatedMinor, currency, { compactDecimals: true })}
              </p>
            </div>
            <div className="text-right">
              <p className="ex-label text-on-coral/70">Over by</p>
              <Money
                minor={overrun.overByMinor}
                currency={currency}
                size="md"
                hideFraction
                className="mt-1 text-on-coral"
                fractionClassName="text-on-coral/60"
              />
            </div>
          </div>
        </div>
      ) : null}

      <Link
        href={href}
        className="flex items-center justify-between border-t border-line pt-4 font-mono text-[0.6875rem] tracking-[0.14em] uppercase text-ink-3 transition-colors hover:text-ink"
      >
        View all categories
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 9L9 3M9 3H4.5M9 3v4.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    </div>
  );
}

/** Ranked category allocations, as stacked slabs with hatched progress. */
export function CategoryBudgetList({
  budget,
  currency,
  limit,
}: {
  budget: BudgetStatus;
  currency: string;
  limit?: number;
}) {
  const rows = limit ? budget.categories.slice(0, limit) : budget.categories;

  return (
    <ul className="flex flex-col">
      {rows.map((row) => (
        <li key={row.categoryId} className="border-b border-line-faint py-4 last:border-0">
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2.5">
              <CategoryIcon slug={row.slug} size="sm" tone={row.level === 'overrun' ? 'coral' : 'outline'} />
              <span className="truncate text-[0.9375rem] font-semibold text-ink">{row.name}</span>
            </span>
            <span className="ex-numeral shrink-0 text-[0.8125rem] text-ink-2">
              {formatMoney(row.spentMinor, currency, { compactDecimals: true })}
              <span className="text-ink-faint">
                {' / '}
                {formatMoney(row.allocatedMinor, currency, { compactDecimals: true })}
              </span>
            </span>
          </div>

          <div className="mt-2.5 flex items-center gap-3">
            <Progress
              value={row.used}
              level={row.level}
              label={`${row.name}: ${formatPercent(row.used)} of allocation used`}
              className="flex-1"
            />
            <span className="w-10 shrink-0 text-right font-mono text-[0.625rem] tracking-[0.06em] text-ink-3">
              {formatPercent(row.used)}
            </span>
          </div>

          {row.level === 'overrun' ? (
            <p className="mt-2 flex items-center gap-1.5 font-mono text-[0.625rem] tracking-[0.1em] uppercase text-coral">
              Budget overrun · {formatMoney(row.overByMinor, currency, { compactDecimals: true })} over
            </p>
          ) : row.level === 'warning' ? (
            <p className="mt-2 font-mono text-[0.625rem] tracking-[0.1em] uppercase text-ink-3">
              Close to limit · {formatMoney(row.remainingMinor, currency, { compactDecimals: true })} left
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------------ */
/* Goals                                                                     */
/* ------------------------------------------------------------------------ */

export function GoalStrip({
  goals,
  currency,
  href,
}: {
  goals: { id: string; name: string; targetAmountMinor: number; currentAmountMinor: number; theme: string | null; deadline: Date | null }[];
  currency: string;
  href: string;
}) {
  if (goals.length === 0) {
    return (
      <div className="flex flex-col gap-4 rounded-[12px] border border-dashed border-line-strong px-5 py-6">
        <p className="max-w-[24ch] text-[1.125rem] leading-[1.15] font-bold tracking-[-0.02em] uppercase text-ink">
          Give yourself something worth saving for.
        </p>
        <Link
          href={href}
          className="inline-flex h-10 w-fit items-center rounded-[8px] bg-forest px-4 font-mono text-[0.6875rem] tracking-[0.14em] uppercase text-on-forest transition-colors hover:bg-forest-2"
        >
          Create goal
        </Link>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-px overflow-hidden rounded-[12px]">
      {goals.map((goal, index) => {
        const progress = Math.min(100, percentOf(goal.currentAmountMinor, goal.targetAmountMinor));
        // Alternating tones give the stack the reference's colour-block rhythm.
        const tone = goal.theme === 'yellow' || (!goal.theme && index === 0) ? 'accent' : 'forest';

        return (
          <li key={goal.id}>
            <Link
              href={href}
              className={cn(
                'relative flex flex-col gap-3 px-5 py-5 transition-opacity hover:opacity-95',
                tone === 'accent' ? 'bg-accent text-on-accent' : 'bg-forest text-on-forest',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p
                    className={cn(
                      'ex-label',
                      tone === 'accent' ? 'text-on-accent/70' : 'text-on-forest-muted',
                    )}
                  >
                    Saved
                  </p>
                  <Money
                    minor={goal.currentAmountMinor}
                    currency={currency}
                    size="md"
                    hideFraction
                    className="mt-1.5 block"
                    fractionClassName={tone === 'accent' ? 'text-on-accent/55' : 'text-on-forest-muted'}
                  />
                  <p className="mt-2 truncate text-[1rem] font-bold tracking-[-0.01em]">{goal.name}</p>
                </div>

                <div className="shrink-0 text-right">
                  <p
                    className={cn(
                      'ex-label',
                      tone === 'accent' ? 'text-on-accent/70' : 'text-on-forest-muted',
                    )}
                  >
                    Goal
                  </p>
                  <Money
                    minor={goal.targetAmountMinor}
                    currency={currency}
                    size="sm"
                    hideFraction
                    className="mt-1.5 block"
                    fractionClassName={tone === 'accent' ? 'text-on-accent/55' : 'text-on-forest-muted'}
                  />
                  <p className="ex-numeral mt-2 text-[0.8125rem]">{formatPercent(progress)}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'h-2 flex-1 overflow-hidden rounded-[2px]',
                    tone === 'accent' ? 'bg-on-accent/20' : 'bg-on-forest/20',
                  )}
                >
                  <span
                    className={cn(
                      'block h-full rounded-[2px] transition-[width] duration-500',
                      tone === 'accent' ? 'bg-on-accent' : 'bg-on-forest',
                    )}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <HatchField
                  fill={1}
                  onDark
                  className={cn('h-4 w-14 shrink-0', tone === 'accent' && 'opacity-40')}
                />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------------ */
/* Recurring                                                                 */
/* ------------------------------------------------------------------------ */

export function UpcomingStrip({
  items,
  currency,
  href,
}: {
  items: {
    id: string;
    merchant: string;
    amountMinor: number;
    frequency: keyof typeof FREQUENCY_LABELS;
    nextDate: Date;
    category: { slug: string } | null;
  }[];
  currency: string;
  href: string;
}) {
  if (items.length === 0) {
    return (
      <p className="py-6 text-[0.875rem] text-ink-3">
        Nothing scheduled.{' '}
        <Link href={href} className="font-semibold text-ink underline decoration-line-strong underline-offset-4">
          Add a recurring payment
        </Link>{' '}
        to see what is coming.
      </p>
    );
  }

  return (
    <ul className="flex flex-col">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-center gap-3 border-b border-line-faint py-3 last:border-0"
        >
          <CategoryIcon slug={item.category?.slug ?? 'subscriptions'} size="sm" tone="outline" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.875rem] font-semibold text-ink">{item.merchant}</span>
            <span className="ex-label mt-1 block">{FREQUENCY_LABELS[item.frequency]}</span>
          </span>
          <span className="shrink-0 text-right">
            <Money minor={item.amountMinor} currency={currency} size="xs" hideFraction className="text-ink" />
            <span className="mt-1 block font-mono text-[0.625rem] tracking-[0.06em] text-ink-faint">
              {formatDayLabel(item.nextDate)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------------ */
/* Insights                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Deterministic observations. Rendered only when `buildInsights` produced
 * something — the panel is absent rather than padded with filler.
 */
export function InsightRail({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <RuleLabel>What the numbers say</RuleLabel>
      <ul className="flex flex-col gap-2">
        {insights.map((insight) => (
          <li key={insight.id} className="flex items-start gap-2.5">
            <span
              aria-hidden="true"
              className={cn(
                'mt-[7px] size-1.5 shrink-0 rounded-full',
                insight.tone === 'warning'
                  ? 'bg-coral'
                  : insight.tone === 'positive'
                    ? 'bg-positive'
                    : 'bg-ink-faint',
              )}
            />
            <p className="text-[0.875rem] leading-snug text-ink-2">{insight.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Small parts                                                               */
/* ------------------------------------------------------------------------ */

export function StatRow({
  items,
  className,
}: {
  items: { label: string; value: string; note?: string }[];
  className?: string;
}) {
  return (
    <dl className={cn('grid gap-x-4 gap-y-5', className)}>
      {items.map((item) => (
        <div key={item.label}>
          <dt className="ex-label">{item.label}</dt>
          <dd className="ex-numeral mt-2 text-[1.0625rem] text-ink">{item.value}</dd>
          {item.note ? <dd className="mt-1 text-[0.6875rem] text-ink-3">{item.note}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

export function SectionShell({
  over,
  title,
  action,
  children,
  className,
}: {
  over: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-[1.25rem] leading-[1.05] font-semibold tracking-[-0.025em] sm:text-[1.5rem]">
          <span className="block font-normal text-ink-faint">{over}</span>
          <span className="block font-bold text-ink">{title}</span>
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export { Badge };
