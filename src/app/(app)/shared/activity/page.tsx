import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUserPage, loadActiveWorkspace } from '@/server/scope';
import { listActivity } from '@/server/queries/collaboration';
import { ActivityFeed } from '@/components/shared/activity-feed';
import { AvatarPair } from '@/components/ui/primitives';
import { firstName } from '@/lib/utils';

export const metadata: Metadata = { title: 'Activity' };

const PAGE_SIZE = 40;

export default async function SharedActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const user = await requireUserPage('/shared/activity');
  const workspace = await loadActiveWorkspace(user.id);
  if (!workspace) redirect('/shared');

  const { cursor } = await searchParams;
  const activity = await listActivity(workspace.id, PAGE_SIZE, cursor);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[1.75rem] leading-[1.02] font-semibold tracking-[-0.03em] sm:text-[2.25rem]">
          <span className="block font-normal text-ink-faint">Everything that</span>
          <span className="block font-bold text-ink">Happened here</span>
        </h1>

        <div className="flex items-center gap-2.5">
          <AvatarPair names={workspace.members.map((member) => member.name)} size="sm" />
          <span className="ex-label">
            {workspace.partner ? `You and ${firstName(workspace.partner.name)}` : 'Just you'}
          </span>
        </div>
      </header>

      <ActivityFeed entries={activity.rows} currency={workspace.currency} currentUserId={user.id} />

      {activity.nextCursor ? (
        <Link
          href={`/shared/activity?cursor=${activity.nextCursor}`}
          className="mx-auto inline-flex h-11 items-center rounded-[8px] border border-line-strong px-6 font-mono text-[0.6875rem] tracking-[0.14em] uppercase text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          Load older activity
        </Link>
      ) : null}

      {cursor ? (
        <Link
          href="/shared/activity"
          className="mx-auto font-mono text-[0.625rem] tracking-[0.12em] uppercase text-ink-3 transition-colors hover:text-ink"
        >
          Back to latest
        </Link>
      ) : null}
    </div>
  );
}
