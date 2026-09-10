import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/session';
import { findInvitationByToken } from '@/server/queries/collaboration';
import { IncomingInvitation } from '@/components/shared/invitations';
import { Wordmark } from '@/components/brand';
import { ErrorNote } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Invitation' };

/**
 * Invitation link.
 *
 * The token identifies the invitation, but it does not grant access on its
 * own: the visitor must be signed in as the address it was sent to. Anyone
 * else holding the link sees a refusal, not the workspace.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  }

  const invitation = await findInvitationByToken(token);

  const problem = (() => {
    if (!invitation) return 'This invitation link is not valid.';
    if (invitation.email !== user.email.toLowerCase()) {
      return `This invitation was sent to a different email address. Sign in as ${invitation.email} to accept it.`;
    }
    if (invitation.status === 'ACCEPTED') return 'This invitation has already been accepted.';
    if (invitation.status === 'DECLINED') return 'This invitation was declined.';
    if (invitation.status === 'REVOKED') return 'This invitation was withdrawn.';
    if (invitation.status === 'EXPIRED' || invitation.expiresAt.getTime() <= Date.now()) {
      return 'This invitation has expired. Ask for a new one.';
    }
    return null;
  })();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-5 py-12">
      <div className="w-full max-w-lg">
        <Link href="/overview" className="mb-8 inline-flex">
          <Wordmark size="md" />
        </Link>

        {problem ? (
          <div className="flex flex-col gap-5">
            <ErrorNote title="Cannot open this invitation" message={problem} />
            <Link
              href="/shared"
              className="inline-flex h-11 w-fit items-center rounded-[8px] bg-forest px-5 font-mono text-[0.6875rem] tracking-[0.14em] uppercase text-on-forest transition-colors hover:bg-forest-2"
            >
              Go to shared finances
            </Link>
          </div>
        ) : invitation ? (
          <IncomingInvitation invitation={invitation} />
        ) : null}
      </div>
    </main>
  );
}
