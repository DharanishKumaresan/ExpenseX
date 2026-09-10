import { QuickAdd } from './quick-add';
import { requireUser, resolveScope } from '@/server/scope';
import { loadAccounts, loadCategories } from '@/server/queries/reference';
import { merchantSuggestions } from '@/server/queries/transactions';
import type { FormOptions } from './types';

/**
 * Resolves the option lists for the current scope on the server, then hands
 * them to the client FAB. Mounted from the personal and shared layouts, so the
 * button always adds to the workspace the user is actually looking at.
 */
export async function QuickAddFor({ workspaceId }: { workspaceId: string | null }) {
  const user = await requireUser();
  const scope = await resolveScope(user, workspaceId);
  const options = await buildFormOptions(scope, user.id);

  return (
    <QuickAdd
      options={options}
      currency={scope.currency}
      workspaceId={scope.workspaceId}
      shared={scope.kind === 'shared'}
      currentUserId={user.id}
    />
  );
}

/** Shared by every surface that opens a transaction form. */
export async function buildFormOptions(
  scope: Awaited<ReturnType<typeof resolveScope>>,
  userId: string,
): Promise<FormOptions> {
  const [categories, accounts, merchants] = await Promise.all([
    loadCategories(userId),
    loadAccounts(userId),
    merchantSuggestions(scope, 12),
  ]);

  return {
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      kind: category.kind,
    })),
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      last4: account.last4,
    })),
    members:
      scope.kind === 'shared'
        ? scope.workspace.members.map((member) => ({
            userId: member.userId,
            name: member.name,
            isSelf: member.isSelf,
          }))
        : [],
    merchants,
  };
}
