import { useEffect, useState } from 'react'

/* ───────────── Scroll memory ─────────────
   Going back returns you to where you were in a list, as on iOS. */

interface Spot {
  y: number
  /** The link you were looking at, and how far down the screen it sat. Long lists only lay out
   *  what's near the screen and guess the rest, so a pixel offset alone lands somewhere else. */
  anchor?: string
  offset?: number
}

const saved = new Map<string, Spot>()
let restoring: number | null = null

/** Remember where `hash` was scrolled to, as you leave it. */
export function rememberScroll(hash: string) {
  const spot: Spot = { y: window.scrollY }
  const el = document.elementFromPoint(window.innerWidth / 2, Math.min(220, window.innerHeight / 3))?.closest<HTMLAnchorElement>('main a[href^="#/"]')
  if (el) {
    spot.anchor = el.getAttribute('href')!
    spot.offset = el.getBoundingClientRect().top
  }
  saved.set(hash, spot)
}

/** Coming back to `hash`: note where it was, so lists draw far enough down to get there. */
export function scrollTargetFor(hash: string, back: boolean) {
  const spot = back ? saved.get(hash) : undefined
  restoring = spot?.y ?? null
  return spot
}

/** Once the screen is drawn: put back what you were looking at, where it was. */
export function restoreScroll(spot: Spot | undefined) {
  if (!spot) return window.scrollTo(0, 0)
  const el = spot.anchor ? document.querySelector(`main a[href="${CSS.escape(spot.anchor)}"]`) : null
  if (el && spot.offset !== undefined) window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - spot.offset)
  else window.scrollTo(0, spot.y)
}

/* ───────────── Progressive lists ─────────────
   A long list draws what fills the screen (or reaches back to where you were) straight
   away, and the rest in small batches while the app is idle, so opening it never stalls. */

const CARD = 120 // a rough card height, to know how many reach a scroll position
const BATCH = 60

export function useProgressive(total: number): number {
  const [limit, setLimit] = useState(() => {
    const reach = (restoring ?? 0) + window.innerHeight * 1.5
    return Math.min(total, Math.max(24, Math.ceil(reach / CARD) + 8))
  })
  useEffect(() => {
    if (limit >= total) return
    const grow = () => setLimit((n) => Math.min(total, n + BATCH))
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(grow, { timeout: 300 })
      return () => cancelIdleCallback(id)
    }
    const id = setTimeout(grow, 50)
    return () => clearTimeout(id)
  }, [limit, total])
  return limit
}
