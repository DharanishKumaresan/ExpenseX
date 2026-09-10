'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { counterpartRoute, isSharedRoute } from './navigation';
import { Avatar } from '@/components/ui/primitives';
import { cn, firstName } from '@/lib/utils';

/**
 * Workspace switcher.
 *
 * The single most important orientation device in the product: it names the
 * money you are currently looking at, and switching moves you to the matching
 * screen in the other workspace rather than resetting you to a dashboard.
 */

export interface SwitcherWorkspace {
  id: string;
  name: string;
  partnerName: string | null;
}

export function WorkspaceSwitcher({
  workspace,
  userName,
  className,
}: {
  workspace: SwitcherWorkspace | null;
  userName: string;
  className?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const shared = isSharedRoute(pathname);

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

  useEffect(() => setOpen(false), [pathname]);

  const currentLabel = shared
    ? workspace?.partnerName
      ? `Shared with ${firstName(workspace.partnerName)}`
      : (workspace?.name ?? 'Shared')
    : 'My Finances';

  const go = (toShared: boolean) => {
    setOpen(false);
    router.push(counterpartRoute(pathname, toShared));
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          'group flex w-full items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition-colors',
          shared
            ? 'border-transparent bg-forest text-on-forest hover:bg-forest-2'
            : 'border-line-strong bg-surface-2 text-ink hover:bg-surface-3',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-[6px]',
            shared ? 'bg-on-forest/15' : 'bg-forest',
          )}
        >
          {shared ? <SharedGlyph /> : <PersonalGlyph />}
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'ex-label block',
              shared ? 'text-on-forest-muted' : 'text-ink-3',
            )}
          >
            Workspace
          </span>
          <span className="mt-0.5 block truncate text-[0.875rem] font-semibold">{currentLabel}</span>
        </span>

        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden="true"
          className={cn('shrink-0 transition-transform', open && 'rotate-180')}
        >
          <path d="M1 3.5L5 7.5L9 3.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="ex-animate-scale absolute top-[calc(100%+6px)] right-0 left-0 z-50 overflow-hidden rounded-[10px] border border-line-strong bg-surface shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35)]"
        >
          <button
            type="button"
            role="menuitemradio"
            aria-checked={!shared}
            onClick={() => go(false)}
            className={cn(
              'flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-surface-2',
              !shared && 'bg-surface-3',
            )}
          >
            <Avatar name={userName} size="sm" tone={!shared ? 'forest' : 'outline'} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.8125rem] font-semibold text-ink">My Finances</span>
              <span className="ex-label mt-0.5 block">Private to you</span>
            </span>
            {!shared ? <Tick /> : null}
          </button>

          <div className="h-px bg-line" />

          {workspace ? (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={shared}
              onClick={() => go(true)}
              className={cn(
                'flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-surface-2',
                shared && 'bg-surface-3',
              )}
            >
              <Avatar
                name={workspace.partnerName ?? workspace.name}
                size="sm"
                tone={shared ? 'forest' : 'outline'}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.8125rem] font-semibold text-ink">
                  {workspace.name}
                </span>
                <span className="ex-label mt-0.5 block truncate">
                  {workspace.partnerName ? `With ${firstName(workspace.partnerName)}` : 'Awaiting partner'}
                </span>
              </span>
              {shared ? <Tick /> : null}
            </button>
          ) : (
            <Link
              href="/shared"
              className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-surface-2"
            >
              <span
                aria-hidden="true"
                className="grid size-8 shrink-0 place-items-center rounded-full border border-dashed border-line-strong text-ink-3"
              >
                +
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.8125rem] font-semibold text-ink">Create a shared space</span>
                <span className="ex-label mt-0.5 block">Budget with one other person</span>
              </span>
            </Link>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Tick() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="shrink-0 text-ink">
      <path d="M2 6.5L4.8 9.2L10 3.4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PersonalGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" className="text-on-forest">
      <circle cx="8" cy="5.4" r="2.6" stroke="currentColor" strokeWidth="1.3" fill="none" />
      <path d="M2.8 13.4c0-2.6 2.3-4.2 5.2-4.2s5.2 1.6 5.2 4.2" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function SharedGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" className="text-on-forest">
      <circle cx="6" cy="6" r="3.1" stroke="currentColor" strokeWidth="1.3" fill="none" />
      <circle cx="10.6" cy="6" r="3.1" stroke="currentColor" strokeWidth="1.3" fill="none" />
      <path d="M2 13.6c.9-1.7 2.4-2.5 4-2.5M14 13.6c-.9-1.7-2.4-2.5-4-2.5" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </svg>
  );
}
