/* eslint-disable no-restricted-globals */
/**
 * ExpenseX service worker.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ----------------------------------
 * It never caches an HTML document, an API response or a server action. Every
 * page in this app is rendered against the signed-in session and is full of
 * one person's money. A cached page would survive sign-out, would be served to
 * whoever opens the browser next, and on a shared device would hand one user
 * another user's ledger. Offline-first is not worth that, so navigations are
 * network-only with a static "you are offline" page as the fallback.
 *
 * What it does cache is the build output: hashed JS/CSS chunks under
 * /_next/static, fonts and icons. Those are immutable, contain no personal
 * data, and are the bulk of what a repeat visit downloads.
 */

const VERSION = 'v2-monochrome';
const STATIC_CACHE = `expensex-static-${VERSION}`;
const ASSET_CACHE = `expensex-assets-${VERSION}`;
const OFFLINE_URL = '/offline.html';

/** The minimum needed to render something sensible with no network. */
const PRECACHE = [OFFLINE_URL, '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // `reload` bypasses the HTTP cache so an update never precaches a stale
      // copy of the offline page.
      await cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('expensex-') && key !== STATIC_CACHE && key !== ASSET_CACHE)
          .map((key) => caches.delete(key)),
      );
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })(),
  );
});

/**
 * The app asks for every cache to be dropped on sign-out, so nothing of the
 * previous session is left on disk for the next person to use the device.
 */
self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (event.data.type === 'CLEAR_CACHES') {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key.startsWith('expensex-')).map((key) => caches.delete(key)));
      })(),
    );
  }
});

/** Immutable build output: hashed filenames, so the cached copy is always right. */
function isImmutableAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/icon.svg' ||
    url.pathname === '/favicon.ico' ||
    url.pathname === '/manifest.webmanifest'
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only ever touch same-origin GETs. Server actions are POSTs and must always
  // reach the network; cross-origin requests are none of this worker's business.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Realtime is a long-lived stream; caching it would break the connection.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const preloaded = await event.preloadResponse;
          if (preloaded) return preloaded;
          return await fetch(request);
        } catch {
          const cache = await caches.open(STATIC_CACHE);
          const offline = await cache.match(OFFLINE_URL);
          return (
            offline ??
            new Response('You are offline.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          );
        }
      })(),
    );
    return;
  }

  if (!isImmutableAsset(url)) return;

  // Cache-first: these filenames change whenever their contents do.
  event.respondWith(
    (async () => {
      const cache = await caches.open(ASSET_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response.ok && response.type === 'basic') {
          cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        if (cached) return cached;
        throw error;
      }
    })(),
  );
});
