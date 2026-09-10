import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireUserPage, loadActiveWorkspace } from '@/server/scope';
import { loadWorkspaceInvitations } from '@/server/queries/collaboration';
import { WorkspaceSettings } from '@/components/shared/workspace-settings';
import { InviteForm, SentInvitationList } from '@/components/shared/invitations';

export const metadata: Metadata = { title: 'Shared settings' };

export default async function SharedSettingsPage() {
  const user = await requireUserPage('/shared/settings');
  const workspace = await loadActiveWorkspace(user.id);
  if (!workspace) redirect('/shared');

  const invitations = await loadWorkspaceInvitations(workspace.id);
  const isOwner = workspace.role === 'OWNER';
  const isFull = workspace.members.length >= workspace.memberLimit;

  return (
    <div className="flex flex-col gap-10">
      <header>
        <h1 className="text-[1.75rem] leading-[1.02] font-semibold tracking-[-0.03em] sm:text-[2.25rem]">
          <span className="block font-normal text-ink-faint">{workspace.name}</span>
          <span className="block font-bold text-ink">Settings</span>
        </h1>
      </header>

      {isOwner ? (
        <section className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <span className="ex-label ex-label-lg">Invite</span>
            <span aria-hidden="true" className="h-px flex-1 bg-line" />
          </div>

          <div className="max-w-xl">
            <InviteForm
              workspaceId={workspace.id}
              disabled={isFull}
              disabledReason={`This space is designed for ${workspace.memberLimit} people and both seats are taken. Remove the other member first if you need to invite someone else.`}
            />
          </div>

          {invitations.length > 0 ? (
            <div className="max-w-xl">
              <p className="ex-label mb-2">Sent invitations</p>
              <SentInvitationList invitations={invitations} />
            </div>
          ) : null}
        </section>
      ) : null}

      <WorkspaceSettings workspace={workspace} />
    </div>
  );
}
