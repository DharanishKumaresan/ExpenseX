'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Money } from '@/components/ui/money-display';
import { Badge } from '@/components/ui/primitives';
import { formatDayLabel } from '@/lib/date';
import { debounce } from '@/lib/utils';

/**
 * Global search.
 *
 * Scoped to the workspace the user is currently in — searching inside the
 * shared space never returns a personal transaction, and vice versa. The
 * server enforces that; `workspaceId` here only states which scope to ask for.
 */

export interface SearchHit {
  kind: 'transaction' | 'goal' | 'budget' | 'category';
  id: string;
  title: string;
  subtitle: string;
  amountMinor?: number;
  date?: string;
  href: string;
}

export function SearchDialog({
  open,
  onClose,
  workspaceId,
  currency,
  scopeLabel,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string | null;
  currency: string;
  scopeLabel: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'done'>('idle');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(
    async (term: string) => {
      abortRef.current?.abort();
      if (term.trim().length < 2) {
        setResults([]);
        setStatus('idle');
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setStatus('loading');

      try {
        const params = new URLSearchParams({ q: term.trim() });
        if (workspaceId) params.set('workspace', workspaceId);
        const response = await fetch(`/api/search?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('search failed');
        const payload = (await response.json()) as { results: SearchHit[] };
        setResults(payload.results);
        setHighlight(0);
        setStatus('done');
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setStatus('error');
      }
    },
    [workspaceId],
  );

  const debounced = useMemo(() => debounce(runSearch, 220), [runSearch]);

  useEffect(() => () => debounced.cancel(), [debounced]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setStatus('idle');
      return;
    }
    // Autofocus after the dialog paints.
    const timer = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, [open]);

  const go = (hit: SearchHit) => {
    onClose();
    router.push(hit.href);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (results.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((value) => (value + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((value) => (value - 1 + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const hit = results[highlight];
      if (hit) go(hit);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Search" eyebrow={scopeLabel} size="md">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-[10px] border border-line bg-surface-3 px-3.5">
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true" className="shrink-0 text-ink-3">
            <circle cx="7.8" cy="7.8" r="5.4" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11.8 11.8L15.5 15.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              debounced(event.target.value);
            }}
            onKeyDown={onKeyDown}
            placeholder="Merchants, goals, categories…"
            aria-label="Search"
            className="h-12 w-full bg-transparent text-[0.9375rem] text-ink outline-none placeholder:text-ink-faint"
          />
          {status === 'loading' ? (
            <span className="ex-label shrink-0 text-ink-faint">Searching…</span>
          ) : null}
        </div>

        {status === 'error' ? (
          <p className="rounded-[8px] border border-coral bg-coral/10 px-3 py-2.5 text-[0.8125rem] text-ink">
            Search is unavailable right now. Try again in a moment.
          </p>
        ) : null}

        {status === 'idle' && query.trim().length < 2 ? (
          <p className="py-6 text-center text-[0.8125rem] text-ink-3">
            Type at least two characters. Results stay inside <strong className="font-semibold text-ink-2">{scopeLabel}</strong>.
          </p>
        ) : null}

        {status === 'done' && results.length === 0 ? (
          <p className="py-6 text-center text-[0.8125rem] text-ink-3">
            Nothing matched &ldquo;{query.trim()}&rdquo;.
          </p>
        ) : null}

        {results.length > 0 ? (
          <ul className="-mx-1 flex flex-col">
            {results.map((hit, index) => (
              <li key={`${hit.kind}-${hit.id}`}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => go(hit)}
                  className={`flex w-full items-center gap-3 rounded-[8px] px-3 py-2.5 text-left transition-colors ${
                    index === highlight ? 'bg-surface-3' : 'hover:bg-surface-2'
                  }`}
                >
                  <Badge tone={hit.kind === 'transaction' ? 'neutral' : 'outline'}>{hit.kind}</Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.875rem] font-semibold text-ink">{hit.title}</span>
                    <span className="block truncate text-[0.75rem] text-ink-3">{hit.subtitle}</span>
                  </span>
                  {hit.amountMinor !== undefined ? (
                    <span className="shrink-0 text-right">
                      <Money minor={hit.amountMinor} currency={currency} size="xs" hideFraction className="text-ink" />
                      {hit.date ? (
                        <span className="mt-0.5 block font-mono text-[0.625rem] text-ink-faint">
                          {formatDayLabel(new Date(hit.date))}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Modal>
  );
}
