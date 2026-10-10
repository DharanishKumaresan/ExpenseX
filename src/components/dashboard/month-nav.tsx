import Link from 'next/link';
import { addMonthsToKey, currentMonthKey, monthLabel, type MonthKey } from '@/lib/date';
import { cn } from '@/lib/utils';

/**
 * Month stepper.
 *
 * Plain links carrying `?month=&year=`, so the month lives in the URL: it can
 * be bookmarked and shared, it survives a refresh, and the page needs no
 * client state to render a different period.
 */
export function MonthNav({
  monthKey,
  basePath,
  className,
}: {
  monthKey: MonthKey;
  basePath: string;
  className?: string;
}) {
  const previous = addMonthsToKey(monthKey, -1);
  const next = addMonthsToKey(monthKey, 1);
  const today = currentMonthKey();

  const href = (key: MonthKey) => `${basePath}?month=${key.month}&year=${key.year}`;
  const isCurrent = monthKey.month === today.month && monthKey.year === today.year;

  // Never step past the current month: there is nothing to show there.
  const nextDisabled =
    next.year > today.year || (next.year === today.year && next.month > today.month);

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Link
        href={href(previous)}
        aria-label={`Previous month, ${monthLabel(previous)}`}
        className="grid size-11 place-items-center rounded-[7px] border border-line text-ink-2 transition-colors hover:border-line-strong hover:bg-surface-2 hover:text-ink lg:size-9"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M7.5 2L3.5 6L7.5 10" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>

      {nextDisabled ? (
        <span
          aria-disabled="true"
          className="grid size-11 cursor-not-allowed place-items-center rounded-[7px] border border-line-faint text-ink-faint lg:size-9"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M4.5 2L8.5 6L4.5 10" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      ) : (
        <Link
          href={href(next)}
          aria-label={`Next month, ${monthLabel(next)}`}
          className="grid size-11 place-items-center rounded-[7px] border border-line text-ink-2 transition-colors hover:border-line-strong hover:bg-surface-2 hover:text-ink lg:size-9"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M4.5 2L8.5 6L4.5 10" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      )}

      {!isCurrent ? (
        <Link
          href={basePath}
          className="ml-1 inline-flex h-11 items-center rounded-[7px] border border-line px-3 font-mono text-[0.625rem] tracking-[0.12em] uppercase text-ink-3 transition-colors hover:border-line-strong hover:text-ink lg:h-9"
        >
          This month
        </Link>
      ) : null}
    </div>
  );
}

/** Parse `?month=&year=` into a MonthKey, falling back to the current month. */
export function parseMonthParam(
  params: { month?: string; year?: string } | undefined,
): MonthKey {
  const today = currentMonthKey();
  if (!params?.month || !params?.year) return today;

  const month = Number(params.month);
  const year = Number(params.year);

  if (!Number.isInteger(month) || month < 1 || month > 12) return today;
  if (!Number.isInteger(year) || year < 2000 || year > 2200) return today;

  return { month, year };
}
