import { formatMoney, formatMoneyParts } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * The product's signature figure treatment: an oversized tabular numeral with
 * the decimal places dropped back to a muted tone, so the eye lands on the
 * rupees and the paise stay available without competing.
 *
 * The muted fraction is decorative contrast only — it is part of the same
 * accessible name as the rest of the number, and the full value is exposed to
 * assistive tech through `aria-label`.
 */

export type MoneySize = 'hero' | 'xl' | 'lg' | 'md' | 'sm' | 'xs';

const SIZES: Record<MoneySize, string> = {
  hero: 'text-[clamp(2.75rem,9vw,5rem)] leading-[0.92]',
  xl: 'text-[clamp(2rem,5.5vw,3.25rem)] leading-[0.95]',
  lg: 'text-[clamp(1.5rem,3.5vw,2.125rem)] leading-none',
  md: 'text-[1.25rem] leading-none',
  sm: 'text-[1rem] leading-none',
  xs: 'text-[0.875rem] leading-none',
};

interface MoneyProps {
  minor: number;
  currency: string;
  size?: MoneySize;
  /** Prefix + for positive values (income, contributions). */
  signed?: boolean;
  /** Hide the paise entirely — used in dense lists and chart axes. */
  hideFraction?: boolean;
  className?: string;
  /** Colour applied to the muted fraction; defaults to the faint ink token. */
  fractionClassName?: string;
  /** Force a leading minus even for a positive number (expense rows). */
  forceNegative?: boolean;
}

export function Money({
  minor,
  currency,
  size = 'md',
  signed,
  hideFraction,
  className,
  fractionClassName,
  forceNegative,
}: MoneyProps) {
  const effective = forceNegative ? -Math.abs(minor) : minor;
  const parts = formatMoneyParts(effective, currency, { signed });
  const accessible = formatMoney(effective, currency, { signed });

  return (
    <span
      className={cn('ex-numeral inline-flex items-baseline whitespace-nowrap', SIZES[size], className)}
      aria-label={accessible}
    >
      <span aria-hidden="true">
        {parts.sign}
        {parts.symbol}
        {parts.whole}
        {!hideFraction && parts.fraction ? (
          <span className={cn('text-ink-faint', fractionClassName)}>
            {parts.decimalSeparator}
            {parts.fraction}
          </span>
        ) : null}
      </span>
    </span>
  );
}

/**
 * Label-over-figure block. The backbone of every dashboard region — a mono
 * micro-label, the number, and an optional footnote.
 */
export function StatBlock({
  label,
  minor,
  currency,
  size = 'lg',
  footnote,
  signed,
  tone = 'default',
  hideFraction,
  className,
  align = 'start',
}: {
  label: string;
  minor: number;
  currency: string;
  size?: MoneySize;
  footnote?: React.ReactNode;
  signed?: boolean;
  tone?: 'default' | 'muted' | 'inverse' | 'coral' | 'accent';
  hideFraction?: boolean;
  className?: string;
  align?: 'start' | 'end';
}) {
  const tones = {
    default: { label: 'text-ink-3', value: 'text-ink', fraction: 'text-ink-faint' },
    muted: { label: 'text-ink-3', value: 'text-ink-2', fraction: 'text-ink-faint' },
    inverse: { label: 'text-on-forest-muted', value: 'text-on-forest', fraction: 'text-on-forest-muted' },
    coral: { label: 'text-on-coral/70', value: 'text-on-coral', fraction: 'text-on-coral/55' },
    accent: { label: 'text-on-accent/70', value: 'text-on-accent', fraction: 'text-on-accent/55' },
  }[tone];

  return (
    <div className={cn('flex flex-col gap-2', align === 'end' && 'items-end text-right', className)}>
      <span className={cn('ex-label', tones.label)}>{label}</span>
      <Money
        minor={minor}
        currency={currency}
        size={size}
        signed={signed}
        hideFraction={hideFraction}
        className={tones.value}
        fractionClassName={tones.fraction}
      />
      {footnote ? <div className={cn('text-[0.75rem] leading-snug', tones.label)}>{footnote}</div> : null}
    </div>
  );
}
