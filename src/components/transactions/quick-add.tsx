'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { AmountInput, Field, Input, SegmentedField } from '@/components/ui/field';
import { FormErrorSummary } from '@/components/ui/primitives';
import { CategoryIcon } from '@/components/category-icon';
import { useToast } from '@/components/ui/toast';
import { quickAddExpense } from '@/server/actions/transactions';
import { TransactionForm } from './transaction-form';
import { currencyMeta } from '@/lib/money';
import { toDateInputValue } from '@/lib/date';
import { cn, firstName } from '@/lib/utils';
import type { FormOptions } from './types';

/**
 * Quick add.
 *
 * Optimised for one thumb: amount first and already focused, a horizontal rail
 * of the categories actually used most, a merchant line, and a single full
 * width action. Everything else lives behind "More options", which hands off
 * to the full form without losing what has been typed.
 */
export function QuickAdd({
  options,
  currency,
  workspaceId,
  shared,
  currentUserId,
}: {
  options: FormOptions;
  currency: string;
  workspaceId: string | null;
  shared: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);

  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [paidBy, setPaidBy] = useState(currentUserId);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) return;
    setAmount('');
    setMerchant('');
    setCategoryId('');
    setPaidBy(currentUserId);
    setFormError(null);
    setFieldErrors({});
  }, [open, currentUserId]);

  // A short rail of expense categories; the full list lives in the full form.
  const quickCategories = options.categories
    .filter((category) => category.kind === 'EXPENSE' || category.kind === 'BOTH')
    .slice(0, 8);

  const submit = () => {
    setFormError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await quickAddExpense({
        workspaceId: workspaceId ?? undefined,
        amount,
        merchant,
        categoryId: categoryId || undefined,
        paidByUserId: shared ? paidBy : undefined,
        date: toDateInputValue(new Date()),
      });

      if (!result.ok) {
        setFormError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      toast({ title: 'Expense added', description: merchant, tone: 'success' });
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Add expense"
        className={cn(
          'ex-no-print fixed right-4 z-40 grid size-14 place-items-center rounded-full bg-accent text-on-accent',
          'shadow-[0_6px_20px_-6px_rgba(0,0,0,0.45)] transition-transform duration-200 hover:scale-105 active:scale-95',
          // Clears the mobile bottom bar; sits lower on desktop where there is none.
          'bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:right-8 lg:bottom-8',
        )}
      >
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
          <path d="M11 4v14M4 11h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      <Modal
        open={open && !fullOpen}
        onClose={() => setOpen(false)}
        title="Add expense"
        eyebrow={shared ? 'Shared workspace' : 'My finances'}
        size="sm"
        footer={
          <div className="flex flex-col gap-2">
            <Button onClick={submit} loading={pending} fullWidth size="lg">
              Add expense
            </Button>
            <button
              type="button"
              onClick={() => setFullOpen(true)}
              className="h-9 font-mono text-[0.6875rem] tracking-[0.14em] uppercase text-ink-3 transition-colors hover:text-ink"
            >
              More options
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          <FormErrorSummary
            error={formError}
            fieldErrors={fieldErrors}
            handled={['amount', 'merchant']}
            title="Could not add"
          />

          <Field label="Amount" htmlFor="quick-amount" required error={fieldErrors.amount} hideLabel>
            <AmountInput
              id="quick-amount"
              symbol={currencyMeta(currency).symbol}
              negative
              autoFocus
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-label="Amount"
              aria-invalid={Boolean(fieldErrors.amount)}
            />
          </Field>

          <div className="flex flex-col gap-2">
            <span className="ex-label">Category</span>
            <div className="ex-no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {quickCategories.map((category) => {
                const selected = categoryId === category.id;
                return (
                  <button
                    key={category.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setCategoryId(selected ? '' : category.id)}
                    className={cn(
                      'flex min-w-[4.5rem] shrink-0 flex-col items-center gap-1.5 rounded-[10px] border px-2 py-2.5 transition-colors',
                      selected
                        ? 'border-ink bg-surface-3'
                        : 'border-line bg-transparent hover:border-line-strong hover:bg-surface-2',
                    )}
                  >
                    <CategoryIcon
                      slug={category.slug}
                      size="sm"
                      tone={selected ? 'forest' : 'outline'}
                    />
                    <span className="ex-label max-w-full truncate">{category.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="What was it for?" htmlFor="quick-merchant" required error={fieldErrors.merchant}>
            <Input
              id="quick-merchant"
              value={merchant}
              onChange={(event) => setMerchant(event.target.value)}
              placeholder="Swiggy"
              maxLength={80}
              autoComplete="off"
              enterKeyHint="done"
              aria-invalid={Boolean(fieldErrors.merchant)}
            />
          </Field>

          {shared && options.members.length > 0 ? (
            <SegmentedField
              label="Paid by"
              name="quickPaidBy"
              value={paidBy}
              onChange={setPaidBy}
              options={options.members.map((member) => ({
                value: member.userId,
                label: member.isSelf ? 'You' : firstName(member.name),
              }))}
            />
          ) : null}

          <p className="font-mono text-[0.6875rem] tracking-[0.06em] uppercase text-ink-faint">
            Dated today · UPI
          </p>
        </div>
      </Modal>

      {/* Handing off to the full form carries the amount and merchant across. */}
      <TransactionForm
        open={fullOpen}
        onClose={() => {
          setFullOpen(false);
          setOpen(false);
        }}
        options={options}
        currency={currency}
        workspaceId={workspaceId}
        shared={shared}
        currentUserId={currentUserId}
        onSaved={() => {
          setFullOpen(false);
          setOpen(false);
        }}
      />
    </>
  );
}
