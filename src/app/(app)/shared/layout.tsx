import { QuickAddFor } from '@/components/transactions/quick-add-server';
import { requireUserPage, loadActiveWorkspace } from '@/server/scope';

/**
 * Shared route group.
 *
 * The floating add button is bound to the shared workspace here, so an expense
 * added from any shared screen lands in the shared ledger — never in the
 * user's personal one. With no workspace yet there is nothing to add to, so
 * the button is simply absent.
 */
export default async function SharedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserPage('/shared');
  const workspace = await loadActiveWorkspace(user.id);

  return (
    <>
      {children}
      {workspace ? <QuickAddFor workspaceId={workspace.id} /> : null}
    </>
  );
}
