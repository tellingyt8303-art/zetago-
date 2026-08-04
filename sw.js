/* =========================================================
   Crax Distributor — Service Worker
   Caches only the app shell (HTML/CSS/JS/icons) for offline
   use and instant loading. Firebase/Firestore calls and
   Google Fonts are left untouched (network only) — this keeps
   sales/stock data always fresh and avoids caching issues
   with cross-origin API responses.
   ========================================================= */

const CACHE_NAME = 'crax-dms-cache-v1';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install: pre-cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: only handle same-origin GET requests (app shell).
// Everything else (Firestore, Google Fonts, gstatic SDK) goes straight to the network.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)){
    return; // let the browser handle it normally
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200){
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return res;
        })
        .catch(() => cached); // offline: fall back to cache

      return cached || networkFetch;
    })
  );
});
