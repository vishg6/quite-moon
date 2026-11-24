/*
 * Quiet Moon — service worker. Caches the app shell so it works fully offline.
 * It only ever serves this app's own files; it never contacts any other origin.
 * Author: Vishal Gangaram
 *
 * When you change any app file, bump CACHE_VERSION so phones pick up the update.
 */
const CACHE_VERSION = 'cycle-v1.6.0';
const APP_FILES = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/cycle.js',
  './js/theme-boot.js',
  './js/reminders.js',
  './fonts/inter-latin-var.woff2',
  './fonts/plus-jakarta-sans-latin-var.woff2',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_FILES.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Only handle this app's own GET requests.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // App shell: serve cached index.html instantly (works offline).
    event.respondWith(
      caches.match('./index.html', { ignoreSearch: true })
        .then((hit) => hit || fetch(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
      }
      return res;
    }))
  );
});

/* ---------- Reminders (Android, installed app) ----------
 * About once a day the phone wakes this worker ("periodic background sync").
 * It reads the reminder schedule the app saved on this device and shows any
 * notification that is due. Nothing is fetched or sent anywhere. */

function idb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('cycle-tracker');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function idbGet(db, store, key) {
  return new Promise((resolve) => {
    try {
      const g = db.transaction(store).objectStore(store).get(key);
      g.onsuccess = () => resolve(g.result);
      g.onerror = () => resolve(undefined);
    } catch { resolve(undefined); }
  });
}
function idbPut(db, store, key, value) {
  return new Promise((resolve) => {
    try {
      const t = db.transaction(store, 'readwrite');
      t.objectStore(store).put(value, key);
      t.oncomplete = () => resolve();
      t.onerror = () => resolve();
    } catch { resolve(); }
  });
}
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function checkReminders() {
  const db = await idb();
  const plan = await idbGet(db, 'kv', 'reminderSchedule');
  if (!plan || !plan.enabled) return;
  const now = new Date();
  const today = ymd(now);
  const yesterday = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const sent = (await idbGet(db, 'kv', 'reminderSent')) || {};
  for (const it of plan.items) {
    if (sent[it.key] || it.date > today || it.date < yesterday) continue;
    if (it.date === today && now.getHours() < (it.type === 'log' ? plan.logTime : plan.time)) continue;
    if (it.needsNoLog) {
      const e = await idbGet(db, 'entries', it.date);
      if (e && !e.auto) { sent[it.key] = Date.now(); continue; } // already logged
    }
    await self.registration.showNotification(it.title, { body: it.body, tag: it.key, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' });
    sent[it.key] = Date.now();
  }
  // forget anything older than 60 days
  const cutoff = Date.now() - 60 * 864e5;
  for (const k of Object.keys(sent)) if (sent[k] < cutoff) delete sent[k];
  await idbPut(db, 'kv', 'reminderSent', sent);
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'qm-reminders') event.waitUntil(checkReminders());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow('./');
    })
  );
});
