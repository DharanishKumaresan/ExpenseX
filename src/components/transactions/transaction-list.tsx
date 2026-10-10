'use client';

import { useState } from 'react';
import { CategoryIcon } from '@/components/category-icon';
import { Money } from '@/components/ui/money-display';
import { Avatar, EmptyState } from '@/components/ui/primitives';
import { TransactionDetail } from './transaction-detail';
import { formatDateTimeRelative, formatDayLabel } from '@/lib/date';
import { cn, firstName } from '@/lib/utils';
import type { FormOptions, TransactionClientRow } from './types';

/**
 * The transaction list.
 *
 * Rows are slabs, not cards: a category tile on the left, the merchant and its
 * category stacked in the middle, the amount and time right-aligned. Expenses
 * carry a leading minus and income a plus, so direction never depends on
 * colour alone.
 *
 * In a shared workspace each row also shows who paid — the single most
 * important fact about a shared expense.
 */

export function TransactionList({
  transactions,
  currency,
  workspaceId,
  shared,
  currentUserId,
  options,
  emptyHeadline = 'Your spending story starts here.',
  emptyBody,
  emptyAction,
  groupByDay = true,
  compact,
  onChanged,
}: {
  transactions: TransactionClientRow[];
  currency: string;
  workspaceId: string | null;
  shared: boolean;
  currentUserId: string;
  /** Enables edit/duplicate/delete from the detail sheet. */
  options?: FormOptions;
  emptyHeadline?: string;
  emptyBody?: string;
  emptyAction?: React.ReactNode;
  groupByDay?: boolean;
  compact?: boolean;
  onChanged?: () => void;
}) {
  const [selected, setSelected] = useState<TransactionClientRow | null>(null);

  if (transactions.length === 0) {
    return <EmptyState headline={emptyHeadline} body={emptyBody} action={emptyAction} />;
  }

  const groups = groupByDay ? groupByDayLabel(transactions) : [{ label: null, rows: transactions }];

  return (
    <>
      <div className="flex flex-col">
        {groups.map((group) => (
          <section key={group.label ?? 'all'}>
            {group.label ? (
              // Pinned to the exact header height rather than a guess at it,
              // so no sliver of the previous day's rows shows above the label.
              <div className="ex-sticky-under-header z-10 -mx-1 flex items-center gap-3 bg-surface/95 px-1 py-2 backdrop-blur-sm">
                <span className="ex-label">{group.label}</span>
                <span aria-hidden="true" className="h-px flex-1 bg-line" />
              </div>
            ) : null}

            <ul className="flex flex-col">
              {group.rows.map((transaction) => (
                <li key={transaction.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(transaction)}
                    className={cn(
                      'flex w-full items-center gap-3 border-b border-line-faint text-left transition-colors last:border-0 hover:bg-surface-2',
                      compact ? 'min-h-12 py-2.5' : 'min-h-14 py-3',
                    )}
                  >
                    <CategoryIcon
                      slug={transaction.categorySlug}
                      size={compact ? 'sm' : 'md'}
                      tone={transaction.type === 'INCOME' ? 'outline' : 'forest'}
                    />

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.9375rem] leading-tight font-semibold text-ink">
                        {transaction.merchant}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5">
                        <span className="ex-label truncate">
                          {transaction.categoryName ?? 'Uncategorised'}
                        </span>
                        {shared && transaction.paidByName ? (
                          <>
                            <span aria-hidden="true" className="text-ink-faint">
                              ·
                            </span>
                            <span className="ex-label truncate normal-case tracking-normal">
                              {transaction.paidByUserId === currentUserId
                                ? 'You paid'
                                : `${firstName(transaction.paidByName)} paid`}
                            </span>
                          </>
                        ) : null}
                      </span>
                    </span>

                    {shared && transaction.paidByName ? (
                      <Avatar
                        name={transaction.paidByName}
                        size="xs"
                        tone={transaction.paidByUserId === currentUserId ? 'forest' : 'outline'}
                        className="hidden sm:inline-flex"
                      />
                    ) : null}

                    <span className="shrink-0 text-right">
                      <Money
                        minor={transaction.amountMinor}
                        currency={currency}
                        size={compact ? 'xs' : 'sm'}
                        signed={transaction.type === 'INCOME'}
                        forceNegative={transaction.type === 'EXPENSE'}
                        hideFraction
                        className={transaction.type === 'INCOME' ? 'text-positive' : 'text-ink'}
                      />
                      <span className="mt-1 block font-mono text-[0.625rem] tracking-[0.06em] text-ink-faint">
                        {formatDateTimeRelative(new Date(transaction.date)).split(' · ')[1] ??
                          formatDayLabel(new Date(transaction.date))}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <TransactionDetail
        transaction={selected}
        currency={currency}
        workspaceId={workspaceId}
        shared={shared}
        currentUserId={currentUserId}
        options={options}
        onClose={() => setSelected(null)}
        onChanged={() => {
          setSelected(null);
          onChanged?.();
        }}
      />
    </>
  );
}

function groupByDayLabel(
  transactions: TransactionClientRow[],
): { label: string; rows: TransactionClientRow[] }[] {
  const now = new Date();
  const groups: { label: string; rows: TransactionClientRow[] }[] = [];

  for (const transaction of transactions) {
    const label = formatDayLabel(new Date(transaction.date), now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(transaction);
    else groups.push({ label, rows: [transaction] });
  }

  return groups;
}
