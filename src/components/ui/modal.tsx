'use client';

import { useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Modal built on the native <dialog> element.
 *
 * `showModal()` gives us a real focus trap, Escape handling, `inert` on the
 * background and correct screen-reader semantics for free — all of which a
 * hand-rolled div would have to reimplement, usually incompletely.
 *
 * It presents as a bottom sheet under `sm` and a centred panel above it, so
 * the mobile experience is thumb-reachable rather than a shrunken desktop
 * dialog.
 */

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Small uppercase kicker above the title. */
  eyebrow?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Suppress the close affordance for flows that must be completed. */
  dismissible?: boolean;
}

const SIZES = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl' };

export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      document.body.style.overflow = 'hidden';
    } else if (!open && dialog.open) {
      dialog.close();
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Escape fires `cancel`; route it through onClose so state stays in step.
  const handleCancel = useCallback(
    (event: React.SyntheticEvent<HTMLDialogElement>) => {
      event.preventDefault();
      if (dismissible) onClose();
    },
    [dismissible, onClose],
  );

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDialogElement>) => {
      if (!dismissible) return;
      // A click on the dialog element itself (not its content) is the backdrop.
      if (event.target === ref.current) onClose();
    },
    [dismissible, onClose],
  );

  return (
    <dialog
      ref={ref}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      aria-labelledby="ex-modal-title"
      className={cn(
        'w-full max-w-none bg-transparent p-0 text-ink backdrop:bg-[color-mix(in_srgb,var(--ex-ink)_55%,transparent)]',
        'm-0 mt-auto sm:m-auto',
        'max-h-[92dvh] sm:max-h-[88dvh]',
        SIZES[size],
      )}
    >
      {open ? (
        <div
          className={cn(
            'ex-animate-sheet flex max-h-[92dvh] flex-col overflow-hidden rounded-t-[22px] bg-surface sm:ex-animate-scale sm:max-h-[88dvh] sm:rounded-[18px]',
            'border border-line-strong',
          )}
        >
          {/* Grab handle: signals the sheet is dismissible on touch. */}
          <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
            <span aria-hidden="true" className="h-1 w-10 rounded-full bg-line-strong" />
          </div>

          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6 sm:py-5">
            <div className="min-w-0">
              {eyebrow ? <p className="ex-label mb-1.5">{eyebrow}</p> : null}
              <h2
                id="ex-modal-title"
                className="text-[1.35rem] leading-tight font-bold tracking-[-0.02em] text-ink sm:text-[1.6rem]"
              >
                {title}
              </h2>
              {description ? (
                <p className="mt-1.5 text-[0.8125rem] leading-snug text-ink-3">{description}</p>
              ) : null}
            </div>
            {dismissible ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mt-1 -mr-1 shrink-0 rounded-[6px] p-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
                </svg>
              </button>
            ) : null}
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">{children}</div>

          {footer ? (
            <footer className="border-t border-line bg-surface-2 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
              {footer}
            </footer>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}

/**
 * Destructive confirmation. Deleting money data is never a single click, and
 * the consequence is spelled out rather than implied by a red button.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Delete',
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  pending?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      eyebrow="Confirm"
      size="sm"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-11 rounded-[8px] border border-line-strong px-5 font-mono text-[0.75rem] tracking-[0.14em] uppercase text-ink transition-colors hover:bg-surface-2 disabled:opacity-60"
          >
            Keep it
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="h-11 rounded-[8px] bg-coral px-5 font-mono text-[0.75rem] tracking-[0.14em] uppercase text-on-coral transition-colors hover:bg-coral-strong disabled:opacity-60"
          >
            {pending ? 'Working…' : confirmLabel}
          </button>
        </div>
      }
    >
      <p className="text-[0.9375rem] leading-relaxed text-ink-2">{message}</p>
    </Modal>
  );
}
