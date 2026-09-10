import type { Metadata } from 'next';
import { requireUserPage, resolveScope } from '@/server/scope';
import {
  TransactionsScreen,
  type TransactionsSearchParams,
} from '@/components/transactions/transactions-screen';

export const metadata: Metadata = { title: 'Transactions' };

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<TransactionsSearchParams>;
}) {
  const user = await requireUserPage('/transactions');
  const params = await searchParams;
  const scope = await resolveScope(user, null);

  return <TransactionsScreen scope={scope} userId={user.id} searchParams={params} />;
}
