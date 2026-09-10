import type { GoalRow } from '@/server/queries/planning';
import { goalProgress } from '@/lib/analytics';

/** Serialisable goal shape handed to the client, with the maths already done. */
export interface GoalView {
  id: string;
  name: string;
  targetMinor: number;
  currentMinor: number;
  remainingMinor: number;
  progress: number;
  complete: boolean;
  overdue: boolean;
  deadline: string | null;
  daysRemaining: number | null;
  estimatedCompletion: string | null;
  averageMonthlyMinor: number | null;
  theme: string | null;
  version: number;
  contributors: { userId: string; name: string; amountMinor: number }[];
  contributions: {
    id: string;
    userId: string;
    userName: string;
    amountMinor: number;
    date: string;
    note: string | null;
  }[];
}

export function toGoalView(row: GoalRow, now: Date = new Date()): GoalView {
  const progress = goalProgress(
    {
      targetAmountMinor: row.targetAmountMinor,
      currentAmountMinor: row.currentAmountMinor,
      deadline: row.deadline,
    },
    row.contributions.map((contribution) => ({
      userId: contribution.userId,
      amountMinor: contribution.amountMinor,
      date: contribution.date,
    })),
    now,
  );

  const nameById = new Map(row.contributions.map((entry) => [entry.userId, entry.user.name]));

  return {
    id: row.id,
    name: row.name,
    targetMinor: row.targetAmountMinor,
    currentMinor: row.currentAmountMinor,
    remainingMinor: progress.remainingMinor,
    progress: progress.progress,
    complete: progress.complete,
    overdue: progress.overdue,
    deadline: row.deadline?.toISOString() ?? null,
    daysRemaining: progress.daysRemaining,
    estimatedCompletion: progress.estimatedCompletion?.toISOString() ?? null,
    averageMonthlyMinor: progress.averageMonthlyMinor,
    theme: row.theme,
    version: row.version,
    contributors: progress.contributorTotals.map((entry) => ({
      userId: entry.userId,
      name: nameById.get(entry.userId) ?? 'Someone',
      amountMinor: entry.amountMinor,
    })),
    contributions: row.contributions.map((contribution) => ({
      id: contribution.id,
      userId: contribution.userId,
      userName: contribution.user.name,
      amountMinor: contribution.amountMinor,
      date: contribution.date.toISOString(),
      note: contribution.note,
    })),
  };
}
