import type { Metadata } from 'next';
import { requireUserPage } from '@/server/scope';
import { db } from '@/server/db';
import { loadAccountBalances, loadAccounts, loadCategories } from '@/server/queries/reference';
import { SettingsScreen } from '@/components/settings/settings-screen';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const user = await requireUserPage('/settings');

  const [accounts, balances, categories, prefs, sessionCount] = await Promise.all([
    loadAccounts(user.id),
    loadAccountBalances(user.id),
    loadCategories(user.id),
    db.notificationPreference.findUnique({ where: { userId: user.id } }),
    db.session.count({ where: { userId: user.id } }),
  ]);

  const balanceById = new Map(balances.map((entry) => [entry.accountId, entry.balanceMinor]));

  return (
    <SettingsScreen
      user={{ name: user.name, email: user.email, currency: user.currency }}
      accounts={accounts.map((account) => ({
        id: account.id,
        name: account.name,
        type: account.type,
        last4: account.last4,
        balanceMinor: balanceById.get(account.id) ?? account.openingBalanceMinor,
      }))}
      customCategories={categories
        .filter((category) => !category.isSystem)
        .map((category) => ({ id: category.id, name: category.name, kind: category.kind }))}
      preferences={{
        sharedTransactions: prefs?.sharedTransactions ?? true,
        sharedBudgets: prefs?.sharedBudgets ?? true,
        sharedGoals: prefs?.sharedGoals ?? true,
        budgetWarnings: prefs?.budgetWarnings ?? true,
        membership: prefs?.membership ?? true,
      }}
      sessionCount={sessionCount}
    />
  );
}
