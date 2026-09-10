'use client';

import { useId, useMemo, useState } from 'react';
import { linearScale, linePath, niceMax, smoothPath, type Point } from './geometry';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * Time-series marks: hairline axes, mono tick labels, no gridline clutter.
 * Expenses are solid; income is drawn as an outline so the two never rely on
 * colour alone to be told apart.
 */

export interface SeriesDatum {
  key: string;
  label: string;
  incomeMinor: number;
  expenseMinor: number;
}

const AXIS_COLOR = 'var(--ex-line)';

/* ------------------------------------------------------------------------ */
/* Income vs expenses — paired bars                                          */
/* ------------------------------------------------------------------------ */

export function IncomeExpenseChart({
  data,
  currency,
  height = 220,
  className,
  showIncome = true,
}: {
  data: readonly SeriesDatum[];
  currency: string;
  height?: number;
  className?: string;
  showIncome?: boolean;
}) {
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();

  const width = 720;
  const padding = { top: 16, right: 8, bottom: 8, left: 8 };
  const plotHeight = height - padding.top - padding.bottom;
  const plotWidth = width - padding.left - padding.right;

  const max = useMemo(
    () =>
      niceMax(
        Math.max(
          1,
          ...data.map((datum) => Math.max(datum.expenseMinor, showIncome ? datum.incomeMinor : 0)),
        ),
      ),
    [data, showIncome],
  );

  if (data.length === 0) return <ChartEmpty height={height} className={className} />;

  const slot = plotWidth / data.length;
  const barWidth = Math.min(showIncome ? slot * 0.28 : slot * 0.52, 26);
  const gap = showIncome ? barWidth * 0.35 : 0;
  // A handful of ticks, spread evenly — one per bar would truncate to nothing.
  const tickCount = Math.min(6, data.length);
  const tickIndices =
    tickCount <= 1
      ? [0]
      : Array.from({ length: tickCount }, (_, i) =>
          Math.round((i * (data.length - 1)) / (tickCount - 1)),
        );

  return (
    <figure className={cn('w-full', className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-labelledby={titleId}
        preserveAspectRatio="none"
        onMouseLeave={() => setActive(null)}
        style={{ height }}
      >
        <title id={titleId}>
          {`${showIncome ? 'Income and expenses' : 'Expenses'} over ${data.length} periods.`}
        </title>

        {[0, 0.5, 1].map((fraction) => {
          const y = padding.top + plotHeight * fraction;
          return (
            <line
              key={fraction}
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke={AXIS_COLOR}
              strokeWidth="1"
              strokeDasharray={fraction === 1 ? undefined : '2 5'}
            />
          );
        })}

        {data.map((datum, index) => {
          const centre = padding.left + slot * index + slot / 2;
          const expenseHeight = linearScale(datum.expenseMinor, max, plotHeight);
          const incomeHeight = linearScale(datum.incomeMinor, max, plotHeight);
          const baseline = padding.top + plotHeight;
          const isActive = active === index;

          const expenseX = showIncome ? centre - barWidth - gap / 2 : centre - barWidth / 2;
          const incomeX = centre + gap / 2;

          return (
            <g key={datum.key}>
              <rect
                x={padding.left + slot * index}
                y={padding.top}
                width={slot}
                height={plotHeight}
                fill="transparent"
                onMouseEnter={() => setActive(index)}
              />

              <rect
                x={expenseX}
                y={baseline - expenseHeight}
                width={barWidth}
                height={Math.max(expenseHeight, datum.expenseMinor > 0 ? 2 : 0)}
                rx="1.5"
                fill="var(--ex-forest)"
                opacity={active === null || isActive ? 1 : 0.35}
                style={{ transition: 'opacity 180ms ease' }}
              />

              {showIncome ? (
                <rect
                  x={incomeX}
                  y={baseline - incomeHeight}
                  width={barWidth}
                  height={Math.max(incomeHeight, datum.incomeMinor > 0 ? 2 : 0)}
                  rx="1.5"
                  fill="none"
                  stroke="var(--ex-ink-3)"
                  strokeWidth="1.4"
                  opacity={active === null || isActive ? 1 : 0.3}
                  style={{ transition: 'opacity 180ms ease' }}
                />
              ) : null}

            </g>
          );
        })}
      </svg>

      {/* Same reasoning as the trend chart: HTML ticks, undistorted type,
          and a fixed small number of them so they never truncate. */}
      <div aria-hidden="true" className="mt-1 flex justify-between gap-2">
        {tickIndices.map((index) => (
          <span
            key={data[index]!.key}
            className="font-mono text-[0.625rem] tracking-[0.08em] whitespace-nowrap"
            style={{ color: active === index ? 'var(--ex-ink)' : 'var(--ex-ink-3)' }}
          >
            {data[index]!.label}
          </span>
        ))}
      </div>

      <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <LegendSwatch label="Spent" variant="solid" />
          {showIncome ? <LegendSwatch label="Earned" variant="outline" /> : null}
        </div>
        {active !== null && data[active] ? (
          <div className="flex items-center gap-3 font-mono text-[0.6875rem] tracking-[0.06em]">
            <span className="text-ink-3">{data[active]!.label}</span>
            <span className="text-ink">
              −{formatMoney(data[active]!.expenseMinor, currency, { compactDecimals: true, bare: false })}
            </span>
            {showIncome && data[active]!.incomeMinor > 0 ? (
              <span className="text-ink-2">
                +{formatMoney(data[active]!.incomeMinor, currency, { compactDecimals: true })}
              </span>
            ) : null}
          </div>
        ) : null}
      </figcaption>

      <DataTable data={data} currency={currency} showIncome={showIncome} />
    </figure>
  );
}

/* ------------------------------------------------------------------------ */
/* Spending over time — area                                                 */
/* ------------------------------------------------------------------------ */

export function TrendChart({
  data,
  currency,
  height = 200,
  className,
  smooth = true,
}: {
  data: readonly SeriesDatum[];
  currency: string;
  height?: number;
  className?: string;
  smooth?: boolean;
}) {
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();
  const gradientId = useId();

  const width = 720;
  const padding = { top: 14, right: 4, bottom: 6, left: 4 };
  const plotHeight = height - padding.top - padding.bottom;
  const plotWidth = width - padding.left - padding.right;

  const max = useMemo(
    () => niceMax(Math.max(1, ...data.map((datum) => datum.expenseMinor))),
    [data],
  );

  if (data.length === 0) return <ChartEmpty height={height} className={className} />;

  const step = data.length > 1 ? plotWidth / (data.length - 1) : 0;
  const points: Point[] = data.map((datum, index) => ({
    x: padding.left + step * index,
    y: padding.top + plotHeight - linearScale(datum.expenseMinor, max, plotHeight),
  }));

  const stroke = smooth ? smoothPath(points) : linePath(points);
  const baseline = padding.top + plotHeight;
  const area = `${stroke} L ${points[points.length - 1]?.x ?? 0} ${baseline} L ${points[0]?.x ?? 0} ${baseline} Z`;

  // At most five ticks: enough to orient, few enough to never crowd.
  const tickCount = Math.min(5, data.length);
  const tickIndices =
    tickCount <= 1
      ? [0]
      : Array.from({ length: tickCount }, (_, i) =>
          Math.round((i * (data.length - 1)) / (tickCount - 1)),
        );

  return (
    <figure className={cn('w-full', className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-labelledby={titleId}
        preserveAspectRatio="none"
        style={{ height }}
        onMouseLeave={() => setActive(null)}
        onMouseMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - bounds.left) / bounds.width;
          const index = Math.round(((ratio * width - padding.left) / plotWidth) * (data.length - 1));
          setActive(Math.max(0, Math.min(data.length - 1, index)));
        }}
      >
        <title id={titleId}>{`Spending across ${data.length} periods.`}</title>

        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ex-forest)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--ex-forest)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        <line
          x1={padding.left}
          y1={baseline}
          x2={width - padding.right}
          y2={baseline}
          stroke={AXIS_COLOR}
          strokeWidth="1"
        />

        <path d={area} fill={`url(#${gradientId})`} />
        <path d={stroke} fill="none" stroke="var(--ex-forest)" strokeWidth="1.8" strokeLinecap="round" />

        {active !== null && points[active] ? (
          <g>
            <line
              x1={points[active]!.x}
              y1={padding.top}
              x2={points[active]!.x}
              y2={baseline}
              stroke="var(--ex-ink-3)"
              strokeWidth="1"
              strokeDasharray="2 3"
            />
            <circle cx={points[active]!.x} cy={points[active]!.y} r="4" fill="var(--ex-surface)" stroke="var(--ex-forest)" strokeWidth="2" />
          </g>
        ) : null}

      </svg>

      {/* Ticks live in HTML, not in the SVG. The plot is drawn with
          preserveAspectRatio="none" so it can fill any width at a fixed
          height — which would squash <text> horizontally. Rendering the
          labels outside keeps the type at its true size and weight.

          They are spaced with justify-between rather than absolute offsets:
          the buckets are evenly spaced, so the positions line up, and labels
          can never overlap however narrow the container gets. */}
      <div aria-hidden="true" className="mt-1 flex justify-between gap-2">
        {tickIndices.map((index) => (
          <span
            key={data[index]!.key}
            className="font-mono text-[0.625rem] tracking-[0.06em] whitespace-nowrap text-ink-3"
          >
            {data[index]!.label}
          </span>
        ))}
      </div>

      <figcaption className="mt-2 h-5 font-mono text-[0.6875rem] tracking-[0.06em] text-ink-3">
        {active !== null && data[active] ? (
          <>
            <span className="text-ink-2">{data[active]!.label}</span>
            {' · '}
            <span className="text-ink">{formatMoney(data[active]!.expenseMinor, currency)}</span>
          </>
        ) : (
          <span className="text-ink-faint">Hover the line for a day&rsquo;s total</span>
        )}
      </figcaption>

      <DataTable data={data} currency={currency} showIncome={false} />
    </figure>
  );
}

/* ------------------------------------------------------------------------ */
/* Compact marks                                                             */
/* ------------------------------------------------------------------------ */

/** Inline trend mark for stat rows. Decorative — always beside a real figure. */
export function Sparkline({
  values,
  className,
  width = 84,
  height = 22,
}: {
  values: readonly number[];
  className?: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1);
  const points = values.map((value, index) => ({
    x: step * index,
    y: height - linearScale(value, max, height - 2) - 1,
  }));

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('overflow-visible', className)}
      aria-hidden="true"
    >
      <path d={smoothPath(points, 0.3)} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Horizontal ranked bars — category distribution, budget vs actual.
 * The track is hatched so a zero-value row is still visibly a row.
 */
export function RankedBars({
  rows,
  currency,
  className,
  showValue = true,
}: {
  rows: readonly { key: string; label: string; valueMinor: number; color?: string; note?: string }[];
  currency: string;
  className?: string;
  showValue?: boolean;
}) {
  const max = Math.max(1, ...rows.map((row) => row.valueMinor));

  return (
    <ul className={cn('flex flex-col gap-3.5', className)}>
      {rows.map((row) => (
        <li key={row.key} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[0.8125rem] font-medium text-ink">{row.label}</span>
            {showValue ? (
              <span className="ex-numeral shrink-0 text-[0.8125rem] text-ink-2">
                {formatMoney(row.valueMinor, currency, { compactDecimals: true })}
              </span>
            ) : null}
          </div>
          <div className="ex-hatch h-2 w-full overflow-hidden rounded-[2px] bg-surface-3">
            <span
              className="block h-full rounded-[2px] transition-[width] duration-500 ease-out"
              style={{
                width: `${(row.valueMinor / max) * 100}%`,
                backgroundColor: row.color ?? 'var(--ex-forest)',
              }}
            />
          </div>
          {row.note ? <span className="text-[0.6875rem] text-ink-3">{row.note}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------------ */
/* Shared bits                                                               */
/* ------------------------------------------------------------------------ */

function LegendSwatch({ label, variant }: { label: string; variant: 'solid' | 'outline' }) {
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className={cn(
          'inline-block h-3 w-2 rounded-[1px]',
          variant === 'solid' ? 'bg-forest' : 'border border-ink-3',
        )}
      />
      <span className="ex-label">{label}</span>
    </span>
  );
}

function ChartEmpty({ height, className }: { height: number; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-[10px] border border-dashed border-line-strong',
        className,
      )}
      style={{ height }}
    >
      <span className="ex-label">Not enough data yet</span>
    </div>
  );
}

/** Screen-reader table mirroring whatever the chart above draws. */
function DataTable({
  data,
  currency,
  showIncome,
}: {
  data: readonly SeriesDatum[];
  currency: string;
  showIncome: boolean;
}) {
  return (
    <table className="sr-only">
      <thead>
        <tr>
          <th scope="col">Period</th>
          <th scope="col">Spent</th>
          {showIncome ? <th scope="col">Earned</th> : null}
        </tr>
      </thead>
      <tbody>
        {data.map((datum) => (
          <tr key={datum.key}>
            <th scope="row">{datum.label}</th>
            <td>{formatMoney(datum.expenseMinor, currency)}</td>
            {showIncome ? <td>{formatMoney(datum.incomeMinor, currency)}</td> : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
