import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/session';

/** The product has no marketing surface; route by session. */
export default async function RootPage() {
  const user = await getCurrentUser();
  redirect(user ? '/overview' : '/login');
}
