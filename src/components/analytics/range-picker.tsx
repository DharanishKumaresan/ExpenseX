import Link from 'next/link';
import { addDays, addMonths, daysBetween, fromDateTimeInputs, startOfDay } from '@/lib/date';
import { cn } from '@/lib/utils';

/**
 * Date range selector.
 *
 * Ranges live in the URL, so an analytics view is linkable and re-renders on
 * the server with the right window. A custom range is accepted through
 * ?from=&to= and validated the same way as any other user input.
 */

export type RangeKey = '7d' | '30d' | '3m' | '6m' | '1y' | 'all' | 'custom';

const PRESETS: { key: RangeKey; label: string }[] = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '3m', label: '3 months' },
  { key: '6m', label: '6 months' },
  { key: '1y', label: '1 year' },
  { key: 'all', label: 'All' },
];

export interface ResolvedRange {
  key: RangeKey;
  from: Date;
  /** Exclusive upper bound. */
  to: Date;
  days: number;
}

export function parseRange(
  params: { range?: string; from?: string; to?: string },
  earliest: Date | null,
  now: Date = new Date(),
): ResolvedRange {
  const tomorrow = addDays(startOfDay(now), 1);

  if (params.from || params.to) {
    const from = params.from ? fromDateTimeInputs(params.from) : null;
    const to = params.to ? fromDateTimeInputs(params.to) : null;
    if (from && to && from <= to) {
      const exclusiveTo = addDays(to, 1);
      return { key: 'custom', from, to: exclusiveTo, days: Math.max(1, daysBetween(from, exclusiveTo)) };
    }
  }

  const key = (PRESETS.find((preset) => preset.key === params.range)?.key ?? '30d') as RangeKey;

  const from = (() => {
    switch (key) {
      case '7d':
        return addDays(startOfDay(now), -6);
      case '3m':
        return addMonths(startOfDay(now), -3);
      case '6m':
        return addMonths(startOfDay(now), -6);
      case '1y':
        return addMonths(startOfDay(now), -12);
      case 'all':
        // Falls back to a year when the account has no history yet.
        return earliest ? startOfDay(earliest) : addMonths(startOfDay(now), -12);
      default:
        return addDays(startOfDay(now), -29);
    }
  })();

  return { key, from, to: tomorrow, days: Math.max(1, daysBetween(from, tomorrow)) };
}

export function RangePicker({ basePath, active }: { basePath: string; active: RangeKey }) {
  return (
    <nav aria-label="Date range" className="ex-no-scrollbar ex-rail flex gap-1.5">
      {PRESETS.map((preset) => {
        const selected = preset.key === active;
        return (
          <Link
            key={preset.key}
            href={`${basePath}?range=${preset.key}`}
            aria-current={selected ? 'true' : undefined}
            className={cn(
              'inline-flex h-11 shrink-0 items-center rounded-[7px] border px-3.5 font-mono text-[0.625rem] tracking-[0.12em] uppercase transition-colors lg:h-9 lg:px-3',
              selected
                ? 'border-ink bg-forest text-on-forest'
                : 'border-line text-ink-3 hover:border-line-strong hover:bg-surface-2 hover:text-ink',
            )}
          >
            {preset.label}
          </Link>
        );
      })}
    </nav>
  );
}
