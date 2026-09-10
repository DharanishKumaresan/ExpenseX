'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { AmountInput, Field, Input, SegmentedField, Select } from '@/components/ui/field';
import { Badge, EmptyState, ErrorNote } from '@/components/ui/primitives';
import { Money } from '@/components/ui/money-display';
import { CategoryIcon } from '@/components/category-icon';
import { useToast } from '@/components/ui/toast';
import {
  deleteRecurring,
  recordRecurringPayment,
  saveRecurring,
  setRecurringActive,
} from '@/server/actions/recurring';
import { currencyMeta, toMajor } from '@/lib/money';
import { formatDate, formatDayLabel, daysBetween, toDateInputValue } from '@/lib/date';
import { FREQUENCY_LABELS, PAYMENT_METHOD_LABELS } from '@/lib/validation';
import { cn } from '@/lib/utils';

/**
 * Recurring commitments.
 *
 * These are projections, not ledger entries. "Record payment" is the explicit
 * bridge: it writes a real transaction and rolls the next date forward, so the
 * app never invents spending that has not happened.
 */

type Frequency = keyof typeof FREQUENCY_LABELS;
type Method = keyof typeof PAYMENT_METHOD_LABELS;

export interface RecurringView {
  id: string;
  merchant: string;
  amountMinor: number;
  frequency: Frequency;
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  paymentMethod: Method;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  accountId: string | null;
  notes: string | null;
  nextDate: string;
  active: boolean;
}

export function RecurringManager({
  items,
  categories,
  accounts,
  currency,
  workspaceId,
  shared,
}: {
  items: RecurringView[];
  categories: { id: string; name: string; slug: string; kind: string }[];
  accounts: { id: string; name: string; last4: string | null }[];
  currency: string;
  workspaceId: string | null;
  shared: boolean;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringView | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (item: RecurringView) => {
    setEditing(item);
    setFormOpen(true);
  };

  const active = items.filter((item) => item.active);
  const paused = items.filter((item) => !item.active);

  return (
    <>
      <div className="flex flex-col gap-8">
        <div className="flex justify-end">
          <Button onClick={openCreate}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            Add commitment
          </Button>
        </div>

        {items.length === 0 ? (
          <EmptyState
            headline="Know what leaves before it does."
            body="Add the subscriptions, rent and bills that repeat, and the app can show you what is committed before you plan the rest."
            action={
              <Button onClick={openCreate} variant="primary">
                Add your first commitment
              </Button>
            }
          />
        ) : (
          <>
            {active.length > 0 ? (
              <section className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="ex-label ex-label-lg">Upcoming payments</span>
                  <span aria-hidden="true" className="h-px flex-1 bg-line" />
                </div>
                <ul className="flex flex-col">
                  {active.map((item) => (
                    <RecurringRow
                      key={item.id}
                      item={item}
                      currency={currency}
                      workspaceId={workspaceId}
                      onEdit={() => openEdit(item)}
                    />
                  ))}
                </ul>
              </section>
            ) : null}

            {paused.length > 0 ? (
              <section className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="ex-label ex-label-lg">Paused</span>
                  <span aria-hidden="true" className="h-px flex-1 bg-line" />
                </div>
                <ul className="flex flex-col opacity-70">
                  {paused.map((item) => (
                    <RecurringRow
                      key={item.id}
                      item={item}
                      currency={currency}
                      workspaceId={workspaceId}
                      onEdit={() => openEdit(item)}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>

      <RecurringForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        item={editing}
        categories={categories}
        accounts={accounts}
        currency={currency}
        workspaceId={workspaceId}
        shared={shared}
      />
    </>
  );
}

function RecurringRow({
  item,
  currency,
  workspaceId,
  onEdit,
}: {
  item: RecurringView;
  currency: string;
  workspaceId: string | null;
  onEdit: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const next = new Date(item.nextDate);
  const daysAway = daysBetween(new Date(), next);
  const dueSoon = item.active && daysAway <= 7;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        toast({ title: 'Could not update', description: result.error, tone: 'error' });
        return;
      }
      toast({ title: success, description: item.merchant, tone: 'success' });
      router.refresh();
    });
  };

  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-line-faint py-3.5 last:border-0">
      <CategoryIcon slug={item.categorySlug} size="md" tone={item.active ? 'forest' : 'outline'} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.9375rem] font-semibold text-ink">{item.merchant}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="ex-label">{FREQUENCY_LABELS[item.frequency]}</span>
          <span aria-hidden="true" className="text-ink-faint">
            ·
          </span>
          <span className="ex-label normal-case tracking-normal">
            {item.active ? `Next ${formatDayLabel(next)}` : 'Paused'}
          </span>
          {dueSoon ? <Badge tone="accent">Due soon</Badge> : null}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <Money minor={item.amountMinor} currency={currency} size="sm" hideFraction className="text-ink" />
        <p className="mt-1 font-mono text-[0.625rem] tracking-[0.06em] text-ink-faint">
          {formatDate(next)}
        </p>
      </div>

      <div className="flex w-full shrink-0 flex-wrap items-center gap-1.5 sm:w-auto">
        {item.active ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(
                () => recordRecurringPayment({ id: item.id, workspaceId: workspaceId ?? undefined }),
                'Payment recorded',
              )
            }
            className="h-9 rounded-[7px] bg-forest px-3 font-mono text-[0.625rem] tracking-[0.12em] uppercase text-on-forest transition-colors hover:bg-forest-2 disabled:opacity-60"
          >
            Record paid
          </button>
        ) : null}

        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              () =>
                setRecurringActive({ id: item.id, workspaceId: workspaceId ?? undefined }, !item.active),
              item.active ? 'Paused' : 'Resumed',
            )
          }
          className="h-9 rounded-[7px] border border-line-strong px-3 font-mono text-[0.625rem] tracking-[0.12em] uppercase text-ink-2 transition-colors hover:bg-surface-2 disabled:opacity-60"
        >
          {item.active ? 'Pause' : 'Resume'}
        </button>

        <button
          type="button"
          onClick={onEdit}
          className="h-9 rounded-[7px] border border-line px-3 font-mono text-[0.625rem] tracking-[0.12em] uppercase text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          Edit
        </button>

        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          aria-label={`Delete ${item.merchant}`}
          className="grid size-9 place-items-center rounded-[7px] text-ink-3 transition-colors hover:bg-coral/10 hover:text-coral"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.2h5.8l.6-8.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() =>
          run(() => deleteRecurring({ id: item.id, workspaceId: workspaceId ?? undefined }), 'Commitment removed')
        }
        pending={pending}
        title={`Delete ${item.merchant}?`}
        message="This removes the recurring commitment. Transactions you already recorded from it are kept."
      />
    </li>
  );
}

function RecurringForm({
  open,
  onClose,
  item,
  categories,
  accounts,
  currency,
  workspaceId,
  shared,
}: {
  open: boolean;
  onClose: () => void;
  item: RecurringView | null;
  categories: { id: string; name: string; slug: string; kind: string }[];
  accounts: { id: string; name: string; last4: string | null }[];
  currency: string;
  workspaceId: string | null;
  shared: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('MONTHLY');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [method, setMethod] = useState<Method>('UPI');
  const [nextDate, setNextDate] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    setFieldErrors({});

    if (item) {
      setMerchant(item.merchant);
      setAmount(String(toMajor(item.amountMinor, currency)));
      setFrequency(item.frequency);
      setCategoryId(item.categoryId ?? '');
      setAccountId(item.accountId ?? '');
      setMethod(item.paymentMethod);
      setNextDate(toDateInputValue(new Date(item.nextDate)));
      setNotes(item.notes ?? '');
    } else {
      setMerchant('');
      setAmount('');
      setFrequency('MONTHLY');
      setCategoryId('');
      setAccountId('');
      setMethod('UPI');
      setNextDate(toDateInputValue(new Date()));
      setNotes('');
    }
  }, [open, item, currency]);

  const submit = () => {
    setFormError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await saveRecurring({
        id: item?.id,
        workspaceId: workspaceId ?? undefined,
        merchant,
        amount,
        type: 'EXPENSE',
        frequency,
        categoryId: categoryId || undefined,
        accountId: accountId || undefined,
        paymentMethod: method,
        nextDate,
        notes: notes || undefined,
      });

      if (!result.ok) {
        setFormError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      toast({ title: item ? 'Commitment updated' : 'Commitment added', description: merchant, tone: 'success' });
      onClose();
      router.refresh();
    });
  };

  const expenseCategories = categories.filter((c) => c.kind === 'EXPENSE' || c.kind === 'BOTH');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? 'Edit commitment' : 'Add commitment'}
      eyebrow={shared ? 'Shared workspace' : 'My finances'}
      size="sm"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending}>
            {item ? 'Save' : 'Add commitment'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {formError ? <ErrorNote title="Could not save" message={formError} /> : null}

        <Field label="What repeats?" htmlFor="rec-merchant" required error={fieldErrors.merchant}>
          <Input
            id="rec-merchant"
            value={merchant}
            onChange={(event) => setMerchant(event.target.value)}
            placeholder="Netflix"
            maxLength={80}
            autoComplete="off"
          />
        </Field>

        <Field label="Amount" htmlFor="rec-amount" required error={fieldErrors.amount}>
          <AmountInput
            id="rec-amount"
            symbol={currencyMeta(currency).symbol}
            negative
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>

        <SegmentedField
          label="How often"
          name="frequency"
          value={frequency}
          onChange={setFrequency}
          options={(Object.keys(FREQUENCY_LABELS) as Frequency[]).map((value) => ({
            value,
            label: FREQUENCY_LABELS[value],
          }))}
          columns={4}
        />

        <Field label="Next payment" htmlFor="rec-date" required error={fieldErrors.nextDate}>
          <Input
            id="rec-date"
            type="date"
            value={nextDate}
            onChange={(event) => setNextDate(event.target.value)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="rec-category">
            <Select id="rec-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Uncategorised</option>
              {expenseCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Payment method" htmlFor="rec-method">
            <Select id="rec-method" value={method} onChange={(e) => setMethod(e.target.value as Method)}>
              {(Object.keys(PAYMENT_METHOD_LABELS) as Method[]).map((value) => (
                <option key={value} value={value}>
                  {PAYMENT_METHOD_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {accounts.length > 0 ? (
          <Field label="Account" htmlFor="rec-account">
            <Select id="rec-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Not linked</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                  {account.last4 ? ` ···· ${account.last4}` : ''}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>
    </Modal>
  );
}
