'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { deleteBudget } from '@/server/actions/budgets';
import { BudgetEditor, type EditorCategory, type ExistingBudget } from './budget-editor';
import { monthLabel, type MonthKey } from '@/lib/date';
import { cn } from '@/lib/utils';

/** Create / edit / delete controls for a month's budget. */
export function BudgetActions({
  monthKey,
  existing,
  categories,
  currency,
  workspaceId,
  shared,
  variant = 'default',
}: {
  monthKey: MonthKey;
  existing: ExistingBudget | null;
  categories: EditorCategory[];
  currency: string;
  workspaceId: string | null;
  shared: boolean;
  /** `onAccent` renders for placement inside the yellow empty state. */
  variant?: 'default' | 'onAccent';
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [editorOpen, setEditorOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const remove = () => {
    if (!existing) return;
    startTransition(async () => {
      const result = await deleteBudget({ id: existing.id, workspaceId: workspaceId ?? undefined });
      setConfirmOpen(false);

      if (!result.ok) {
        toast({ title: 'Could not delete', description: result.error, tone: 'error' });
        return;
      }
      toast({ title: 'Budget deleted', description: monthLabel(monthKey), tone: 'success' });
      router.refresh();
    });
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          className={cn(
            'inline-flex h-11 items-center gap-2 rounded-[8px] px-5 font-mono text-[0.6875rem] tracking-[0.14em] uppercase transition-colors',
            variant === 'onAccent'
              ? 'bg-on-accent text-accent hover:opacity-90'
              : 'bg-forest text-on-forest hover:bg-forest-2',
          )}
        >
          {existing ? 'Edit budget' : 'Create budget'}
        </button>

        {existing && variant === 'default' ? (
          <Button
            variant="ghost"
            size="md"
            onClick={() => setConfirmOpen(true)}
            aria-label="Delete budget"
            // Icon-only: square it off rather than leaving the label padding.
            className="w-11 px-0"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.2h5.8l.6-8.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Button>
        ) : null}
      </div>

      <BudgetEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        monthKey={monthKey}
        existing={existing}
        categories={categories}
        currency={currency}
        workspaceId={workspaceId}
        shared={shared}
      />

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={remove}
        pending={pending}
        title={`Delete the ${monthLabel(monthKey)} budget?`}
        message="The budget and its category allocations will be removed. Your transactions are not affected, but this month will stop being measured against a target."
      />
    </>
  );
}
