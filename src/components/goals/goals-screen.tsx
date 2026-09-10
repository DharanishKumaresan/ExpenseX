import { GoalCard } from './goal-card';
import { CreateGoalButton } from './goal-form';
import { toGoalView } from './types';
import { listGoals } from '@/server/queries/planning';
import type { Scope } from '@/server/scope';
import { EmptyState, RuleLabel } from '@/components/ui/primitives';
import { StatBlock } from '@/components/ui/money-display';
import { sumMinor } from '@/lib/money';

/**
 * Goals screen, shared by /goals and /shared/goals.
 *
 * Cards alternate tone so the stack reads as the reference's colour-block
 * rhythm rather than a uniform grid.
 */
export async function GoalsScreen({ scope, userId }: { scope: Scope; userId: string }) {
  const rows = await listGoals(scope);
  const goals = rows.map((row) => toGoalView(row));

  const shared = scope.kind === 'shared';
  const members = shared
    ? scope.workspace.members.map((member) => ({
        userId: member.userId,
        name: member.name,
        isSelf: member.isSelf,
      }))
    : [];

  const totalTarget = sumMinor(goals.map((goal) => goal.targetMinor));
  const totalSaved = sumMinor(goals.map((goal) => goal.currentMinor));

  const tones: ('accent' | 'forest' | 'surface')[] = ['accent', 'forest', 'surface'];

  return (
    <div className="flex flex-col gap-9">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[1.75rem] leading-[1.02] font-semibold tracking-[-0.03em] sm:text-[2.25rem]">
          <span className="block font-normal text-ink-faint">Create and track</span>
          <span className="block font-bold text-ink">{shared ? 'Our goals' : 'Your goals'}</span>
        </h1>

        {goals.length > 0 ? (
          <CreateGoalButton currency={scope.currency} workspaceId={scope.workspaceId} shared={shared} />
        ) : null}
      </header>

      {goals.length === 0 ? (
        <EmptyState
          headline={shared ? 'Save for something together.' : 'Give yourself something worth saving for.'}
          body={
            shared
              ? 'Create a shared goal, and both of you can contribute towards it. Every contribution is recorded against whoever put the money in.'
              : 'A goal turns leftover money into progress you can see. Set a target and start adding to it.'
          }
          tone="accent"
          action={
            <CreateGoalButton
              currency={scope.currency}
              workspaceId={scope.workspaceId}
              shared={shared}
              variant="onAccent"
              label={shared ? 'Create shared goal' : 'Create goal'}
            />
          }
        />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-6 border-y border-line py-6 sm:grid-cols-3">
            <StatBlock label="Total saved" minor={totalSaved} currency={scope.currency} size="lg" hideFraction />
            <StatBlock label="Across targets" minor={totalTarget} currency={scope.currency} size="lg" hideFraction tone="muted" />
            <div className="col-span-2 sm:col-span-1">
              <p className="ex-label">Active goals</p>
              <p className="ex-numeral mt-2 text-[1.5rem] text-ink">{goals.length}</p>
            </div>
          </section>

          <RuleLabel>Progress</RuleLabel>

          <div className="flex flex-col gap-4">
            {goals.map((goal, index) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                currency={scope.currency}
                workspaceId={scope.workspaceId}
                shared={shared}
                currentUserId={userId}
                members={members}
                tone={
                  goal.theme === 'yellow'
                    ? 'accent'
                    : goal.theme === 'forest'
                      ? 'forest'
                      : goal.theme === 'sage'
                        ? 'surface'
                        : (tones[index % tones.length] ?? 'surface')
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
