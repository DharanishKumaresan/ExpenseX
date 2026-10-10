'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { Select } from '@/components/ui/field';
import { Badge } from '@/components/ui/primitives';
import { PAYMENT_METHOD_LABELS, TRANSACTION_TYPE_LABELS } from '@/lib/validation';
import { cn, debounce } from '@/lib/utils';

/**
 * Transaction filters.
 *
 * Every filter is a URL parameter, so a filtered view is shareable, survives a
 * refresh, and is read on the server — the list is never filtered client-side
 * over a partial page of rows, which would silently lie about the results.
 */

export interface FilterOptions {
  categories: { id: string; name: string }[];
  accounts: { id: string; name: string }[];
  members: { userId: string; name: string; isSelf: boolean }[];
}

const SORTS = [
  { value: 'date-desc', label: 'Newest first' },
  { value: 'date-asc', label: 'Oldest first' },
  { value: 'amount-desc', label: 'Largest first' },
  { value: 'amount-asc', label: 'Smallest first' },
] as const;

export function FilterBar({
  options,
  shared,
  resultCount,
}: {
  options: FilterOptions;
  shared: boolean;
  resultCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [searchValue, setSearchValue] = useState(params.get('q') ?? '');

  // Keep the input in step when the URL changes from elsewhere (back button).
  useEffect(() => {
    setSearchValue(params.get('q') ?? '');
  }, [params]);

  const update = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
      }
      // Any filter change resets paging; page 3 of the old result set is
      // meaningless against the new one.
      next.delete('page');
      startTransition(() => {
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      });
    },
    [params, pathname, router],
  );

  const debouncedSearch = useMemo(
    () => debounce((value: string) => update({ q: value || null }), 300),
    [update],
  );

  useEffect(() => () => debouncedSearch.cancel(), [debouncedSearch]);

  const active = useMemo(() => {
    const entries: { key: string; label: string }[] = [];
    const type = params.get('type');
    const category = params.get('category');
    const method = params.get('method');
    const account = params.get('account');
    const paidBy = params.get('paidBy');
    const from = params.get('from');
    const to = params.get('to');

    if (type) entries.push({ key: 'type', label: TRANSACTION_TYPE_LABELS[type as 'EXPENSE'] ?? type });
    if (category) {
      entries.push({
        key: 'category',
        label: options.categories.find((c) => c.id === category)?.name ?? 'Category',
      });
    }
    if (method) {
      entries.push({ key: 'method', label: PAYMENT_METHOD_LABELS[method as 'UPI'] ?? method });
    }
    if (account) {
      entries.push({
        key: 'account',
        label: options.accounts.find((a) => a.id === account)?.name ?? 'Account',
      });
    }
    if (paidBy) {
      const member = options.members.find((m) => m.userId === paidBy);
      entries.push({ key: 'paidBy', label: member ? `Paid by ${member.isSelf ? 'you' : member.name}` : 'Paid by' });
    }
    if (from) entries.push({ key: 'from', label: `From ${from}` });
    if (to) entries.push({ key: 'to', label: `To ${to}` });
    return entries;
  }, [params, options]);

  const clearAll = () => {
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
    setSearchValue('');
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Search takes the full width on narrow screens; sort and filters drop
          to their own row rather than squeezing the input to nothing. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex h-11 min-w-0 items-center gap-2.5 rounded-[8px] border border-line bg-surface-3 px-3 sm:flex-1">
          <svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden="true" className="shrink-0 text-ink-3">
            <circle cx="7.8" cy="7.8" r="5.4" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11.8 11.8L15.5 15.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={searchValue}
            onChange={(event) => {
              setSearchValue(event.target.value);
              debouncedSearch(event.target.value);
            }}
            placeholder="Search merchants and notes"
            aria-label="Search transactions"
            className="w-full min-w-0 bg-transparent text-[0.875rem] text-ink outline-none placeholder:text-ink-faint"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select
            aria-label="Sort transactions"
            value={params.get('sort') ?? 'date-desc'}
            onChange={(event) => update({ sort: event.target.value })}
            className="h-11 flex-1 sm:w-auto sm:min-w-[9.5rem] sm:flex-none"
          >
            {SORTS.map((sort) => (
              <option key={sort.value} value={sort.value}>
                {sort.label}
              </option>
            ))}
          </Select>

          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className={cn(
              'flex h-11 shrink-0 items-center gap-2 rounded-[8px] border px-3.5 font-mono text-[0.6875rem] tracking-[0.14em] uppercase transition-colors',
              expanded || active.length > 0
                ? 'border-ink bg-surface-3 text-ink'
                : 'border-line text-ink-3 hover:border-line-strong hover:text-ink',
            )}
          >
            Filters
            {active.length > 0 ? (
              <span className="grid size-4 place-items-center rounded-full bg-forest text-[0.5625rem] text-on-forest">
                {active.length}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="grid gap-3 rounded-[10px] border border-line bg-surface-2 p-3.5 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="ex-label">Type</span>
            <Select value={params.get('type') ?? ''} onChange={(e) => update({ type: e.target.value })}>
              <option value="">All types</option>
              {Object.entries(TRANSACTION_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="ex-label">Category</span>
            <Select value={params.get('category') ?? ''} onChange={(e) => update({ category: e.target.value })}>
              <option value="">All categories</option>
              {options.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="ex-label">Payment method</span>
            <Select value={params.get('method') ?? ''} onChange={(e) => update({ method: e.target.value })}>
              <option value="">Any method</option>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>

          {shared && options.members.length > 0 ? (
            <label className="flex flex-col gap-1.5">
              <span className="ex-label">Paid by</span>
              <Select value={params.get('paidBy') ?? ''} onChange={(e) => update({ paidBy: e.target.value })}>
                <option value="">Anyone</option>
                {options.members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.isSelf ? 'You' : member.name}
                  </option>
                ))}
              </Select>
            </label>
          ) : options.accounts.length > 0 ? (
            <label className="flex flex-col gap-1.5">
              <span className="ex-label">Account</span>
              <Select value={params.get('account') ?? ''} onChange={(e) => update({ account: e.target.value })}>
                <option value="">Any account</option>
                {options.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}

          <label className="flex flex-col gap-1.5">
            <span className="ex-label">From</span>
            <input
              type="date"
              value={params.get('from') ?? ''}
              onChange={(e) => update({ from: e.target.value })}
              className="h-11 w-full rounded-[8px] border border-line bg-surface-3 px-3 text-[0.875rem] text-ink"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="ex-label">To</span>
            <input
              type="date"
              value={params.get('to') ?? ''}
              onChange={(e) => update({ to: e.target.value })}
              className="h-11 w-full rounded-[8px] border border-line bg-surface-3 px-3 text-[0.875rem] text-ink"
            />
          </label>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span
          className="ex-label"
          aria-live="polite"
          // Announces "12 results" as filters change, for screen readers.
        >
          {pending ? 'Filtering…' : `${resultCount} ${resultCount === 1 ? 'result' : 'results'}`}
        </span>

        {active.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => update({ [entry.key]: null })}
            className="group inline-flex min-h-8 items-center"
            aria-label={`Remove filter: ${entry.label}`}
          >
            <Badge tone="neutral" className="gap-1.5 transition-colors group-hover:bg-surface-2">
              {entry.label}
              <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
                <path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </Badge>
          </button>
        ))}

        {active.length > 0 || searchValue ? (
          <button
            type="button"
            onClick={clearAll}
            className="font-mono text-[0.625rem] tracking-[0.12em] uppercase text-ink-3 underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink"
          >
            Clear all
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Page links that preserve the current filters. */
export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  if (pageCount <= 1) return null;

  const go = (target: number) => {
    const next = new URLSearchParams(params.toString());
    if (target <= 1) next.delete('page');
    else next.set('page', String(target));
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Transaction pages"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"
    >
      <p className="ex-label">
        {first}–{last} of {total}
      </p>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => go(page - 1)}
          disabled={page <= 1}
          className="h-11 rounded-[7px] border border-line px-4 font-mono text-[0.625rem] tracking-[0.12em] uppercase text-ink-2 transition-colors hover:border-line-strong hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 lg:h-9 lg:px-3"
        >
          Previous
        </button>
        <span className="px-2 font-mono text-[0.6875rem] tracking-[0.08em] text-ink-3">
          {page} / {pageCount}
        </span>
        <button
          type="button"
          onClick={() => go(page + 1)}
          disabled={page >= pageCount}
          className="h-11 rounded-[7px] border border-line px-4 font-mono text-[0.625rem] tracking-[0.12em] uppercase text-ink-2 transition-colors hover:border-line-strong hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 lg:h-9 lg:px-3"
        >
          Next
        </button>
      </div>
    </nav>
  );
}
