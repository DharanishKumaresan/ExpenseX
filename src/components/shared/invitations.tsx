'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Avatar, Badge, ErrorNote } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { inviteToWorkspace, respondToInvitation, revokeInvitation } from '@/server/actions/workspace';
import { formatDate } from '@/lib/date';
import type { PendingInvitation } from '@/server/queries/collaboration';

/**
 * Invitation flows.
 *
 * Sending an invite grants nothing: the recipient must accept while signed in
 * as the address it was sent to. Until then the invitation shows as PENDING on
 * both sides.
 */

export function IncomingInvitation({ invitation }: { invitation: PendingInvitation }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const respond = (accept: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await respondToInvitation({ invitationId: invitation.id, accept });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast({
        title: accept ? 'You joined the shared space' : 'Invitation declined',
        description: invitation.workspace.name,
        tone: 'success',
      });
      router.refresh();
    });
  };

  return (
    <section className="flex flex-col gap-5 rounded-[14px] bg-forest px-5 py-6 text-on-forest sm:px-7">
      <div className="flex items-center gap-3">
        <Avatar name={invitation.invitedBy.name} size="md" tone="outline" className="border-on-forest/30 text-on-forest" />
        <div className="min-w-0">
          <p className="ex-label text-on-forest-muted">Invitation</p>
          <p className="mt-1 text-[0.9375rem] font-semibold">
            {invitation.invitedBy.name} invited you
          </p>
        </div>
      </div>

      <div>
        <p className="text-[1.5rem] leading-tight font-bold tracking-[-0.02em] sm:text-[1.875rem]">
          {invitation.workspace.name}
        </p>
        {invitation.workspace.description ? (
          <p className="mt-2 max-w-[46ch] text-[0.9375rem] leading-relaxed text-on-forest-muted">
            {invitation.workspace.description}
          </p>
        ) : null}
        <p className="mt-3 font-mono text-[0.625rem] tracking-[0.12em] uppercase text-on-forest-muted">
          Expires {formatDate(invitation.expiresAt)}
        </p>
      </div>

      {error ? (
        <div className="rounded-[8px] bg-on-forest/10 px-3.5 py-3">
          <p className="text-[0.8125rem] text-on-forest">{error}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => respond(true)}
          className="inline-flex h-11 items-center rounded-[8px] bg-on-forest px-5 font-mono text-[0.6875rem] tracking-[0.14em] uppercase text-forest transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? 'Working…' : 'Accept and join'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => respond(false)}
          className="inline-flex h-11 items-center rounded-[8px] border border-on-forest/30 px-5 font-mono text-[0.6875rem] tracking-[0.14em] uppercase text-on-forest transition-colors hover:bg-on-forest/10 disabled:opacity-60"
        >
          Decline
        </button>
      </div>
    </section>
  );
}

export function InviteForm({
  workspaceId,
  disabled,
  disabledReason,
}: {
  workspaceId: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set('workspaceId', workspaceId);
    setError(null);
    setFieldErrors({});
    setInviteUrl(null);

    startTransition(async () => {
      const result = await inviteToWorkspace(formData);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      form.reset();
      setInviteUrl(result.data.inviteUrl);
      toast({
        title: 'Invitation sent',
        description: result.data.recipientHasAccount
          ? 'They will see it the next time they open ExpenseX.'
          : 'Share the link with them so they can sign up and join.',
        tone: 'success',
      });
      router.refresh();
    });
  };

  if (disabled) {
    return (
      <div className="rounded-[10px] border border-line bg-surface-2 px-4 py-3.5">
        <p className="text-[0.875rem] text-ink-3">{disabledReason}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? <ErrorNote title="Could not invite" message={error} /> : null}

      <Field
        label="Invite by email"
        htmlFor="invite-email"
        error={fieldErrors.email}
        hint="They must accept before they can see anything in this space."
      >
        <div className="flex gap-2">
          <Input
            id="invite-email"
            name="email"
            type="email"
            required
            maxLength={254}
            placeholder="partner@example.com"
            autoComplete="off"
            aria-invalid={Boolean(fieldErrors.email)}
          />
          <Button type="submit" loading={pending} className="shrink-0">
            Invite
          </Button>
        </div>
      </Field>

      {inviteUrl ? (
        <div className="rounded-[10px] border border-line bg-surface-3 px-4 py-3.5">
          <p className="ex-label mb-2">Invitation link</p>
          <p className="mb-2 text-[0.8125rem] leading-snug text-ink-2">
            No email is sent in this build. Copy this link to the person you invited — it only works
            for the address you entered.
          </p>
          <code className="block overflow-x-auto rounded-[6px] bg-surface px-3 py-2 font-mono text-[0.75rem] text-ink">
            {typeof window !== 'undefined' ? `${window.location.origin}${inviteUrl}` : inviteUrl}
          </code>
        </div>
      ) : null}
    </form>
  );
}

export function SentInvitationList({ invitations }: { invitations: PendingInvitation[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  if (invitations.length === 0) return null;

  const revoke = (id: string) => {
    startTransition(async () => {
      const result = await revokeInvitation(id);
      if (!result.ok) {
        toast({ title: 'Could not revoke', description: result.error, tone: 'error' });
        return;
      }
      toast({ title: 'Invitation revoked', tone: 'success' });
      router.refresh();
    });
  };

  const tone = (status: PendingInvitation['status']) =>
    status === 'PENDING' ? 'accent' : status === 'DECLINED' ? 'coral' : 'outline';

  return (
    <ul className="flex flex-col">
      {invitations.map((invitation) => (
        <li
          key={invitation.id}
          className="flex flex-wrap items-center gap-3 border-b border-line-faint py-3 last:border-0"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.875rem] font-medium text-ink">{invitation.email}</span>
            <span className="ex-label mt-1 block">
              Sent {formatDate(invitation.createdAt)}
            </span>
          </span>
          <Badge tone={tone(invitation.status)}>{invitation.status}</Badge>
          {invitation.status === 'PENDING' ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => revoke(invitation.id)}
              className="h-9 rounded-[7px] border border-line px-3 font-mono text-[0.625rem] tracking-[0.12em] uppercase text-ink-3 transition-colors hover:border-coral hover:text-coral disabled:opacity-60"
            >
              Revoke
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
