import { useSyncExternalStore } from 'react'

/**
 * Offline support: the service worker (sw/sw.js) keeps the app and the OCR readers on the phone.
 * The first time it's in charge, we load both readers once in the background so it can keep them.
 */
export type OfflineState = 'unsupported' | 'preparing' | 'ready' | 'failed'

const READY_KEY = 'commonplace-offline-ready'

let state: OfflineState = 'unsupported'
const listeners = new Set<() => void>()
const set = (next: OfflineState) => {
  state = next
  listeners.forEach((l) => l())
}

export function useOfflineState(): OfflineState {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  )
}

export function startOffline() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  set('preparing')
  navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => set('failed'))
  // The readers have to load while the service worker is in charge of the page, or it never sees them.
  if (navigator.serviceWorker.controller) idle(prepare)
  else navigator.serviceWorker.addEventListener('controllerchange', () => idle(prepare), { once: true })
}

async function prepare() {
  try {
    if ((await readersSaved()) && localStorage.getItem(READY_KEY)) return set('ready')
    if (!navigator.onLine) return set('failed')
    const { prepareOffline } = await import('./ocr')
    await prepareOffline()
    localStorage.setItem(READY_KEY, String(Date.now()))
    set('ready')
  } catch {
    set('failed')
  }
}

/** True when the OCR engine is still in the service worker's cache (the browser can clear it under storage pressure). */
async function readersSaved(): Promise<boolean> {
  const cache = await caches.open('commonplace-runtime')
  const keys = await cache.keys()
  return keys.some((r) => r.url.includes('tesseract-core'))
}

function idle(fn: () => void) {
  if ('requestIdleCallback' in window) requestIdleCallback(fn, { timeout: 5000 })
  else setTimeout(fn, 2000)
}
