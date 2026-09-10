'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../db';
import { requireUser } from '../scope';
import { actionFailure, invalid, type ActionResult } from '../errors';
import { destroyAllSessions } from '../auth/session';
import { createSession } from '../auth/session';
import { hashPassword, verifyPassword, checkPasswordStrength } from '../auth/password';
import {
  changePasswordSchema,
  createCategorySchema,
  fieldErrorsFrom,
  notificationPrefsSchema,
  saveAccountSchema,
  updateProfileSchema,
  updateThemeSchema,
} from '@/lib/validation';
import { slugify } from '@/lib/categories';
import { parseMoneyToMinor } from '@/lib/money';

/**
 * Profile, appearance, accounts, categories and notification preferences.
 * Every action re-derives the acting user from the session cookie.
 */

export async function saveTheme(theme: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const parsed = updateThemeSchema.safeParse({ theme });
    if (!parsed.success) throw invalid('Unknown theme.');

    await db.user.update({ where: { id: user.id }, data: { theme: parsed.data.theme } });
    return { ok: true };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const parsed = updateProfileSchema.safeParse({
      name: formData.get('name'),
      currency: formData.get('currency'),
    });
    if (!parsed.success) {
      throw invalid('Please check the form.', fieldErrorsFrom(parsed.error));
    }

    await db.user.update({
      where: { id: user.id },
      data: { name: parsed.data.name, currency: parsed.data.currency },
    });

    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function changePassword(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const parsed = changePasswordSchema.safeParse({
      currentPassword: formData.get('currentPassword'),
      newPassword: formData.get('newPassword'),
      confirmPassword: formData.get('confirmPassword'),
    });
    if (!parsed.success) {
      throw invalid('Please check the form.', fieldErrorsFrom(parsed.error));
    }

    const record = await db.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true, email: true },
    });
    if (!record) throw invalid('Please sign in again.');

    const valid = await verifyPassword(parsed.data.currentPassword, record.passwordHash);
    if (!valid) {
      throw invalid('That is not your current password.', {
        currentPassword: 'That is not your current password.',
      });
    }

    const strength = checkPasswordStrength(parsed.data.newPassword, record.email);
    if (!strength.ok) {
      throw invalid(strength.message ?? 'Choose a stronger password.', {
        newPassword: strength.message ?? 'Choose a stronger password.',
      });
    }

    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(parsed.data.newPassword) },
    });

    // A password change ends every existing session, then re-establishes one
    // for the device that made the change.
    await destroyAllSessions(user.id);
    await createSession(user.id);

    return { ok: true };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function saveNotificationPreferences(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const parsed = notificationPrefsSchema.safeParse({
      sharedTransactions: formData.get('sharedTransactions') === 'on',
      sharedBudgets: formData.get('sharedBudgets') === 'on',
      sharedGoals: formData.get('sharedGoals') === 'on',
      budgetWarnings: formData.get('budgetWarnings') === 'on',
      membership: formData.get('membership') === 'on',
    });
    if (!parsed.success) throw invalid('Please check the form.');

    await db.notificationPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...parsed.data },
      update: parsed.data,
    });

    revalidatePath('/settings');
    return { ok: true };
  } catch (error) {
    return actionFailure(error);
  }
}

/* ------------------------------------------------------------------------ */
/* Accounts                                                                  */
/* ------------------------------------------------------------------------ */

export async function saveAccount(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const id = (formData.get('id') as string | null) || undefined;
    const parsed = saveAccountSchema.safeParse({
      id,
      name: formData.get('name'),
      type: formData.get('type'),
      last4: formData.get('last4') ?? '',
      openingBalance: formData.get('openingBalance') ?? '0',
    });
    if (!parsed.success) {
      throw invalid('Please check the form.', fieldErrorsFrom(parsed.error));
    }

    const openingBalanceMinor = parsed.data.openingBalance
      ? parseMoneyToMinor(parsed.data.openingBalance, user.currency)
      : 0;
    const last4 = parsed.data.last4 && parsed.data.last4.length === 4 ? parsed.data.last4 : null;

    if (parsed.data.id) {
      // updateMany with userId in the filter: an id belonging to someone else
      // updates zero rows rather than throwing after the fact.
      const result = await db.account.updateMany({
        where: { id: parsed.data.id, userId: user.id },
        data: { name: parsed.data.name, type: parsed.data.type, last4, openingBalanceMinor },
      });
      if (result.count === 0) throw invalid('That account no longer exists.');
    } else {
      const existing = await db.account.count({ where: { userId: user.id, archived: false } });
      if (existing >= 20) throw invalid('You can keep up to 20 accounts.');

      await db.account.create({
        data: {
          userId: user.id,
          name: parsed.data.name,
          type: parsed.data.type,
          last4,
          openingBalanceMinor,
          isDefault: existing === 0,
        },
      });
    }

    revalidatePath('/settings');
    revalidatePath('/transactions');
    return { ok: true };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function archiveAccount(accountId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const result = await db.account.updateMany({
      where: { id: accountId, userId: user.id },
      data: { archived: true, isDefault: false },
    });
    if (result.count === 0) throw invalid('That account no longer exists.');

    revalidatePath('/settings');
    return { ok: true };
  } catch (error) {
    return actionFailure(error);
  }
}

/* ------------------------------------------------------------------------ */
/* Custom categories                                                         */
/* ------------------------------------------------------------------------ */

export async function createCategory(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const parsed = createCategorySchema.safeParse({
      name: formData.get('name'),
      kind: formData.get('kind') ?? 'EXPENSE',
    });
    if (!parsed.success) {
      throw invalid('Please check the form.', fieldErrorsFrom(parsed.error));
    }

    const slug = slugify(parsed.data.name);
    if (!slug) throw invalid('Use letters or numbers in the category name.');

    const clash = await db.category.findFirst({
      where: { slug, OR: [{ userId: null }, { userId: user.id }] },
      select: { id: true },
    });
    if (clash) throw invalid('You already have a category with that name.', { name: 'Already exists.' });

    const count = await db.category.count({ where: { userId: user.id } });
    if (count >= 40) throw invalid('You can add up to 40 custom categories.');

    const created = await db.category.create({
      data: { name: parsed.data.name, slug, kind: parsed.data.kind, userId: user.id, sortOrder: 500 },
      select: { id: true },
    });

    revalidatePath('/settings');
    revalidatePath('/budgets');
    return { ok: true, data: { id: created.id } };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function deleteCategory(categoryId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();

    const inUse = await db.transaction.count({ where: { categoryId, userId: user.id } });
    if (inUse > 0) {
      throw invalid(
        `That category is used by ${inUse} transaction${inUse === 1 ? '' : 's'}. Recategorise them first.`,
      );
    }

    // userId in the filter means system categories can never be deleted.
    const result = await db.category.deleteMany({ where: { id: categoryId, userId: user.id } });
    if (result.count === 0) throw invalid('That category cannot be removed.');

    revalidatePath('/settings');
    return { ok: true };
  } catch (error) {
    return actionFailure(error);
  }
}

/* ------------------------------------------------------------------------ */
/* Notifications                                                             */
/* ------------------------------------------------------------------------ */

export async function markNotificationsRead(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await db.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    });
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (error) {
    return actionFailure(error);
  }
}
