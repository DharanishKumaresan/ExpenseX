import { TransactionList } from './transaction-list';
import { FilterBar, Pagination } from './filter-bar';
import { AddTransactionButton } from './add-transaction-button';
import { toClientRow } from './types';
import { buildFormOptions } from './quick-add-server';
import { listTransactions, type TransactionFilters } from '@/server/queries/transactions';
import { loadAccounts, loadCategories } from '@/server/queries/reference';
import type { Scope } from '@/server/scope';
import { Money } from '@/components/ui/money-display';
import { cashFlow } from '@/lib/analytics';
import { fromDateTimeInputs } from '@/lib/date';
import { addDays } from '@/lib/date';

/**
 * The transactions screen, shared by /transactions and /shared/transactions.
 *
 * Both call it with their own verified Scope. Nothing here decides which
 * workspace to read — that has already been settled by `resolveScope`.
 */

const PAGE_SIZE = 25;

export interface TransactionsSearchParams {
  q?: string;
  type?: string;
  category?: string;
  method?: string;
  account?: string;
  paidBy?: string;
  from?: string;
  to?: string;
  sort?: string;
  page?: string;
}

const TYPES = new Set(['EXPENSE', 'INCOME', 'TRANSFER']);
const METHODS = new Set(['CASH', 'UPI', 'DEBIT_CARD', 'CREDIT_CARD', 'BANK_TRANSFER', 'OTHER']);
const SORTS = new Set(['date-desc', 'date-asc', 'amount-desc', 'amount-asc']);

/** Query strings are user input: every value is validated before it reaches Prisma. */
function parseFilters(params: TransactionsSearchParams): TransactionFilters {
  const filters: TransactionFilters = {};

  if (params.q) filters.search = params.q.slice(0, 80);
  if (params.type && TYPES.has(params.type)) filters.types = [params.type as 'EXPENSE'];
  if (params.category) filters.categoryIds = [params.category];
  if (params.method && METHODS.has(params.method)) filters.paymentMethods = [params.method as 'UPI'];
  if (params.account) filters.accountIds = [params.account];
  if (params.paidBy) filters.paidByUserId = params.paidBy;
  if (params.sort && SORTS.has(params.sort)) filters.sort = params.sort as 'date-desc';

  const from = params.from ? fromDateTimeInputs(params.from) : null;
  if (from) filters.from = from;

  const to = params.to ? fromDateTimeInputs(params.to) : null;
  // `to` is inclusive in the UI but exclusive in the query.
  if (to) filters.to = addDays(to, 1);

  return filters;
}

export async function TransactionsScreen({
  scope,
  userId,
  searchParams,
}: {
  scope: Scope;
  userId: string;
  searchParams: TransactionsSearchParams;
}) {
  const filters = parseFilters(searchParams);
  const page = Math.max(1, Number(searchParams.page) || 1);

  const [result, formOptions, categories, accounts] = await Promise.all([
    listTransactions(scope, filters, page, PAGE_SIZE),
    buildFormOptions(scope, userId),
    loadCategories(userId),
    loadAccounts(userId),
  ]);

  const rows = result.rows.map(toClientRow);

  // Totals describe the page in view, and say so — a filtered total that
  // silently covered only 25 of 300 matches would be actively misleading.
  const pageTotals = cashFlow(
    result.rows.map((row) => ({
      id: row.id,
      type: row.type,
      amountMinor: row.amountMinor,
      date: row.date,
      categoryId: row.category?.id ?? null,
      merchant: row.merchant,
    })),
  );

  const shared = scope.kind === 'shared';

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[1.75rem] leading-[1.02] font-semibold tracking-[-0.03em] sm:text-[2.25rem]">
          <span className="block font-normal text-ink-faint">
            {shared ? 'Everything we' : 'All recent'}
          </span>
          <span className="block font-bold text-ink">
            {shared ? 'Spent together' : 'Transactions'}
          </span>
        </h1>

        <AddTransactionButton
          options={formOptions}
          currency={scope.currency}
          workspaceId={scope.workspaceId}
          shared={shared}
          currentUserId={userId}
        />
      </header>

      <FilterBar
        options={{
          categories: categories.map((category) => ({ id: category.id, name: category.name })),
          accounts: accounts.map((account) => ({ id: account.id, name: account.name })),
          members: formOptions.members,
        }}
        shared={shared}
        resultCount={result.total}
      />

      {rows.length > 0 ? (
        <dl className="grid grid-cols-2 gap-4 border-y border-line py-4 sm:grid-cols-3">
          <div>
            <dt className="ex-label">Spent on this page</dt>
            <dd className="mt-1.5">
              <Money minor={pageTotals.expenseMinor} currency={scope.currency} size="sm" hideFraction className="text-ink" />
            </dd>
          </div>
          <div>
            <dt className="ex-label">Received on this page</dt>
            <dd className="mt-1.5">
              <Money minor={pageTotals.incomeMinor} currency={scope.currency} size="sm" hideFraction className="text-ink" />
            </dd>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <dt className="ex-label">Matching transactions</dt>
            <dd className="ex-numeral mt-1.5 text-[1rem] text-ink">{result.total}</dd>
          </div>
        </dl>
      ) : null}

      <TransactionList
        transactions={rows}
        currency={scope.currency}
        workspaceId={scope.workspaceId}
        shared={shared}
        currentUserId={userId}
        options={formOptions}
        emptyHeadline={
          Object.keys(filters).length > 0
            ? 'Nothing matches those filters.'
            : shared
              ? 'Nothing shared yet.'
              : 'Your spending story starts here.'
        }
        emptyBody={
          Object.keys(filters).length > 0
            ? 'Try widening the date range or clearing a filter.'
            : shared
              ? 'Add the first shared expense and both of you will see it here.'
              : 'Add your first expense and this list fills in.'
        }
      />

      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        pageSize={result.pageSize}
      />
    </div>
  );
}
