import { QuickAddFor } from '@/components/transactions/quick-add-server';

/**
 * Personal route group. The URLs are unchanged (/overview, /transactions, …);
 * the group exists so the quick-add button is bound to the personal scope for
 * every screen inside it.
 */
export default function PersonalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <QuickAddFor workspaceId={null} />
    </>
  );
}
