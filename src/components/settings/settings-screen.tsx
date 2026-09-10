'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Toggle } from '@/components/ui/field';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { Badge, ErrorNote, RuleLabel } from '@/components/ui/primitives';
import { Money } from '@/components/ui/money-display';
import { ThemeToggle } from '@/components/shell/theme-toggle';
import { useToast } from '@/components/ui/toast';
import {
  archiveAccount,
  changePassword,
  createCategory,
  deleteCategory,
  saveAccount,
  saveNotificationPreferences,
  updateProfile,
} from '@/server/actions/settings';
import { CURRENCIES, CURRENCY_CODES } from '@/lib/money';
import { pluralise } from '@/lib/utils';

/**
 * Settings.
 *
 * Grouped by what the user is actually trying to change — who they are, how it
 * looks, where money lives, how it is categorised, and what they hear about.
 */

interface AccountView {
  id: string;
  name: string;
  type: string;
  last4: string | null;
  balanceMinor: number;
}

const ACCOUNT_TYPES = [
  { value: 'BANK', label: 'Bank' },
  { value: 'SAVINGS', label: 'Savings' },
  { value: 'CASH', label: 'Cash' },
  { value: 'WALLET', label: 'Wallet' },
  { value: 'CREDIT_CARD', label: 'Credit card' },
];

export function SettingsScreen({
  user,
  accounts,
  customCategories,
  preferences,
  sessionCount,
}: {
  user: { name: string; email: string; currency: string };
  accounts: AccountView[];
  customCategories: { id: string; name: string; kind: string }[];
  preferences: Record<string, boolean>;
  sessionCount: number;
}) {
  return (
    <div className="flex flex-col gap-12">
      <header>
        <h1 className="text-[1.75rem] leading-[1.02] font-semibold tracking-[-0.03em] sm:text-[2.25rem]">
          <span className="block font-normal text-ink-faint">Your</span>
          <span className="block font-bold text-ink">Settings</span>
        </h1>
      </header>

      <ProfileSection user={user} />

      <section className="flex max-w-xl flex-col gap-5">
        <RuleLabel>Appearance</RuleLabel>
        <ThemeToggle />
      </section>

      <AccountsSection accounts={accounts} currency={user.currency} />
      <CategoriesSection categories={customCategories} />
      <NotificationsSection preferences={preferences} />
      <SecuritySection sessionCount={sessionCount} />
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function ProfileSection({ user }: { user: { name: string; email: string; currency: string } }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);

    startTransition(async () => {
      const result = await updateProfile(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast({ title: 'Profile updated', tone: 'success' });
      router.refresh();
    });
  };

  return (
    <section className="flex max-w-xl flex-col gap-5">
      <RuleLabel>Profile</RuleLabel>

      <form onSubmit={submit} className="flex flex-col gap-4">
        {error ? <ErrorNote title="Could not save" message={error} /> : null}

        <Field label="Name" htmlFor="profile-name" required>
          <Input id="profile-name" name="name" defaultValue={user.name} maxLength={80} required />
        </Field>

        <Field label="Email" htmlFor="profile-email" hint="Your email cannot be changed in this build.">
          <Input id="profile-email" value={user.email} disabled readOnly />
        </Field>

        <Field
          label="Default currency"
          htmlFor="profile-currency"
          hint="Applies to your personal finances. Shared spaces carry their own currency."
        >
          <Select id="profile-currency" name="currency" defaultValue={user.currency}>
            {CURRENCY_CODES.map((code) => (
              <option key={code} value={code}>
                {CURRENCIES[code].label} ({CURRENCIES[code].symbol})
              </option>
            ))}
          </Select>
        </Field>

        <div className="pt-1">
          <Button type="submit" loading={pending}>
            Save profile
          </Button>
        </div>
      </form>
    </section>
  );
}

/* ------------------------------------------------------------------------ */

function AccountsSection({ accounts, currency }: { accounts: AccountView[]; currency: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AccountView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (editing) formData.set('id', editing.id);
    setError(null);

    startTransition(async () => {
      const result = await saveAccount(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast({ title: editing ? 'Account updated' : 'Account added', tone: 'success' });
      setOpen(false);
      setEditing(null);
      router.refresh();
    });
  };

  const archive = (id: string) => {
    startTransition(async () => {
      const result = await archiveAccount(id);
      setConfirmId(null);
      if (!result.ok) {
        toast({ title: 'Could not remove', description: result.error, tone: 'error' });
        return;
      }
      toast({ title: 'Account removed', tone: 'success' });
      router.refresh();
    });
  };

  return (
    <section className="flex max-w-xl flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <RuleLabel>Accounts</RuleLabel>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
          className="shrink-0 font-mono text-[0.625rem] tracking-[0.12em] uppercase text-ink-3 transition-colors hover:text-ink"
        >
          + Add account
        </button>
      </div>

      {accounts.length === 0 ? (
        <p className="text-[0.875rem] text-ink-3">
          No accounts yet. Add one to track balances alongside your spending.
        </p>
      ) : (
        <ul className="flex flex-col">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="flex items-center gap-3 border-b border-line-faint py-3.5 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.9375rem] font-semibold text-ink">
                  {account.name}
                  {account.last4 ? <span className="text-ink-3"> ···· {account.last4}</span> : null}
                </p>
                <p className="ex-label mt-1">{account.type.replace('_', ' ')}</p>
              </div>

              <Money
                minor={account.balanceMinor}
                currency={currency}
                size="sm"
                hideFraction
                className={account.balanceMinor < 0 ? 'text-coral' : 'text-ink'}
              />

              <button
                type="button"
                onClick={() => {
                  setEditing(account);
                  setOpen(true);
                }}
                className="h-9 shrink-0 rounded-[7px] border border-line px-3 font-mono text-[0.625rem] tracking-[0.12em] uppercase text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setConfirmId(account.id)}
                aria-label={`Remove ${account.name}`}
                className="grid size-9 shrink-0 place-items-center rounded-[7px] text-ink-3 transition-colors hover:bg-coral/10 hover:text-coral"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.2h5.8l.6-8.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit account' : 'Add account'}
        eyebrow="Where money lives"
        size="sm"
      >
        <form onSubmit={submit} className="flex flex-col gap-5">
          {error ? <ErrorNote title="Could not save" message={error} /> : null}

          <Field label="Name" htmlFor="account-name" required>
            <Input
              id="account-name"
              name="name"
              defaultValue={editing?.name ?? ''}
              placeholder="HDFC Savings"
              maxLength={40}
              required
            />
          </Field>

          <Field label="Type" htmlFor="account-type">
            <Select id="account-type" name="type" defaultValue={editing?.type ?? 'BANK'}>
              {ACCOUNT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Last 4 digits" htmlFor="account-last4" hint="Optional. Shown on transaction details.">
            <Input
              id="account-last4"
              name="last4"
              defaultValue={editing?.last4 ?? ''}
              inputMode="numeric"
              maxLength={4}
              placeholder="8904"
            />
          </Field>

          {!editing ? (
            <Field label="Opening balance" htmlFor="account-balance" hint="Optional.">
              <Input id="account-balance" name="openingBalance" inputMode="decimal" placeholder="0" />
            </Field>
          ) : null}

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {editing ? 'Save' : 'Add account'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmId !== null}
        onClose={() => setConfirmId(null)}
        onConfirm={() => confirmId && archive(confirmId)}
        pending={pending}
        title="Remove this account?"
        message="Transactions linked to it are kept, but they will no longer show an account. This cannot be undone."
        confirmLabel="Remove"
      />
    </section>
  );
}

/* ------------------------------------------------------------------------ */

function CategoriesSection({ categories }: { categories: { id: string; name: string; kind: string }[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const formData = new FormData();
    formData.set('name', name);
    formData.set('kind', 'EXPENSE');

    startTransition(async () => {
      const result = await createCategory(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setName('');
      toast({ title: 'Category added', tone: 'success' });
      router.refresh();
    });
  };

  const remove = (id: string, label: string) => {
    startTransition(async () => {
      const result = await deleteCategory(id);
      if (!result.ok) {
        toast({ title: 'Could not remove', description: result.error, tone: 'error' });
        return;
      }
      toast({ title: 'Category removed', description: label, tone: 'success' });
      router.refresh();
    });
  };

  return (
    <section className="flex max-w-xl flex-col gap-5">
      <RuleLabel>Custom categories</RuleLabel>

      <p className="text-[0.875rem] leading-snug text-ink-3">
        The built-in categories are always available. Add your own for anything they miss.
      </p>

      <form onSubmit={add} className="flex flex-col gap-3">
        {error ? <ErrorNote title="Could not add" message={error} /> : null}
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Pet care"
            maxLength={32}
            aria-label="New category name"
          />
          <Button type="submit" loading={pending} className="shrink-0">
            Add
          </Button>
        </div>
      </form>

      {categories.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <li key={category.id}>
              <span className="inline-flex items-center gap-2 rounded-[6px] border border-line bg-surface-3 py-1.5 pr-1.5 pl-3">
                <span className="text-[0.8125rem] font-medium text-ink">{category.name}</span>
                <button
                  type="button"
                  onClick={() => remove(category.id, category.name)}
                  aria-label={`Remove ${category.name}`}
                  className="grid size-5 place-items-center rounded-[4px] text-ink-3 transition-colors hover:bg-coral/15 hover:text-coral"
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
                    <path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------------ */

function NotificationsSection({ preferences }: { preferences: Record<string, boolean> }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await saveNotificationPreferences(formData);
      if (!result.ok) {
        toast({ title: 'Could not save', description: result.error, tone: 'error' });
        return;
      }
      toast({ title: 'Preferences saved', tone: 'success' });
      router.refresh();
    });
  };

  return (
    <section className="flex max-w-xl flex-col gap-4">
      <RuleLabel>Notifications</RuleLabel>

      <form onSubmit={submit} className="flex flex-col">
        <div className="divide-y divide-line-faint">
          <Toggle
            name="sharedTransactions"
            defaultChecked={preferences.sharedTransactions}
            label="Shared expenses"
            description="When the other person adds or edits a shared transaction."
          />
          <Toggle
            name="sharedBudgets"
            defaultChecked={preferences.sharedBudgets}
            label="Shared budget changes"
            description="When the shared budget or an allocation is changed."
          />
          <Toggle
            name="budgetWarnings"
            defaultChecked={preferences.budgetWarnings}
            label="Budget overruns"
            description="When a shared category goes past its allocation."
          />
          <Toggle
            name="sharedGoals"
            defaultChecked={preferences.sharedGoals}
            label="Shared goals"
            description="New shared goals and contributions towards them."
          />
          <Toggle
            name="membership"
            defaultChecked={preferences.membership}
            label="Invitations and membership"
            description="Invitations, joins, and changes to who is in a shared space."
          />
        </div>

        <div className="pt-4">
          <Button type="submit" loading={pending}>
            Save preferences
          </Button>
        </div>
      </form>
    </section>
  );
}

/* ------------------------------------------------------------------------ */

function SecuritySection({ sessionCount }: { sessionCount: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await changePassword(formData);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      form.reset();
      toast({
        title: 'Password changed',
        description: 'Every other device has been signed out.',
        tone: 'success',
      });
      router.refresh();
    });
  };

  return (
    <section className="flex max-w-xl flex-col gap-5">
      <RuleLabel>Security</RuleLabel>

      <p className="flex items-center gap-2 text-[0.875rem] text-ink-3">
        <Badge tone="outline">{sessionCount}</Badge>
        active {pluralise(sessionCount, 'session')}. Changing your password signs out all of them.
      </p>

      <form onSubmit={submit} className="flex flex-col gap-4">
        {error ? <ErrorNote title="Could not change password" message={error} /> : null}

        <Field
          label="Current password"
          htmlFor="current-password"
          required
          error={fieldErrors.currentPassword}
        >
          <Input
            id="current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>

        <Field
          label="New password"
          htmlFor="new-password"
          required
          hint="At least 10 characters."
          error={fieldErrors.newPassword}
        >
          <Input
            id="new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
          />
        </Field>

        <Field
          label="Confirm new password"
          htmlFor="confirm-password"
          required
          error={fieldErrors.confirmPassword}
        >
          <Input
            id="confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
          />
        </Field>

        <div className="pt-1">
          <Button type="submit" loading={pending}>
            Change password
          </Button>
        </div>
      </form>
    </section>
  );
}
