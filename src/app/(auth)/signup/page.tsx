import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth/auth-form';
import { redirectIfSignedIn } from '@/server/actions/auth';

export const metadata: Metadata = { title: 'Create account' };

export default async function SignUpPage() {
  await redirectIfSignedIn();
  return <AuthForm mode="signup" />;
}
