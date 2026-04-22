// ── SERVICE WORKER ────────────────────────────────────
// Strategy: Cache-first for app shell, network-first for anything else.
// Version bump here to force cache refresh on deploy.

const CACHE = 'clock-v1';

// All files that make up the app shell
const PRECACHE = [
  '/Clock/index.html',
  '/Clock/manifest.json',
  'https://fonts.googleapis.com/css2?family=Azeret+Mono:wght@100;200;300;400&family=Syne:wght@700;800&display=swap',
];

// ── INSTALL ───────────────────────────────────────────
// Pre-cache app shell on install
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()) // activate immediately
  );
});

// ── ACTIVATE ──────────────────────────────────────────
// Delete old caches on activation
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim()) // take control immediately
  );
});

// ── FETCH ─────────────────────────────────────────────
// Cache-first for same-origin + fonts, network-only for everything else
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and non-http requests
  if (!url.protocol.startsWith('http')) return;

  const isSameOrigin = url.origin === self.location.origin;
  const isFontRequest = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

  if (isSameOrigin || isFontRequest) {
    // Cache-first: serve from cache, fall back to network, then cache response
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          // Only cache valid responses
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, clone));
          return response;
        }).catch(() => {
          // Offline fallback — return the cached app shell
          if (request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
    );
  }
  // All other requests (analytics, etc.) go straight to network
});

// ── BACKGROUND TIMER NOTIFICATIONS ───────────────────
// Receives a message from the page to schedule a notification
// when the app is backgrounded and a timer completes.
self.addEventListener('message', event => {
  if (event.data?.type === 'SCHEDULE_TIMER') {
    const { label, delayMs } = event.data;
    if (!delayMs || delayMs <= 0) return;

    // Store the timeout ID so we can cancel it
    const id = setTimeout(() => {
      self.registration.showNotification('Timer done ✓', {
        body: label || 'Your timer has ended.',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'clock-timer',
        renotify: true,
        vibrate: [200, 100, 200, 100, 400],
        actions: [
          { action: 'open', title: 'Open' }
        ]
      });
    }, delayMs);

    // Allow cancelling
    event.source?.postMessage({ type: 'TIMER_SCHEDULED', id });
  }

  if (event.data?.type === 'CANCEL_TIMER') {
    clearTimeout(event.data.id);
  }
});

// ── NOTIFICATION CLICK ────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(list => {
          for (const client of list) {
            if (client.url.includes('clock') && 'focus' in client) {
              return client.focus();
            }
          }
          return clients.openWindow('/index.html');
        })
    );
  }
});
