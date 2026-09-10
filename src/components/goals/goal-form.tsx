'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { AmountInput, Field, Input, SegmentedField } from '@/components/ui/field';
import { ErrorNote } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { createGoal, updateGoal } from '@/server/actions/goals';
import { currencyMeta, toMajor } from '@/lib/money';
import { toDateInputValue } from '@/lib/date';
import type { GoalView } from './types';

type Theme = 'sage' | 'yellow' | 'coral' | 'forest';

const THEMES: { value: Theme; label: string }[] = [
  { value: 'yellow', label: 'Yellow' },
  { value: 'forest', label: 'Forest' },
  { value: 'sage', label: 'Sage' },
  { value: 'coral', label: 'Coral' },
];

/** Create or edit a savings goal. */
export function GoalForm({
  open,
  onClose,
  goal,
  currency,
  workspaceId,
  shared,
}: {
  open: boolean;
  onClose: () => void;
  goal?: GoalView | null;
  currency: string;
  workspaceId: string | null;
  shared: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [initial, setInitial] = useState('');
  const [deadline, setDeadline] = useState('');
  const [theme, setTheme] = useState<Theme>('yellow');
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isEdit = Boolean(goal);

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    setFieldErrors({});

    if (goal) {
      setName(goal.name);
      setTarget(String(toMajor(goal.targetMinor, currency)));
      setDeadline(goal.deadline ? toDateInputValue(new Date(goal.deadline)) : '');
      setTheme((goal.theme as Theme) ?? 'yellow');
      setInitial('');
    } else {
      setName('');
      setTarget('');
      setInitial('');
      setDeadline('');
      setTheme('yellow');
    }
  }, [open, goal, currency]);

  const submit = () => {
    setFormError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result =
        isEdit && goal
          ? await updateGoal({
              id: goal.id,
              workspaceId: workspaceId ?? undefined,
              name,
              target,
              deadline: deadline || undefined,
              theme,
              version: goal.version,
            })
          : await createGoal({
              workspaceId: workspaceId ?? undefined,
              name,
              target,
              deadline: deadline || undefined,
              theme,
              initial: initial || undefined,
            });

      if (!result.ok) {
        setFormError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      toast({ title: isEdit ? 'Goal updated' : 'Goal created', description: name, tone: 'success' });
      onClose();
      router.refresh();
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit goal' : 'Create a goal'}
      eyebrow={shared ? 'Shared workspace' : 'My finances'}
      size="sm"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending}>
            {isEdit ? 'Save goal' : 'Create goal'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {formError ? <ErrorNote title="Could not save" message={formError} /> : null}

        <Field label="What are you saving for?" htmlFor="goal-name" required error={fieldErrors.name}>
          <Input
            id="goal-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Goa Trip"
            maxLength={60}
            autoComplete="off"
            aria-invalid={Boolean(fieldErrors.name)}
          />
        </Field>

        <Field label="Target amount" htmlFor="goal-target" required error={fieldErrors.target}>
          <AmountInput
            id="goal-target"
            symbol={currencyMeta(currency).symbol}
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            aria-invalid={Boolean(fieldErrors.target)}
          />
        </Field>

        {!isEdit ? (
          <Field
            label="Already saved"
            htmlFor="goal-initial"
            hint="Optional. Recorded as your first contribution."
            error={fieldErrors.initial}
          >
            <Input
              id="goal-initial"
              inputMode="decimal"
              value={initial}
              onChange={(event) => setInitial(event.target.value)}
              placeholder="0"
            />
          </Field>
        ) : null}

        <Field label="Deadline" htmlFor="goal-deadline" hint="Optional." error={fieldErrors.deadline}>
          <Input
            id="goal-deadline"
            type="date"
            value={deadline}
            onChange={(event) => setDeadline(event.target.value)}
          />
        </Field>

        <SegmentedField
          label="Colour"
          name="theme"
          value={theme}
          onChange={setTheme}
          options={THEMES}
          columns={4}
        />
      </div>
    </Modal>
  );
}

/** Standalone "+ Create goal" trigger. */
export function CreateGoalButton({
  currency,
  workspaceId,
  shared,
  label = 'Create goal',
  variant = 'default',
}: {
  currency: string;
  workspaceId: string | null;
  shared: boolean;
  label?: string;
  variant?: 'default' | 'onAccent';
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === 'onAccent'
            ? 'inline-flex h-11 items-center gap-2 rounded-[8px] bg-on-accent px-5 font-mono text-[0.6875rem] tracking-[0.14em] uppercase text-accent transition-opacity hover:opacity-90'
            : 'inline-flex h-11 items-center gap-2 rounded-[8px] bg-forest px-5 font-mono text-[0.6875rem] tracking-[0.14em] uppercase text-on-forest transition-colors hover:bg-forest-2'
        }
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {label}
      </button>

      <GoalForm
        open={open}
        onClose={() => setOpen(false)}
        currency={currency}
        workspaceId={workspaceId}
        shared={shared}
      />
    </>
  );
}
