import { useEffect, useSyncExternalStore } from 'react'
import { deleteCover, loadCovers, putCover } from './db'
import { isSample } from './samples'
import type { Book } from './types'

/**
 * Cover images kept on this device, so the shelf looks the same offline.
 * A book's `cover` link is what syncs; the image behind it is downloaded once and
 * stored here. A photo you took of the cover yourself lives only here.
 */

const local = new Map<string, { src: string; url: string }>()
const listeners = new Set<() => void>()
let version = 0
let loading: Promise<void> | null = null
const inFlight = new Set<string>()
/** Links that can't be downloaded (no CORS, or gone): shown straight from the web instead. */
const unfetchable = new Set<string>()
/** Links with no cover behind them (Open Library has none for that ISBN): remembered, so they're not asked again. */
const MISSING_KEY = 'commonplace.missingCovers'
const missing = new Set<string>(
  (() => {
    try {
      return JSON.parse(localStorage.getItem(MISSING_KEY) ?? '[]') as string[]
    } catch {
      return []
    }
  })(),
)
/** Open Library has no image behind this link (found out when it was first shown). */
export const isMissingCover = (url: string) => missing.has(url)

function markMissing(url: string) {
  missing.add(url)
  try {
    localStorage.setItem(MISSING_KEY, JSON.stringify([...missing].slice(-2000)))
  } catch {}
}

function emit() {
  version++
  for (const l of listeners) l()
}

function remember(id: string, src: string, blob: Blob) {
  const old = local.get(id)
  if (old) URL.revokeObjectURL(old.url)
  local.set(id, { src, url: URL.createObjectURL(blob) })
}

function ensureLoaded() {
  loading ??= loadCovers()
    .then((all) => all.forEach((c) => remember(c.id, c.src, c.blob)))
    .catch(() => {})
    .then(emit)
  return loading
}

/** Shrinks a cover to what the screen needs: covers are small, phones are not. */
export async function shrink(blob: Blob, longest = 720): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(blob)
    const scale = Math.min(1, longest / Math.max(bmp.width, bmp.height))
    if (scale === 1 && blob.size < 400_000) return blob
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scale)
    c.height = Math.round(bmp.height * scale)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    bmp.close()
    return await new Promise((resolve) => c.toBlob((b) => resolve(b ?? blob), 'image/jpeg', 0.86))
  } catch {
    return blob
  }
}

/** A whole imported shelf asks at once; take covers a few at a time. */
let active = 0
const waiting: (() => void)[] = []
async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (active >= 4) await new Promise<void>((r) => waiting.push(r))
  active++
  try {
    return await work()
  } finally {
    active--
    waiting.shift()?.()
  }
}

/** Downloads a cover, or null if the site won't share it with a web app. */
export const fetchCover = (url: string) => slot(() => download(url))

async function download(url: string): Promise<Blob | null> {
  if (unfetchable.has(url) || missing.has(url)) return null
  // baps.org doesn't share its images with web apps; don't ask, just show the link.
  if (url.startsWith('https://www.baps.org/')) return unfetchable.add(url), null
  try {
    const res = await fetch(url, { mode: 'cors', signal: AbortSignal.timeout(12000) })
    if (res.status === 404) markMissing(url)
    const blob = res.ok ? await res.blob() : null
    // Open Library answers a missing cover with a 1×1 gif.
    if (!blob || !blob.type.startsWith('image/') || blob.size < 1000) throw new Error('no image')
    return await shrink(blob)
  } catch {
    unfetchable.add(url)
    return null
  }
}

export async function saveLocalCover(bookId: string, blob: Blob, src: string) {
  await putCover({ id: bookId, blob, src })
  remember(bookId, src, blob)
  emit()
}

export async function removeLocalCover(bookId: string) {
  const old = local.get(bookId)
  if (!old) return
  URL.revokeObjectURL(old.url)
  local.delete(bookId)
  await deleteCover(bookId).catch(() => {})
  emit()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/**
 * The best picture of this book's cover: a photo you took, then the saved copy of its
 * link, then the link itself (downloading it for next time).
 */
export function useCoverSrc(book: Book, skip = false): string | undefined {
  useSyncExternalStore(subscribe, () => version)
  const rec = local.get(book.id)
  const fresh = rec && (rec.src === 'photo' || rec.src === book.cover) ? rec.url : undefined
  const link = book.cover?.startsWith('https://') ? book.cover : undefined

  useEffect(() => {
    if (skip) return
    ensureLoaded().then(() => {
      const r = local.get(book.id)
      if (!link || (r && (r.src === 'photo' || r.src === link))) return
      if (inFlight.has(book.id) || unfetchable.has(link) || isSample(book.id)) return
      inFlight.add(book.id)
      fetchCover(link)
        .then((blob) => blob && saveLocalCover(book.id, blob, link))
        .finally(() => inFlight.delete(book.id))
    })
  }, [book.id, link, skip])

  return fresh ?? (book.cover && missing.has(book.cover) ? undefined : book.cover)
}
