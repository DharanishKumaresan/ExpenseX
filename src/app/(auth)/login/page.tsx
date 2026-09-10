import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth/auth-form';
import { redirectIfSignedIn } from '@/server/actions/auth';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  await redirectIfSignedIn();
  const { next } = await searchParams;
  return <AuthForm mode="signin" next={next} />;
}
