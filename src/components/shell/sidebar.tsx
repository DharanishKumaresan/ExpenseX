'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PERSONAL_NAV, SHARED_NAV, SYSTEM_NAV, isActive, type NavItem } from './navigation';
import { WorkspaceSwitcher, type SwitcherWorkspace } from './workspace-switcher';
import { cn } from '@/lib/utils';

/**
 * Desktop sidebar.
 *
 * Sits directly on the canvas with no panel of its own — the rule-and-label
 * divisions do the structural work, matching the editorial register of the
 * rest of the product. PERSONAL and SHARED are separated by a labelled
 * hairline so the boundary is impossible to miss.
 */
export function Sidebar({
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

  return (
    <aside className="ex-no-print sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-6 px-5 py-6 lg:flex xl:w-[268px]">
      <Link href="/overview" className="flex items-baseline px-1">
        <span className="text-[1.5rem] leading-none font-extrabold tracking-[-0.05em] text-ink">
          expense
        </span>
        <span className="text-[1.5rem] leading-none font-extrabold tracking-[-0.05em] text-ink-faint">
          x
        </span>
      </Link>

      <WorkspaceSwitcher workspace={workspace} userName={userName} />

      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
        <NavGroup label="Personal" items={PERSONAL_NAV} pathname={pathname} />

        <NavGroup
          label="Shared"
          items={hasSharedSpace ? SHARED_NAV : [{ href: '/shared', label: 'Our Finances', exact: true }]}
          pathname={pathname}
          badge={pendingInvitations > 0 ? pendingInvitations : undefined}
          hint={hasSharedSpace ? undefined : 'Not set up yet'}
        />

        <div className="mt-auto pt-2">
          <NavGroup label="System" items={SYSTEM_NAV} pathname={pathname} />
        </div>
      </nav>
    </aside>
  );
}

function NavGroup({
  label,
  items,
  pathname,
  badge,
  hint,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
  badge?: number;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5 px-1">
        <span className="ex-label ex-label-lg">{label}</span>
        {badge ? (
          <span className="grid size-4 place-items-center rounded-full bg-coral font-mono text-[0.5625rem] font-bold text-on-coral">
            {badge}
          </span>
        ) : null}
        <span aria-hidden="true" className="h-px flex-1 bg-line" />
      </div>

      <ul className="flex flex-col gap-px">
        {items.map((item) => {
          const active = isActive(pathname, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-[7px] px-2.5 py-[7px] text-[0.875rem] transition-colors',
                  active
                    ? 'bg-surface-2 font-semibold text-ink'
                    : 'font-medium text-ink-3 hover:bg-surface-2/60 hover:text-ink',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'h-3.5 w-[2px] shrink-0 rounded-full transition-colors',
                    active ? 'bg-ink' : 'bg-transparent',
                  )}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {hint ? <p className="px-3 text-[0.6875rem] text-ink-faint">{hint}</p> : null}
    </div>
  );
}
