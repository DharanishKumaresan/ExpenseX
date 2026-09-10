import { cn } from '@/lib/utils';

/**
 * Brand marks and the hatched-curve motif from the reference art direction:
 * a field of thin vertical rules clipped by a sweeping curve, which reads as
 * both texture and a suggestion of a rising balance.
 */

export function Wordmark({
  size = 'md',
  className,
  inverse,
}: {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  inverse?: boolean;
}) {
  const sizes = {
    sm: 'text-[1.25rem]',
    md: 'text-[1.75rem]',
    lg: 'text-[3rem] sm:text-[4rem]',
    xl: 'text-[3.5rem] sm:text-[5.5rem]',
  };
  return (
    <span
      className={cn(
        'inline-flex items-baseline leading-none font-extrabold tracking-[-0.055em]',
        sizes[size],
        className,
      )}
    >
      <span className={inverse ? 'text-on-forest' : 'text-ink'}>expense</span>
      <span className={inverse ? 'text-on-forest-muted' : 'text-ink-faint'}>x</span>
    </span>
  );
}

/** Small folded-corner glyph used as the app icon. */
export function BrandGlyph({ className, size = 22 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path d="M4 3h9l7 7v11H4V3Z" fill="currentColor" fillOpacity="0.16" />
      <path d="M4 3h9l7 7v11H4V3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M13 3v7h7" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Vertical rules clipped by a curve. `density` sets the gap between rules and
 * `direction` flips the sweep.
 */
export function HatchCurve({
  className,
  onDark,
  direction = 'rise',
}: {
  className?: string;
  onDark?: boolean;
  direction?: 'rise' | 'fall';
}) {
  const lines = Array.from({ length: 64 }, (_, index) => index);
  const stroke = onDark ? 'var(--ex-line-on-forest)' : 'var(--ex-line-strong)';

  return (
    <svg
      viewBox="0 0 320 220"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cn('h-full w-full', className)}
    >
      <defs>
        <clipPath id={`hatch-clip-${direction}`}>
          {direction === 'rise' ? (
            <path d="M0 220 L0 150 C 90 150, 150 120, 200 40 L 200 0 L 320 0 L 320 220 Z" />
          ) : (
            <path d="M0 0 L0 90 C 80 150, 170 170, 320 175 L 320 220 L 0 220 Z" />
          )}
        </clipPath>
      </defs>

      <g clipPath={`url(#hatch-clip-${direction})`}>
        {lines.map((index) => (
          <line
            key={index}
            x1={index * 5 + 2}
            y1={0}
            x2={index * 5 + 2}
            y2={220}
            stroke={stroke}
            strokeWidth="1.4"
          />
        ))}
      </g>
    </svg>
  );
}

/** 3×3 dot grid from the reference headers. Decorative only. */
export function DotGrid({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className={className}>
      {[2, 8, 14].map((y) =>
        [2, 8, 14].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.35" fill="currentColor" />),
      )}
    </svg>
  );
}
