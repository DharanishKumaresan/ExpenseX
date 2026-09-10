/**
 * Seed data.
 *
 * Builds two accounts with a genuinely usable history: five months of personal
 * spending for the primary demo user, a monthly budget, goals, recurring
 * commitments, and a shared workspace the two of them run together.
 *
 * Amounts are in PAISE (integer minor units) throughout — `rupees()` is the
 * only place a decimal appears, and it never uses floating point arithmetic.
 *
 * Re-running is safe: the script clears the demo users' data first.
 */
import { PrismaClient } from '@prisma/client';
import type { PaymentMethod, TransactionType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();

/* ------------------------------------------------------------------------ */
/* Configuration                                                             */
/* ------------------------------------------------------------------------ */

const DEMO_PASSWORD = 'expensex-demo-2026';

const PRIMARY = {
  name: 'Dharanish',
  email: 'demo@expensex.app',
};

const PARTNER = {
  name: 'Alex Mehra',
  email: 'alex@expensex.app',
};

/** Rupees → paise, without touching a float. */
function rupees(value: number): number {
  return Math.round(value * 100);
}

/** Deterministic PRNG so every seed run produces the same dashboard. */
function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const random = makeRandom(20260910);

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)] as T;
}

function between(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

/** IST is UTC+5:30; the app renders in Asia/Kolkata. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istDate(year: number, month: number, day: number, hour = 12, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - IST_OFFSET_MS);
}

const CATEGORY_PRESETS = [
  { slug: 'food', name: 'Food', icon: 'food', kind: 'EXPENSE', color: 'forest', sortOrder: 10 },
  { slug: 'shopping', name: 'Shopping', icon: 'shopping', kind: 'EXPENSE', color: 'clay', sortOrder: 20 },
  { slug: 'transport', name: 'Transport', icon: 'transport', kind: 'EXPENSE', color: 'sage', sortOrder: 30 },
  { slug: 'rent', name: 'Rent', icon: 'rent', kind: 'EXPENSE', color: 'ink', sortOrder: 40 },
  { slug: 'bills', name: 'Bills', icon: 'bills', kind: 'EXPENSE', color: 'fern', sortOrder: 50 },
  { slug: 'education', name: 'Education', icon: 'education', kind: 'EXPENSE', color: 'slate', sortOrder: 60 },
  { slug: 'health', name: 'Health', icon: 'health', kind: 'EXPENSE', color: 'coral', sortOrder: 70 },
  { slug: 'entertainment', name: 'Entertainment', icon: 'entertainment', kind: 'EXPENSE', color: 'accent', sortOrder: 80 },
  { slug: 'subscriptions', name: 'Subscriptions', icon: 'subscriptions', kind: 'EXPENSE', color: 'stone', sortOrder: 90 },
  { slug: 'travel', name: 'Travel', icon: 'travel', kind: 'EXPENSE', color: 'slate', sortOrder: 100 },
  { slug: 'housing', name: 'Housing', icon: 'housing', kind: 'EXPENSE', color: 'ink', sortOrder: 110 },
  { slug: 'groceries', name: 'Groceries', icon: 'groceries', kind: 'EXPENSE', color: 'moss', sortOrder: 120 },
  { slug: 'investments', name: 'Investments', icon: 'investments', kind: 'BOTH', color: 'stone', sortOrder: 130 },
  { slug: 'salary', name: 'Salary', icon: 'salary', kind: 'INCOME', color: 'forest', sortOrder: 140 },
  { slug: 'freelance', name: 'Freelance', icon: 'freelance', kind: 'INCOME', color: 'moss', sortOrder: 150 },
  { slug: 'other', name: 'Other', icon: 'other', kind: 'BOTH', color: 'stone', sortOrder: 999 },
] as const;

/* ------------------------------------------------------------------------ */
/* Merchant vocabulary                                                       */
/* ------------------------------------------------------------------------ */

const FOOD = ['Swiggy', 'Zomato', 'Third Wave Coffee', 'A2B', 'Blue Tokai', 'Meghana Foods'];
const GROCERIES = ['BigBasket', 'DMart', 'Zepto', 'Licious'];
const TRANSPORT = ['Uber', 'Ola', 'Namma Metro', 'Rapido', 'IndianOil'];
const SHOPPING = ['Amazon', 'Myntra', 'Decathlon', 'Croma', 'IKEA'];
const ENTERTAINMENT = ['BookMyShow', 'PVR Cinemas', 'Steam'];
const HEALTH = ['Apollo Pharmacy', 'Cult.fit', 'Practo'];

/* ------------------------------------------------------------------------ */
/* Seed                                                                      */
/* ------------------------------------------------------------------------ */

async function main() {
  console.log('· seeding ExpenseX');

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // --- Clean slate for the demo accounts only -----------------------------
  const existing = await db.user.findMany({
    where: { email: { in: [PRIMARY.email, PARTNER.email] } },
    select: { id: true },
  });
  if (existing.length > 0) {
    // Everything else cascades from User and Workspace.
    await db.workspace.deleteMany({ where: { ownerId: { in: existing.map((u) => u.id) } } });
    await db.user.deleteMany({ where: { id: { in: existing.map((u) => u.id) } } });
    console.log('· removed previous demo data');
  }

  // --- System categories --------------------------------------------------
  await db.category.createMany({
    data: CATEGORY_PRESETS.map((preset) => ({
      name: preset.name,
      slug: preset.slug,
      icon: preset.icon,
      color: preset.color,
      kind: preset.kind,
      isSystem: true,
      sortOrder: preset.sortOrder,
      userId: null,
    })),
    skipDuplicates: true,
  });

  const categories = await db.category.findMany({ where: { userId: null } });
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category.id]));
  const cat = (slug: string): string => {
    const id = categoryBySlug.get(slug);
    if (!id) throw new Error(`missing category ${slug}`);
    return id;
  };

  // --- Users --------------------------------------------------------------
  const primary = await db.user.create({
    data: {
      name: PRIMARY.name,
      email: PRIMARY.email,
      passwordHash,
      currency: 'INR',
      notificationPrefs: { create: {} },
      accounts: {
        create: [
          { name: 'HDFC Savings', type: 'SAVINGS', last4: '8904', openingBalanceMinor: rupees(48_000), isDefault: true },
          { name: 'Cash', type: 'CASH', openingBalanceMinor: rupees(3_500) },
          { name: 'ICICI Credit', type: 'CREDIT_CARD', last4: '4417', openingBalanceMinor: 0 },
        ],
      },
    },
    select: { id: true, accounts: { select: { id: true, name: true } } },
  });

  const partner = await db.user.create({
    data: {
      name: PARTNER.name,
      email: PARTNER.email,
      passwordHash,
      currency: 'INR',
      notificationPrefs: { create: {} },
      accounts: { create: [{ name: 'Axis Savings', type: 'SAVINGS', last4: '2210', isDefault: true }] },
    },
    select: { id: true, accounts: { select: { id: true } } },
  });

  const hdfc = primary.accounts.find((a) => a.name === 'HDFC Savings')!.id;
  const cash = primary.accounts.find((a) => a.name === 'Cash')!.id;
  const credit = primary.accounts.find((a) => a.name === 'ICICI Credit')!.id;

  const personalScope = `u:${primary.id}`;

  console.log(`· created ${PRIMARY.email} and ${PARTNER.email}`);

  /* ---------------------------------------------------------------------- */
  /* Personal transactions — five months of history                          */
  /* ---------------------------------------------------------------------- */

  type Row = {
    type: TransactionType;
    amountMinor: number;
    merchant: string;
    categoryId: string;
    accountId: string;
    paymentMethod: PaymentMethod;
    date: Date;
    notes?: string;
  };

  const rows: Row[] = [];
  const MONTHS: { year: number; month: number; days: number }[] = [
    { year: 2026, month: 5, days: 31 },
    { year: 2026, month: 6, days: 30 },
    { year: 2026, month: 7, days: 31 },
    { year: 2026, month: 8, days: 31 },
    // The current month is partial: today is 10 September 2026.
    { year: 2026, month: 9, days: 10 },
  ];

  for (const period of MONTHS) {
    const { year, month, days } = period;
    const partial = days < 28;

    // Income
    rows.push({
      type: 'INCOME',
      amountMinor: rupees(65_000),
      merchant: 'Salary',
      categoryId: cat('salary'),
      accountId: hdfc,
      paymentMethod: 'BANK_TRANSFER',
      date: istDate(year, month, 1, 9, 0),
      notes: 'Monthly salary credit',
    });

    if (!partial && random() > 0.55) {
      rows.push({
        type: 'INCOME',
        amountMinor: rupees(between(6_000, 14_000)),
        merchant: 'Freelance project',
        categoryId: cat('freelance'),
        accountId: hdfc,
        paymentMethod: 'BANK_TRANSFER',
        date: istDate(year, month, between(12, 24), 16, 30),
      });
    }

    // Fixed commitments
    rows.push({
      type: 'EXPENSE',
      amountMinor: rupees(15_000),
      merchant: 'Rent',
      categoryId: cat('rent'),
      accountId: hdfc,
      paymentMethod: 'BANK_TRANSFER',
      date: istDate(year, month, 3, 10, 15),
    });
    rows.push({
      type: 'EXPENSE',
      amountMinor: rupees(649),
      merchant: 'Netflix',
      categoryId: cat('subscriptions'),
      accountId: credit,
      paymentMethod: 'CREDIT_CARD',
      date: istDate(year, month, 5, 6, 0),
    });
    rows.push({
      type: 'EXPENSE',
      amountMinor: rupees(119),
      merchant: 'Spotify',
      categoryId: cat('subscriptions'),
      accountId: credit,
      paymentMethod: 'CREDIT_CARD',
      date: istDate(year, month, 5, 6, 5),
    });

    if (!partial) {
      rows.push({
        type: 'EXPENSE',
        amountMinor: rupees(between(1_150, 1_850)),
        merchant: 'BESCOM Electricity',
        categoryId: cat('bills'),
        accountId: hdfc,
        paymentMethod: 'UPI',
        date: istDate(year, month, 12, 19, 20),
      });
      rows.push({
        type: 'EXPENSE',
        amountMinor: rupees(799),
        merchant: 'ACT Fibernet',
        categoryId: cat('bills'),
        accountId: hdfc,
        paymentMethod: 'UPI',
        date: istDate(year, month, 8, 11, 0),
      });
      rows.push({
        type: 'EXPENSE',
        amountMinor: rupees(1_500),
        merchant: 'Cult.fit',
        categoryId: cat('health'),
        accountId: credit,
        paymentMethod: 'CREDIT_CARD',
        date: istDate(year, month, 6, 7, 30),
      });
    }

    // Food — the busiest category
    const foodCount = partial ? between(5, 8) : between(13, 19);
    for (let index = 0; index < foodCount; index += 1) {
      rows.push({
        type: 'EXPENSE',
        amountMinor: rupees(between(180, 880)),
        merchant: pick(FOOD),
        categoryId: cat('food'),
        accountId: random() > 0.75 ? cash : hdfc,
        paymentMethod: random() > 0.75 ? 'CASH' : 'UPI',
        date: istDate(year, month, between(1, days), between(8, 22), between(0, 59)),
      });
    }

    // Groceries
    const groceryCount = partial ? 2 : between(3, 5);
    for (let index = 0; index < groceryCount; index += 1) {
      rows.push({
        type: 'EXPENSE',
        amountMinor: rupees(between(1_100, 3_400)),
        merchant: pick(GROCERIES),
        categoryId: cat('groceries'),
        accountId: hdfc,
        paymentMethod: 'UPI',
        date: istDate(year, month, between(1, days), between(9, 21)),
      });
    }

    // Transport
    const transportCount = partial ? between(3, 6) : between(8, 14);
    for (let index = 0; index < transportCount; index += 1) {
      rows.push({
        type: 'EXPENSE',
        amountMinor: rupees(between(60, 480)),
        merchant: pick(TRANSPORT),
        categoryId: cat('transport'),
        accountId: random() > 0.8 ? cash : hdfc,
        paymentMethod: random() > 0.8 ? 'CASH' : 'UPI',
        date: istDate(year, month, between(1, days), between(7, 23)),
      });
    }

    // Shopping — deliberately heavier in September so the budget overruns
    const shoppingCount = partial ? 2 : between(2, 5);
    for (let index = 0; index < shoppingCount; index += 1) {
      rows.push({
        type: 'EXPENSE',
        amountMinor: rupees(partial ? between(2_200, 3_400) : between(499, 4_999)),
        merchant: pick(SHOPPING),
        categoryId: cat('shopping'),
        accountId: credit,
        paymentMethod: 'CREDIT_CARD',
        date: istDate(year, month, between(1, days), between(11, 22)),
      });
    }

    // Entertainment
    for (let index = 0; index < (partial ? 1 : between(1, 3)); index += 1) {
      rows.push({
        type: 'EXPENSE',
        amountMinor: rupees(between(300, 950)),
        merchant: pick(ENTERTAINMENT),
        categoryId: cat('entertainment'),
        accountId: credit,
        paymentMethod: 'CREDIT_CARD',
        date: istDate(year, month, between(1, days), between(17, 23)),
      });
    }

    // Health, occasionally
    if (random() > 0.5) {
      rows.push({
        type: 'EXPENSE',
        amountMinor: rupees(between(320, 1_600)),
        merchant: pick(HEALTH),
        categoryId: cat('health'),
        accountId: hdfc,
        paymentMethod: 'UPI',
        date: istDate(year, month, between(1, days), between(10, 20)),
      });
    }

    // Education, most months
    if (!partial && random() > 0.35) {
      rows.push({
        type: 'EXPENSE',
        amountMinor: rupees(4_000),
        merchant: 'Coursera',
        categoryId: cat('education'),
        accountId: credit,
        paymentMethod: 'CREDIT_CARD',
        date: istDate(year, month, between(4, 20), 20, 10),
      });
    }

    // Travel, occasionally
    if (!partial && random() > 0.65) {
      rows.push({
        type: 'EXPENSE',
        amountMinor: rupees(between(3_200, 7_500)),
        merchant: pick(['IRCTC', 'MakeMyTrip', 'IndiGo']),
        categoryId: cat('travel'),
        accountId: hdfc,
        paymentMethod: 'UPI',
        date: istDate(year, month, between(6, 22), 14, 0),
      });
    }

    // Investments
    if (!partial) {
      rows.push({
        type: 'EXPENSE',
        amountMinor: rupees(8_000),
        merchant: 'Index fund SIP',
        categoryId: cat('investments'),
        accountId: hdfc,
        paymentMethod: 'BANK_TRANSFER',
        date: istDate(year, month, 7, 10, 0),
        notes: 'Monthly SIP',
      });
    }
  }

  await db.transaction.createMany({
    data: rows.map((row) => ({
      userId: primary.id,
      workspaceId: null,
      scopeKey: personalScope,
      type: row.type,
      amountMinor: row.amountMinor,
      currency: 'INR',
      merchant: row.merchant,
      categoryId: row.categoryId,
      accountId: row.accountId,
      paymentMethod: row.paymentMethod,
      date: row.date,
      notes: row.notes ?? null,
    })),
  });

  console.log(`· ${rows.length} personal transactions`);

  /* ---------------------------------------------------------------------- */
  /* Personal budget, goals, recurring                                       */
  /* ---------------------------------------------------------------------- */

  await db.budget.create({
    data: {
      userId: primary.id,
      scopeKey: personalScope,
      month: 9,
      year: 2026,
      totalAmountMinor: rupees(40_000),
      categories: {
        create: [
          { categoryId: cat('rent'), allocatedAmountMinor: rupees(15_000) },
          { categoryId: cat('food'), allocatedAmountMinor: rupees(8_000) },
          { categoryId: cat('groceries'), allocatedAmountMinor: rupees(5_000) },
          { categoryId: cat('transport'), allocatedAmountMinor: rupees(3_000) },
          // Deliberately tight, so the overrun state is visible on first run.
          { categoryId: cat('shopping'), allocatedAmountMinor: rupees(4_000) },
          { categoryId: cat('entertainment'), allocatedAmountMinor: rupees(1_500) },
          { categoryId: cat('health'), allocatedAmountMinor: rupees(2_000) },
        ],
      },
    },
  });

  await db.budget.create({
    data: {
      userId: primary.id,
      scopeKey: personalScope,
      month: 8,
      year: 2026,
      totalAmountMinor: rupees(38_000),
      categories: {
        create: [
          { categoryId: cat('rent'), allocatedAmountMinor: rupees(15_000) },
          { categoryId: cat('food'), allocatedAmountMinor: rupees(7_500) },
          { categoryId: cat('groceries'), allocatedAmountMinor: rupees(5_000) },
          { categoryId: cat('transport'), allocatedAmountMinor: rupees(3_000) },
          { categoryId: cat('shopping'), allocatedAmountMinor: rupees(5_000) },
        ],
      },
    },
  });

  const emergency = await db.goal.create({
    data: {
      userId: primary.id,
      scopeKey: personalScope,
      name: 'Emergency Fund',
      targetAmountMinor: rupees(100_000),
      currentAmountMinor: 0,
      deadline: istDate(2027, 3, 31),
      theme: 'forest',
    },
    select: { id: true },
  });

  const macbook = await db.goal.create({
    data: {
      userId: primary.id,
      scopeKey: personalScope,
      name: 'New Camera',
      targetAmountMinor: rupees(72_000),
      currentAmountMinor: 0,
      deadline: istDate(2026, 12, 20),
      theme: 'yellow',
    },
    select: { id: true },
  });

  // Contributions drive the running totals, so the two always agree.
  const personalContributions = [
    { goalId: emergency.id, amountMinor: rupees(12_000), date: istDate(2026, 5, 6) },
    { goalId: emergency.id, amountMinor: rupees(10_000), date: istDate(2026, 6, 5) },
    { goalId: emergency.id, amountMinor: rupees(8_000), date: istDate(2026, 7, 4) },
    { goalId: emergency.id, amountMinor: rupees(9_500), date: istDate(2026, 8, 6) },
    { goalId: emergency.id, amountMinor: rupees(5_500), date: istDate(2026, 9, 4) },
    { goalId: macbook.id, amountMinor: rupees(9_000), date: istDate(2026, 6, 18) },
    { goalId: macbook.id, amountMinor: rupees(11_000), date: istDate(2026, 7, 20) },
    { goalId: macbook.id, amountMinor: rupees(7_500), date: istDate(2026, 8, 22) },
  ];

  for (const contribution of personalContributions) {
    await db.goalContribution.create({
      data: { ...contribution, userId: primary.id, note: null },
    });
    await db.goal.update({
      where: { id: contribution.goalId },
      data: { currentAmountMinor: { increment: contribution.amountMinor } },
    });
  }

  await db.recurringTransaction.createMany({
    data: [
      {
        userId: primary.id, scopeKey: personalScope, merchant: 'Rent', amountMinor: rupees(15_000),
        currency: 'INR', type: 'EXPENSE', frequency: 'MONTHLY', categoryId: cat('rent'),
        accountId: hdfc, paymentMethod: 'BANK_TRANSFER',
        startDate: istDate(2026, 5, 3), nextDate: istDate(2026, 10, 3), active: true,
      },
      {
        userId: primary.id, scopeKey: personalScope, merchant: 'Netflix', amountMinor: rupees(649),
        currency: 'INR', type: 'EXPENSE', frequency: 'MONTHLY', categoryId: cat('subscriptions'),
        accountId: credit, paymentMethod: 'CREDIT_CARD',
        startDate: istDate(2026, 5, 5), nextDate: istDate(2026, 10, 5), active: true,
      },
      {
        userId: primary.id, scopeKey: personalScope, merchant: 'Spotify', amountMinor: rupees(119),
        currency: 'INR', type: 'EXPENSE', frequency: 'MONTHLY', categoryId: cat('subscriptions'),
        accountId: credit, paymentMethod: 'CREDIT_CARD',
        startDate: istDate(2026, 5, 5), nextDate: istDate(2026, 10, 5), active: true,
      },
      {
        userId: primary.id, scopeKey: personalScope, merchant: 'Cult.fit', amountMinor: rupees(1_500),
        currency: 'INR', type: 'EXPENSE', frequency: 'MONTHLY', categoryId: cat('health'),
        accountId: credit, paymentMethod: 'CREDIT_CARD',
        startDate: istDate(2026, 5, 6), nextDate: istDate(2026, 10, 6), active: true,
      },
      {
        userId: primary.id, scopeKey: personalScope, merchant: 'ACT Fibernet', amountMinor: rupees(799),
        currency: 'INR', type: 'EXPENSE', frequency: 'MONTHLY', categoryId: cat('bills'),
        accountId: hdfc, paymentMethod: 'UPI',
        startDate: istDate(2026, 5, 8), nextDate: istDate(2026, 10, 8), active: true,
      },
      {
        userId: primary.id, scopeKey: personalScope, merchant: 'Amazon Prime', amountMinor: rupees(1_499),
        currency: 'INR', type: 'EXPENSE', frequency: 'YEARLY', categoryId: cat('subscriptions'),
        accountId: credit, paymentMethod: 'CREDIT_CARD',
        startDate: istDate(2026, 2, 14), nextDate: istDate(2027, 2, 14), active: true,
      },
      {
        userId: primary.id, scopeKey: personalScope, merchant: 'Domain renewal', amountMinor: rupees(1_180),
        currency: 'INR', type: 'EXPENSE', frequency: 'YEARLY', categoryId: cat('bills'),
        accountId: credit, paymentMethod: 'CREDIT_CARD',
        startDate: istDate(2026, 4, 2), nextDate: istDate(2027, 4, 2), active: false,
      },
    ],
  });

  console.log('· personal budget, goals and recurring commitments');

  /* ---------------------------------------------------------------------- */
  /* Shared workspace                                                        */
  /* ---------------------------------------------------------------------- */

  const workspace = await db.workspace.create({
    data: {
      name: 'Our Finances',
      description: 'Household spending and the trip fund',
      currency: 'INR',
      ownerId: primary.id,
      members: {
        create: [
          { userId: primary.id, role: 'OWNER', status: 'ACTIVE', joinedAt: istDate(2026, 6, 1) },
          { userId: partner.id, role: 'MEMBER', status: 'ACTIVE', joinedAt: istDate(2026, 6, 2) },
        ],
      },
    },
    select: { id: true },
  });

  const sharedScope = `w:${workspace.id}`;

  const sharedRows: (Row & { paidByUserId: string; createdBy: string })[] = [];

  for (const period of [
    { year: 2026, month: 7, days: 31 },
    { year: 2026, month: 8, days: 31 },
    { year: 2026, month: 9, days: 10 },
  ]) {
    const { year, month, days } = period;
    const partial = days < 28;

    sharedRows.push({
      type: 'EXPENSE', amountMinor: rupees(15_000), merchant: 'Rent',
      categoryId: cat('housing'), accountId: hdfc, paymentMethod: 'BANK_TRANSFER',
      date: istDate(year, month, 1, 10, 0),
      paidByUserId: partner.id, createdBy: partner.id,
    });

    for (let index = 0; index < (partial ? 2 : between(3, 5)); index += 1) {
      const payer = random() > 0.5 ? primary.id : partner.id;
      sharedRows.push({
        type: 'EXPENSE', amountMinor: rupees(between(1_400, 3_600)), merchant: pick(GROCERIES),
        categoryId: cat('groceries'), accountId: hdfc, paymentMethod: 'UPI',
        date: istDate(year, month, between(1, days), between(10, 20)),
        paidByUserId: payer, createdBy: payer,
      });
    }

    for (let index = 0; index < (partial ? 3 : between(4, 7)); index += 1) {
      const payer = random() > 0.5 ? primary.id : partner.id;
      sharedRows.push({
        type: 'EXPENSE', amountMinor: rupees(between(420, 2_200)), merchant: pick(FOOD),
        categoryId: cat('food'), accountId: hdfc, paymentMethod: 'UPI',
        date: istDate(year, month, between(1, days), between(12, 22)),
        paidByUserId: payer, createdBy: primary.id,
      });
    }

    for (let index = 0; index < (partial ? 2 : between(3, 6)); index += 1) {
      const payer = random() > 0.5 ? primary.id : partner.id;
      sharedRows.push({
        type: 'EXPENSE', amountMinor: rupees(between(120, 620)), merchant: pick(TRANSPORT),
        categoryId: cat('transport'), accountId: hdfc, paymentMethod: 'UPI',
        date: istDate(year, month, between(1, days), between(8, 23)),
        paidByUserId: payer, createdBy: payer,
      });
    }

    if (!partial) {
      sharedRows.push({
        type: 'EXPENSE', amountMinor: rupees(between(1_800, 2_600)), merchant: 'BESCOM Electricity',
        categoryId: cat('bills'), accountId: hdfc, paymentMethod: 'UPI',
        date: istDate(year, month, 12, 19, 0),
        paidByUserId: primary.id, createdBy: primary.id,
      });
    }

    // Shopping runs over its shared allocation in September.
    for (let index = 0; index < (partial ? 3 : 2); index += 1) {
      const payer = random() > 0.5 ? primary.id : partner.id;
      sharedRows.push({
        type: 'EXPENSE', amountMinor: rupees(partial ? between(2_400, 4_800) : between(900, 3_200)),
        merchant: pick(SHOPPING), categoryId: cat('shopping'), accountId: credit,
        paymentMethod: 'CREDIT_CARD',
        date: istDate(year, month, between(1, days), between(12, 21)),
        paidByUserId: payer, createdBy: payer,
      });
    }
  }

  sharedRows.push({
    type: 'EXPENSE', amountMinor: rupees(5_000), merchant: 'Goa flights (advance)',
    categoryId: cat('travel'), accountId: hdfc, paymentMethod: 'CREDIT_CARD',
    date: istDate(2026, 8, 24, 15, 0),
    paidByUserId: partner.id, createdBy: partner.id,
    notes: 'Booked the outbound leg',
  });

  await db.transaction.createMany({
    data: sharedRows.map((row) => ({
      userId: row.createdBy,
      workspaceId: workspace.id,
      scopeKey: sharedScope,
      type: row.type,
      amountMinor: row.amountMinor,
      currency: 'INR',
      merchant: row.merchant,
      categoryId: row.categoryId,
      // Accounts belong to individuals; keep shared rows unlinked.
      accountId: null,
      paymentMethod: row.paymentMethod,
      paidByUserId: row.paidByUserId,
      date: row.date,
      notes: row.notes ?? null,
    })),
  });

  await db.budget.create({
    data: {
      workspaceId: workspace.id,
      scopeKey: sharedScope,
      month: 9,
      year: 2026,
      totalAmountMinor: rupees(50_000),
      categories: {
        create: [
          { categoryId: cat('housing'), allocatedAmountMinor: rupees(15_000) },
          { categoryId: cat('food'), allocatedAmountMinor: rupees(8_000) },
          { categoryId: cat('groceries'), allocatedAmountMinor: rupees(7_000) },
          { categoryId: cat('transport'), allocatedAmountMinor: rupees(5_000) },
          { categoryId: cat('shopping'), allocatedAmountMinor: rupees(6_000) },
          { categoryId: cat('travel'), allocatedAmountMinor: rupees(4_000) },
          { categoryId: cat('bills'), allocatedAmountMinor: rupees(3_000) },
        ],
      },
    },
  });

  const goaTrip = await db.goal.create({
    data: {
      workspaceId: workspace.id,
      scopeKey: sharedScope,
      name: 'Goa Trip',
      targetAmountMinor: rupees(50_000),
      currentAmountMinor: 0,
      deadline: istDate(2026, 12, 15),
      theme: 'yellow',
    },
    select: { id: true },
  });

  const laptop = await db.goal.create({
    data: {
      workspaceId: workspace.id,
      scopeKey: sharedScope,
      name: 'New Laptop',
      targetAmountMinor: rupees(80_000),
      currentAmountMinor: 0,
      deadline: istDate(2027, 2, 28),
      theme: 'forest',
    },
    select: { id: true },
  });

  const sharedContributions = [
    { goalId: goaTrip.id, userId: primary.id, amountMinor: rupees(6_000), date: istDate(2026, 6, 12), note: 'Kicking it off' },
    { goalId: goaTrip.id, userId: partner.id, amountMinor: rupees(5_000), date: istDate(2026, 6, 20), note: null },
    { goalId: goaTrip.id, userId: primary.id, amountMinor: rupees(5_500), date: istDate(2026, 7, 8), note: null },
    { goalId: goaTrip.id, userId: partner.id, amountMinor: rupees(4_000), date: istDate(2026, 7, 26), note: null },
    { goalId: goaTrip.id, userId: primary.id, amountMinor: rupees(4_000), date: istDate(2026, 8, 10), note: null },
    { goalId: goaTrip.id, userId: partner.id, amountMinor: rupees(5_000), date: istDate(2026, 8, 28), note: 'After the flight booking' },
    { goalId: goaTrip.id, userId: primary.id, amountMinor: rupees(2_500), date: istDate(2026, 9, 6), note: null },
    { goalId: laptop.id, userId: primary.id, amountMinor: rupees(14_000), date: istDate(2026, 6, 15), note: null },
    { goalId: laptop.id, userId: partner.id, amountMinor: rupees(12_000), date: istDate(2026, 7, 15), note: null },
    { goalId: laptop.id, userId: primary.id, amountMinor: rupees(11_000), date: istDate(2026, 8, 14), note: null },
    { goalId: laptop.id, userId: partner.id, amountMinor: rupees(8_000), date: istDate(2026, 9, 2), note: null },
  ];

  for (const contribution of sharedContributions) {
    await db.goalContribution.create({ data: contribution });
    await db.goal.update({
      where: { id: contribution.goalId },
      data: { currentAmountMinor: { increment: contribution.amountMinor } },
    });
  }

  await db.recurringTransaction.createMany({
    data: [
      {
        userId: primary.id, workspaceId: workspace.id, scopeKey: sharedScope,
        merchant: 'Rent', amountMinor: rupees(15_000), currency: 'INR', type: 'EXPENSE',
        frequency: 'MONTHLY', categoryId: cat('housing'), paymentMethod: 'BANK_TRANSFER',
        startDate: istDate(2026, 7, 1), nextDate: istDate(2026, 10, 1), active: true,
      },
      {
        userId: partner.id, workspaceId: workspace.id, scopeKey: sharedScope,
        merchant: 'House help', amountMinor: rupees(3_500), currency: 'INR', type: 'EXPENSE',
        frequency: 'MONTHLY', categoryId: cat('housing'), paymentMethod: 'CASH',
        startDate: istDate(2026, 7, 5), nextDate: istDate(2026, 10, 5), active: true,
      },
    ],
  });

  /* --- Activity feed ----------------------------------------------------- */

  const activities: {
    actorId: string;
    action: string;
    entityType: string;
    metadata: Record<string, unknown>;
    createdAt: Date;
  }[] = [
    {
      actorId: primary.id, action: 'WORKSPACE_CREATED', entityType: 'workspace',
      metadata: { label: 'Our Finances' }, createdAt: istDate(2026, 6, 1, 20, 12),
    },
    {
      actorId: primary.id, action: 'MEMBER_INVITED', entityType: 'invitation',
      metadata: { label: PARTNER.email, memberName: PARTNER.name }, createdAt: istDate(2026, 6, 1, 20, 15),
    },
    {
      actorId: partner.id, action: 'MEMBER_JOINED', entityType: 'member',
      metadata: { memberName: PARTNER.name }, createdAt: istDate(2026, 6, 2, 9, 4),
    },
    {
      actorId: primary.id, action: 'GOAL_CREATED', entityType: 'goal',
      metadata: { label: 'Goa Trip', amountMinor: rupees(50_000), currency: 'INR' },
      createdAt: istDate(2026, 6, 12, 21, 30),
    },
    {
      actorId: partner.id, action: 'GOAL_CONTRIBUTION_ADDED', entityType: 'goal',
      metadata: { label: 'Goa Trip', amountMinor: rupees(5_000), currency: 'INR' },
      createdAt: istDate(2026, 8, 28, 18, 40),
    },
    {
      actorId: partner.id, action: 'TRANSACTION_CREATED', entityType: 'transaction',
      metadata: { label: 'Goa flights (advance)', amountMinor: rupees(5_000), currency: 'INR', categoryName: 'Travel' },
      createdAt: istDate(2026, 8, 24, 15, 2),
    },
    {
      actorId: primary.id, action: 'BUDGET_CREATED', entityType: 'budget',
      metadata: { label: 'September 2026', amountMinor: rupees(50_000), currency: 'INR' },
      createdAt: istDate(2026, 9, 1, 8, 10),
    },
    {
      actorId: primary.id, action: 'BUDGET_UPDATED', entityType: 'budget',
      metadata: {
        label: 'September 2026', categoryName: 'Travel', currency: 'INR',
        previousAmountMinor: rupees(3_000), newAmountMinor: rupees(4_000),
      },
      createdAt: istDate(2026, 9, 3, 12, 25),
    },
    {
      actorId: primary.id, action: 'GOAL_CONTRIBUTION_ADDED', entityType: 'goal',
      metadata: { label: 'Goa Trip', amountMinor: rupees(2_500), currency: 'INR' },
      createdAt: istDate(2026, 9, 6, 19, 15),
    },
    {
      actorId: partner.id, action: 'GOAL_CONTRIBUTION_ADDED', entityType: 'goal',
      metadata: { label: 'New Laptop', amountMinor: rupees(8_000), currency: 'INR' },
      createdAt: istDate(2026, 9, 2, 11, 0),
    },
  ];

  for (const activity of activities) {
    await db.activity.create({
      data: {
        workspaceId: workspace.id,
        actorId: activity.actorId,
        // The seed writes the same enum values the app does.
        action: activity.action as never,
        entityType: activity.entityType,
        metadata: activity.metadata as never,
        createdAt: activity.createdAt,
      },
    });
  }

  await db.notification.createMany({
    data: [
      {
        userId: primary.id, workspaceId: workspace.id, type: 'SHARED_GOAL_CONTRIBUTION',
        title: `${PARTNER.name} contributed to New Laptop`,
        message: '₹8,000 added · now ₹45,000 saved', href: '/shared/goals',
        read: false, createdAt: istDate(2026, 9, 2, 11, 0),
      },
      {
        userId: primary.id, workspaceId: workspace.id, type: 'SHARED_TRANSACTION',
        title: `${PARTNER.name} added an expense`,
        message: '₹15,000 · Rent', href: '/shared/transactions',
        read: false, createdAt: istDate(2026, 9, 1, 10, 2),
      },
    ],
  });

  console.log(`· shared workspace "Our Finances" with ${sharedRows.length} transactions`);
  console.log('');
  console.log('  Sign in with either account:');
  console.log(`    ${PRIMARY.email}  /  ${DEMO_PASSWORD}`);
  console.log(`    ${PARTNER.email}  /  ${DEMO_PASSWORD}`);
  console.log('');
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (error) => {
    console.error('seed failed:', error);
    await db.$disconnect();
    process.exit(1);
  });
