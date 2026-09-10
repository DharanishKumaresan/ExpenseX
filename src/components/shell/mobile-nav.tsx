'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  MOBILE_NAV,
  PERSONAL_NAV,
  SHARED_NAV,
  SYSTEM_NAV,
  isActive,
  isSharedRoute,
  type MobileIcon,
} from './navigation';
import { Modal } from '@/components/ui/modal';
import { Avatar } from '@/components/ui/primitives';
import { cn, firstName } from '@/lib/utils';
import type { SwitcherWorkspace } from './workspace-switcher';

/**
 * Bottom navigation for small screens.
 *
 * Designed for the thumb, not shrunk from the desktop: five targets at 56px
 * minimum, the Shared workspace reachable from "More", and safe-area padding
 * so the bar clears the iOS home indicator.
 */
export function MobileNav({
  workspace,
  userName,
  hasSharedSpace,
  pendingInvitations,
}: {
  workspace: SwitcherWorkspace | null;
  userName: string;
  hasSharedSpace: boolean;
  pendingInvitations: number;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [pathname]);

  const shared = isSharedRoute(pathname);
  const moreActive = shared || pathname.startsWith('/settings') || pathname.startsWith('/analytics') || pathname.startsWith('/recurring');

  return (
    <>
      <nav
        aria-label="Main"
        className="ex-no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-sm lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="grid grid-cols-5">
          {MOBILE_NAV.map((item) => {
            // In the shared workspace the same tabs point at shared screens.
            const href = shared ? sharedEquivalent(item.href) : item.href;
            const active = isActive(pathname, { href, label: item.label, exact: href === '/shared' });
            return (
              <li key={item.href}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 transition-colors',
                    active ? 'text-ink' : 'text-ink-3',
                  )}
                >
                  <NavIcon icon={item.icon} filled={active} />
                  <span className="font-mono text-[0.5625rem] tracking-[0.1em] uppercase">
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}

          <li>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-haspopup="dialog"
              className={cn(
                'relative flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 py-2 transition-colors',
                moreActive ? 'text-ink' : 'text-ink-3',
              )}
            >
              <NavIcon icon="more" filled={moreActive} />
              <span className="font-mono text-[0.5625rem] tracking-[0.1em] uppercase">More</span>
              {pendingInvitations > 0 ? (
                <span className="absolute top-2 right-[22%] size-2 rounded-full bg-coral" aria-hidden="true" />
              ) : null}
            </button>
          </li>
        </ul>
      </nav>

      <Modal
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Everything"
        eyebrow={shared ? (workspace?.name ?? 'Shared') : 'My Finances'}
      >
        <div className="flex flex-col gap-6 pb-2">
          <MenuSection title="Personal" items={PERSONAL_NAV} pathname={pathname} />

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2.5">
              <span className="ex-label ex-label-lg">Shared</span>
              {pendingInvitations > 0 ? (
                <span className="grid size-4 place-items-center rounded-full bg-coral font-mono text-[0.5625rem] font-bold text-on-coral">
                  {pendingInvitations}
                </span>
              ) : null}
              <span aria-hidden="true" className="h-px flex-1 bg-line" />
            </div>

            {workspace ? (
              <div className="mb-1 flex items-center gap-2.5 rounded-[8px] bg-surface-3 px-3 py-2.5">
                <Avatar name={workspace.partnerName ?? workspace.name} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-[0.8125rem] font-semibold text-ink">{workspace.name}</p>
                  <p className="ex-label mt-0.5">
                    {workspace.partnerName ? `With ${firstName(workspace.partnerName)}` : 'Awaiting partner'}
                  </p>
                </div>
              </div>
            ) : null}

            <ul className="flex flex-col">
              {(hasSharedSpace ? SHARED_NAV : [{ href: '/shared', label: 'Set up a shared space', exact: true }]).map(
                (item) => (
                  <MenuLink key={item.href} href={item.href} label={item.label} active={isActive(pathname, item)} />
                ),
              )}
            </ul>
          </div>

          <MenuSection title="System" items={SYSTEM_NAV} pathname={pathname} />

          <p className="pt-1 text-[0.6875rem] text-ink-faint">
            Signed in as {userName}
          </p>
        </div>
      </Modal>
    </>
  );
}

function sharedEquivalent(href: string): string {
  const map: Record<string, string> = {
    '/overview': '/shared',
    '/transactions': '/shared/transactions',
    '/budgets': '/shared/budget',
    '/goals': '/shared/goals',
  };
  return map[href] ?? href;
}

function MenuSection({
  title,
  items,
  pathname,
}: {
  title: string;
  items: { href: string; label: string; exact?: boolean }[];
  pathname: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <span className="ex-label ex-label-lg">{title}</span>
        <span aria-hidden="true" className="h-px flex-1 bg-line" />
      </div>
      <ul className="flex flex-col">
        {items.map((item) => (
          <MenuLink key={item.href} href={item.href} label={item.label} active={isActive(pathname, item)} />
        ))}
      </ul>
    </div>
  );
}

function MenuLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex min-h-12 items-center justify-between rounded-[7px] px-3 text-[0.9375rem] transition-colors',
          active ? 'bg-surface-3 font-semibold text-ink' : 'font-medium text-ink-2 hover:bg-surface-2',
        )}
      >
        {label}
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="text-ink-faint">
          <path d="M4 2L8.5 6L4 10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    </li>
  );
}

function NavIcon({ icon, filled }: { icon: MobileIcon; filled: boolean }) {
  const stroke = 1.5;
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 20 20',
    fill: 'none',
    'aria-hidden': true as const,
  };

  switch (icon) {
    case 'home':
      return (
        <svg {...common}>
          <path d="M3 8.2L10 3l7 5.2V16a1 1 0 0 1-1 1h-3.5v-4.5h-5V17H4a1 1 0 0 1-1-1V8.2Z" stroke="currentColor" strokeWidth={stroke} strokeLinejoin="round" fill={filled ? 'currentColor' : 'none'} fillOpacity={filled ? 0.14 : 0} />
        </svg>
      );
    case 'list':
      return (
        <svg {...common}>
          <path d="M4 5.5h12M4 10h12M4 14.5h8" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" />
        </svg>
      );
    case 'budget':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="14" height="12" rx="2" stroke="currentColor" strokeWidth={stroke} fill={filled ? 'currentColor' : 'none'} fillOpacity={filled ? 0.14 : 0} />
          <path d="M3 8h14M7.5 12h5" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" />
        </svg>
      );
    case 'goal':
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth={stroke} />
          <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth={stroke} fill={filled ? 'currentColor' : 'none'} fillOpacity={filled ? 0.2 : 0} />
        </svg>
      );
    case 'more':
      return (
        <svg {...common}>
          <circle cx="5" cy="10" r="1.4" fill="currentColor" />
          <circle cx="10" cy="10" r="1.4" fill="currentColor" />
          <circle cx="15" cy="10" r="1.4" fill="currentColor" />
        </svg>
      );
  }
}
