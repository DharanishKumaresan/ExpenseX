import { z } from 'zod';
import {
  CURRENCY_CODES,
  MAX_AMOUNT_MINOR,
  tryParseMoneyToMinor,
  type CurrencyCode,
} from './money';
import { fromDateTimeInputs } from './date';

/**
 * Every mutation validates through this module — the same schemas run on the
 * client for instant feedback and on the server as the authority. The server
 * never trusts that the client ran them.
 */

const trimmed = (max: number) => z.string().trim().max(max);

/**
 * Optional free text, normalised to `null` when blank.
 *
 * Nullish for the same reason as `optionalCuid`: one action's normalised
 * output is another action's input, so the schema has to accept what it emits.
 */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value && value.length > 0 ? value : null));

export const emailSchema = z
  .string()
  .trim()
  .min(3, 'Enter your email address.')
  .max(254, 'That email address is too long.')
  .email('Enter a valid email address.')
  .transform((value) => value.toLowerCase());

export const nameSchema = trimmed(80)
  .min(1, 'Enter your name.')
  .refine((value) => /\p{L}/u.test(value), 'Enter a valid name.');

export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(200, 'That password is too long.');

export const currencySchema = z
  .enum(CURRENCY_CODES as [CurrencyCode, ...CurrencyCode[]])
  .describe('ISO 4217 currency code');

/**
 * A money field arriving from a form. Parsed exactly (never via parseFloat)
 * and returned as integer minor units.
 */
export function moneyField(options: { currencyKey?: string; allowZero?: boolean; label?: string } = {}) {
  const label = options.label ?? 'amount';
  return z
    .union([z.string(), z.number()])
    .transform((value, ctx) => {
      const parsed = tryParseMoneyToMinor(value, 'INR');
      if (!parsed.ok) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: parsed.error });
        return z.NEVER;
      }
      return parsed.minor;
    })
    .refine((minor) => options.allowZero || minor > 0, `Enter an ${label} greater than zero.`)
    .refine((minor) => minor <= MAX_AMOUNT_MINOR, 'That amount is too large.');
}

/**
 * Re-parse a minor-unit value against the scope's real currency. Currencies
 * differ in decimal places (JPY has none), so the final authority is the
 * currency the server resolved, not one the client claimed.
 */
export function reparseMoney(raw: string | number, currency: string): { ok: true; minor: number } | { ok: false; error: string } {
  return tryParseMoneyToMinor(raw, currency);
}

const dateInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid date.');

const timeInput = z
  .string()
  .regex(/^\d{1,2}:\d{2}$/, 'Choose a valid time.')
  .nullish()
  .or(z.literal(''));

export const cuidSchema = z.string().trim().min(1).max(64);

/**
 * An optional id reference.
 *
 * `.nullish()` rather than `.optional()` on purpose: these schemas normalise a
 * missing id to `null`, and that normalised value is fed back through the same
 * schema when one action delegates to another (quick-add → createTransaction).
 * Accepting only `undefined` would make the second parse reject the first
 * parse's own output.
 */
export const optionalCuid = z
  .string()
  .trim()
  .max(64)
  .nullish()
  .transform((value) => (value && value.length > 0 ? value : null));

/* ------------------------------------------------------------------------ */
/* Auth                                                                      */
/* ------------------------------------------------------------------------ */

export const signUpSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.').max(200),
  next: z.string().max(500).optional(),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'The two passwords do not match.',
    path: ['confirmPassword'],
  });

/* ------------------------------------------------------------------------ */
/* Transactions                                                              */
/* ------------------------------------------------------------------------ */

export const transactionTypeSchema = z.enum(['EXPENSE', 'INCOME', 'TRANSFER']);
export const paymentMethodSchema = z.enum([
  'CASH', 'UPI', 'DEBIT_CARD', 'CREDIT_CARD', 'BANK_TRANSFER', 'OTHER',
]);

export const PAYMENT_METHOD_LABELS: Record<z.infer<typeof paymentMethodSchema>, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  DEBIT_CARD: 'Debit Card',
  CREDIT_CARD: 'Credit Card',
  BANK_TRANSFER: 'Bank Transfer',
  OTHER: 'Other',
};

export const TRANSACTION_TYPE_LABELS: Record<z.infer<typeof transactionTypeSchema>, string> = {
  EXPENSE: 'Expense',
  INCOME: 'Income',
  TRANSFER: 'Transfer',
};

const transactionBase = z.object({
  workspaceId: optionalCuid,
  type: transactionTypeSchema.default('EXPENSE'),
  amount: z.union([z.string(), z.number()]),
  merchant: trimmed(80).min(1, 'Add a merchant or description.'),
  categoryId: optionalCuid,
  accountId: optionalCuid,
  paymentMethod: paymentMethodSchema.default('UPI'),
  paidByUserId: optionalCuid,
  date: dateInput,
  time: timeInput,
  notes: optionalText(500),
  tags: z
    .array(trimmed(24).min(1))
    .max(8, 'Up to 8 tags.')
    .optional()
    .transform((value) => value ?? []),
});

export const createTransactionSchema = transactionBase.superRefine((data, ctx) => {
  if (!fromDateTimeInputs(data.date, data.time || null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose a valid date.', path: ['date'] });
  }
});

export const updateTransactionSchema = transactionBase.extend({
  id: cuidSchema,
  /** Optimistic-concurrency token read when the form was opened. */
  version: z.coerce.number().int().positive(),
});

export const deleteTransactionSchema = z.object({
  id: cuidSchema,
  workspaceId: optionalCuid,
});

/** The one-handed mobile flow: amount, category, merchant, today. */
export const quickExpenseSchema = z.object({
  workspaceId: optionalCuid,
  amount: z.union([z.string(), z.number()]),
  merchant: trimmed(80).min(1, 'What was it for?'),
  categoryId: optionalCuid,
  paidByUserId: optionalCuid,
  date: dateInput,
});

/* ------------------------------------------------------------------------ */
/* Budgets                                                                   */
/* ------------------------------------------------------------------------ */

export const budgetAllocationSchema = z.object({
  categoryId: cuidSchema,
  amount: z.union([z.string(), z.number()]),
});

export const saveBudgetSchema = z.object({
  workspaceId: optionalCuid,
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2200),
  total: z.union([z.string(), z.number()]),
  allocations: z.array(budgetAllocationSchema).max(40, 'Too many categories.').default([]),
  /** Present when editing; absent when creating. */
  version: z.coerce.number().int().positive().optional(),
});

export const deleteBudgetSchema = z.object({
  id: cuidSchema,
  workspaceId: optionalCuid,
});

/* ------------------------------------------------------------------------ */
/* Goals                                                                     */
/* ------------------------------------------------------------------------ */

export const goalThemeSchema = z.enum(['sage', 'yellow', 'coral', 'forest']);

export const createGoalSchema = z.object({
  workspaceId: optionalCuid,
  name: trimmed(60).min(1, 'Name your goal.'),
  target: z.union([z.string(), z.number()]),
  deadline: dateInput.optional().or(z.literal('')),
  theme: goalThemeSchema.default('sage'),
  icon: optionalText(24),
  /** Optional starting balance recorded as the first contribution. */
  initial: z.union([z.string(), z.number()]).optional(),
});

export const updateGoalSchema = z.object({
  id: cuidSchema,
  workspaceId: optionalCuid,
  name: trimmed(60).min(1, 'Name your goal.'),
  target: z.union([z.string(), z.number()]),
  deadline: dateInput.optional().or(z.literal('')),
  theme: goalThemeSchema,
  version: z.coerce.number().int().positive(),
});

export const contributeSchema = z.object({
  goalId: cuidSchema,
  workspaceId: optionalCuid,
  amount: z.union([z.string(), z.number()]),
  /** Only meaningful in a shared space; must be a member. */
  contributorId: optionalCuid,
  note: optionalText(140),
});

export const deleteGoalSchema = z.object({
  id: cuidSchema,
  workspaceId: optionalCuid,
});

/* ------------------------------------------------------------------------ */
/* Recurring                                                                 */
/* ------------------------------------------------------------------------ */

export const frequencySchema = z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']);

export const FREQUENCY_LABELS: Record<z.infer<typeof frequencySchema>, string> = {
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  YEARLY: 'Yearly',
};

/** Payments per year, used to normalise commitments to monthly/yearly totals. */
export const FREQUENCY_PER_YEAR: Record<z.infer<typeof frequencySchema>, number> = {
  WEEKLY: 52,
  MONTHLY: 12,
  QUARTERLY: 4,
  YEARLY: 1,
};

export const saveRecurringSchema = z.object({
  id: cuidSchema.optional(),
  workspaceId: optionalCuid,
  merchant: trimmed(80).min(1, 'Name this commitment.'),
  amount: z.union([z.string(), z.number()]),
  type: transactionTypeSchema.default('EXPENSE'),
  frequency: frequencySchema.default('MONTHLY'),
  categoryId: optionalCuid,
  accountId: optionalCuid,
  paymentMethod: paymentMethodSchema.default('UPI'),
  nextDate: dateInput,
  notes: optionalText(300),
});

export const recurringIdSchema = z.object({
  id: cuidSchema,
  workspaceId: optionalCuid,
});

/* ------------------------------------------------------------------------ */
/* Categories, accounts                                                      */
/* ------------------------------------------------------------------------ */

export const createCategorySchema = z.object({
  name: trimmed(32).min(1, 'Name the category.'),
  kind: z.enum(['EXPENSE', 'INCOME', 'BOTH']).default('EXPENSE'),
});

export const saveAccountSchema = z.object({
  id: cuidSchema.optional(),
  name: trimmed(40).min(1, 'Name the account.'),
  type: z.enum(['CASH', 'BANK', 'WALLET', 'CREDIT_CARD', 'SAVINGS']).default('BANK'),
  last4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'Enter the last 4 digits.')
    .optional()
    .or(z.literal('')),
  openingBalance: z.union([z.string(), z.number()]).optional(),
});

/* ------------------------------------------------------------------------ */
/* Shared workspaces                                                         */
/* ------------------------------------------------------------------------ */

export const createWorkspaceSchema = z.object({
  name: trimmed(50).min(1, 'Name your shared space.'),
  description: optionalText(160),
  currency: currencySchema.default('INR'),
});

export const updateWorkspaceSchema = z.object({
  workspaceId: cuidSchema,
  name: trimmed(50).min(1, 'Name your shared space.'),
  description: optionalText(160),
  currency: currencySchema,
});

export const inviteSchema = z.object({
  workspaceId: cuidSchema,
  email: emailSchema,
});

export const invitationResponseSchema = z.object({
  invitationId: cuidSchema,
  accept: z.boolean(),
});

export const memberActionSchema = z.object({
  workspaceId: cuidSchema,
  memberUserId: cuidSchema,
});

/* ------------------------------------------------------------------------ */
/* Settings                                                                  */
/* ------------------------------------------------------------------------ */

export const updateProfileSchema = z.object({
  name: nameSchema,
  currency: currencySchema,
});

export const updateThemeSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
});

export const notificationPrefsSchema = z.object({
  sharedTransactions: z.coerce.boolean().default(false),
  sharedBudgets: z.coerce.boolean().default(false),
  sharedGoals: z.coerce.boolean().default(false),
  budgetWarnings: z.coerce.boolean().default(false),
  membership: z.coerce.boolean().default(false),
});

/* ------------------------------------------------------------------------ */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------ */

/** Flatten a ZodError into the `{ field: message }` shape actions return. */
export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}

export function firstErrorMessage(error: z.ZodError, fallback = 'Please check the form.'): string {
  return error.issues[0]?.message ?? fallback;
}
