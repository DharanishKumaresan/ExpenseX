'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TransactionForm } from './transaction-form';
import type { FormOptions } from './types';

/** Explicit "+ Add transaction" entry point, alongside the floating button. */
export function AddTransactionButton({
  options,
  currency,
  workspaceId,
  shared,
  currentUserId,
  label = 'Add transaction',
}: {
  options: FormOptions;
  currency: string;
  workspaceId: string | null;
  shared: boolean;
  currentUserId: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {label}
      </Button>

      <TransactionForm
        open={open}
        onClose={() => setOpen(false)}
        options={options}
        currency={currency}
        workspaceId={workspaceId}
        shared={shared}
        currentUserId={currentUserId}
        onSaved={() => setOpen(false)}
      />
    </>
  );
}
