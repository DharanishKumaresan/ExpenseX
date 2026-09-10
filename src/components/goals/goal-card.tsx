'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Money } from '@/components/ui/money-display';
import { Avatar, Badge, HatchField } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { deleteGoal } from '@/server/actions/goals';
import { ContributeForm } from './contribute-form';
import { GoalForm } from './goal-form';
import { formatMoney, formatPercent } from '@/lib/money';
import { formatDate, formatDayLabel } from '@/lib/date';
import { cn, firstName, pluralise } from '@/lib/utils';
import type { GoalView } from './types';

/**
 * Goal block.
 *
 * A full-bleed colour slab in the reference language: SAVED and GOAL as
 * label/figure pairs, a solid progress bar over hatched texture, and the
 * derived numbers (days left, projected completion, who contributed what)
 * underneath.
 */
export function GoalCard({
  goal,
  currency,
  workspaceId,
  shared,
  currentUserId,
  members,
  tone,
}: {
  goal: GoalView;
  currency: string;
  workspaceId: string | null;
  shared: boolean;
  currentUserId: string;
  members: { userId: string; name: string; isSelf: boolean }[];
  tone: 'accent' | 'forest' | 'surface';
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [contributeOpen, setContributeOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const palette = {
    accent: {
      block: 'bg-accent text-on-accent',
      label: 'text-on-accent/70',
      fraction: 'text-on-accent/55',
      track: 'bg-on-accent/20',
      fill: 'bg-on-accent',
      border: 'border-on-accent/20',
      button: 'bg-on-accent text-accent',
      ghost: 'border border-on-accent/30 text-on-accent',
    },
    forest: {
      block: 'bg-forest text-on-forest',
      label: 'text-on-forest-muted',
      fraction: 'text-on-forest-muted',
      track: 'bg-on-forest/20',
      fill: 'bg-on-forest',
      border: 'border-on-forest/20',
      button: 'bg-on-forest text-forest',
      ghost: 'border border-on-forest/30 text-on-forest',
    },
    surface: {
      block: 'bg-surface-2 text-ink',
      label: 'text-ink-3',
      fraction: 'text-ink-faint',
      track: 'bg-surface-3',
      fill: 'bg-forest',
      border: 'border-line',
      button: 'bg-forest text-on-forest',
      ghost: 'border border-line-strong text-ink',
    },
  }[tone];

  const remove = () => {
    startTransition(async () => {
      const result = await deleteGoal({ id: goal.id, workspaceId: workspaceId ?? undefined });
      setConfirmOpen(false);

      if (!result.ok) {
        toast({ title: 'Could not delete', description: result.error, tone: 'error' });
        return;
      }
      toast({ title: 'Goal deleted', description: goal.name, tone: 'success' });
      router.refresh();
    });
  };

  return (
    <>
      <article className={cn('flex flex-col gap-5 rounded-[14px] px-5 py-6 sm:px-7', palette.block)}>
        {/* No wrapping: a wide target (₹1,00,000.00) would otherwise drop the
            GOAL column below the name and break the two-figure pairing. */}
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={cn('ex-label', palette.label)}>Saved</p>
            <Money
              minor={goal.currentMinor}
              currency={currency}
              size="xl"
              className="mt-2 block"
              fractionClassName={palette.fraction}
            />
            <h3 className="mt-3 text-[1.25rem] leading-tight font-bold tracking-[-0.02em]">{goal.name}</h3>
          </div>

          <div className="shrink-0 text-right">
            <p className={cn('ex-label', palette.label)}>Goal</p>
            <Money
              minor={goal.targetMinor}
              currency={currency}
              size="sm"
              hideFraction
              className="mt-2 block"
              fractionClassName={palette.fraction}
            />
            <p className="ex-numeral mt-2 text-[1rem]">{formatPercent(goal.progress)}</p>
          </div>
        </header>

        <div className="flex items-center gap-3">
          <div
            className={cn('h-3 flex-1 overflow-hidden rounded-[2px]', palette.track)}
            role="progressbar"
            aria-valuenow={Math.round(goal.progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${goal.name}: ${formatPercent(goal.progress)} saved`}
          >
            <span
              className={cn('block h-full rounded-[2px] transition-[width] duration-700 ease-out', palette.fill)}
              style={{ width: `${goal.progress}%` }}
            />
          </div>
          <HatchField fill={1} onDark={tone !== 'surface'} className="h-5 w-20 shrink-0 opacity-50" />
        </div>

        <dl className={cn('grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-4', palette.border)}>
          <div>
            <dt className={cn('ex-label', palette.label)}>Remaining</dt>
            <dd className="ex-numeral mt-1.5 text-[0.9375rem]">
              {formatMoney(goal.remainingMinor, currency, { compactDecimals: true })}
            </dd>
          </div>

          <div>
            <dt className={cn('ex-label', palette.label)}>Deadline</dt>
            <dd className="mt-1.5 text-[0.8125rem] font-medium">
              {goal.deadline ? formatDate(new Date(goal.deadline)) : 'None set'}
            </dd>
          </div>

          <div>
            <dt className={cn('ex-label', palette.label)}>Days left</dt>
            <dd className="ex-numeral mt-1.5 text-[0.9375rem]">
              {goal.complete
                ? 'Reached'
                : goal.daysRemaining === null
                  ? '—'
                  : goal.daysRemaining < 0
                    ? `${Math.abs(goal.daysRemaining)} over`
                    : goal.daysRemaining}
            </dd>
          </div>

          <div>
            <dt className={cn('ex-label', palette.label)}>Est. completion</dt>
            <dd className="mt-1.5 text-[0.8125rem] font-medium">
              {goal.complete ? (
                'Done'
              ) : goal.estimatedCompletion ? (
                formatDate(new Date(goal.estimatedCompletion))
              ) : (
                // Never invented: the projection needs real contribution history.
                <span className={cn('font-mono text-[0.6875rem] tracking-[0.1em] uppercase', palette.label)}>
                  Not enough data
                </span>
              )}
            </dd>
          </div>
        </dl>

        {shared && goal.contributors.length > 0 ? (
          <div className={cn('flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-4', palette.border)}>
            <span className={cn('ex-label', palette.label)}>Contributors</span>
            {goal.contributors.map((contributor) => (
              <span key={contributor.userId} className="flex items-center gap-2">
                <Avatar
                  name={contributor.name}
                  size="xs"
                  tone={tone === 'surface' ? 'forest' : 'outline'}
                  className={tone !== 'surface' ? 'border-current/30' : undefined}
                />
                <span className="text-[0.8125rem] font-medium">
                  {contributor.userId === currentUserId ? 'You' : firstName(contributor.name)}
                </span>
                <span className={cn('ex-numeral text-[0.8125rem]', palette.label)}>
                  {formatMoney(contributor.amountMinor, currency, { compactDecimals: true })}
                </span>
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setContributeOpen(true)}
            className={cn(
              'inline-flex h-10 items-center rounded-[8px] px-4 font-mono text-[0.6875rem] tracking-[0.14em] uppercase transition-opacity hover:opacity-90',
              palette.button,
            )}
          >
            Add money
          </button>

          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className={cn(
              'inline-flex h-10 items-center rounded-[8px] px-4 font-mono text-[0.6875rem] tracking-[0.14em] uppercase transition-colors hover:bg-current/10',
              palette.ghost,
            )}
          >
            Edit
          </button>

          {goal.contributions.length > 0 ? (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              className={cn('ml-auto font-mono text-[0.625rem] tracking-[0.12em] uppercase', palette.label)}
            >
              {expanded ? 'Hide history' : `History (${goal.contributions.length})`}
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            aria-label={`Delete ${goal.name}`}
            className={cn(
              'inline-flex size-10 items-center justify-center rounded-[8px] transition-colors hover:bg-current/10',
              goal.contributions.length > 0 ? '' : 'ml-auto',
              palette.label,
            )}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.2h5.8l.6-8.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {expanded ? (
          <ul className={cn('flex flex-col border-t pt-2', palette.border)}>
            {goal.contributions.map((contribution) => (
              <li
                key={contribution.id}
                className={cn('flex items-center gap-3 border-b py-2.5 last:border-0', palette.border)}
              >
                <Avatar
                  name={contribution.userName}
                  size="xs"
                  tone={tone === 'surface' ? 'forest' : 'outline'}
                  className={tone !== 'surface' ? 'border-current/30' : undefined}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.8125rem] font-semibold">
                    {contribution.userId === currentUserId ? 'You' : firstName(contribution.userName)}
                  </span>
                  {contribution.note ? (
                    <span className={cn('block truncate text-[0.75rem]', palette.label)}>{contribution.note}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right">
                  <Money
                    minor={contribution.amountMinor}
                    currency={currency}
                    size="xs"
                    signed
                    hideFraction
                    fractionClassName={palette.fraction}
                  />
                  <span className={cn('mt-0.5 block font-mono text-[0.625rem]', palette.label)}>
                    {formatDayLabel(new Date(contribution.date))}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {goal.complete ? (
          <Badge tone={tone === 'accent' ? 'forest' : 'accent'} className="w-fit">
            Goal reached
          </Badge>
        ) : goal.overdue ? (
          <Badge tone="coral" className="w-fit">
            Past deadline
          </Badge>
        ) : null}
      </article>

      <ContributeForm
        open={contributeOpen}
        onClose={() => setContributeOpen(false)}
        goal={goal}
        currency={currency}
        workspaceId={workspaceId}
        shared={shared}
        members={members}
        currentUserId={currentUserId}
      />

      <GoalForm
        open={editOpen}
        onClose={() => setEditOpen(false)}
        goal={goal}
        currency={currency}
        workspaceId={workspaceId}
        shared={shared}
      />

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={remove}
        pending={pending}
        title={`Delete ${goal.name}?`}
        message={`The goal and its ${goal.contributions.length} ${pluralise(goal.contributions.length, 'contribution')} will be removed permanently. This cannot be undone.`}
      />
    </>
  );
}
