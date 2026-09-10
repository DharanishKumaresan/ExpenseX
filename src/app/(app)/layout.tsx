import { Sidebar } from '@/components/shell/sidebar';
import { MobileNav } from '@/components/shell/mobile-nav';
import { Header, MobileWorkspaceBar } from '@/components/shell/header';
import { RealtimeListener } from '@/components/shell/realtime-listener';
import { requireUserPage, loadActiveWorkspace } from '@/server/scope';
import { loadNotifications, loadIncomingInvitations, expireStaleInvitations } from '@/server/queries/collaboration';

/**
 * The authenticated shell.
 *
 * Loads once per navigation: the session user, their single active shared
 * workspace (if any), the notification tray and any invitation waiting for
 * them. Everything below renders inside one large rounded panel sitting on the
 * sage canvas — the ground/panel relationship the whole design rests on.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserPage();

  await expireStaleInvitations();

  const [workspace, notifications, invitations] = await Promise.all([
    loadActiveWorkspace(user.id),
    loadNotifications(user.id),
    loadIncomingInvitations(user.email),
  ]);

  const switcherWorkspace = workspace
    ? {
        id: workspace.id,
        name: workspace.name,
        partnerName: workspace.partner?.name ?? null,
      }
    : null;

  return (
    <div className="flex min-h-dvh bg-canvas">
      <Sidebar
        workspace={switcherWorkspace}
        userName={user.name}
        hasSharedSpace={Boolean(workspace)}
        pendingInvitations={invitations.length}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          user={{ name: user.name, email: user.email, currency: user.currency }}
          workspace={switcherWorkspace}
          notifications={notifications.rows}
          unread={notifications.unread}
        />

        <MobileWorkspaceBar workspace={switcherWorkspace} userName={user.name} />

        {/* pb clears the mobile bottom bar and the floating add button. */}
        <main
          id="main"
          className="min-w-0 flex-1 px-3 pt-3 pb-28 sm:px-6 lg:px-8 lg:pt-2 lg:pb-10"
        >
          <div className="ex-panel min-h-full px-4 py-6 sm:px-7 sm:py-8 lg:px-10 lg:py-10">
            {children}
          </div>
        </main>
      </div>

      <MobileNav
        workspace={switcherWorkspace}
        userName={user.name}
        hasSharedSpace={Boolean(workspace)}
        pendingInvitations={invitations.length}
      />

      <RealtimeListener
        workspaceId={workspace?.id ?? null}
        userId={user.id}
        partnerName={workspace?.partner?.name ?? null}
      />
    </div>
  );
}
