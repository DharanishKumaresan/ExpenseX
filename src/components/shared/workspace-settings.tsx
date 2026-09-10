'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { ConfirmDialog } from '@/components/ui/modal';
import { Avatar, Badge, ErrorNote } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { deleteWorkspace, leaveWorkspace, removeMember, updateWorkspaceSettings } from '@/server/actions/workspace';
import { CURRENCIES, CURRENCY_CODES } from '@/lib/money';
import type { WorkspaceContext } from '@/server/scope';

/**
 * Shared space settings.
 *
 * Roles are enforced on the server; the UI simply does not offer what the
 * current member is not allowed to do. Both destructive paths — removing the
 * other person and deleting the space — spell out the consequence first.
 */
export function WorkspaceSettings({ workspace }: { workspace: WorkspaceContext }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'remove' | 'leave' | 'delete' | null>(null);

  const isOwner = workspace.role === 'OWNER';

  const saveDetails = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set('workspaceId', workspace.id);
    setFormError(null);

    startTransition(async () => {
      const result = await updateWorkspaceSettings(formData);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      toast({ title: 'Space updated', tone: 'success' });
      router.refresh();
    });
  };

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, success: string, redirectTo?: string) => {
    startTransition(async () => {
      const result = await action();
      setConfirm(null);

      if (!result.ok) {
        toast({ title: 'Could not complete', description: result.error, tone: 'error' });
        return;
      }
      toast({ title: success, tone: 'success' });
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <span className="ex-label ex-label-lg">Space details</span>
          <span aria-hidden="true" className="h-px flex-1 bg-line" />
        </div>

        <form onSubmit={saveDetails} className="flex max-w-xl flex-col gap-4">
          {formError ? <ErrorNote title="Could not save" message={formError} /> : null}

          <Field label="Name" htmlFor="ws-settings-name" required>
            <Input
              id="ws-settings-name"
              name="name"
              defaultValue={workspace.name}
              maxLength={50}
              required
            />
          </Field>

          <Field label="Description" htmlFor="ws-settings-description">
            <Textarea
              id="ws-settings-description"
              name="description"
              defaultValue={workspace.description ?? ''}
              maxLength={160}
            />
          </Field>

          <Field
            label="Currency"
            htmlFor="ws-settings-currency"
            hint="Existing amounts are not converted — they are re-displayed in the new currency."
          >
            <Select id="ws-settings-currency" name="currency" defaultValue={workspace.currency}>
              {CURRENCY_CODES.map((code) => (
                <option key={code} value={code}>
                  {CURRENCIES[code].label} ({CURRENCIES[code].symbol})
                </option>
              ))}
            </Select>
          </Field>

          <div className="pt-1">
            <Button type="submit" loading={pending}>
              Save changes
            </Button>
          </div>
        </form>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="ex-label ex-label-lg">Members</span>
          <span aria-hidden="true" className="h-px flex-1 bg-line" />
          <span className="ex-label">
            {workspace.members.length} of {workspace.memberLimit}
          </span>
        </div>

        <ul className="flex flex-col">
          {workspace.members.map((member) => (
            <li
              key={member.userId}
              className="flex flex-wrap items-center gap-3 border-b border-line-faint py-3.5 last:border-0"
            >
              <Avatar name={member.name} size="md" tone={member.isSelf ? 'forest' : 'outline'} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.9375rem] font-semibold text-ink">
                  {member.name}
                  {member.isSelf ? <span className="text-ink-3"> (you)</span> : null}
                </p>
                <p className="mt-0.5 truncate text-[0.75rem] text-ink-3">{member.email}</p>
              </div>
              <Badge tone={member.role === 'OWNER' ? 'forest' : 'outline'}>{member.role}</Badge>

              {isOwner && !member.isSelf ? (
                <button
                  type="button"
                  onClick={() => setConfirm('remove')}
                  className="h-9 rounded-[7px] border border-line px-3 font-mono text-[0.625rem] tracking-[0.12em] uppercase text-ink-3 transition-colors hover:border-coral hover:text-coral"
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="ex-label ex-label-lg text-coral">Danger zone</span>
          <span aria-hidden="true" className="h-px flex-1 bg-line" />
        </div>

        <div className="flex flex-col gap-3 rounded-[12px] border border-coral/40 px-4 py-4 sm:px-5">
          {isOwner ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.9375rem] font-semibold text-ink">Delete this shared space</p>
                  <p className="mt-1 max-w-[52ch] text-[0.8125rem] leading-snug text-ink-3">
                    Removes every shared transaction, budget, goal and activity entry for both
                    people. Personal finances are untouched.
                  </p>
                </div>
                <Button variant="coral" onClick={() => setConfirm('delete')} disabled={pending}>
                  Delete space
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.9375rem] font-semibold text-ink">Leave this shared space</p>
                <p className="mt-1 max-w-[52ch] text-[0.8125rem] leading-snug text-ink-3">
                  You lose access to everything in it. The history you contributed stays with the
                  space.
                </p>
              </div>
              <Button variant="coral" onClick={() => setConfirm('leave')} disabled={pending}>
                Leave space
              </Button>
            </div>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={confirm === 'remove'}
        onClose={() => setConfirm(null)}
        pending={pending}
        title={`Remove ${workspace.partner?.name ?? 'this person'}?`}
        message="They lose access to this shared space immediately. Everything they added stays, and you can invite someone again afterwards."
        confirmLabel="Remove"
        onConfirm={() => {
          const formData = new FormData();
          formData.set('workspaceId', workspace.id);
          formData.set('memberUserId', workspace.partner?.userId ?? '');
          run(() => removeMember(formData), 'Member removed');
        }}
      />

      <ConfirmDialog
        open={confirm === 'leave'}
        onClose={() => setConfirm(null)}
        pending={pending}
        title={`Leave ${workspace.name}?`}
        message="You will no longer see any of this space's transactions, budgets or goals. Only the owner can invite you back."
        confirmLabel="Leave"
        onConfirm={() => run(() => leaveWorkspace(workspace.id), 'You left the space', '/overview')}
      />

      <ConfirmDialog
        open={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        pending={pending}
        title={`Delete ${workspace.name}?`}
        message="Every shared transaction, budget, goal, contribution and activity entry is permanently deleted for both of you. This cannot be undone."
        confirmLabel="Delete forever"
        onConfirm={() => run(() => deleteWorkspace(workspace.id), 'Shared space deleted', '/overview')}
      />
    </div>
  );
}
