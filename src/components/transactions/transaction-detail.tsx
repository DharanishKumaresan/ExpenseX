'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Money } from '@/components/ui/money-display';
import { CategoryIcon } from '@/components/category-icon';
import { Badge } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { deleteTransaction, duplicateTransaction } from '@/server/actions/transactions';
import { TransactionForm } from './transaction-form';
import { PAYMENT_METHOD_LABELS, TRANSACTION_TYPE_LABELS } from '@/lib/validation';
import { formatDate, formatTime } from '@/lib/date';
import { cn } from '@/lib/utils';
import type { FormOptions, TransactionClientRow } from './types';

/**
 * Transaction detail — the receipt view.
 *
 * Laid out as the reference does it: an oversized signed figure, the merchant
 * and category beneath, then a hairline-ruled table of metadata, then the
 * actions. Edit / Duplicate / Delete all work from here.
 */
export function TransactionDetail({
  transaction,
  currency,
  workspaceId,
  shared,
  currentUserId,
  options,
  onClose,
  onChanged,
}: {
  transaction: TransactionClientRow | null;
  currency: string;
  workspaceId: string | null;
  shared: boolean;
  currentUserId: string;
  /** Omitted on read-only surfaces; editing is then unavailable. */
  options?: FormOptions;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  if (!transaction) return null;

  const when = new Date(transaction.date);
  const isExpense = transaction.type === 'EXPENSE';

  const rows: { label: string; value: string }[] = [
    { label: 'Date', value: formatDate(when).toUpperCase() },
    { label: 'Time', value: formatTime(when) },
    { label: 'Payment method', value: PAYMENT_METHOD_LABELS[transaction.paymentMethod] },
  ];

  if (transaction.accountName) {
    rows.push({
      label: 'Account',
      value: transaction.accountLast4
        ? `${transaction.accountName} ···· ${transaction.accountLast4}`
        : transaction.accountName,
    });
  }
  if (shared) {
    rows.push({
      label: 'Paid by',
      value: transaction.paidByUserId === currentUserId ? 'You' : (transaction.paidByName ?? 'Unknown'),
    });
    rows.push({
      label: 'Added by',
      value: transaction.createdByUserId === currentUserId ? 'You' : transaction.createdByName,
    });
  }
  rows.push({ label: 'Reference', value: `TXN-${transaction.id.slice(-8).toUpperCase()}` });

  const remove = () => {
    startTransition(async () => {
      const result = await deleteTransaction({ id: transaction.id, workspaceId: workspaceId ?? undefined });
      setConfirmOpen(false);

      if (!result.ok) {
        toast({ title: 'Could not delete', description: result.error, tone: 'error' });
        return;
      }
      toast({ title: 'Transaction deleted', description: transaction.merchant, tone: 'success' });
      onChanged?.();
      router.refresh();
    });
  };

  const duplicate = () => {
    startTransition(async () => {
      const result = await duplicateTransaction({
        id: transaction.id,
        workspaceId: workspaceId ?? undefined,
      });

      if (!result.ok) {
        toast({ title: 'Could not duplicate', description: result.error, tone: 'error' });
        return;
      }
      toast({
        title: 'Duplicated',
        description: `A copy of ${transaction.merchant} was added, dated today.`,
        tone: 'success',
      });
      onChanged?.();
      router.refresh();
    });
  };

  return (
    <>
      <Modal
        open={Boolean(transaction) && !editOpen}
        onClose={onClose}
        title={transaction.merchant}
        eyebrow={TRANSACTION_TYPE_LABELS[transaction.type]}
        size="sm"
        footer={
          options ? (
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                disabled={pending}
                className="h-11 rounded-[8px] bg-forest font-mono text-[0.6875rem] tracking-[0.14em] uppercase text-on-forest transition-colors hover:bg-forest-2 disabled:opacity-60"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={duplicate}
                disabled={pending}
                className="h-11 rounded-[8px] border border-line-strong font-mono text-[0.6875rem] tracking-[0.14em] uppercase text-ink transition-colors hover:bg-surface-2 disabled:opacity-60"
              >
                Duplicate
              </button>
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={pending}
                className="h-11 rounded-[8px] border border-coral font-mono text-[0.6875rem] tracking-[0.14em] uppercase text-coral transition-colors hover:bg-coral hover:text-on-coral disabled:opacity-60"
              >
                Delete
              </button>
            </div>
          ) : null
        }
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-4 pb-2 text-center">
            <CategoryIcon
              slug={transaction.categorySlug}
              size="lg"
              tone={isExpense ? 'forest' : 'outline'}
            />
            <Money
              minor={transaction.amountMinor}
              currency={currency}
              size="xl"
              signed={transaction.type === 'INCOME'}
              forceNegative={isExpense}
              className={cn(isExpense ? 'text-ink' : 'text-positive')}
            />
            <span className="ex-label">{transaction.categoryName ?? 'Uncategorised'}</span>
          </div>

          <dl className="flex flex-col border-t border-line">
            {rows.map((row) => (
              <div
                key={row.label}
                className="flex items-baseline justify-between gap-4 border-b border-line-faint py-3"
              >
                <dt className="ex-label">{row.label}</dt>
                <dd className="font-mono text-[0.8125rem] tracking-[0.04em] text-ink">{row.value}</dd>
              </div>
            ))}
          </dl>

          {transaction.tags.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {transaction.tags.map((tag) => (
                <Badge key={tag} tone="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}

          {transaction.notes ? (
            <div className="rounded-[8px] bg-surface-3 px-3.5 py-3">
              <p className="ex-label mb-1.5">Notes</p>
              <p className="text-[0.875rem] leading-relaxed text-ink-2">{transaction.notes}</p>
            </div>
          ) : null}
        </div>
      </Modal>

      {options ? (
        <TransactionForm
          open={editOpen}
          onClose={() => setEditOpen(false)}
          transaction={transaction}
          options={options}
          currency={currency}
          workspaceId={workspaceId}
          shared={shared}
          currentUserId={currentUserId}
          onSaved={() => {
            setEditOpen(false);
            onChanged?.();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={remove}
        pending={pending}
        title="Delete this transaction?"
        message={`${transaction.merchant} will be removed permanently, and every total and chart that counted it will be recalculated. This cannot be undone.`}
      />
    </>
  );
}
