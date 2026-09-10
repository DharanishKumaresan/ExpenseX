'use server';

import { redirect } from 'next/navigation';
import { db, isPrismaError, PRISMA_ERROR } from '../db';
import { actionFailure, invalid, type ActionResult } from '../errors';
import { createSession, destroySession, getCurrentUser } from '../auth/session';
import { checkPasswordStrength, fakeVerifyDelay, hashPassword, verifyPassword } from '../auth/password';
import { enforce, reset } from '../rate-limit';
import { fieldErrorsFrom, signInSchema, signUpSchema } from '@/lib/validation';
import { CATEGORY_PRESETS } from '@/lib/categories';

/**
 * Authentication.
 *
 * Sign-in never reveals whether an email exists: the same message and roughly
 * the same response time come back either way. Both entry points are rate
 * limited per IP.
 */

/** Only relative in-app paths are honoured, so `?next=` cannot bounce off-site. */
function safeRedirect(next: string | undefined | null): string {
  if (!next) return '/overview';
  if (!next.startsWith('/') || next.startsWith('//')) return '/overview';
  return next;
}

export async function signUp(formData: FormData): Promise<ActionResult<{ redirectTo: string }>> {
  try {
    await enforce('signup');

    const parsed = signUpSchema.safeParse({
      name: formData.get('name'),
      email: formData.get('email'),
      password: formData.get('password'),
    });
    if (!parsed.success) {
      throw invalid('Please check the form.', fieldErrorsFrom(parsed.error));
    }

    const { name, email, password } = parsed.data;

    const strength = checkPasswordStrength(password, email);
    if (!strength.ok) {
      throw invalid(strength.message ?? 'Choose a stronger password.', {
        password: strength.message ?? 'Choose a stronger password.',
      });
    }

    const passwordHash = await hashPassword(password);

    let userId: string;
    try {
      const user = await db.user.create({
        data: {
          name,
          email,
          passwordHash,
          notificationPrefs: { create: {} },
          // A brand-new account gets one cash account so the first expense
          // has somewhere to land without a settings detour.
          accounts: { create: { name: 'Cash', type: 'CASH', isDefault: true } },
        },
        select: { id: true },
      });
      userId = user.id;
    } catch (error) {
      if (isPrismaError(error, PRISMA_ERROR.UNIQUE_VIOLATION)) {
        throw invalid('An account already exists for that email.', {
          email: 'An account already exists for that email.',
        });
      }
      throw error;
    }

    await ensureSystemCategories();
    await createSession(userId);
    await reset('signup');

    return { ok: true, data: { redirectTo: '/overview' } };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function signIn(formData: FormData): Promise<ActionResult<{ redirectTo: string }>> {
  try {
    const emailRaw = String(formData.get('email') ?? '').toLowerCase().trim();
    await enforce('login', emailRaw);

    const parsed = signInSchema.safeParse({
      email: formData.get('email'),
      password: formData.get('password'),
      next: formData.get('next') ?? undefined,
    });
    if (!parsed.success) {
      throw invalid('Enter your email and password.', fieldErrorsFrom(parsed.error));
    }

    const user = await db.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      // Spend a comparable amount of time so timing does not disclose that
      // this email is unregistered.
      await fakeVerifyDelay();
      throw invalid('That email and password do not match.');
    }

    const valid = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!valid) throw invalid('That email and password do not match.');

    await createSession(user.id);
    await reset('login', parsed.data.email);

    return { ok: true, data: { redirectTo: safeRedirect(parsed.data.next) } };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function signOut(): Promise<void> {
  await destroySession();
  redirect('/login');
}

/**
 * Seed the shared system categories once. Runs on first sign-up rather than
 * requiring the seed script, so a fresh deployment is usable immediately.
 */
async function ensureSystemCategories(): Promise<void> {
  const existing = await db.category.count({ where: { userId: null } });
  if (existing >= CATEGORY_PRESETS.length) return;

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
}

/** Used by the auth pages to bounce an already-signed-in visitor. */
export async function redirectIfSignedIn(): Promise<void> {
  const user = await getCurrentUser();
  if (user) redirect('/overview');
}
