import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from '../db';
import type { Scope } from '../scope';
import type { MonthKey } from '@/lib/date';

/**
 * Budgets, goals and recurring commitments — the "planning" side of the
 * product. Same rule as transactions: scopeKey comes from a verified Scope.
 */

/* ------------------------------------------------------------------------ */
/* Budgets                                                                   */
/* ------------------------------------------------------------------------ */

const BUDGET_SELECT = {
  id: true,
  month: true,
  year: true,
  totalAmountMinor: true,
  version: true,
  updatedAt: true,
  categories: {
    select: {
      id: true,
      categoryId: true,
      allocatedAmountMinor: true,
      category: { select: { id: true, name: true, slug: true, color: true } },
    },
  },
} satisfies Prisma.BudgetSelect;

export type BudgetRow = Prisma.BudgetGetPayload<{ select: typeof BUDGET_SELECT }>;

export async function findBudget(scope: Scope, monthKey: MonthKey): Promise<BudgetRow | null> {
  return db.budget.findUnique({
    where: {
      scopeKey_year_month: { scopeKey: scope.scopeKey, year: monthKey.year, month: monthKey.month },
    },
    select: BUDGET_SELECT,
  });
}

/** Months that already have a budget, newest first — powers the month picker. */
export async function listBudgetMonths(scope: Scope): Promise<MonthKey[]> {
  const rows = await db.budget.findMany({
    where: { scopeKey: scope.scopeKey },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    select: { month: true, year: true },
    take: 36,
  });
  return rows;
}

/* ------------------------------------------------------------------------ */
/* Goals                                                                     */
/* ------------------------------------------------------------------------ */

const GOAL_SELECT = {
  id: true,
  name: true,
  targetAmountMinor: true,
  currentAmountMinor: true,
  deadline: true,
  icon: true,
  theme: true,
  version: true,
  createdAt: true,
  contributions: {
    orderBy: { date: 'desc' },
    take: 50,
    select: {
      id: true,
      amountMinor: true,
      date: true,
      note: true,
      userId: true,
      user: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.GoalSelect;

export type GoalRow = Prisma.GoalGetPayload<{ select: typeof GOAL_SELECT }>;

export async function listGoals(scope: Scope): Promise<GoalRow[]> {
  return db.goal.findMany({
    where: { scopeKey: scope.scopeKey, archived: false },
    orderBy: [{ createdAt: 'desc' }],
    select: GOAL_SELECT,
  });
}

export async function findGoal(scope: Scope, id: string): Promise<GoalRow | null> {
  return db.goal.findFirst({ where: { id, scopeKey: scope.scopeKey }, select: GOAL_SELECT });
}

/** Compact goal rows for the dashboard, without contribution history. */
export async function listGoalSummaries(scope: Scope, take = 3) {
  return db.goal.findMany({
    where: { scopeKey: scope.scopeKey, archived: false },
    orderBy: [{ createdAt: 'desc' }],
    take,
    select: {
      id: true,
      name: true,
      targetAmountMinor: true,
      currentAmountMinor: true,
      deadline: true,
      theme: true,
    },
  });
}

/* ------------------------------------------------------------------------ */
/* Recurring                                                                 */
/* ------------------------------------------------------------------------ */

const RECURRING_SELECT = {
  id: true,
  merchant: true,
  amountMinor: true,
  currency: true,
  type: true,
  frequency: true,
  paymentMethod: true,
  notes: true,
  startDate: true,
  nextDate: true,
  active: true,
  category: { select: { id: true, name: true, slug: true, color: true } },
  account: { select: { id: true, name: true, last4: true } },
} satisfies Prisma.RecurringTransactionSelect;

export type RecurringRow = Prisma.RecurringTransactionGetPayload<{ select: typeof RECURRING_SELECT }>;

export async function listRecurring(scope: Scope): Promise<RecurringRow[]> {
  return db.recurringTransaction.findMany({
    where: { scopeKey: scope.scopeKey },
    orderBy: [{ active: 'desc' }, { nextDate: 'asc' }],
    select: RECURRING_SELECT,
  });
}

export async function findRecurring(scope: Scope, id: string): Promise<RecurringRow | null> {
  return db.recurringTransaction.findFirst({
    where: { id, scopeKey: scope.scopeKey },
    select: RECURRING_SELECT,
  });
}

/** Active commitments due within the window, soonest first. */
export async function upcomingRecurring(scope: Scope, withinDays = 45, take = 6) {
  const until = new Date(Date.now() + withinDays * 86_400_000);
  return db.recurringTransaction.findMany({
    where: { scopeKey: scope.scopeKey, active: true, nextDate: { lte: until } },
    orderBy: { nextDate: 'asc' },
    take,
    select: RECURRING_SELECT,
  });
}
