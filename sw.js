/* Python IDE — offline cache */
const APP_VERSION = "v27";
const CACHE_NAME = `pyide-${APP_VERSION}`;
const PRECACHE = [
  "/",
  "/index.html",
  "/assets/app.js?v=27",
  "/assets/styles.css?v=27",
  "/assets/shell.js?v=27",
  "/assets/completions.js?v=27",
  "/assets/js-worker.js?v=27",
  "/assets/batch-worker.js?v=27",
  "/assets/worker.js?v=27",
  "/assets/shims.py?v=27",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/index.html")));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
