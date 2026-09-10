'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { AmountInput, Field, Input, SegmentedField } from '@/components/ui/field';
import { ErrorNote, Progress } from '@/components/ui/primitives';
import { Money } from '@/components/ui/money-display';
import { useToast } from '@/components/ui/toast';
import { contributeToGoal } from '@/server/actions/goals';
import { currencyMeta, formatPercent, parseMoneyToMinor, percentOf } from '@/lib/money';
import { firstName } from '@/lib/utils';
import type { GoalView } from './types';

/**
 * Add money to a goal.
 *
 * In a shared space the contribution can be credited to either person, because
 * one of you often transfers on behalf of the other. The server re-checks that
 * the chosen contributor is actually a member.
 */
export function ContributeForm({
  open,
  onClose,
  goal,
  currency,
  workspaceId,
  shared,
  members,
  currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  goal: GoalView;
  currency: string;
  workspaceId: string | null;
  shared: boolean;
  members: { userId: string; name: string; isSelf: boolean }[];
  currentUserId: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [amount, setAmount] = useState('');
  const [contributor, setContributor] = useState(currentUserId);
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setAmount('');
    setNote('');
    setContributor(currentUserId);
    setFormError(null);
    setFieldErrors({});
  }, [open, currentUserId]);

  // Live preview of where this contribution lands the goal.
  let previewMinor = goal.currentMinor;
  try {
    if (amount.trim()) previewMinor = goal.currentMinor + parseMoneyToMinor(amount, currency);
  } catch {
    // Mid-typing; keep the current total.
  }
  const previewProgress = Math.min(100, percentOf(previewMinor, goal.targetMinor));

  const submit = () => {
    setFormError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await contributeToGoal({
        goalId: goal.id,
        workspaceId: workspaceId ?? undefined,
        amount,
        contributorId: shared ? contributor : undefined,
        note: note || undefined,
      });

      if (!result.ok) {
        setFormError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      toast({
        title: 'Contribution added',
        description: `${goal.name} is now ${formatPercent(percentOf(result.data.currentMinor, goal.targetMinor))} funded`,
        tone: 'success',
      });
      onClose();
      router.refresh();
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add contribution"
      eyebrow={goal.name}
      size="sm"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending}>
            Add contribution
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {formError ? <ErrorNote title="Could not add" message={formError} /> : null}

        <Field label="Amount" htmlFor="contribution-amount" required error={fieldErrors.amount}>
          <AmountInput
            id="contribution-amount"
            symbol={currencyMeta(currency).symbol}
            autoFocus
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-invalid={Boolean(fieldErrors.amount)}
          />
        </Field>

        {shared && members.length > 0 ? (
          <SegmentedField
            label="Contributing as"
            name="contributor"
            value={contributor}
            onChange={setContributor}
            hint="Credit this to whoever actually put the money in."
            options={members.map((member) => ({
              value: member.userId,
              label: member.isSelf ? 'You' : firstName(member.name),
            }))}
          />
        ) : null}

        <Field label="Note" htmlFor="contribution-note" hint="Optional.">
          <Input
            id="contribution-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Bonus from this month"
            maxLength={140}
          />
        </Field>

        <div className="flex flex-col gap-3 rounded-[10px] bg-surface-3 px-4 py-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="ex-label">After this</p>
              <Money minor={previewMinor} currency={currency} size="md" hideFraction className="mt-1.5 text-ink" />
            </div>
            <div className="text-right">
              <p className="ex-label">Of target</p>
              <p className="ex-numeral mt-1.5 text-[1rem] text-ink">{formatPercent(previewProgress)}</p>
            </div>
          </div>
          <Progress value={previewProgress} tone="forest" label={`Projected progress for ${goal.name}`} />
        </div>
      </div>
    </Modal>
  );
}
