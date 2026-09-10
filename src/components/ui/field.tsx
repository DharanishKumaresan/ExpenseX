'use client';

import { forwardRef, useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * Form primitives.
 *
 * Inputs are sunken wells with a single hairline underneath rather than boxed
 * cards — the editorial register — but every one of them is a real labelled
 * control with an id/for pair, `aria-describedby` for hints and errors, and
 * `aria-invalid` when it fails.
 */

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  /** Visually hide the label but keep it for assistive tech. */
  hideLabel?: boolean;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
  hideLabel,
}: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={htmlFor}
        className={cn('ex-label flex items-center gap-1.5', hideLabel && 'sr-only')}
      >
        {label}
        {required ? (
          <span aria-hidden="true" className="text-coral">
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p className="flex items-start gap-1.5 text-[0.75rem] leading-tight font-medium text-coral">
          <svg width="12" height="12" viewBox="0 0 12 12" className="mt-px shrink-0" aria-hidden="true">
            <circle cx="6" cy="6" r="5.25" stroke="currentColor" strokeWidth="1.2" fill="none" />
            <path d="M6 3.25v3.2M6 8.4v.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          {error}
        </p>
      ) : hint ? (
        <p className="text-[0.75rem] leading-tight text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

const CONTROL_BASE =
  'w-full rounded-[8px] border border-line bg-surface-3 px-3 text-[0.9375rem] text-ink ' +
  'placeholder:text-ink-faint transition-colors ' +
  'hover:border-line-strong focus:border-ink focus:outline-none ' +
  'aria-[invalid=true]:border-coral aria-[invalid=true]:bg-coral/5 ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(CONTROL_BASE, 'h-11', className)} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(CONTROL_BASE, 'min-h-20 resize-y py-2.5', className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(CONTROL_BASE, 'h-11 cursor-pointer appearance-none pr-9', className)}
          {...props}
        >
          {children}
        </select>
        <svg
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-3"
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden="true"
        >
          <path d="M1 3.5L5 7.5L9 3.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </svg>
      </div>
    );
  },
);

/**
 * The oversized amount entry that headlines every money form. Renders the
 * currency symbol as a fixed prefix and lets the figure itself dominate.
 */
export const AmountInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { symbol: string; negative?: boolean }
>(function AmountInput({ symbol, negative, className, ...props }, ref) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-[12px] border border-line bg-surface-3 px-4 py-3 transition-colors',
        'focus-within:border-ink',
        className,
      )}
    >
      {negative ? (
        <span aria-hidden="true" className="ex-numeral text-2xl text-ink-3">
          −
        </span>
      ) : null}
      <span aria-hidden="true" className="ex-numeral text-2xl text-ink-3">
        {symbol}
      </span>
      <input
        ref={ref}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        className="ex-numeral w-full bg-transparent text-3xl text-ink outline-none placeholder:text-ink-faint sm:text-4xl"
        {...props}
      />
    </div>
  );
});

/** Radio group rendered as segmented slabs — used for type and "paid by". */
interface SegmentOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

export function SegmentedField<T extends string>({
  label,
  name,
  value,
  onChange,
  options,
  hint,
  error,
  columns,
}: {
  label: string;
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentOption<T>[];
  hint?: string;
  error?: string;
  columns?: number;
}) {
  const groupId = useId();
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="ex-label mb-1.5">{label}</legend>
      <div
        role="radiogroup"
        aria-labelledby={groupId}
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                'flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-[8px] border px-2 py-2 text-center transition-colors',
                selected
                  ? 'border-ink bg-forest text-on-forest'
                  : 'border-line bg-surface-3 text-ink-2 hover:border-line-strong hover:bg-surface-2',
              )}
            >
              <span className="font-mono text-[0.6875rem] font-medium tracking-[0.12em] uppercase">
                {option.label}
              </span>
              {option.description ? (
                <span className={cn('text-[0.65rem]', selected ? 'text-on-forest-muted' : 'text-ink-3')}>
                  {option.description}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {/* Mirrors the selection for non-JS submits and for form serialisation. */}
      <input type="hidden" name={name} value={value} />
      {error ? (
        <p className="text-[0.75rem] font-medium text-coral">{error}</p>
      ) : hint ? (
        <p className="text-[0.75rem] text-ink-3">{hint}</p>
      ) : null}
    </fieldset>
  );
}

/** Switch used in settings. A real checkbox under a styled track. */
export function Toggle({
  label,
  description,
  name,
  defaultChecked,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  name?: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-3.5">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-[0.875rem] font-semibold text-ink">
          {label}
        </label>
        {description ? <p className="mt-0.5 text-[0.75rem] leading-snug text-ink-3">{description}</p> : null}
      </div>
      <label className="relative inline-flex shrink-0 cursor-pointer items-center">
        <input
          id={id}
          name={name}
          type="checkbox"
          defaultChecked={defaultChecked}
          checked={checked}
          onChange={(event) => onChange?.(event.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="block h-6 w-11 rounded-full border border-line-strong bg-surface-3 transition-colors peer-checked:border-forest peer-checked:bg-forest peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-0.5 size-5 -translate-y-1/2 rounded-full bg-ink transition-transform duration-200 peer-checked:translate-x-5 peer-checked:bg-on-forest"
        />
      </label>
    </div>
  );
}
