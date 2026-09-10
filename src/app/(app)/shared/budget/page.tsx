import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireUserPage, loadActiveWorkspace, resolveScope } from '@/server/scope';
import { BudgetScreen } from '@/components/budgets/budget-screen';
import { parseMonthParam } from '@/components/dashboard/month-nav';

export const metadata: Metadata = { title: 'Shared budget' };

export default async function SharedBudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const user = await requireUserPage('/shared/budget');
  const workspace = await loadActiveWorkspace(user.id);
  if (!workspace) redirect('/shared');

  const params = await searchParams;
  const scope = await resolveScope(user, workspace.id);

  return (
    <BudgetScreen
      scope={scope}
      userId={user.id}
      monthKey={parseMonthParam(params)}
      basePath="/shared/budget"
    />
  );
}
