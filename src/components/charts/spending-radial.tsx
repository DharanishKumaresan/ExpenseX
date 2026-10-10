'use client';

import { useId, useMemo, useState } from 'react';
import { annulusSector, polar, sqrtScale } from './geometry';
import { Money } from '@/components/ui/money-display';
import { formatMoney, formatPercent } from '@/lib/money';
import { cn, pluralise } from '@/lib/utils';

/**
 * The spending visualisation.
 *
 * Every expense in the period is drawn as one thin radiating rule. Rays are
 * grouped into a category's angular wedge, the wedge's width is that
 * category's share of total spend, and each ray's length is its own amount on
 * a square-root scale. So the picture is literally the data: no smoothing, no
 * decorative filler, and a dense month looks dense.
 *
 * ACCESSIBILITY
 * Hover/focus is a progressive enhancement. The same figures are always
 * present as a real <table> for assistive technology, and each wedge is a
 * focusable button reachable by keyboard.
 */

export interface RadialSlice {
  key: string;
  name: string;
  color: string;
  spentMinor: number;
  share: number;
  transactionCount: number;
  /** Individual expense amounts in this category, largest first. */
  amounts: number[];
}

interface Props {
  slices: readonly RadialSlice[];
  totalMinor: number;
  currency: string;
  /** Label shown under the centre figure. */
  caption?: string;
  className?: string;
  size?: number;
}

const VIEWBOX = 420;
const CENTRE = VIEWBOX / 2;
const INNER_RADIUS = 62;
const MIN_RAY = 74;
const MAX_RAY = 196;
const WEDGE_GAP_DEG = 3.2;
/** Total rays across the whole chart; density that reads as texture, not noise. */
const TARGET_RAYS = 150;

export function SpendingRadial({ slices, totalMinor, currency, caption, className, size }: Props) {
  const [active, setActive] = useState<string | null>(null);
  const titleId = useId();

  const geometry = useMemo(() => {
    const positive = slices.filter((slice) => slice.spentMinor > 0);
    if (positive.length === 0) return null;

    const largestSingleExpense = Math.max(
      1,
      ...positive.flatMap((slice) => (slice.amounts.length > 0 ? slice.amounts : [slice.spentMinor])),
    );

    let cursor = 0;
    return positive.map((slice) => {
      const span = (slice.share / 100) * 360;
      const start = cursor;
      cursor += span;

      // Keep a hairline of ground between wedges, but never invert a thin one.
      const gap = Math.min(WEDGE_GAP_DEG, span * 0.35);
      const innerStart = start + gap / 2;
      const innerEnd = start + span - gap / 2;
      const usable = Math.max(0.001, innerEnd - innerStart);

      const rayCount = Math.max(2, Math.round((slice.share / 100) * TARGET_RAYS));
      const amounts = slice.amounts.length > 0 ? slice.amounts : [slice.spentMinor];

      const rays = Array.from({ length: rayCount }, (_, index) => {
        const angle = innerStart + (usable * (index + 0.5)) / rayCount;
        // Cycle the real amounts so every ray's length is an actual expense.
        const amount = amounts[index % amounts.length] ?? 0;
        const radius = sqrtScale(amount, largestSingleExpense, MIN_RAY, MAX_RAY - MIN_RAY);
        return { angle, radius, amount };
      });

      return {
        slice,
        start,
        end: start + span,
        hoverPath: annulusSector(CENTRE, CENTRE, INNER_RADIUS, MAX_RAY + 10, start, start + span),
        rays,
      };
    });
  }, [slices]);

  const activeSlice = useMemo(
    () => (active ? (slices.find((slice) => slice.key === active) ?? null) : null),
    [active, slices],
  );

  if (!geometry) {
    return (
      <div
        className={cn('flex aspect-square w-full items-center justify-center', className)}
        style={size ? { maxWidth: size } : undefined}
      >
        <div className="flex size-[62%] flex-col items-center justify-center gap-2 rounded-full border border-dashed border-line-strong text-center">
          <span className="ex-label">No spending yet</span>
          <span className="text-[0.75rem] text-ink-3">This month is still blank.</span>
        </div>
      </div>
    );
  }

  const accessibleTitle =
    `Spending by category. Total ${formatMoney(totalMinor, currency)} across ` +
    `${slices.length} ${pluralise(slices.length, 'category', 'categories')}.`;

  return (
    <div className={cn('relative w-full', className)} style={size ? { maxWidth: size } : undefined}>
      <svg
        viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        className="w-full overflow-visible"
        role="img"
        aria-labelledby={titleId}
        onMouseLeave={() => setActive(null)}
      >
        {/* One string child, not a mix of text and expressions: React
            serialises interleaved children as separate text nodes on the
            server and merges them on the client, which trips hydration. */}
        <title id={titleId}>{accessibleTitle}</title>

        {/* Dotted outer ring — the reference's containing circle. */}
        <circle
          cx={CENTRE}
          cy={CENTRE}
          r={MAX_RAY + 14}
          fill="none"
          stroke="var(--ex-line)"
          strokeWidth="1"
          strokeDasharray="1 6"
          strokeLinecap="round"
        />

        {/* A single hairline from centre to edge, as in the reference. */}
        <line
          x1={CENTRE}
          y1={CENTRE - INNER_RADIUS}
          x2={CENTRE}
          y2={CENTRE - (MAX_RAY + 14)}
          stroke="var(--ex-line-strong)"
          strokeWidth="1"
          strokeDasharray="2 4"
        />

        {geometry.map((wedge) => {
          const dimmed = active !== null && active !== wedge.slice.key;
          return (
            <g
              key={wedge.slice.key}
              style={{
                opacity: dimmed ? 0.22 : 1,
                transition: 'opacity 220ms var(--ease-out-quint)',
              }}
            >
              {wedge.rays.map((ray, index) => {
                const from = polar(CENTRE, CENTRE, INNER_RADIUS + 4, ray.angle);
                const to = polar(CENTRE, CENTRE, ray.radius, ray.angle);
                return (
                  <line
                    key={index}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={wedge.slice.color}
                    strokeWidth={active === wedge.slice.key ? 1.9 : 1.35}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-width 180ms var(--ease-out-quint)' }}
                  />
                );
              })}
            </g>
          );
        })}

        {/* Hover/focus targets sit above the marks but paint nothing. */}
        {geometry.map((wedge) => (
          <path
            key={`hit-${wedge.slice.key}`}
            d={wedge.hoverPath}
            fill="transparent"
            tabIndex={0}
            role="button"
            aria-label={`${wedge.slice.name}: ${formatMoney(wedge.slice.spentMinor, currency)}, ${formatPercent(wedge.slice.share, 1)} of spending, ${wedge.slice.transactionCount} ${pluralise(wedge.slice.transactionCount, 'transaction')}`}
            className="cursor-pointer outline-none focus-visible:stroke-focus focus-visible:[stroke-width:2]"
            onMouseEnter={() => setActive(wedge.slice.key)}
            onFocus={() => setActive(wedge.slice.key)}
            onBlur={() => setActive(null)}
          />
        ))}

        {/* Centre well: the reference's solid disc that the rays radiate from. */}
        <circle cx={CENTRE} cy={CENTRE} r={INNER_RADIUS} fill="var(--ex-surface)" />
        <circle
          cx={CENTRE}
          cy={CENTRE}
          r={INNER_RADIUS}
          fill="none"
          stroke="var(--ex-line)"
          strokeWidth="1"
        />
      </svg>

      {/* Centre readout, overlaid so it can use real typography. The padding is
          derived from the well: the disc is 2 x INNER_RADIUS wide out of a
          VIEWBOX-wide square, so anything wider than that spills over the rays
          instead of sitting inside the circle. */}
      <div
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
        style={{ paddingInline: `${((VIEWBOX - INNER_RADIUS * 2) / 2 / VIEWBOX) * 100}%` }}
      >
        {activeSlice ? (
          <>
            <span className="ex-label mb-1.5 max-w-full truncate">{activeSlice.name}</span>
            <Money
              minor={activeSlice.spentMinor}
              currency={currency}
              size="md"
              hideFraction
              className="text-ink"
            />
            <span className="mt-1.5 font-mono text-[0.6875rem] tracking-[0.08em] text-ink-3">
              {formatPercent(activeSlice.share, 1)}
            </span>
            <span className="mt-0.5 font-mono text-[0.625rem] tracking-[0.06em] text-ink-faint">
              {activeSlice.transactionCount} {pluralise(activeSlice.transactionCount, 'txn')}
            </span>
          </>
        ) : (
          <>
            <span className="ex-label mb-1.5 max-w-full truncate">{caption ?? 'Total spent'}</span>
            <Money minor={totalMinor} currency={currency} size="md" hideFraction className="text-ink" />
          </>
        )}
      </div>

      {/* The chart's data, always available to assistive technology. */}
      <table className="sr-only">
        <caption>Spending by category</caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Amount</th>
            <th scope="col">Share</th>
            <th scope="col">Transactions</th>
          </tr>
        </thead>
        <tbody>
          {slices.map((slice) => (
            <tr key={slice.key}>
              <th scope="row">{slice.name}</th>
              <td>{formatMoney(slice.spentMinor, currency)}</td>
              <td>{formatPercent(slice.share, 1)}</td>
              <td>{slice.transactionCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Legend rail that pairs with the radial on wide layouts. */
export function RadialLegend({
  slices,
  currency,
  className,
  limit = 6,
}: {
  slices: readonly RadialSlice[];
  currency: string;
  className?: string;
  limit?: number;
}) {
  const shown = slices.slice(0, limit);
  return (
    <ul className={cn('flex flex-col', className)}>
      {shown.map((slice) => (
        <li
          key={slice.key}
          className="flex items-center justify-between gap-3 border-b border-line-faint py-2.5 last:border-0"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-[1px]"
              style={{ backgroundColor: slice.color }}
            />
            <span className="truncate text-[0.8125rem] font-medium text-ink">{slice.name}</span>
          </span>
          <span className="flex shrink-0 items-baseline gap-2.5">
            <span className="font-mono text-[0.6875rem] tracking-[0.06em] text-ink-3">
              {formatPercent(slice.share)}
            </span>
            <Money minor={slice.spentMinor} currency={currency} size="xs" hideFraction className="text-ink-2" />
          </span>
        </li>
      ))}
    </ul>
  );
}
