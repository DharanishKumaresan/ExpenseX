'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { NotificationBell } from './notification-bell';
import { SearchDialog } from './search-dialog';
import { ThemeToggle } from './theme-toggle';
import { isSharedRoute } from './navigation';
import { WorkspaceSwitcher, type SwitcherWorkspace } from './workspace-switcher';
import { signOut } from '@/server/actions/auth';
import { clearServiceWorkerCaches } from '@/components/pwa/service-worker';
import { Avatar, Badge } from '@/components/ui/primitives';
import { Wordmark } from '@/components/brand';
import { cn, firstName } from '@/lib/utils';
import type { NotificationRow } from '@/server/queries/collaboration';

/**
 * Top bar.
 *
 * Carries the workspace name on mobile (where the sidebar switcher is not
 * visible), plus search, notifications and the account menu everywhere.
 */
export function Header({
  user,
  workspace,
  notifications,
  unread,
}: {
  user: { name: string; email: string; currency: string };
  workspace: SwitcherWorkspace | null;
  notifications: NotificationRow[];
  unread: number;
}) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const shared = isSharedRoute(pathname);

  // ⌘K / Ctrl+K opens search from anywhere.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const scopeLabel = shared
    ? workspace?.name ?? 'Shared'
    : 'My Finances';

  return (
    <>
      {/* Keeps its canvas background at every width: the content panel scrolls
          underneath, and a transparent bar would let text collide with it. */}
      {/* The height here is what --ex-header-h describes; changing the padding
          or the control height means changing that token too. */}
      <header className="ex-no-print sticky top-0 z-30 flex h-[var(--ex-header-h)] items-center gap-1.5 border-b border-line bg-canvas/95 px-3 backdrop-blur-sm sm:gap-2 sm:px-6 lg:border-0 lg:px-8">
        <Link href="/overview" className="shrink-0 lg:hidden" aria-label="ExpenseX home">
          <Wordmark size="sm" />
        </Link>

        {/* Scope indicator: on mobile this is the only place the current
            workspace is named, so it is never hidden behind a menu. */}
        <div className="ml-1 flex min-w-0 flex-1 items-center gap-2 lg:ml-0">
          <span
            className={cn(
              'hidden max-w-full truncate rounded-[5px] px-2 py-1 font-mono text-[0.625rem] tracking-[0.14em] uppercase xs:inline-block lg:hidden',
              shared ? 'bg-forest text-on-forest' : 'bg-surface-2 text-ink-3',
            )}
          >
            {shared && workspace?.partnerName
              ? `With ${firstName(workspace.partnerName)}`
              : scopeLabel}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex size-10 shrink-0 items-center justify-center gap-2 rounded-[7px] border border-line text-ink-3 transition-colors hover:border-line-strong hover:bg-surface-2 hover:text-ink lg:size-auto lg:h-9 lg:min-w-[13rem] lg:justify-start lg:px-2.5"
          aria-label="Search"
        >
          <svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden="true" className="shrink-0">
            <circle cx="7.8" cy="7.8" r="5.4" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11.8 11.8L15.5 15.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="hidden text-[0.8125rem] lg:inline">Search</span>
          <kbd className="ml-auto hidden rounded-[3px] border border-line px-1.5 font-mono text-[0.5625rem] tracking-[0.08em] text-ink-faint lg:inline">
            ⌘K
          </kbd>
        </button>

        <ThemeToggle compact />

        <NotificationBell notifications={notifications} unread={unread} />
        <AccountMenu user={user} />
      </header>

      <SearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        workspaceId={shared ? (workspace?.id ?? null) : null}
        currency={user.currency}
        scopeLabel={scopeLabel}
      />
    </>
  );
}

function AccountMenu({ user }: { user: { name: string; email: string } }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div className="relative" onPointerDown={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        className="grid size-10 shrink-0 place-items-center rounded-full transition-transform hover:scale-105 lg:size-9"
      >
        <Avatar name={user.name} size="sm" />
      </button>

      {open ? (
        <div
          role="menu"
          className="ex-animate-scale absolute top-[calc(100%+8px)] right-0 z-50 w-56 overflow-hidden rounded-[10px] border border-line-strong bg-surface shadow-[0_16px_40px_-16px_rgba(0,0,0,0.4)]"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-[0.8125rem] font-semibold text-ink">{user.name}</p>
            <p className="mt-0.5 truncate text-[0.75rem] text-ink-3">{user.email}</p>
          </div>

          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between px-4 py-2.5 text-[0.8125rem] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            Settings
            <Badge tone="outline">⌘,</Badge>
          </Link>

          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await signOut();
                // Build output only, but a shared device should keep none of it.
                await clearServiceWorkerCaches();
                router.refresh();
              })
            }
            className="w-full px-4 py-2.5 text-left text-[0.8125rem] font-medium text-coral transition-colors hover:bg-coral/10 disabled:opacity-60"
          >
            {pending ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Compact switcher shown at the top of mobile pages. */
export function MobileWorkspaceBar({
  workspace,
  userName,
}: {
  workspace: SwitcherWorkspace | null;
  userName: string;
}) {
  return (
    <div className="px-4 pt-3 sm:px-6 lg:hidden">
      <WorkspaceSwitcher workspace={workspace} userName={userName} />
    </div>
  );
}
