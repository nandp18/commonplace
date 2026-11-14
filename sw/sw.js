/* Commonplace service worker: keeps the app and its OCR readers on the phone so capture works offline.
 * The build fills in PRECACHE (every built file) and VERSION (a hash of them). See `offline()` in vite.config.ts. */

const PRECACHE = self.__PRECACHE__
const VERSION = self.__VERSION__
const SHELL = `commonplace-shell-${VERSION}`
// Not versioned: the OCR engine and models are large and their URLs are pinned, so they outlive app updates.
const RUNTIME = 'commonplace-runtime'

/** Pinned, immutable files: the Tesseract engine and models (jsDelivr), and font files. */
const CACHE_FIRST = ['https://cdn.jsdelivr.net/', 'https://fonts.gstatic.com/']
/** Font stylesheets: use the saved one, and refresh it in the background. */
const REFRESH = ['https://fonts.googleapis.com/']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('commonplace-shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = req.url

  if (req.mode === 'navigate') return event.respondWith(page(req))
  if (CACHE_FIRST.some((p) => url.startsWith(p))) return event.respondWith(cacheFirst(req))
  if (REFRESH.some((p) => url.startsWith(p))) return event.respondWith(refresh(req, event))
  if (new URL(url).origin === self.location.origin) return event.respondWith(shell(req))
  // Everything else (GitHub sync, Chandra, book lookups, covers) goes straight to the network.
})

/** The page: try the network briefly so updates arrive, else open the saved copy. */
async function page(req) {
  const cache = await caches.open(SHELL)
  try {
    const res = await withTimeout(fetch(req), 4000)
    if (res.ok) cache.put('./', res.clone())
    return res
  } catch {
    return (await cache.match('./', { ignoreVary: true })) || Response.error()
  }
}

/** Built files are hashed, so a saved copy is always right. */
async function shell(req) {
  // ignoreVary: module scripts and stylesheets are fetched with an Origin header, and saved responses may say `Vary: Origin`.
  const hit = await caches.match(req, { ignoreSearch: true, ignoreVary: true })
  if (hit) return hit
  return fetch(req)
}

async function cacheFirst(req) {
  const hit = await caches.match(req, { ignoreVary: true })
  if (hit) return hit
  const res = await fetch(req)
  // Scripts loaded by importScripts come back opaque; they're still worth keeping.
  if (res.ok || res.type === 'opaque') (await caches.open(RUNTIME)).put(req, res.clone())
  return res
}

async function refresh(req, event) {
  const cache = await caches.open(RUNTIME)
  const hit = await cache.match(req, { ignoreVary: true })
  const fresh = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone())
    return res
  })
  if (hit) {
    event.waitUntil(fresh.catch(() => {}))
    return hit
  }
  return fresh
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    )
  })
}
