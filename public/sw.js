const APP_VERSION = 'v34'
const CACHE_NAME = `pyide-${APP_VERSION}`
const PRECACHE = [
  '/ide.html',
  '/assets/app.js',
  '/assets/ai-assistant.js',
  '/assets/styles.css',
  '/assets/shell.js',
  '/assets/completions.js',
  '/assets/js-worker.js',
  '/assets/batch-worker.js',
  '/assets/worker.js',
  '/assets/lua-worker.js',
  '/assets/sql-worker.js',
  '/assets/shims.py',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/')) return

  if (request.mode === 'navigate') {
    if (url.pathname !== '/ide.html') return
    event.respondWith(fetch(request).catch(() => caches.match('/ide.html')))
    return
  }

  if (!url.pathname.startsWith('/assets/')) return
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {})
        }
        return response
      })
    }),
  )
})
