/**
 * Navigation model.
 *
 * PERSONAL and SHARED are separate, visually divided groups — the product's
 * central promise is that you always know which set of money you are looking
 * at, and the nav is the first place that has to be true.
 */

export interface NavItem {
  href: string;
  label: string;
  /** Matches nested routes such as /transactions/abc. */
  exact?: boolean;
}

export interface NavGroup {
  id: 'personal' | 'shared' | 'system';
  label: string;
  items: NavItem[];
}

export const PERSONAL_NAV: NavItem[] = [
  { href: '/overview', label: 'Overview' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/budgets', label: 'Budgets' },
  { href: '/goals', label: 'Goals' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/recurring', label: 'Recurring' },
];

export const SHARED_NAV: NavItem[] = [
  { href: '/shared', label: 'Our Finances', exact: true },
  { href: '/shared/transactions', label: 'Shared Transactions' },
  { href: '/shared/budget', label: 'Shared Budget' },
  { href: '/shared/goals', label: 'Shared Goals' },
  { href: '/shared/activity', label: 'Activity' },
];

export const SYSTEM_NAV: NavItem[] = [{ href: '/settings', label: 'Settings' }];

/** Bottom bar on small screens; "More" opens the full menu including Shared. */
export const MOBILE_NAV: (NavItem & { icon: MobileIcon })[] = [
  { href: '/overview', label: 'Home', icon: 'home' },
  { href: '/transactions', label: 'Activity', icon: 'list' },
  { href: '/budgets', label: 'Budget', icon: 'budget' },
  { href: '/goals', label: 'Goals', icon: 'goal' },
];

export type MobileIcon = 'home' | 'list' | 'budget' | 'goal' | 'more';

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** True when the current route belongs to the shared workspace. */
export function isSharedRoute(pathname: string): boolean {
  return pathname === '/shared' || pathname.startsWith('/shared/');
}

/**
 * The equivalent screen in the other workspace, so switching keeps the user
 * on the page they were reading instead of dumping them on a dashboard.
 */
const EQUIVALENT: Record<string, string> = {
  '/overview': '/shared',
  '/transactions': '/shared/transactions',
  '/budgets': '/shared/budget',
  '/goals': '/shared/goals',
  '/analytics': '/shared',
  '/recurring': '/shared/transactions',
  '/shared': '/overview',
  '/shared/transactions': '/transactions',
  '/shared/budget': '/budgets',
  '/shared/goals': '/goals',
  '/shared/activity': '/overview',
  '/shared/settings': '/settings',
};

export function counterpartRoute(pathname: string, toShared: boolean): string {
  const base = Object.keys(EQUIVALENT)
    .sort((a, b) => b.length - a.length)
    .find((key) => pathname === key || pathname.startsWith(`${key}/`));

  if (base) return EQUIVALENT[base] ?? (toShared ? '/shared' : '/overview');
  return toShared ? '/shared' : '/overview';
}
