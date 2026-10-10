'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker and keeps it current.
 *
 * The worker caches build output only (see public/sw.js for why it refuses to
 * cache pages), so there is no "new content available, reload?" prompt to
 * show: a new build ships new hashed filenames, the old worker is replaced on
 * the next navigation, and the user never sees a mixed-version app.
 *
 * In development it does the opposite job — it unregisters anything already
 * installed, because a worker holding on to old chunks makes hot reloading
 * behave in ways that look like application bugs.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
        .catch(() => {});
      return;
    }

    let cancelled = false;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        if (cancelled) return;

        // A tab left open for days should still pick up a new deploy.
        const interval = window.setInterval(
          () => {
            void registration.update().catch(() => {});
          },
          60 * 60 * 1000,
        );

        return () => window.clearInterval(interval);
      } catch {
        // A failed registration must never break the app; it only means no
        // offline fallback and no asset cache on this visit.
      }
      return undefined;
    };

    let cleanup: (() => void) | undefined;
    void register().then((fn) => {
      if (cancelled) fn?.();
      else cleanup = fn;
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return null;
}

/**
 * Drops every cache the worker owns.
 *
 * Called on sign-out: the caches hold no personal data by design, but a device
 * that has been handed to someone else should not keep the previous session's
 * bytes around at all.
 */
export async function clearServiceWorkerCaches(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    registration?.active?.postMessage({ type: 'CLEAR_CACHES' });
  } catch {
    // Nothing to clear, or the worker is gone already.
  }
}
