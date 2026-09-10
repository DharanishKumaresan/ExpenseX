import type { PaymentMethod, TransactionType } from '@prisma/client';
import type { TransactionRow } from '@/server/queries/transactions';

/**
 * The flattened, serialisable shape a transaction takes once it crosses into
 * client components. Prisma rows carry nested relations and Date objects that
 * are awkward to pass through the server/client boundary repeatedly, so the
 * mapping happens once, here.
 */
export interface TransactionClientRow {
  id: string;
  type: TransactionType;
  amountMinor: number;
  merchant: string;
  notes: string | null;
  /** ISO string — Dates do survive the boundary, but strings keep keys stable. */
  date: string;
  paymentMethod: PaymentMethod;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  categoryColor: string | null;
  accountId: string | null;
  accountName: string | null;
  accountLast4: string | null;
  createdByUserId: string;
  createdByName: string;
  paidByUserId: string | null;
  paidByName: string | null;
  tags: string[];
  version: number;
}

export function toClientRow(row: TransactionRow): TransactionClientRow {
  return {
    id: row.id,
    type: row.type,
    amountMinor: row.amountMinor,
    merchant: row.merchant,
    notes: row.notes,
    date: row.date.toISOString(),
    paymentMethod: row.paymentMethod,
    categoryId: row.category?.id ?? null,
    categoryName: row.category?.name ?? null,
    categorySlug: row.category?.slug ?? null,
    categoryColor: row.category?.color ?? null,
    accountId: row.account?.id ?? null,
    accountName: row.account?.name ?? null,
    accountLast4: row.account?.last4 ?? null,
    createdByUserId: row.userId,
    createdByName: row.user.name,
    paidByUserId: row.paidByUserId,
    paidByName: row.paidByUser?.name ?? null,
    tags: row.tags.map((entry) => entry.tag.name),
    version: row.version,
  };
}

/** Option lists the transaction form needs, resolved on the server. */
export interface FormOptions {
  categories: { id: string; name: string; slug: string; kind: string }[];
  accounts: { id: string; name: string; last4: string | null }[];
  members: { userId: string; name: string; isSelf: boolean }[];
  merchants: string[];
}
