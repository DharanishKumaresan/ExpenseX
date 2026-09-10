import type { Metadata } from 'next';
import { requireUserPage, resolveScope } from '@/server/scope';
import { BudgetScreen } from '@/components/budgets/budget-screen';
import { parseMonthParam } from '@/components/dashboard/month-nav';

export const metadata: Metadata = { title: 'Budgets' };

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const user = await requireUserPage('/budgets');
  const params = await searchParams;
  const scope = await resolveScope(user, null);

  return (
    <BudgetScreen
      scope={scope}
      userId={user.id}
      monthKey={parseMonthParam(params)}
      basePath="/budgets"
    />
  );
}
