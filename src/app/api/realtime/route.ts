import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/server/auth/session';
import { loadWorkspaceForUser, personalScopeKey, workspaceScopeKey } from '@/server/scope';
import { realtime, userChannel, type RealtimeEvent } from '@/server/realtime';

/**
 * Server-Sent Events stream.
 *
 * SSE over WebSockets because the traffic is entirely one-way (server → client
 * change notices) and SSE reconnects on its own, needs no extra server, and
 * rides the existing session cookie for auth.
 *
 * The channels a connection may subscribe to are derived from the session and
 * a membership check — a client cannot ask to listen to a workspace it does
 * not belong to.
 */

export const dynamic = 'force-dynamic';
// Streaming needs the Node runtime; the edge runtime would buffer this.
export const runtime = 'nodejs';

const HEARTBEAT_MS = 25_000;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const requestedWorkspace = new URL(request.url).searchParams.get('workspace');

  const channels = [userChannel(user.id), personalScopeKey(user.id)];

  if (requestedWorkspace) {
    const workspace = await loadWorkspaceForUser(requestedWorkspace, user.id);
    if (!workspace) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    channels.push(workspaceScopeKey(workspace.id));
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      // Tell the browser to wait 5s before reconnecting after a drop.
      send('retry: 5000\n\n');
      send(`event: ready\ndata: ${JSON.stringify({ channels: channels.length })}\n\n`);

      const unsubscribe = realtime.subscribe(channels, (event: RealtimeEvent) => {
        send(
          `event: change\ndata: ${JSON.stringify({
            entity: event.entity,
            actorId: event.actorId,
            at: event.at,
          })}\n\n`,
        );
      });

      // Comment frames keep proxies from closing an idle connection.
      const heartbeat = setInterval(() => send(': keep-alive\n\n'), HEARTBEAT_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed by the client.
        }
      };

      request.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Disable proxy buffering (nginx), which would defeat streaming.
      'X-Accel-Buffering': 'no',
    },
  });
}
