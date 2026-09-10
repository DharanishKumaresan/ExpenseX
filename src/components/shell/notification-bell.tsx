'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { markNotificationsRead } from '@/server/actions/settings';
import { formatAge } from '@/lib/date';
import { cn } from '@/lib/utils';
import type { NotificationRow } from '@/server/queries/collaboration';

/**
 * Notification tray.
 *
 * Rows are already persisted server-side; this only presents them and marks
 * the set read when the tray is opened.
 */
export function NotificationBell({
  notifications,
  unread,
}: {
  notifications: NotificationRow[];
  unread: number;
}) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      startTransition(async () => {
        await markNotificationsRead();
        router.refresh();
      });
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative grid size-9 place-items-center rounded-[7px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path
            d="M4.4 7.4a4.6 4.6 0 0 1 9.2 0v3l1.2 2.2H3.2L4.4 10.4v-3Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path d="M7.2 14.4a1.9 1.9 0 0 0 3.6 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 grid min-w-[15px] place-items-center rounded-full bg-coral px-1 font-mono text-[0.5rem] leading-[15px] font-bold text-on-coral"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          className="ex-animate-scale absolute top-[calc(100%+8px)] right-0 z-50 w-[min(21rem,calc(100vw-2rem))] overflow-hidden rounded-[12px] border border-line-strong bg-surface shadow-[0_16px_40px_-16px_rgba(0,0,0,0.4)]"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="ex-label ex-label-lg">Notifications</span>
            {notifications.length > 0 ? (
              <span className="font-mono text-[0.625rem] tracking-[0.1em] text-ink-faint">
                {notifications.length}
              </span>
            ) : null}
          </div>

          {notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-[0.8125rem] text-ink-3">
              Nothing yet. Shared activity will show up here.
            </p>
          ) : (
            <ul className="max-h-[22rem] overflow-y-auto">
              {notifications.map((notification) => {
                const body = (
                  <>
                    <span className="flex items-start gap-2">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'mt-1.5 size-1.5 shrink-0 rounded-full',
                          notification.read ? 'bg-transparent' : 'bg-coral',
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.8125rem] leading-snug font-semibold text-ink">
                          {notification.title}
                        </span>
                        <span className="mt-0.5 block text-[0.75rem] leading-snug text-ink-3">
                          {notification.message}
                        </span>
                        <span className="mt-1 block font-mono text-[0.625rem] tracking-[0.08em] text-ink-faint">
                          {formatAge(notification.createdAt)}
                        </span>
                      </span>
                    </span>
                  </>
                );

                return (
                  <li key={notification.id} className="border-b border-line-faint last:border-0">
                    {notification.href ? (
                      <Link
                        href={notification.href}
                        onClick={() => setOpen(false)}
                        className="block px-4 py-3 transition-colors hover:bg-surface-2"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="px-4 py-3">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
