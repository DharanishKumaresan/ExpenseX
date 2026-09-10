import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  budgetLevel,
  budgetStatus,
  buildInsights,
  cashFlow,
  categoryBreakdown,
  goalProgress,
  recurringTotals,
  spendByMember,
  type TransactionLike,
} from '../src/lib/analytics.ts';

/** Fixed clock so projections are deterministic. */
const NOW = new Date('2026-09-10T12:00:00.000Z');
const day = (offset: number) => new Date(NOW.getTime() + offset * 86_400_000);

const categories = [
  { id: 'food', name: 'Food', slug: 'food', color: 'forest' },
  { id: 'rent', name: 'Rent', slug: 'rent', color: 'ink' },
  { id: 'shop', name: 'Shopping', slug: 'shopping', color: 'clay' },
];

function expense(amountMinor: number, categoryId: string | null, offset = 0, paidBy?: string): TransactionLike {
  return {
    id: `${categoryId}-${amountMinor}-${offset}`,
    type: 'EXPENSE',
    amountMinor,
    date: day(offset),
    categoryId,
    merchant: 'Test',
    paidByUserId: paidBy ?? null,
  };
}

describe('cashFlow', () => {
  test('nets income against expenses and computes the savings rate', () => {
    const result = cashFlow([
      { id: 'i', type: 'INCOME', amountMinor: 6_500_000, date: NOW, categoryId: null, merchant: 'Salary' },
      expense(1_500_000, 'rent'),
      expense(500_000, 'food'),
    ]);

    assert.equal(result.incomeMinor, 6_500_000);
    assert.equal(result.expenseMinor, 2_000_000);
    assert.equal(result.netMinor, 4_500_000);
    assert.equal(Math.round(result.savingsRate!), 69);
    assert.equal(result.transactionCount, 3);
  });

  test('excludes transfers so both legs are not double counted', () => {
    const result = cashFlow([
      { id: 't', type: 'TRANSFER', amountMinor: 1_000_000, date: NOW, categoryId: null, merchant: 'Move' },
      expense(100_000, 'food'),
    ]);

    assert.equal(result.expenseMinor, 100_000);
    assert.equal(result.transactionCount, 1);
  });

  test('reports a null savings rate when there was no income', () => {
    assert.equal(cashFlow([expense(100, 'food')]).savingsRate, null);
  });
});

describe('categoryBreakdown', () => {
  test('ranks categories by spend and computes shares', () => {
    const slices = categoryBreakdown(
      [expense(600_000, 'rent'), expense(300_000, 'food'), expense(100_000, 'food')],
      categories,
    );

    assert.equal(slices[0]!.name, 'Rent');
    assert.equal(slices[0]!.spentMinor, 600_000);
    assert.equal(Math.round(slices[0]!.share), 60);
    assert.equal(slices[1]!.name, 'Food');
    assert.equal(slices[1]!.transactionCount, 2);
  });

  test('buckets uncategorised spending rather than dropping it', () => {
    const slices = categoryBreakdown([expense(5000, null)], categories);
    assert.equal(slices[0]!.name, 'Uncategorised');
    assert.equal(slices[0]!.categoryId, null);
  });
});

describe('budgetLevel', () => {
  test('maps utilisation onto the documented thresholds', () => {
    assert.equal(budgetLevel(0, 1000), 'healthy');
    assert.equal(budgetLevel(799, 1000), 'healthy');
    assert.equal(budgetLevel(800, 1000), 'warning');
    assert.equal(budgetLevel(999, 1000), 'warning');
    assert.equal(budgetLevel(1000, 1000), 'reached');
    assert.equal(budgetLevel(1001, 1000), 'overrun');
    assert.equal(budgetLevel(500, 0), 'none');
  });
});

describe('budgetStatus', () => {
  const budget = {
    totalAmountMinor: 4_000_000,
    categories: [
      { categoryId: 'rent', allocatedAmountMinor: 1_500_000 },
      { categoryId: 'food', allocatedAmountMinor: 800_000 },
      { categoryId: 'shop', allocatedAmountMinor: 400_000 },
    ],
  };

  test('computes totals, remainders and overruns', () => {
    const status = budgetStatus(
      budget,
      [expense(1_500_000, 'rent'), expense(420_000, 'food'), expense(534_400, 'shop')],
      categories,
    )!;

    assert.equal(status.totalMinor, 4_000_000);
    assert.equal(status.allocatedMinor, 2_700_000);
    assert.equal(status.unallocatedMinor, 1_300_000);
    assert.equal(status.spentMinor, 2_454_400);
    assert.equal(status.remainingMinor, 1_545_600);

    const shopping = status.categories.find((row) => row.categoryId === 'shop')!;
    assert.equal(shopping.level, 'overrun');
    assert.equal(shopping.overByMinor, 134_400);
    assert.equal(shopping.remainingMinor, 0);

    const rent = status.categories.find((row) => row.categoryId === 'rent')!;
    assert.equal(rent.level, 'reached');

    assert.equal(status.overrunCategories.length, 1);
  });

  test('returns null without a budget', () => {
    assert.equal(budgetStatus(null, [], categories), null);
  });

  test('counts uncategorised spend against the total but no category', () => {
    const status = budgetStatus(budget, [expense(100_000, null)], categories)!;
    assert.equal(status.spentMinor, 100_000);
    assert.equal(status.categories.every((row) => row.spentMinor === 0), true);
  });
});

describe('spendByMember', () => {
  test('attributes spending to whoever actually paid', () => {
    const members = [
      { userId: 'u1', name: 'Dharanish' },
      { userId: 'u2', name: 'Alex' },
    ];
    const totals = spendByMember(
      [expense(100_000, 'food', 0, 'u1'), expense(250_000, 'food', 0, 'u2'), expense(50_000, 'food', 0, 'u1')],
      members,
    );

    assert.equal(totals.find((t) => t.userId === 'u1')!.spentMinor, 150_000);
    assert.equal(totals.find((t) => t.userId === 'u2')!.spentMinor, 250_000);
  });

  test('can narrow to a single category', () => {
    const members = [{ userId: 'u1', name: 'A' }];
    const totals = spendByMember(
      [expense(100, 'food', 0, 'u1'), expense(900, 'rent', 0, 'u1')],
      members,
      'rent',
    );
    assert.equal(totals[0]!.spentMinor, 900);
  });
});

describe('goalProgress', () => {
  const goal = { targetAmountMinor: 5_000_000, currentAmountMinor: 3_200_000, deadline: day(96) };

  test('computes progress, remainder and contributor totals', () => {
    const progress = goalProgress(
      goal,
      [
        { userId: 'u1', amountMinor: 1_800_000, date: day(-90) },
        { userId: 'u2', amountMinor: 1_400_000, date: day(-30) },
      ],
      NOW,
    );

    assert.equal(progress.remainingMinor, 1_800_000);
    assert.equal(Math.round(progress.progress), 64);
    assert.equal(progress.complete, false);
    assert.equal(progress.daysRemaining, 96);
    assert.equal(progress.contributorTotals[0]!.userId, 'u1');
    assert.equal(progress.contributorTotals[0]!.amountMinor, 1_800_000);
  });

  test('projects a completion date once there is enough history', () => {
    const progress = goalProgress(
      goal,
      [
        { userId: 'u1', amountMinor: 1_800_000, date: day(-90) },
        { userId: 'u2', amountMinor: 1_400_000, date: day(-30) },
      ],
      NOW,
    );
    assert.ok(progress.estimatedCompletion instanceof Date);
    assert.ok(progress.averageMonthlyMinor! > 0);
  });

  test('refuses to project from a single contribution', () => {
    const progress = goalProgress(goal, [{ userId: 'u1', amountMinor: 3_200_000, date: day(-40) }], NOW);
    assert.equal(progress.estimatedCompletion, null);
    assert.equal(progress.averageMonthlyMinor, null);
  });

  test('refuses to project from a history shorter than two weeks', () => {
    const progress = goalProgress(
      goal,
      [
        { userId: 'u1', amountMinor: 1_600_000, date: day(-3) },
        { userId: 'u1', amountMinor: 1_600_000, date: day(-1) },
      ],
      NOW,
    );
    assert.equal(progress.estimatedCompletion, null);
  });

  test('marks a completed goal and never projects past it', () => {
    const progress = goalProgress(
      { targetAmountMinor: 1000, currentAmountMinor: 1200, deadline: null },
      [
        { userId: 'u1', amountMinor: 600, date: day(-60) },
        { userId: 'u1', amountMinor: 600, date: day(-20) },
      ],
      NOW,
    );
    assert.equal(progress.complete, true);
    assert.equal(progress.remainingMinor, 0);
    assert.equal(progress.progress, 100);
    assert.equal(progress.estimatedCompletion, null);
  });

  test('flags an overdue goal', () => {
    const progress = goalProgress(
      { targetAmountMinor: 1000, currentAmountMinor: 100, deadline: day(-5) },
      [],
      NOW,
    );
    assert.equal(progress.overdue, true);
    assert.equal(progress.daysRemaining, -5);
  });
});

describe('recurringTotals', () => {
  test('normalises every cadence through a yearly figure', () => {
    const totals = recurringTotals([
      { amountMinor: 64_900, frequency: 'MONTHLY', active: true, type: 'EXPENSE' },
      { amountMinor: 10_000, frequency: 'WEEKLY', active: true, type: 'EXPENSE' },
      { amountMinor: 120_000, frequency: 'YEARLY', active: true, type: 'EXPENSE' },
      { amountMinor: 30_000, frequency: 'QUARTERLY', active: true, type: 'EXPENSE' },
    ]);

    // 64_900*12 + 10_000*52 + 120_000 + 30_000*4 = 778_800 + 520_000 + 120_000 + 120_000
    assert.equal(totals.yearlyMinor, 1_538_800);
    assert.equal(totals.monthlyMinor, Math.round(1_538_800 / 12));
    assert.equal(totals.activeCount, 4);
  });

  test('excludes paused items from the commitment totals', () => {
    const totals = recurringTotals([
      { amountMinor: 100_000, frequency: 'MONTHLY', active: false, type: 'EXPENSE' },
      { amountMinor: 50_000, frequency: 'MONTHLY', active: true, type: 'EXPENSE' },
    ]);
    assert.equal(totals.yearlyMinor, 600_000);
    assert.equal(totals.pausedCount, 1);
    assert.equal(totals.activeCount, 1);
  });

  test('ignores income schedules in the outgoing commitment total', () => {
    const totals = recurringTotals([
      { amountMinor: 6_500_000, frequency: 'MONTHLY', active: true, type: 'INCOME' },
    ]);
    assert.equal(totals.yearlyMinor, 0);
  });
});

describe('buildInsights', () => {
  const format = (minor: number) => `₹${Math.round(minor / 100)}`;

  test('produces a month-over-month insight only with a baseline', () => {
    const withBaseline = buildInsights({
      current: cashFlow([expense(1_000_000, 'food')]),
      previous: cashFlow([expense(500_000, 'food')]),
      breakdown: [],
      budget: null,
      hasPreviousMonth: true,
      formatAmount: format,
    });
    assert.ok(withBaseline.some((i) => i.id === 'month-over-month'));

    const withoutBaseline = buildInsights({
      current: cashFlow([expense(1_000_000, 'food')]),
      previous: null,
      breakdown: [],
      budget: null,
      hasPreviousMonth: false,
      formatAmount: format,
    });
    assert.equal(withoutBaseline.some((i) => i.id === 'month-over-month'), false);
  });

  test('suppresses a month-over-month insight for noise-level change', () => {
    const insights = buildInsights({
      current: cashFlow([expense(1_010_000, 'food')]),
      previous: cashFlow([expense(1_000_000, 'food')]),
      breakdown: [],
      budget: null,
      hasPreviousMonth: true,
      formatAmount: format,
    });
    assert.equal(insights.some((i) => i.id === 'month-over-month'), false);
  });

  test('never fabricates an insight from an empty period', () => {
    const insights = buildInsights({
      current: cashFlow([]),
      previous: null,
      breakdown: [],
      budget: null,
      hasPreviousMonth: false,
      formatAmount: format,
    });
    assert.deepEqual(insights, []);
  });
});
