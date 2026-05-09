/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME = 'flora-pi-v1';
const STATIC_ASSETS = ['/', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || new Response('Offline', { status: 503 }))),
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  const payload = event.data.json();
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || '/favicon.svg',
      badge: payload.badge || '/favicon.svg',
      image: payload.image,
      data: payload.data,
      actions: payload.actions,
      vibrate: [200, 100, 200],
      tag: payload.data?.recommendationId || 'flora-pi',
      renotify: true,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data;
  const action = event.action;

  if (action === 'watered' && data?.recommendationId) {
    event.waitUntil(
      fetch(`/api/recommendations/${data.recommendationId}/watered`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    return;
  }

  const urlToOpen = data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(urlToOpen));
      if (existing) return existing.focus();
      return self.clients.openWindow(urlToOpen);
    }),
  );
});
