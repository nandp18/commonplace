import { afterNav, reducedMotion } from './motion'

/**
 * Filing a quote: its words gather into a single bead of ink, which waits while the
 * library comes in underneath, then falls into the sea of drops on the timeline.
 *
 * The bead lives outside React (a fixed element on <body>) so it survives the screen
 * change. Two layers, so the fall can arc: the outer one drifts sideways, the inner one
 * drops with gravity and stretches into a teardrop.
 */

let bead: { outer: HTMLDivElement; inner: HTMLDivElement; landing: boolean } | null = null

/** A filed quote is on its way down; the sea should catch it rather than drop its own. */
export const incomingDrop = () => bead !== null

const remove = (b: NonNullable<typeof bead>) => {
  b.outer.remove()
  if (bead === b) bead = null
}

/** Pull the quote's words into one bead. Resolves once the bead has formed. */
export async function gatherIntoDrop(filing: HTMLElement): Promise<void> {
  if (reducedMotion()) return
  const box = filing.querySelector<HTMLElement>('.saved-quote') ?? filing
  const r = box.getBoundingClientRect()
  const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, innerHeight)
  const at = { x: r.left + r.width / 2, y: (top + bottom) / 2 }

  // Everything else on the card lets go first.
  filing.classList.add('gathering')
  for (const el of filing.querySelectorAll<HTMLElement>(':scope > :not(.saved-quote), .translit'))
    el.animate([{ opacity: 1 }, { opacity: 0, filter: 'blur(3px)' }], { duration: 240, easing: 'ease-out', fill: 'forwards' })

  // Then the words fly in, in reading order.
  const words = [...box.querySelectorAll<HTMLElement>('.quote-text .w')]
  const parts = words.length ? words : [...box.querySelectorAll<HTMLElement>('.quote-text')]
  const spread = Math.min(260, parts.length * 14)
  const duration = 480
  const flights = parts.map((w, i) => {
    const b = w.getBoundingClientRect()
    const dx = at.x - (b.left + b.width / 2), dy = at.y - (b.top + b.height / 2)
    return w.animate(
      [
        { transform: 'none', opacity: 1, filter: 'blur(0px)' },
        { opacity: 1, offset: 0.6 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.1)`, opacity: 0, filter: 'blur(2px)' },
      ],
      {
        duration,
        delay: 80 + (parts.length > 1 ? (i / (parts.length - 1)) * spread : 0),
        easing: 'cubic-bezier(0.55, 0, 0.75, 0.25)',
        fill: 'forwards',
      },
    ).finished
  })

  bead?.outer.remove()
  const outer = document.createElement('div')
  outer.className = 'ink-drop'
  outer.style.left = `${at.x}px`
  outer.style.top = `${at.y}px`
  const inner = document.createElement('div')
  inner.className = 'ink-drop-body'
  outer.appendChild(inner)
  document.body.appendChild(outer)
  const b = (bead = { outer, inner, landing: false })

  // The bead swells as the ink arrives, then settles with a small wobble.
  const total = 80 + spread + duration
  inner.animate(
    [
      { transform: 'scale(0)' },
      { transform: 'scale(0.55)', offset: 0.55 },
      { transform: 'scale(1.18, 0.9)', offset: 0.86 },
      { transform: 'scale(0.94, 1.06)', offset: 0.94 },
      { transform: 'scale(1)' },
    ],
    { duration: total + 160, delay: 120, easing: 'ease-out', fill: 'backwards' },
  )
  await Promise.all(flights).catch(() => undefined)
  await new Promise((r) => setTimeout(r, 200))

  // Nothing caught it (the sea isn't on screen): let it fade rather than hang there.
  setTimeout(() => {
    if (bead === b && !b.landing) b.outer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).finished.then(() => remove(b))
  }, 2500)
}

/**
 * Drop the bead onto a point on screen, once the screen change has finished.
 * `target` is asked late, after layout has settled. Resolves true if it landed there.
 */
export async function landDrop(target: () => { x: number; y: number } | null): Promise<boolean> {
  const b = bead
  if (!b) return false
  b.landing = true
  // A screen change that never reports finishing (a backgrounded tab) mustn't strand it.
  await Promise.race([afterNav(), new Promise((r) => setTimeout(r, 1500))])
  const t = target()
  if (bead !== b) return false
  if (!t || t.y < 0 || t.y > innerHeight) {
    await b.outer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }).finished
    remove(b)
    return false
  }
  const x0 = parseFloat(b.outer.style.left), y0 = parseFloat(b.outer.style.top)
  const dx = t.x - x0, dy = t.y - y0
  // A tossed arc: up to an apex above the water, then down under gravity. The sea is often
  // higher on screen than the sheet was, so it can't simply drop straight down.
  const apex = Math.max(28, Math.min(y0 - 24, t.y - 110))
  const rise = y0 - apex, drop = t.y - apex
  const g = 26 // ms per √px: 100px of free fall takes about a quarter second
  const squash = 120, up = Math.sqrt(rise) * g, down = Math.sqrt(drop) * g * 1.1
  const total = squash + up + down
  const at = (ms: number) => ms / total
  b.outer.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(0)', offset: at(squash) }, { transform: `translateX(${dx}px)` }], {
    duration: total,
    easing: 'linear',
    fill: 'forwards',
  })
  await b.inner.animate(
    [
      { transform: 'translateY(0) scale(1)', easing: 'ease-in-out' },
      // Gathers itself, then springs up, stretched along its path.
      { transform: 'translateY(2px) scale(1.14, 0.84)', offset: at(squash), easing: 'cubic-bezier(0.2, 0.6, 0.35, 1)' },
      // Rounds out at the top of the arc, then falls, stretching into a teardrop.
      { transform: `translateY(${apex - y0}px) scale(0.9)`, offset: at(squash + up), easing: 'cubic-bezier(0.6, 0, 0.9, 0.55)' },
      { transform: `translateY(${dy}px) scale(0.46, 0.8)` },
    ],
    { duration: total, fill: 'forwards' },
  ).finished
  remove(b)
  return true
}
