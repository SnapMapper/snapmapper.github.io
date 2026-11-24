// Mapper Log service worker: caches every app file on first load so the app runs offline.
//
// To ship an update: change VERSION. Installed copies fetch this file on their next online
// launch, see the change, cache the new files under a new name and delete the old cache.
// Case data lives in IndexedDB and is never touched here.

const VERSION = '1.8.0';
const CACHE_PREFIX = 'mapper-log-';
const CACHE = CACHE_PREFIX + VERSION;

const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/boot-check.js',
  'js/ui.js',
  'js/model.js',
  'js/store.js',
  'js/backup.js',
  'js/share.js',
  'js/xlsx.js',
  'js/export-map.js',
  'js/edit-event.js',
  'js/sound.js',
  'js/charts.js',
  'js/icons.js',
  'js/directory.js',
  'js/screens/start.js',
  'js/screens/live.js',
  'js/screens/review.js',
  'js/screens/cases.js',
  'js/screens/dashboard.js',
  'js/screens/data.js',
  'icons/icon.svg',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-512-maskable.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('index.html', { cacheName: CACHE }).then((hit) => hit || fetch(req)),
    );
    return;
  }
  event.respondWith(
    caches.match(req, { cacheName: CACHE, ignoreSearch: true }).then((hit) => hit || fetch(req)),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'version' && event.ports[0]) event.ports[0].postMessage(VERSION);
});
