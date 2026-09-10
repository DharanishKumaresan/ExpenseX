'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { cn, clientId } from '@/lib/utils';

/**
 * Toasts. Deliberately flat blocks, not floating glass cards: a solid slab of
 * forest (or coral for failures) with a mono label, matching the language of
 * the rest of the product.
 */

export type ToastTone = 'default' | 'success' | 'error';

interface Toast {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (input: { title: string; description?: string; tone?: ToastTone }) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DURATION_MS = 5000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((entry) => entry.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback<ToastContextValue['toast']>(
    ({ title, description, tone = 'default' }) => {
      const id = clientId();
      setToasts((current) => [...current.slice(-2), { id, title, description, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        // Announced politely: a saved transaction should not interrupt a
        // screen-reader user mid-sentence.
        role="status"
        aria-live="polite"
        aria-atomic="false"
        // Sits above the mobile bottom bar (present below lg) so a toast never
        // covers the navigation the user might be reaching for.
        className="ex-no-print pointer-events-none fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[80] flex flex-col items-stretch gap-2 lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-[22rem]"
      >
        {toasts.map((entry) => (
          <ToastCard key={entry.id} toast={entry} onDismiss={() => dismiss(entry.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const tone = {
    default: 'bg-forest text-on-forest',
    success: 'bg-forest text-on-forest',
    error: 'bg-coral text-on-coral',
  }[toast.tone];

  const label = { default: 'Done', success: 'Saved', error: 'Could not save' }[toast.tone];

  return (
    <div
      className={cn(
        'ex-animate-rise pointer-events-auto flex items-start gap-3 rounded-[10px] px-4 py-3 shadow-[0_2px_0_0_var(--ex-line-strong)]',
        tone,
      )}
    >
      <div className="min-w-0 flex-1">
        <p
          className="ex-label mb-1"
          style={{ color: toast.tone === 'error' ? 'var(--ex-on-coral)' : 'var(--ex-on-forest-muted)' }}
        >
          {label}
        </p>
        <p className="text-[0.9rem] leading-snug font-semibold">{toast.title}</p>
        {toast.description ? (
          <p className="mt-0.5 text-[0.8rem] leading-snug opacity-80">{toast.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="-mr-1 -mt-1 shrink-0 rounded p-1 text-current opacity-60 transition-opacity hover:opacity-100"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.6" fill="none" />
        </svg>
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>.');
  return context;
}
