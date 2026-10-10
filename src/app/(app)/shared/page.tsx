import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUserPage, loadActiveWorkspace, resolveScope } from '@/server/scope';
import { loadIncomingInvitations, listActivity } from '@/server/queries/collaboration';
import { loadOverview } from '@/server/queries/overview';
import { buildFormOptions } from '@/components/transactions/quick-add-server';
import { CreateSpaceButton } from '@/components/shared/create-space';
import { IncomingInvitation } from '@/components/shared/invitations';
import { ActivityFeed } from '@/components/shared/activity-feed';
import { SpendingRadial, RadialLegend } from '@/components/charts/spending-radial';
import { TransactionList } from '@/components/transactions/transaction-list';
import { MonthNav, parseMonthParam } from '@/components/dashboard/month-nav';
import {
  BudgetStrip,
  GoalStrip,
  InsightRail,
  OverviewHero,
  SectionShell,
} from '@/components/dashboard/blocks';
import { Avatar, AvatarPair, EmptyState, RuleLabel } from '@/components/ui/primitives';
import { Money } from '@/components/ui/money-display';
import { HatchCurve } from '@/components/brand';
import { spendByMember } from '@/lib/analytics';
import { monthLabel } from '@/lib/date';
import { firstName } from '@/lib/utils';

export const metadata: Metadata = { title: 'Our Finances' };

/**
 * The shared workspace dashboard.
 *
 * Handles three states: no space yet, an invitation waiting to be answered,
 * and an active shared space. The active view mirrors the personal dashboard
 * so the two feel like one product, with the collaboration facts — who paid,
 * who contributed, what changed — layered on top.
 */
export default async function SharedPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const user = await requireUserPage('/shared');
  const params = await searchParams;

  const [workspace, invitations] = await Promise.all([
    loadActiveWorkspace(user.id),
    loadIncomingInvitations(user.email),
  ]);

  /* --- No shared space yet ------------------------------------------------ */
  if (!workspace) {
    return (
      <div className="flex flex-col gap-8">
        <header>
          <h1 className="text-[1.75rem] leading-[1.02] font-semibold tracking-[-0.03em] sm:text-[2.25rem]">
            <span className="block font-normal text-ink-faint">Shared</span>
            <span className="block font-bold text-ink">Finances</span>
          </h1>
        </header>

        {invitations.map((invitation) => (
          <IncomingInvitation key={invitation.id} invitation={invitation} />
        ))}

        <section className="relative overflow-hidden rounded-[16px] bg-forest px-6 py-10 text-on-forest sm:px-10 sm:py-14">
          <div className="absolute inset-x-0 bottom-0 h-32 opacity-60">
            <HatchCurve onDark direction="rise" />
          </div>

          <div className="relative flex max-w-[52ch] flex-col gap-5">
            <p className="ex-label text-on-forest-muted">Two people, one budget</p>
            <h2 className="text-[2rem] leading-[1.05] font-bold tracking-[-0.03em] uppercase sm:text-[2.75rem]">
              Build something together.
            </h2>
            <p className="text-[0.9375rem] leading-relaxed text-on-forest-muted">
              Create a shared financial space and invite one other person. You both add expenses,
              set the budget, and save towards the same goals — while your own finances stay
              completely private.
            </p>

            <ul className="mt-2 flex flex-col gap-2.5">
              {[
                'A separate ledger, budget and set of goals',
                'Every expense records who paid, not just who entered it',
                'An activity feed of every change either of you makes',
              ].map((line) => (
                <li key={line} className="flex items-start gap-2.5">
                  <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-on-forest-muted" />
                  <span className="text-[0.875rem] leading-snug text-on-forest">{line}</span>
                </li>
              ))}
            </ul>

            <div className="mt-3">
              <CreateSpaceButton variant="onForest" />
            </div>
          </div>
        </section>
      </div>
    );
  }

  /* --- Active shared space ------------------------------------------------ */
  const monthKey = parseMonthParam(params);
  const scope = await resolveScope(user, workspace.id);

  const [data, formOptions, activity] = await Promise.all([
    loadOverview(scope, monthKey),
    buildFormOptions(scope, user.id),
    listActivity(workspace.id, 5),
  ]);

  const members = workspace.members.map((member) => ({ userId: member.userId, name: member.name }));
  const paidByMember = spendByMember(data.monthTransactions, members).filter(
    (entry) => entry.spentMinor > 0,
  );

  return (
    <div className="flex flex-col gap-10 lg:gap-14">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          <AvatarPair names={workspace.members.map((member) => member.name)} size="md" />
          <div className="min-w-0">
            <p className="ex-label">Shared with</p>
            <p className="mt-1 truncate text-[0.9375rem] font-semibold text-ink">
              {workspace.partner
                ? `You and ${firstName(workspace.partner.name)}`
                : 'You — nobody has joined yet'}
            </p>
          </div>
        </div>

        <Link
          href="/shared/settings"
          className="-mr-2 inline-flex h-10 shrink-0 items-center rounded-[7px] px-2 font-mono text-[0.6875rem] tracking-[0.14em] uppercase text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          Space settings
        </Link>
      </header>

      {!workspace.partner ? (
        <section className="flex flex-col gap-3 rounded-[12px] bg-accent px-5 py-5 text-on-accent sm:px-6">
          <p className="ex-label text-on-accent/70">Waiting on one more person</p>
          <p className="max-w-[44ch] text-[1.125rem] leading-tight font-bold tracking-[-0.02em]">
            This space is ready. Invite the person you are budgeting with.
          </p>
          <Link
            href="/shared/settings"
            className="mt-1 inline-flex h-11 w-fit items-center rounded-[8px] bg-on-accent px-5 font-mono text-[0.6875rem] tracking-[0.14em] uppercase text-accent transition-opacity hover:opacity-90"
          >
            Send an invitation
          </Link>
        </section>
      ) : null}

      <OverviewHero
        monthKey={monthKey}
        cash={data.current}
        currency={data.currency}
        budget={data.budget}
        label="Our money"
        action={<MonthNav monthKey={monthKey} basePath="/shared" />}
      />

      {paidByMember.length > 0 ? (
        <section className="flex flex-col gap-4">
          <RuleLabel>Who paid this month</RuleLabel>
          <ul className="grid gap-3 sm:grid-cols-2">
            {paidByMember.map((entry) => (
              <li
                key={entry.userId}
                className="flex items-center gap-3 rounded-[10px] bg-surface-2 px-4 py-3.5"
              >
                <Avatar name={entry.name} size="sm" tone={entry.userId === user.id ? 'forest' : 'outline'} />
                <span className="min-w-0 flex-1 truncate text-[0.875rem] font-semibold text-ink">
                  {entry.userId === user.id ? 'You' : firstName(entry.name)}
                </span>
                <Money minor={entry.spentMinor} currency={data.currency} size="sm" hideFraction className="text-ink" />
              </li>
            ))}
          </ul>
          <p className="text-[0.75rem] text-ink-3">
            Totals of what each of you actually paid out this month.
          </p>
        </section>
      ) : null}

      <section className="grid gap-8 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-7">
          <SectionShell over="Where it went" title={monthLabel(monthKey)}>
            <div className="flex justify-center py-2">
              <SpendingRadial
                slices={data.radial}
                totalMinor={data.current.expenseMinor}
                currency={data.currency}
                caption="Spent together"
                size={440}
              />
            </div>
          </SectionShell>
        </div>

        <div className="flex flex-col gap-8 lg:col-span-5">
          {data.radial.length > 0 ? (
            <div className="flex flex-col gap-3">
              <RuleLabel>By category</RuleLabel>
              <RadialLegend slices={data.radial} currency={data.currency} limit={7} />
            </div>
          ) : null}
          <InsightRail insights={data.insights} />
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-7">
          <SectionShell
            over="Recent"
            title="Shared transactions"
            action={
              <Link
                href="/shared/transactions"
                className="font-mono text-[0.6875rem] tracking-[0.14em] uppercase text-ink-3 transition-colors hover:text-ink"
              >
                Show more
              </Link>
            }
          >
            <TransactionList
              transactions={data.recent}
              currency={data.currency}
              workspaceId={workspace.id}
              shared
              currentUserId={user.id}
              options={formOptions}
              groupByDay={false}
              emptyHeadline="Nothing shared yet."
              emptyBody="Add the first shared expense — rent, groceries, a dinner — and it appears for both of you."
            />
          </SectionShell>
        </div>

        <div className="flex flex-col gap-10 lg:col-span-5">
          <SectionShell
            over="This month"
            title="Shared budget"
            action={
              <Link
                href="/shared/budget"
                className="font-mono text-[0.6875rem] tracking-[0.14em] uppercase text-ink-3 transition-colors hover:text-ink"
              >
                Manage
              </Link>
            }
          >
            <BudgetStrip
              budget={data.budget}
              currency={data.currency}
              href="/shared/budget"
              monthKey={monthKey}
            />
          </SectionShell>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-7">
          <SectionShell
            over="Save for something"
            title="Shared goals"
            action={
              <Link
                href="/shared/goals"
                className="font-mono text-[0.6875rem] tracking-[0.14em] uppercase text-ink-3 transition-colors hover:text-ink"
              >
                All goals
              </Link>
            }
          >
            <GoalStrip goals={data.goals} currency={data.currency} href="/shared/goals" />
          </SectionShell>
        </div>

        <div className="lg:col-span-5">
          <SectionShell
            over="Lately"
            title="Activity"
            action={
              <Link
                href="/shared/activity"
                className="font-mono text-[0.6875rem] tracking-[0.14em] uppercase text-ink-3 transition-colors hover:text-ink"
              >
                Full feed
              </Link>
            }
          >
            <ActivityFeed
              entries={activity.rows}
              currency={data.currency}
              currentUserId={user.id}
              compact
            />
          </SectionShell>
        </div>
      </section>
    </div>
  );
}
