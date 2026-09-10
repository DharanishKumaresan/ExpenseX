'use client';

import { useEffect, useState, useTransition } from 'react';
import { saveTheme } from '@/server/actions/settings';
import { cn } from '@/lib/utils';

type ThemePreference = 'light' | 'dark' | 'system';

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

/**
 * Theme control.
 *
 * The preference is applied to <html> immediately (so the change is instant
 * and survives navigation) and persisted twice: to localStorage for the
 * pre-paint bootstrap script, and to the user record so a new device inherits
 * it. "System" keeps listening to the OS setting for as long as it is chosen.
 */
export function ThemeToggle({ compact }: { compact?: boolean }) {
  const [preference, setPreference] = useState<ThemePreference>('system');
  const [, startTransition] = useTransition();

  useEffect(() => {
    const stored = (document.documentElement.getAttribute('data-theme-pref') ??
      localStorage.getItem('ex-theme') ??
      'system') as ThemePreference;
    setPreference(stored);
  }, []);

  useEffect(() => {
    if (preference !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.setAttribute('data-theme', media.matches ? 'dark' : 'light');
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preference]);

  const choose = (next: ThemePreference) => {
    setPreference(next);
    const resolved =
      next === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : next;

    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.setAttribute('data-theme-pref', next);
    try {
      localStorage.setItem('ex-theme', next);
    } catch {
      // Private mode: the server copy below is still authoritative next load.
    }
    startTransition(() => {
      void saveTheme(next);
    });
  };

  if (compact) {
    const next: ThemePreference = preference === 'dark' ? 'light' : 'dark';
    return (
      <button
        type="button"
        onClick={() => choose(next)}
        aria-label={`Switch to ${next} theme`}
        className="grid size-9 place-items-center rounded-[7px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <SunMoon />
      </button>
    );
  }

  return (
    <fieldset>
      <legend className="ex-label mb-2">Appearance</legend>
      <div role="radiogroup" className="grid grid-cols-3 gap-1.5">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={preference === option.value}
            onClick={() => choose(option.value)}
            className={cn(
              'h-11 rounded-[8px] border font-mono text-[0.6875rem] tracking-[0.12em] uppercase transition-colors',
              preference === option.value
                ? 'border-ink bg-forest text-on-forest'
                : 'border-line bg-surface-3 text-ink-2 hover:border-line-strong hover:bg-surface-2',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function SunMoon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="3.4" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M9 1.6v1.8M9 14.6v1.8M16.4 9h-1.8M3.4 9H1.6M14.2 3.8l-1.3 1.3M5.1 12.9l-1.3 1.3M14.2 14.2l-1.3-1.3M5.1 5.1L3.8 3.8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
