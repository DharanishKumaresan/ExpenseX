'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

/**
 * Error boundary for the authenticated app.
 *
 * Next.js hands the client a sanitised error in production — no message, only
 * a digest that correlates with the server log. Nothing internal is shown
 * either way; the user gets a plain explanation and a way forward.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[expensex] route error', error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-start justify-center gap-6">
      <div className="flex flex-col gap-3">
        <p className="ex-label">Something went wrong</p>
        <h1 className="max-w-[22ch] text-[1.75rem] leading-[1.05] font-bold tracking-[-0.03em] uppercase text-ink sm:text-[2.25rem]">
          We could not load this screen.
        </h1>
        <p className="max-w-[46ch] text-[0.9375rem] leading-relaxed text-ink-3">
          Your data is safe — this was a problem rendering the page, not saving anything. Try again,
          and if it keeps happening head back to your overview.
        </p>
        {error.digest ? (
          <p className="font-mono text-[0.6875rem] tracking-[0.1em] uppercase text-ink-faint">
            Reference {error.digest}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={reset}>Try again</Button>
        <Link
          href="/overview"
          className="inline-flex h-11 items-center rounded-[8px] border border-line-strong px-5 font-mono text-[0.75rem] tracking-[0.14em] uppercase text-ink transition-colors hover:bg-surface-2"
        >
          Back to overview
        </Link>
      </div>
    </div>
  );
}
