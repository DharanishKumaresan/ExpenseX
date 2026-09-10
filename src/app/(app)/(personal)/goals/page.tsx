import type { Metadata } from 'next';
import { requireUserPage, resolveScope } from '@/server/scope';
import { GoalsScreen } from '@/components/goals/goals-screen';

export const metadata: Metadata = { title: 'Goals' };

export default async function GoalsPage() {
  const user = await requireUserPage('/goals');
  const scope = await resolveScope(user, null);
  return <GoalsScreen scope={scope} userId={user.id} />;
}
