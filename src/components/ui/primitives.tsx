import Link from 'next/link';
import { cn, initials } from '@/lib/utils';
import { swatchFor, swatchForKey } from '@/lib/categories';
import { BUDGET_LEVEL_LABEL, type BudgetLevel } from '@/lib/analytics';

/* ------------------------------------------------------------------------ */
/* Avatars                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Monogram avatar. No uploaded imagery in this build, so the fallback IS the
 * design: a forest tile with the person's initials in mono.
 */
export function Avatar({
  name,
  size = 'md',
  tone = 'forest',
  className,
}: {
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  tone?: 'forest' | 'accent' | 'coral' | 'outline';
  className?: string;
}) {
  const sizes = {
    xs: 'size-6 text-[0.5625rem]',
    sm: 'size-8 text-[0.625rem]',
    md: 'size-10 text-[0.6875rem]',
    lg: 'size-14 text-[0.875rem]',
  };
  const tones = {
    forest: 'bg-forest text-on-forest',
    accent: 'bg-accent text-on-accent',
    coral: 'bg-coral text-on-coral',
    outline: 'border border-line-strong bg-surface-3 text-ink-2',
  };

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-mono font-medium tracking-[0.04em] uppercase select-none',
        sizes[size],
        tones[tone],
        className,
      )}
      title={name}
    >
      <span aria-hidden="true">{initials(name)}</span>
      <span className="sr-only">{name}</span>
    </span>
  );
}

/** Overlapping pair used wherever the two members are shown together. */
export function AvatarPair({
  names,
  size = 'sm',
}: {
  names: readonly string[];
  size?: 'xs' | 'sm' | 'md';
}) {
  return (
    <span className="flex items-center -space-x-2">
      {names.slice(0, 2).map((name, index) => (
        <Avatar
          key={name}
          name={name}
          size={size}
          tone={index === 0 ? 'forest' : 'outline'}
          className="ring-2 ring-surface"
        />
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------------ */
/* Badges                                                                    */
/* ------------------------------------------------------------------------ */

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'forest' | 'accent' | 'coral' | 'positive' | 'outline';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-surface-3 text-ink-2',
    forest: 'bg-forest text-on-forest',
    accent: 'bg-accent text-on-accent',
    coral: 'bg-coral text-on-coral',
    positive: 'bg-positive text-on-positive',
    outline: 'border border-line-strong text-ink-3',
  };
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-[4px] px-1.5 py-[3px] font-mono text-[0.625rem] leading-none font-medium tracking-[0.12em] whitespace-nowrap uppercase',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Category chip carrying its swatch as a small square, never as the only cue. */
export function CategoryBadge({
  name,
  color,
  className,
}: {
  name: string;
  color?: string | null;
  className?: string;
}) {
  const swatch = color ? swatchFor(color) : swatchForKey(name);
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-[1px]"
        style={{ backgroundColor: swatch }}
      />
      <span className="ex-label">{name}</span>
    </span>
  );
}

/**
 * Budget state pill. The label always carries the meaning in words —
 * "BUDGET OVERRUN" — so the colour is reinforcement, never the signal.
 */
export function BudgetLevelBadge({ level, className }: { level: BudgetLevel; className?: string }) {
  if (level === 'none' || level === 'healthy') return null;
  const tone = level === 'overrun' ? 'coral' : level === 'reached' ? 'forest' : 'accent';
  return (
    <Badge tone={tone} className={className}>
      {level === 'overrun' ? (
        <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true" className="shrink-0">
          <path d="M5 1L9.33 8.5H0.67L5 1Z" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
          <path d="M5 4.1v1.7M5 6.9v.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      ) : null}
      {BUDGET_LEVEL_LABEL[level]}
    </Badge>
  );
}

/* ------------------------------------------------------------------------ */
/* Progress                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Progress rendered as a solid fill over hatched track — the reference's
 * vertical-rule texture. Overrun is drawn as a coral fill that visibly
 * saturates the bar, and the accompanying text states the overrun explicitly.
 */
export function Progress({
  value,
  level,
  tone,
  label,
  className,
  height = 'md',
}: {
  /** 0-100+; values above 100 render as a full bar with an overrun cap. */
  value: number;
  level?: BudgetLevel;
  tone?: 'forest' | 'accent' | 'coral' | 'inverse';
  label: string;
  className?: string;
  height?: 'sm' | 'md' | 'lg';
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const resolvedTone =
    tone ?? (level === 'overrun' ? 'coral' : level === 'warning' ? 'accent' : 'forest');

  const fills = {
    forest: 'bg-forest',
    accent: 'bg-accent',
    coral: 'bg-coral',
    inverse: 'bg-on-forest',
  };
  const heights = { sm: 'h-1.5', md: 'h-2.5', lg: 'h-4' };

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn(
        'ex-hatch relative w-full overflow-hidden rounded-[2px] bg-surface-3',
        heights[height],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn('absolute inset-y-0 left-0 transition-[width] duration-500 ease-out', fills[resolvedTone])}
        style={{ width: `${clamped}%` }}
      />
      {value > 100 ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 right-0 w-1 bg-on-coral/60"
          title="Over budget"
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Structure                                                                 */
/* ------------------------------------------------------------------------ */

/** Two-tone editorial heading: light muted line over a heavy dark line. */
export function SectionHeading({
  over,
  title,
  action,
  className,
  size = 'md',
}: {
  over: string;
  title: string;
  action?: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizes = {
    sm: 'text-[1.25rem] sm:text-[1.5rem]',
    md: 'text-[1.75rem] sm:text-[2.25rem]',
    lg: 'text-[2rem] sm:text-[2.75rem]',
  };
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <h2 className={cn('leading-[1.02] font-semibold tracking-[-0.03em]', sizes[size])}>
        <span className="block font-normal text-ink-faint">{over}</span>
        <span className="block font-bold text-ink">{title}</span>
      </h2>
      {action}
    </div>
  );
}

/** Hairline rule with an optional inline label, used between block stacks. */
export function RuleLabel({ children, className }: { children?: React.ReactNode; className?: string }) {
  if (!children) return <hr className={cn('border-t border-line', className)} />;
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="ex-label shrink-0">{children}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-line" />
    </div>
  );
}

/**
 * Vertical-rule texture field from the references. Used as decorative fill
 * inside goal and budget blocks; density can encode a value.
 */
export function HatchField({
  fill = 0.5,
  className,
  onDark,
}: {
  /** 0-1 — how much of the width is hatched. */
  fill?: number;
  className?: string;
  onDark?: boolean;
}) {
  return (
    <div aria-hidden="true" className={cn('relative overflow-hidden', className)}>
      <div
        className={cn('absolute inset-y-0 left-0', onDark ? 'ex-hatch-on-dark' : 'ex-hatch')}
        style={{ width: `${Math.max(0, Math.min(1, fill)) * 100}%` }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Empty & loading states                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Empty states are written, not shrugged. Each one names what the screen is
 * for and offers the single action that fills it.
 */
export function EmptyState({
  headline,
  body,
  action,
  tone = 'surface',
  className,
}: {
  headline: string;
  body?: string;
  action?: React.ReactNode;
  tone?: 'surface' | 'forest' | 'accent';
  className?: string;
}) {
  const tones = {
    surface: 'bg-surface-2 text-ink',
    forest: 'bg-forest text-on-forest',
    accent: 'bg-accent text-on-accent',
  };
  const bodyTone = {
    surface: 'text-ink-3',
    forest: 'text-on-forest-muted',
    accent: 'text-on-accent/70',
  };

  return (
    <div
      className={cn(
        'flex flex-col items-start gap-4 rounded-[14px] px-6 py-10 sm:px-10 sm:py-14',
        tones[tone],
        className,
      )}
    >
      <p className="max-w-[24ch] text-[1.35rem] leading-[1.1] font-bold tracking-[-0.02em] uppercase sm:text-[1.75rem]">
        {headline}
      </p>
      {body ? <p className={cn('max-w-[46ch] text-[0.9375rem] leading-relaxed', bodyTone[tone])}>{body}</p> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('ex-skeleton rounded-[4px]', className)} />;
}

/** Loading placeholder that says what it is waiting for. */
export function LoadingBlock({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3', className)} role="status" aria-live="polite">
      <span className="ex-label">{label}</span>
      <Skeleton className="h-12 w-2/3" />
      <Skeleton className="h-4 w-1/3" />
    </div>
  );
}

/** Inline error panel — never renders a stack trace or an internal code. */
export function ErrorNote({
  title,
  message,
  action,
  className,
}: {
  title: string;
  message?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn('rounded-[10px] border border-coral bg-coral/10 px-4 py-3.5', className)}
    >
      <p className="flex items-center gap-2 font-mono text-[0.6875rem] font-medium tracking-[0.14em] uppercase text-ink">
        <svg width="11" height="11" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M5 1L9.33 8.5H0.67L5 1Z" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
          <path d="M5 4.1v1.7M5 6.9v.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
        {title}
      </p>
      {message ? <p className="mt-1.5 text-[0.8125rem] leading-snug text-ink-2">{message}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Navigation helpers                                                        */
/* ------------------------------------------------------------------------ */

/** Row that reads as a slab and behaves as a link. */
export function BlockLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'ex-block group transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2',
        className,
      )}
    >
      {children}
    </Link>
  );
}

/**
 * Form-level error summary.
 *
 * Renders the headline failure plus any field errors the form does not itself
 * display inline. Without this, a validation failure on a field that has no
 * visible input (or that the form chose not to surface) degrades to a useless
 * "Please check the form."
 */
export function FormErrorSummary({
  error,
  fieldErrors,
  handled = [],
  title = 'Could not save',
}: {
  error: string | null;
  fieldErrors?: Record<string, string>;
  /** Field keys the form renders inline, so they are not repeated here. */
  handled?: string[];
  title?: string;
}) {
  if (!error) return null;

  const unhandled = Object.entries(fieldErrors ?? {}).filter(
    ([key]) => !handled.includes(key) && key !== 'form',
  );

  return (
    <ErrorNote
      title={title}
      message={error}
      action={
        unhandled.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {unhandled.map(([key, message]) => (
              <li key={key} className="text-[0.8125rem] leading-snug text-ink-2">
                <span className="ex-label mr-1.5">{key}</span>
                {message}
              </li>
            ))}
          </ul>
        ) : null
      }
    />
  );
}
