// Zero-build PWA offline cache. No precache manifest to keep in sync with
// src/*.js by hand: cache-as-you-go instead. Network-first (not
// cache-first): this is an actively-edited project with no build step or
// filename hashing to bust a stale cache automatically, so a cache-first
// strategy would keep serving yesterday's JS/CSS to every returning tab
// after each edit, online or not. Network-first only falls back to the
// cache when the network actually fails (offline), so a normal online
// reload always gets the latest files, while offline use still works from
// whatever was last cached successfully.
const CACHE_NAME = 'sprite-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
    )).then(() => self.clients.claim()),
  );
});

// Only the app's own static files are worth intercepting at all: a plain
// GET for a page/script/style/data/manifest file, same origin, no query
// string. A local dev server commonly also serves something that looks
// nothing like that (a long-poll or SSE request for its own auto-reload
// mechanism, e.g.): routing one of those through `fetch()`+`cache.put()`
// below, built for a normal one-shot response, can hang the whole
// connection or throw against a stream that never ends. Leaving the event
// alone entirely (no `respondWith`) for anything outside this shape lets
// the browser handle it exactly as if this service worker didn't exist.
const CACHEABLE_EXT = /\.(html|js|css|json|png|jpg|jpeg|gif|svg|webp|woff2?)$/i;
function isCacheableRequest(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (url.search) return false;
  return url.pathname === '/' || CACHEABLE_EXT.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  if (!isCacheableRequest(event.request)) return;
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        const response = await fetch(event.request);
        if (response.ok) cache.put(event.request, response.clone());
        return response;
      } catch {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        throw new Error('offline and not cached: ' + event.request.url);
      }
    }),
  );
});
