/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope;

self.skipWaiting();
self.addEventListener('activate', () => self.clients.claim());

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// SPA: minden oldal-navigáció az index.html-t kapja (offline is)
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }));

// Megálló- és járatadatok: ritkán változnak → gyors válasz a gyorsítótárból, háttérben frissítés
registerRoute(({ url }) => /^\/api\/(stops\/search|stops\/nearby|stops\/[^/]+$|routes\/)/.test(url.pathname),
  new StaleWhileRevalidate({ cacheName: 'api-static', plugins: [new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 7 * 86400 })] }));

// Élő adatok: hálózat elsőként, offline a legutóbbi válasz
registerRoute(({ url }) => url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/push'),
  new NetworkFirst({ cacheName: 'api-live', networkTimeoutSeconds: 6, plugins: [new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 86400 })] }));

// Térképcsempék
registerRoute(({ url }) => url.hostname === 'tiles.openfreemap.org',
  new CacheFirst({ cacheName: 'map-tiles', plugins: [new ExpirationPlugin({ maxEntries: 3000, maxAgeSeconds: 30 * 86400 })] }));

// ---- Push értesítések ----
self.addEventListener('push', (event) => {
  let msg: { title: string; body: string; tag?: string; url?: string; requireInteraction?: boolean } = { title: 'BP Utas', body: '' };
  try { msg = event.data?.json() ?? msg; } catch { msg.body = event.data?.text() ?? ''; }
  event.waitUntil(self.registration.showNotification(msg.title, {
    body: msg.body,
    tag: msg.tag,
    icon: '/icon.svg',
    badge: '/icon.svg',
    data: { url: msg.url ?? '/' },
    requireInteraction: msg.requireInteraction,
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url ?? '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { await (c as WindowClient).navigate(url).catch(() => null); return (c as WindowClient).focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
