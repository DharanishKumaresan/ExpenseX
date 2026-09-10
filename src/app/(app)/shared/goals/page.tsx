import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireUserPage, loadActiveWorkspace, resolveScope } from '@/server/scope';
import { GoalsScreen } from '@/components/goals/goals-screen';

export const metadata: Metadata = { title: 'Shared goals' };

export default async function SharedGoalsPage() {
  const user = await requireUserPage('/shared/goals');
  const workspace = await loadActiveWorkspace(user.id);
  if (!workspace) redirect('/shared');

  const scope = await resolveScope(user, workspace.id);
  return <GoalsScreen scope={scope} userId={user.id} />;
}
