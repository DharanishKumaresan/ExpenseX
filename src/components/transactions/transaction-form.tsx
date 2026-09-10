'use client';

import { useEffect, useId, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { AmountInput, Field, Input, Select, SegmentedField, Textarea } from '@/components/ui/field';
import { FormErrorSummary } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { createTransaction, updateTransaction } from '@/server/actions/transactions';
import { PAYMENT_METHOD_LABELS, TRANSACTION_TYPE_LABELS } from '@/lib/validation';
import { currencyMeta, toMajor } from '@/lib/money';
import { toDateInputValue, toTimeInputValue } from '@/lib/date';
import { firstName } from '@/lib/utils';
import type { FormOptions, TransactionClientRow } from './types';

/**
 * Create / edit a transaction.
 *
 * The same component serves both: an edit carries the row's `version`, which
 * the server checks before writing. If the other person changed the row in the
 * meantime the save is refused with a readable message rather than silently
 * overwriting their edit.
 */

type TxType = 'EXPENSE' | 'INCOME' | 'TRANSFER';
type Method = keyof typeof PAYMENT_METHOD_LABELS;

export function TransactionForm({
  open,
  onClose,
  transaction,
  options,
  currency,
  workspaceId,
  shared,
  currentUserId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** Present when editing. */
  transaction?: TransactionClientRow | null;
  options: FormOptions;
  currency: string;
  workspaceId: string | null;
  shared: boolean;
  currentUserId: string;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const listId = useId();

  const isEdit = Boolean(transaction);
  const symbol = currencyMeta(currency).symbol;

  const [type, setType] = useState<TxType>('EXPENSE');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [method, setMethod] = useState<Method>('UPI');
  const [paidBy, setPaidBy] = useState(currentUserId);
  const [date, setDate] = useState(() => toDateInputValue(new Date()));
  const [time, setTime] = useState(() => toTimeInputValue(new Date()));
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');

  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Reset every time the sheet opens so a previous entry never bleeds through.
  useEffect(() => {
    if (!open) return;
    setFormError(null);
    setFieldErrors({});

    if (transaction) {
      const when = new Date(transaction.date);
      setType(transaction.type);
      setAmount(String(toMajor(transaction.amountMinor, currency)));
      setMerchant(transaction.merchant);
      setCategoryId(transaction.categoryId ?? '');
      setAccountId(transaction.accountId ?? '');
      setMethod(transaction.paymentMethod);
      setPaidBy(transaction.paidByUserId ?? currentUserId);
      setDate(toDateInputValue(when));
      setTime(toTimeInputValue(when));
      setNotes(transaction.notes ?? '');
      setTags(transaction.tags.join(', '));
    } else {
      const now = new Date();
      setType('EXPENSE');
      setAmount('');
      setMerchant('');
      setCategoryId('');
      setAccountId(options.accounts[0]?.id ?? '');
      setMethod('UPI');
      setPaidBy(currentUserId);
      setDate(toDateInputValue(now));
      setTime(toTimeInputValue(now));
      setNotes('');
      setTags('');
    }
  }, [open, transaction, currency, currentUserId, options.accounts]);

  const categories = useMemo(
    () =>
      options.categories.filter((category) =>
        type === 'TRANSFER'
          ? category.kind === 'BOTH'
          : category.kind === type || category.kind === 'BOTH',
      ),
    [options.categories, type],
  );

  // Clear a category that does not belong to the newly chosen type.
  useEffect(() => {
    if (categoryId && !categories.some((category) => category.id === categoryId)) {
      setCategoryId('');
    }
  }, [categories, categoryId]);

  const submit = () => {
    setFormError(null);
    setFieldErrors({});

    const payload = {
      workspaceId: workspaceId ?? undefined,
      type,
      amount,
      merchant,
      categoryId: categoryId || undefined,
      accountId: accountId || undefined,
      paymentMethod: method,
      paidByUserId: shared ? paidBy : undefined,
      date,
      time,
      notes: notes || undefined,
      tags: tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    };

    startTransition(async () => {
      const result =
        isEdit && transaction
          ? await updateTransaction({ ...payload, id: transaction.id, version: transaction.version })
          : await createTransaction(payload);

      if (!result.ok) {
        setFormError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      toast({
        title: isEdit ? 'Transaction updated' : 'Transaction added',
        description: merchant,
        tone: 'success',
      });
      onClose();
      onSaved?.();
      router.refresh();
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit transaction' : 'Add transaction'}
      eyebrow={shared ? 'Shared workspace' : 'My finances'}
      size="md"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending}>
            {isEdit ? 'Save changes' : 'Add transaction'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <FormErrorSummary
          error={formError}
          fieldErrors={fieldErrors}
          handled={['amount', 'merchant', 'categoryId', 'accountId', 'date']}
        />

        <Field label="Amount" htmlFor="amount" required error={fieldErrors.amount}>
          <AmountInput
            id="amount"
            symbol={symbol}
            negative={type === 'EXPENSE'}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-invalid={Boolean(fieldErrors.amount)}
          />
        </Field>

        <SegmentedField
          label="Type"
          name="type"
          value={type}
          onChange={setType}
          options={(Object.keys(TRANSACTION_TYPE_LABELS) as TxType[]).map((value) => ({
            value,
            label: TRANSACTION_TYPE_LABELS[value],
          }))}
        />

        <Field
          label={type === 'INCOME' ? 'Source' : 'Merchant'}
          htmlFor="merchant"
          required
          error={fieldErrors.merchant}
        >
          <Input
            id="merchant"
            list={listId}
            value={merchant}
            onChange={(event) => setMerchant(event.target.value)}
            placeholder={type === 'INCOME' ? 'Salary' : 'Swiggy'}
            maxLength={80}
            autoComplete="off"
            aria-invalid={Boolean(fieldErrors.merchant)}
          />
          <datalist id={listId}>
            {options.merchants.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="category" error={fieldErrors.categoryId}>
            <Select
              id="category"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">Uncategorised</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Payment method" htmlFor="method">
            <Select
              id="method"
              value={method}
              onChange={(event) => setMethod(event.target.value as Method)}
            >
              {(Object.keys(PAYMENT_METHOD_LABELS) as Method[]).map((value) => (
                <option key={value} value={value}>
                  {PAYMENT_METHOD_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {shared && options.members.length > 0 ? (
          <SegmentedField
            label="Paid by"
            name="paidBy"
            value={paidBy}
            onChange={setPaidBy}
            hint="Who actually paid. You can record an expense your partner paid for."
            options={options.members.map((member) => ({
              value: member.userId,
              label: member.isSelf ? 'You' : firstName(member.name),
            }))}
          />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" htmlFor="date" required error={fieldErrors.date}>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              aria-invalid={Boolean(fieldErrors.date)}
            />
          </Field>

          <Field label="Time" htmlFor="time">
            <Input id="time" type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          </Field>
        </div>

        {options.accounts.length > 0 ? (
          <Field label="Account" htmlFor="account" error={fieldErrors.accountId}>
            <Select
              id="account"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              <option value="">Not linked</option>
              {options.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                  {account.last4 ? ` ···· ${account.last4}` : ''}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field label="Tags" htmlFor="tags" hint="Comma separated, up to 8.">
          <Input
            id="tags"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="weekend, reimbursable"
            maxLength={200}
          />
        </Field>

        <Field label="Notes" htmlFor="notes">
          <Textarea
            id="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={500}
            placeholder="Anything worth remembering later"
          />
        </Field>
      </div>
    </Modal>
  );
}
