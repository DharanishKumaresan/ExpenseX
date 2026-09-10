import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireUserPage, loadActiveWorkspace, resolveScope } from '@/server/scope';
import {
  TransactionsScreen,
  type TransactionsSearchParams,
} from '@/components/transactions/transactions-screen';

export const metadata: Metadata = { title: 'Shared transactions' };

export default async function SharedTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<TransactionsSearchParams>;
}) {
  const user = await requireUserPage('/shared/transactions');
  const workspace = await loadActiveWorkspace(user.id);
  // Without a shared space there is nothing here; send them to set one up.
  if (!workspace) redirect('/shared');

  const params = await searchParams;
  const scope = await resolveScope(user, workspace.id);

  return <TransactionsScreen scope={scope} userId={user.id} searchParams={params} />;
}
