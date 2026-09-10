'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { AmountInput, Field, Input, Select } from '@/components/ui/field';
import { ErrorNote } from '@/components/ui/primitives';
import { CategoryIcon } from '@/components/category-icon';
import { Money } from '@/components/ui/money-display';
import { useToast } from '@/components/ui/toast';
import { saveBudget } from '@/server/actions/budgets';
import { createCategory } from '@/server/actions/settings';
import { currencyMeta, parseMoneyToMinor, toMajor } from '@/lib/money';
import { MONTH_NAMES, monthLabel, type MonthKey } from '@/lib/date';
import { cn } from '@/lib/utils';

/**
 * Budget editor.
 *
 * The allocation total is recomputed on every keystroke and the save is
 * blocked while allocations exceed the budget — the constraint is enforced
 * again on the server, but showing it live is what stops the user building an
 * impossible budget in the first place.
 */

export interface EditorCategory {
  id: string;
  name: string;
  slug: string;
  kind: string;
}

export interface ExistingBudget {
  id: string;
  month: number;
  year: number;
  totalAmountMinor: number;
  version: number;
  allocations: { categoryId: string; allocatedAmountMinor: number }[];
}

export function BudgetEditor({
  open,
  onClose,
  monthKey,
  existing,
  categories,
  currency,
  workspaceId,
  shared,
}: {
  open: boolean;
  onClose: () => void;
  monthKey: MonthKey;
  existing: ExistingBudget | null;
  categories: EditorCategory[];
  currency: string;
  workspaceId: string | null;
  shared: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [month, setMonth] = useState(monthKey.month);
  const [year, setYear] = useState(monthKey.year);
  const [total, setTotal] = useState('');
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [newCategory, setNewCategory] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const expenseCategories = useMemo(
    () => categories.filter((category) => category.kind === 'EXPENSE' || category.kind === 'BOTH'),
    [categories],
  );

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    setMonth(monthKey.month);
    setYear(monthKey.year);

    if (existing) {
      setTotal(String(toMajor(existing.totalAmountMinor, currency)));
      const next: Record<string, string> = {};
      for (const allocation of existing.allocations) {
        next[allocation.categoryId] = String(toMajor(allocation.allocatedAmountMinor, currency));
      }
      setAllocations(next);
    } else {
      setTotal('');
      setAllocations({});
    }
  }, [open, existing, monthKey, currency]);

  /** Sum the typed allocations, ignoring anything that is not yet a number. */
  const allocatedMinor = useMemo(() => {
    let sum = 0;
    for (const value of Object.values(allocations)) {
      if (!value.trim()) continue;
      try {
        sum += parseMoneyToMinor(value, currency);
      } catch {
        // Mid-typing values simply do not count yet.
      }
    }
    return sum;
  }, [allocations, currency]);

  const totalMinor = useMemo(() => {
    if (!total.trim()) return 0;
    try {
      return parseMoneyToMinor(total, currency);
    } catch {
      return 0;
    }
  }, [total, currency]);

  const unallocatedMinor = totalMinor - allocatedMinor;
  const overAllocated = unallocatedMinor < 0;

  const submit = () => {
    setFormError(null);

    const payload = {
      workspaceId: workspaceId ?? undefined,
      month,
      year,
      total,
      allocations: Object.entries(allocations)
        .filter(([, value]) => value.trim() !== '' && value.trim() !== '0')
        .map(([categoryId, amount]) => ({ categoryId, amount })),
      version: existing?.version,
    };

    startTransition(async () => {
      const result = await saveBudget(payload);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      toast({
        title: existing ? 'Budget updated' : 'Budget created',
        description: monthLabel({ month, year }),
        tone: 'success',
      });
      onClose();
      router.refresh();
    });
  };

  const addCategory = () => {
    const name = newCategory.trim();
    if (!name) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.set('name', name);
      formData.set('kind', 'EXPENSE');
      const result = await createCategory(formData);

      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setNewCategory('');
      setAddingCategory(false);
      // The new category arrives with the refreshed server props.
      router.refresh();
    });
  };

  const years = [monthKey.year - 1, monthKey.year, monthKey.year + 1];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={existing ? 'Edit budget' : 'Create budget'}
      eyebrow={shared ? 'Shared workspace' : 'My finances'}
      size="lg"
      footer={
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="ex-label">Allocated</p>
              <Money minor={allocatedMinor} currency={currency} size="sm" hideFraction className="mt-1 text-ink" />
            </div>
            <div className="text-right">
              <p className="ex-label">{overAllocated ? 'Over-allocated' : 'Unallocated'}</p>
              <Money
                minor={Math.abs(unallocatedMinor)}
                currency={currency}
                size="sm"
                hideFraction
                className={cn('mt-1', overAllocated ? 'text-coral' : 'text-ink')}
              />
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={pending} disabled={overAllocated}>
              {existing ? 'Save budget' : 'Create budget'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {formError ? <ErrorNote title="Could not save" message={formError} /> : null}

        {overAllocated ? (
          <ErrorNote
            title="Allocations exceed the budget"
            message="Reduce a category or raise the total before saving."
          />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Month" htmlFor="budget-month">
            <Select
              id="budget-month"
              value={month}
              onChange={(event) => setMonth(Number(event.target.value))}
            >
              {MONTH_NAMES.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Year" htmlFor="budget-year">
            <Select id="budget-year" value={year} onChange={(event) => setYear(Number(event.target.value))}>
              {years.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Total budget" htmlFor="budget-total" required>
          <AmountInput
            id="budget-total"
            symbol={currencyMeta(currency).symbol}
            value={total}
            onChange={(event) => setTotal(event.target.value)}
          />
        </Field>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="ex-label ex-label-lg">Category allocations</span>
            <button
              type="button"
              onClick={() => setAddingCategory((value) => !value)}
              className="font-mono text-[0.625rem] tracking-[0.12em] uppercase text-ink-3 transition-colors hover:text-ink"
            >
              {addingCategory ? 'Cancel' : '+ New category'}
            </button>
          </div>

          {addingCategory ? (
            <div className="flex gap-2 rounded-[8px] bg-surface-3 p-2.5">
              <Input
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                placeholder="Category name"
                maxLength={32}
                aria-label="New category name"
              />
              <Button size="sm" onClick={addCategory} loading={pending} className="shrink-0">
                Add
              </Button>
            </div>
          ) : null}

          <ul className="flex flex-col gap-px overflow-hidden rounded-[10px] border border-line">
            {expenseCategories.map((category) => {
              const value = allocations[category.id] ?? '';
              const hasValue = value.trim() !== '' && value.trim() !== '0';

              return (
                <li
                  key={category.id}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 transition-colors',
                    hasValue ? 'bg-surface-3' : 'bg-surface-2',
                  )}
                >
                  <CategoryIcon slug={category.slug} size="sm" tone={hasValue ? 'forest' : 'outline'} />
                  <label
                    htmlFor={`alloc-${category.id}`}
                    className="min-w-0 flex-1 truncate text-[0.875rem] font-medium text-ink"
                  >
                    {category.name}
                  </label>
                  <div className="flex w-32 shrink-0 items-center gap-1.5 rounded-[6px] border border-line bg-surface px-2.5">
                    <span aria-hidden="true" className="ex-numeral text-[0.8125rem] text-ink-3">
                      {currencyMeta(currency).symbol}
                    </span>
                    <input
                      id={`alloc-${category.id}`}
                      inputMode="decimal"
                      value={value}
                      onChange={(event) =>
                        setAllocations((current) => ({ ...current, [category.id]: event.target.value }))
                      }
                      placeholder="0"
                      aria-label={`${category.name} allocation`}
                      className="ex-numeral h-9 w-full bg-transparent text-right text-[0.875rem] text-ink outline-none placeholder:text-ink-faint"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
