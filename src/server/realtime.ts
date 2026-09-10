import 'server-only';
import { EventEmitter } from 'node:events';

/**
 * Real-time change propagation.
 *
 * Writes publish an event; connected clients hold an SSE stream
 * (`/api/realtime`) and refresh the affected route when one arrives. This is
 * genuine server push — nothing here polls, and no timer fakes it.
 *
 * TRANSPORT
 * ---------
 * The default bus is in-process, which is correct and complete for a
 * single-instance deployment (the default for this app). Across several
 * instances a message published on instance A would not reach a listener on
 * instance B, so `RealtimeBus` is an interface with one seam: swap in a
 * PostgreSQL LISTEN/NOTIFY or Redis pub/sub implementation and every call site
 * keeps working. See README → Realtime.
 */

export type RealtimeEntity =
  | 'transaction'
  | 'budget'
  | 'goal'
  | 'contribution'
  | 'recurring'
  | 'activity'
  | 'notification'
  | 'membership';

export interface RealtimeEvent {
  /** Scope the change belongs to: "u:<userId>" or "w:<workspaceId>". */
  channel: string;
  entity: RealtimeEntity;
  /** Who caused it — clients skip refreshing for their own echo. */
  actorId: string;
  at: number;
}

export interface RealtimeBus {
  publish(event: RealtimeEvent): void;
  subscribe(channels: readonly string[], handler: (event: RealtimeEvent) => void): () => void;
}

class InProcessBus implements RealtimeBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // One SSE listener per connected tab per channel; the Node default of 10
    // is far too low and would log spurious leak warnings.
    this.emitter.setMaxListeners(0);
  }

  publish(event: RealtimeEvent): void {
    this.emitter.emit(event.channel, event);
  }

  subscribe(channels: readonly string[], handler: (event: RealtimeEvent) => void): () => void {
    const unique = Array.from(new Set(channels));
    for (const channel of unique) this.emitter.on(channel, handler);
    return () => {
      for (const channel of unique) this.emitter.off(channel, handler);
    };
  }
}

// Survives hot reloads in dev, which would otherwise strand open SSE streams
// on an emitter nobody publishes to any more.
const globalForBus = globalThis as unknown as { realtimeBus?: RealtimeBus };
export const realtime: RealtimeBus = globalForBus.realtimeBus ?? new InProcessBus();
if (process.env.NODE_ENV !== 'production') globalForBus.realtimeBus = realtime;

/** Announce a change to everyone watching a scope. */
export function publishChange(channel: string, entity: RealtimeEntity, actorId: string): void {
  realtime.publish({ channel, entity, actorId, at: Date.now() });
}

/** Personal notification channel for a user, independent of any workspace. */
export function userChannel(userId: string): string {
  return `n:${userId}`;
}
