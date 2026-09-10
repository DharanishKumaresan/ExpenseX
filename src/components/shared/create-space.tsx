'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { ErrorNote } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { createWorkspace } from '@/server/actions/workspace';
import { CURRENCIES, CURRENCY_CODES } from '@/lib/money';

/**
 * Create a shared space.
 *
 * Creating the space and inviting the other person are separate steps on
 * purpose: the space exists and is usable immediately, and the invitation is
 * an explicit act with an explicit acceptance on the other side.
 */
export function CreateSpaceButton({
  label = 'Create shared space',
  variant = 'default',
}: {
  label?: string;
  variant?: 'default' | 'onForest';
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setFormError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await createWorkspace(formData);
      if (!result.ok) {
        setFormError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      toast({
        title: 'Shared space created',
        description: 'Invite the other person to start budgeting together.',
        tone: 'success',
      });
      setOpen(false);
      router.push('/shared/settings');
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === 'onForest'
            ? 'inline-flex h-12 items-center gap-2 rounded-[8px] bg-on-forest px-6 font-mono text-[0.6875rem] tracking-[0.14em] uppercase text-forest transition-opacity hover:opacity-90'
            : 'inline-flex h-12 items-center gap-2 rounded-[8px] bg-forest px-6 font-mono text-[0.6875rem] tracking-[0.14em] uppercase text-on-forest transition-colors hover:bg-forest-2'
        }
      >
        <svg width="13" height="13" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {label}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create a shared space"
        eyebrow="For exactly two people"
        description="A separate set of budgets, goals and transactions that you and one other person both manage. Your personal finances stay private."
        size="sm"
      >
        <form onSubmit={submit} className="flex flex-col gap-5">
          {formError ? <ErrorNote title="Could not create" message={formError} /> : null}

          <Field label="Name this space" htmlFor="ws-name" required error={fieldErrors.name}>
            <Input
              id="ws-name"
              name="name"
              defaultValue="Our Finances"
              maxLength={50}
              required
              autoComplete="off"
            />
          </Field>

          <Field label="Description" htmlFor="ws-description" hint="Optional.">
            <Textarea
              id="ws-description"
              name="description"
              maxLength={160}
              placeholder="Household spending and the trip fund"
            />
          </Field>

          <Field label="Currency" htmlFor="ws-currency">
            <Select id="ws-currency" name="currency" defaultValue="INR">
              {CURRENCY_CODES.map((code) => (
                <option key={code} value={code}>
                  {CURRENCIES[code].label} ({CURRENCIES[code].symbol})
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Create space
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
