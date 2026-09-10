'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';

/**
 * Live updates.
 *
 * Holds one EventSource for the whole session. When the other person changes
 * something in the shared workspace, the server pushes an event and we refresh
 * the current route — the change appears without anyone reloading.
 *
 * Events caused by this user are ignored: their own mutation already
 * revalidated the page, and refreshing again would fight the optimistic UI.
 */
export function RealtimeListener({
  workspaceId,
  userId,
  partnerName,
}: {
  workspaceId: string | null;
  userId: string;
  partnerName: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastToast = useRef(0);

  useEffect(() => {
    // A user with no shared space still listens on their personal channel so
    // an incoming invitation appears without a reload.
    const params = new URLSearchParams();
    if (workspaceId) params.set('workspace', workspaceId);

    const source = new EventSource(`/api/realtime?${params.toString()}`);

    const onChange = (event: MessageEvent<string>) => {
      let payload: { entity?: string; actorId?: string };
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!payload.actorId || payload.actorId === userId) return;

      // Coalesce bursts (a budget save touches several rows) into one refresh.
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => router.refresh(), 350);

      const now = Date.now();
      if (payload.entity !== 'notification' && now - lastToast.current > 4000) {
        lastToast.current = now;
        toast({
          title: partnerName ? `${partnerName} made a change` : 'Shared space updated',
          description: 'This page just refreshed with the latest numbers.',
        });
      }
    };

    source.addEventListener('change', onChange as EventListener);

    return () => {
      source.removeEventListener('change', onChange as EventListener);
      source.close();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [workspaceId, userId, partnerName, router, toast]);

  return null;
}
