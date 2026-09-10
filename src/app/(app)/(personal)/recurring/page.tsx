import type { Metadata } from 'next';
import { requireUserPage, resolveScope } from '@/server/scope';
import { listRecurring } from '@/server/queries/planning';
import { loadAccounts, loadCategories } from '@/server/queries/reference';
import { rollForwardOverdue } from '@/server/actions/recurring';
import { RecurringManager, type RecurringView } from '@/components/recurring/recurring-manager';
import { StatBlock } from '@/components/ui/money-display';
import { recurringTotals } from '@/lib/analytics';

export const metadata: Metadata = { title: 'Recurring' };

export default async function RecurringPage() {
  const user = await requireUserPage('/recurring');
  const scope = await resolveScope(user, null);

  // Catch up anything whose date has slipped into the past before we read.
  await rollForwardOverdue(null);

  const [items, categories, accounts] = await Promise.all([
    listRecurring(scope),
    loadCategories(user.id),
    loadAccounts(user.id),
  ]);

  const totals = recurringTotals(
    items.map((item) => ({
      amountMinor: item.amountMinor,
      frequency: item.frequency,
      active: item.active,
      type: item.type,
    })),
  );

  const views: RecurringView[] = items.map((item) => ({
    id: item.id,
    merchant: item.merchant,
    amountMinor: item.amountMinor,
    frequency: item.frequency,
    type: item.type,
    paymentMethod: item.paymentMethod,
    categoryId: item.category?.id ?? null,
    categoryName: item.category?.name ?? null,
    categorySlug: item.category?.slug ?? null,
    accountId: item.account?.id ?? null,
    notes: item.notes,
    nextDate: item.nextDate.toISOString(),
    active: item.active,
  }));

  return (
    <div className="flex flex-col gap-9">
      <header>
        <h1 className="text-[1.75rem] leading-[1.02] font-semibold tracking-[-0.03em] sm:text-[2.25rem]">
          <span className="block font-normal text-ink-faint">What repeats</span>
          <span className="block font-bold text-ink">Recurring</span>
        </h1>
      </header>

      <section className="grid grid-cols-2 gap-6 border-y border-line py-6 sm:grid-cols-4">
        <StatBlock
          label="Monthly commitments"
          minor={totals.monthlyMinor}
          currency={scope.currency}
          size="lg"
          hideFraction
        />
        <StatBlock
          label="Yearly commitments"
          minor={totals.yearlyMinor}
          currency={scope.currency}
          size="lg"
          hideFraction
          tone="muted"
        />
        <div>
          <p className="ex-label">Active</p>
          <p className="ex-numeral mt-2 text-[1.5rem] text-ink">{totals.activeCount}</p>
        </div>
        <div>
          <p className="ex-label">Paused</p>
          <p className="ex-numeral mt-2 text-[1.5rem] text-ink-3">{totals.pausedCount}</p>
        </div>
      </section>

      <RecurringManager
        items={views}
        categories={categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug, kind: c.kind }))}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, last4: a.last4 }))}
        currency={scope.currency}
        workspaceId={null}
        shared={false}
      />
    </div>
  );
}
