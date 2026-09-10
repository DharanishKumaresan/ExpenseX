import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

/**
 * Data isolation.
 *
 * These tests run against the real database, because the guarantees they check
 * are enforced by the schema and the query predicates — not by TypeScript.
 * They assert two things:
 *
 *   1. The membership predicate every shared query uses returns nothing for a
 *      non-member, so a tampered workspaceId cannot reach another pair's data.
 *   2. The CHECK constraints reject rows that would blur the personal/shared
 *      boundary, even if application code were bypassed entirely.
 *
 * Requires DATABASE_URL and a migrated database (npm run db:start).
 */

const db = new PrismaClient();

const TAG = `isolation-${Date.now()}`;
const email = (name: string) => `${name}.${TAG}@example.test`;

let owner: { id: string };
let member: { id: string };
let outsider: { id: string };
let workspaceId: string;
let categoryId: string;

const personalKey = (userId: string) => `u:${userId}`;
const sharedKey = (id: string) => `w:${id}`;

before(async () => {
  const hash = '$2a$12$C6UzMDM.H6dfI/f/IKcEe.uQZzPFN3sJ9pWQ6FEpKqRHNiVoTGqFy';

  owner = await db.user.create({
    data: { name: 'Owner', email: email('owner'), passwordHash: hash },
    select: { id: true },
  });
  member = await db.user.create({
    data: { name: 'Member', email: email('member'), passwordHash: hash },
    select: { id: true },
  });
  outsider = await db.user.create({
    data: { name: 'Outsider', email: email('outsider'), passwordHash: hash },
    select: { id: true },
  });

  const workspace = await db.workspace.create({
    data: {
      name: `Space ${TAG}`,
      currency: 'INR',
      ownerId: owner.id,
      members: {
        create: [
          { userId: owner.id, role: 'OWNER', status: 'ACTIVE' },
          { userId: member.id, role: 'MEMBER', status: 'ACTIVE' },
        ],
      },
    },
    select: { id: true },
  });
  workspaceId = workspace.id;

  const category = await db.category.findFirstOrThrow({
    where: { userId: null },
    select: { id: true },
  });
  categoryId = category.id;

  // One personal expense for the owner, one shared expense in the workspace.
  await db.transaction.create({
    data: {
      userId: owner.id,
      workspaceId: null,
      scopeKey: personalKey(owner.id),
      type: 'EXPENSE',
      amountMinor: 111_00,
      currency: 'INR',
      merchant: `PERSONAL-${TAG}`,
      categoryId,
      date: new Date(),
    },
  });

  await db.transaction.create({
    data: {
      userId: owner.id,
      workspaceId,
      scopeKey: sharedKey(workspaceId),
      type: 'EXPENSE',
      amountMinor: 222_00,
      currency: 'INR',
      merchant: `SHARED-${TAG}`,
      categoryId,
      paidByUserId: member.id,
      date: new Date(),
    },
  });
});

after(async () => {
  await db.workspace.deleteMany({ where: { id: workspaceId } });
  await db.user.deleteMany({
    where: { id: { in: [owner.id, member.id, outsider.id].filter(Boolean) } },
  });
  await db.$disconnect();
});

/* ------------------------------------------------------------------------ */
/* Workspace membership                                                      */
/* ------------------------------------------------------------------------ */

/** Exactly the predicate `loadWorkspaceForUser` uses. */
function workspaceForUser(id: string, userId: string) {
  return db.workspace.findFirst({
    where: { id, members: { some: { userId, status: 'ACTIVE' } } },
    select: { id: true },
  });
}

describe('workspace access', () => {
  test('a member resolves the workspace', async () => {
    assert.ok(await workspaceForUser(workspaceId, owner.id));
    assert.ok(await workspaceForUser(workspaceId, member.id));
  });

  test('a non-member gets nothing, even with the real workspace id', async () => {
    assert.equal(await workspaceForUser(workspaceId, outsider.id), null);
  });

  test('a removed member loses access immediately', async () => {
    await db.workspaceMember.updateMany({
      where: { workspaceId, userId: member.id },
      data: { status: 'REMOVED' },
    });
    assert.equal(await workspaceForUser(workspaceId, member.id), null);

    await db.workspaceMember.updateMany({
      where: { workspaceId, userId: member.id },
      data: { status: 'ACTIVE' },
    });
    assert.ok(await workspaceForUser(workspaceId, member.id));
  });
});

/* ------------------------------------------------------------------------ */
/* Scope separation                                                          */
/* ------------------------------------------------------------------------ */

describe('personal and shared ledgers never mix', () => {
  test("a personal expense is absent from the workspace's scope", async () => {
    const rows = await db.transaction.findMany({
      where: { scopeKey: sharedKey(workspaceId) },
      select: { merchant: true },
    });
    assert.ok(rows.some((row) => row.merchant === `SHARED-${TAG}`));
    assert.equal(rows.some((row) => row.merchant === `PERSONAL-${TAG}`), false);
  });

  test("a shared expense is absent from the creator's personal scope", async () => {
    const rows = await db.transaction.findMany({
      where: { scopeKey: personalKey(owner.id) },
      select: { merchant: true },
    });
    assert.ok(rows.some((row) => row.merchant === `PERSONAL-${TAG}`));
    assert.equal(rows.some((row) => row.merchant === `SHARED-${TAG}`), false);
  });

  test('an outsider scoped to their own key sees neither', async () => {
    const rows = await db.transaction.findMany({
      where: { scopeKey: personalKey(outsider.id) },
    });
    assert.equal(rows.length, 0);
  });
});

/* ------------------------------------------------------------------------ */
/* Database-level guarantees                                                 */
/* ------------------------------------------------------------------------ */

describe('CHECK constraints backstop the application', () => {
  test('rejects a transaction whose scopeKey contradicts its workspace', async () => {
    await assert.rejects(
      db.transaction.create({
        data: {
          userId: owner.id,
          workspaceId,
          // Claims to be personal while pointing at a workspace.
          scopeKey: personalKey(owner.id),
          type: 'EXPENSE',
          amountMinor: 100,
          currency: 'INR',
          merchant: 'bad-scope',
          date: new Date(),
        },
      }),
      /Transaction_scope_key_matches|constraint/i,
    );
  });

  test('rejects a personal transaction that names a payer', async () => {
    await assert.rejects(
      db.transaction.create({
        data: {
          userId: owner.id,
          workspaceId: null,
          scopeKey: personalKey(owner.id),
          type: 'EXPENSE',
          amountMinor: 100,
          currency: 'INR',
          merchant: 'bad-payer',
          paidByUserId: member.id,
          date: new Date(),
        },
      }),
      /Transaction_paid_by_requires_workspace|constraint/i,
    );
  });

  test('rejects a zero or negative amount', async () => {
    await assert.rejects(
      db.transaction.create({
        data: {
          userId: owner.id,
          workspaceId: null,
          scopeKey: personalKey(owner.id),
          type: 'EXPENSE',
          amountMinor: 0,
          currency: 'INR',
          merchant: 'zero',
          date: new Date(),
        },
      }),
      /Transaction_amount_positive_bounded|constraint/i,
    );
  });

  test('rejects a budget that is both personal and shared', async () => {
    await assert.rejects(
      db.budget.create({
        data: {
          userId: owner.id,
          workspaceId,
          scopeKey: sharedKey(workspaceId),
          month: 1,
          year: 2027,
          totalAmountMinor: 1000,
        },
      }),
      /Budget_exactly_one_scope|constraint/i,
    );
  });

  test('rejects a budget that belongs to neither scope', async () => {
    await assert.rejects(
      db.budget.create({
        data: {
          userId: null,
          workspaceId: null,
          scopeKey: 'u:orphan',
          month: 1,
          year: 2027,
          totalAmountMinor: 1000,
        },
      }),
      /Budget_exactly_one_scope|constraint/i,
    );
  });

  test('rejects a second personal budget for the same month', async () => {
    const base = {
      userId: owner.id,
      workspaceId: null,
      scopeKey: personalKey(owner.id),
      month: 6,
      year: 2027,
      totalAmountMinor: 500_000,
    };
    const created = await db.budget.create({ data: base, select: { id: true } });

    await assert.rejects(db.budget.create({ data: base }), /Unique|P2002/i);

    await db.budget.delete({ where: { id: created.id } });
  });

  test('rejects an invalid month', async () => {
    await assert.rejects(
      db.budget.create({
        data: {
          userId: owner.id,
          workspaceId: null,
          scopeKey: personalKey(owner.id),
          month: 13,
          year: 2027,
          totalAmountMinor: 1000,
        },
      }),
      /Budget_month_valid|constraint/i,
    );
  });

  test('rejects a duplicate system category slug', async () => {
    const existing = await db.category.findFirstOrThrow({
      where: { userId: null },
      select: { slug: true },
    });
    await assert.rejects(
      db.category.create({
        data: { name: 'Clone', slug: existing.slug, kind: 'EXPENSE', isSystem: true, userId: null },
      }),
      /Category_system_slug_key|Unique|P2002/i,
    );
  });

  test('rejects a negative goal balance', async () => {
    const goal = await db.goal.create({
      data: {
        userId: owner.id,
        scopeKey: personalKey(owner.id),
        name: 'Guard',
        targetAmountMinor: 10_000,
        currentAmountMinor: 100,
      },
      select: { id: true },
    });

    await assert.rejects(
      db.goal.update({
        where: { id: goal.id },
        data: { currentAmountMinor: { decrement: 500 } },
      }),
      /Goal_current_non_negative|constraint/i,
    );

    await db.goal.delete({ where: { id: goal.id } });
  });
});

/* ------------------------------------------------------------------------ */
/* Cascades                                                                  */
/* ------------------------------------------------------------------------ */

describe('cascades leave nothing orphaned', () => {
  test('deleting a workspace removes its shared rows but not personal ones', async () => {
    const scratch = await db.workspace.create({
      data: {
        name: `Scratch ${TAG}`,
        currency: 'INR',
        ownerId: owner.id,
        members: { create: [{ userId: owner.id, role: 'OWNER', status: 'ACTIVE' }] },
      },
      select: { id: true },
    });

    await db.transaction.create({
      data: {
        userId: owner.id,
        workspaceId: scratch.id,
        scopeKey: sharedKey(scratch.id),
        type: 'EXPENSE',
        amountMinor: 500,
        currency: 'INR',
        merchant: `SCRATCH-${TAG}`,
        date: new Date(),
      },
    });

    await db.workspace.delete({ where: { id: scratch.id } });

    assert.equal(
      await db.transaction.count({ where: { merchant: `SCRATCH-${TAG}` } }),
      0,
      'shared transactions should cascade with the workspace',
    );
    assert.equal(
      await db.transaction.count({ where: { merchant: `PERSONAL-${TAG}` } }),
      1,
      'personal transactions must survive a shared workspace deletion',
    );
  });
});
