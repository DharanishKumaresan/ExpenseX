'use client';

import Link from 'next/link';
import { forwardRef } from 'react';
import { useFormStatus } from 'react-dom';
import { cn } from '@/lib/utils';

/**
 * Buttons are flat slabs with a hard 2px offset shadow instead of a blur —
 * the brutalist register the rest of the product uses. No gradients, no glow.
 */

export type ButtonVariant = 'primary' | 'accent' | 'coral' | 'outline' | 'ghost' | 'quiet';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-forest text-on-forest hover:bg-forest-2 active:translate-y-px disabled:bg-forest/50',
  accent:
    'bg-accent text-on-accent hover:bg-accent-strong active:translate-y-px disabled:bg-accent/50',
  coral:
    'bg-coral text-on-coral hover:bg-coral-strong active:translate-y-px disabled:bg-coral/50',
  outline:
    'border border-line-strong bg-transparent text-ink hover:bg-surface-2 active:translate-y-px',
  ghost: 'bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink',
  quiet: 'bg-surface-3 text-ink hover:bg-surface-2 active:translate-y-px',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[0.6875rem] tracking-[0.14em]',
  md: 'h-11 px-5 text-[0.75rem] tracking-[0.14em]',
  lg: 'h-14 px-7 text-[0.8125rem] tracking-[0.16em]',
};

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-[8px] font-mono font-medium uppercase ' +
  'transition-colors duration-150 select-none ' +
  'disabled:cursor-not-allowed disabled:opacity-60 disabled:active:translate-y-0';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Shows a spinner and blocks interaction. */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', fullWidth, loading, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
});

interface LinkButtonProps extends React.ComponentProps<typeof Link> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

export function LinkButton({
  variant = 'primary',
  size = 'md',
  fullWidth,
  className,
  children,
  ...props
}: LinkButtonProps) {
  return (
    <Link
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      {...props}
    >
      {children}
    </Link>
  );
}

/**
 * Submit button wired to the enclosing form's pending state, so every form
 * gets progressive-enhancement-safe feedback without per-form state.
 */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: Omit<ButtonProps, 'type' | 'loading'> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} {...props}>
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Circular arrow control from the reference art direction. */
export function ArrowButton({
  label,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-current/30 transition-transform duration-200 hover:scale-105 active:scale-95',
        className,
      )}
      {...props}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M4 12L12 4M12 4H5.5M12 4V10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
