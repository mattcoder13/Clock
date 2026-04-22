// ── SERVICE WORKER ────────────────────────────────────
// Cache-first for app shell, network-first for anything else.
// Bump CACHE version on every deploy to force refresh.

const CACHE = 'clock-v2';

const PRECACHE = [
  '/Clock/index.html',
  '/Clock/manifest.json',
  'https://fonts.googleapis.com/css2?family=Azeret+Mono:wght@100;200;300;400&family=Syne:wght@700;800&display=swap',
];

// ── INSTALL ───────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ──────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  const isSameOrigin = url.origin === self.location.origin;
  const isFontRequest = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

  if (isSameOrigin || isFontRequest) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, clone));
          return response;
        }).catch(() => {
          if (request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
    );
  }
});

// ── SKIP WAITING (from update banner) ─────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── SCHEDULED TIMERS (multi) ─────────────────────────
// Keep a map of { id -> timeoutHandle } so several timers / alarms
// can be pending simultaneously.
const scheduled = new Map();
let nextId = 1;

self.addEventListener('message', event => {
  const data = event.data;
  if (!data) return;

  if (data.type === 'SCHEDULE_TIMER') {
    const { label, delayMs, title = 'Timer done ✓', tag = 'clock-timer' } = data;
    if (!delayMs || delayMs <= 0) return;

    const id = nextId++;
    const handle = setTimeout(() => {
      scheduled.delete(id);
      self.registration.showNotification(title, {
        body: label || 'Your timer has ended.',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag,
        renotify: true,
        vibrate: [200, 100, 200, 100, 400],
        actions: [{ action: 'open', title: 'Open' }]
      });
    }, delayMs);

    scheduled.set(id, handle);
    event.source?.postMessage({ type: 'TIMER_SCHEDULED', id, requestId: data.requestId });
  }

  if (data.type === 'CANCEL_TIMER') {
    const handle = scheduled.get(data.id);
    if (handle) {
      clearTimeout(handle);
      scheduled.delete(data.id);
    }
  }

  if (data.type === 'CANCEL_ALL_TIMERS') {
    for (const h of scheduled.values()) clearTimeout(h);
    scheduled.clear();
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
            if (client.url.includes('index.html') || client.url.endsWith('/')) {
              if ('focus' in client) return client.focus();
            }
          }
          return clients.openWindow('/index.html');
        })
    );
  }
});
