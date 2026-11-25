/* RoundingOS service worker: makes the app open with no network.
 *
 * Release rule: bump CACHE_VERSION whenever any app file changes, or installed
 * copies keep running the old code. The new version downloads in the background
 * and waits; the page shows "Update available" and only reloads when you tap it.
 *
 * This file caches app code only. Patient data lives in the on-device database
 * (IndexedDB, see src/core/store.js) and is never cached here or sent anywhere.
 */
const CACHE_VERSION = 'roundingos-v1.7.0';

const APP_FILES = [
  './',
  'index.html',
  'styles/styles.css',
  'manifest.json',
  'src/core/pwa.js',
  'vendor/dexie/dexie.min.js',
  'src/core/data.js',
  'vendor/bip39/english.js',
  'src/core/crypto.js',
  'src/core/store.js',
  'src/core/lock.js',
  'src/core/retention.js',
  'src/core/transfer.js',
  'src/clinical/dotphrases.js',
  'src/features/progressnote.js',
  'src/features/exambuilder.js',
  'src/clinical/algorithms.js',
  'src/clinical/calc.js',
  'src/features/planbuilder.js',
  'src/features/reminders.js',
  'src/speech/speech.js',
  'src/features/signout.js',
  'src/core/app.js',
  'physical-exam-builder.html',
  'src/features/physical-exam-builder.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png'
];

self.addEventListener('install', event => {
  // cache: 'reload' skips the HTTP cache so a new version never precaches stale files
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      cache.addAll(APP_FILES.map(url => new Request(url, { cache: 'reload' })))
    )
  );
  // No skipWaiting() here: the new version waits until the user taps "Reload".
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('roundingos-') && k !== CACHE_VERSION).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return; // old local-server sync: always live

  // Page loads (including ?query or #hash) get the cached page. A page that isn't cached
  // (such as labs/voice-bench.html) loads from the network; the app shell is only the offline fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match(req, { ignoreSearch: true })
        .then(hit => hit || fetch(req).catch(() => caches.match('index.html')))
    );
    return;
  }

  // Cache-first for app files; anything else falls through to the network
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req))
  );
});
