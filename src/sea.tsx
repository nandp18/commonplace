import { useEffect, useMemo, useRef, useState } from 'react'
import { QuoteText } from './components'
import { dropPath } from './dropShape'
import { arrivedByCeremony } from './drop'
import { haptic, markTransition, morphName, reducedMotion } from './motion'
import type { Book, Quote } from './types'

/**
 * The collection as a sea of dots. Every quote is one drop in it: newest near the
 * surface, oldest deepest. The water is a staggered halftone lattice whose dots move
 * in small orbits and swell into bands with the waves; tapping a drop sends out a
 * ripple and brings its quote up beneath the sea.
 */

const GAP = 13 // lattice spacing, CSS px
const HEIGHT = 250
const SURFACE = 46 // resting height of the waterline
const INK = '30, 35, 29'
const GOLD = '181, 138, 53'
const BLUE = '52, 120, 246'

/** Spray thrown up where a drop hits the water. */
interface Spray {
  x: number
  y: number
  vx: number
  vy: number
  r: number
}

interface Ripple {
  x: number
  y: number
  t0: number
  strength: number
}

const hash = (s: string) => {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}

const dateLabel = (t: number) =>
  new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()

export function DotSea({
  quotes,
  dailyId,
  freshId,
  bookOf,
}: {
  quotes: Quote[]
  dailyId?: string
  freshId?: string
  bookOf: (id?: string) => Book | undefined
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(0)
  const [selected, setSelected] = useState<string | undefined>(freshId ?? dailyId)
  const live = useRef({ selected, dailyId })
  live.current = { selected, dailyId }
  const ripples = useRef<Ripple[]>([])
  /** Where the selected drop currently is, eased toward the surface. */
  const lift = useRef(new Map<string, number>())
  /** A filed quote's drop: falling from above the sea, or sinking in from the surface where it landed. */
  const falling = useRef<{ id: string; t0: number; from: number } | null>(
    freshId && !arrivedByCeremony(freshId) ? { id: freshId, t0: performance.now(), from: -16 } : null,
  )
  /** A gold glow around a drop that just arrived by the filing ceremony. */
  const glow = useRef<{ id: string; t0: number } | null>(null)
  const spray = useRef<Spray[]>([])

  // Each quote gets a fixed place: depth by age (newest just under the surface), x by a stable hash.
  const drops = useMemo(() => {
    if (!width) return []
    const byAge = [...quotes].sort((a, b) => b.createdAt - a.createdAt)
    const n = byAge.length
    return byAge.map((q, rank) => ({
      q,
      x: 18 + ((hash(q.id) % 1000) / 1000) * (width - 36),
      y: SURFACE + 18 + (n > 1 ? rank / (n - 1) : 0) * (HEIGHT - SURFACE - 30),
    }))
  }, [quotes, width])
  /** Where each drop was last drawn, for tapping. */
  const drawn = useRef(new Map<string, { x: number; y: number }>())

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // A freshly filed quote falls in with a splash.
  useEffect(() => {
    if (!freshId || !width) return
    setSelected(freshId)
    const d = drops.find((x) => x.q.id === freshId)
    const splash = (strength: number) => {
      if (!d) return
      ripples.current.push({ x: d.x, y: SURFACE, t0: performance.now(), strength })
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i / 6 - 0.5) * 1.9 + (Math.random() - 0.5) * 0.25
        const v = 70 + Math.random() * 70 * (1 - Math.abs(i / 6 - 0.5))
        spray.current.push({ x: d.x, y: SURFACE - 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 1.5, r: 1 + Math.random() * 0.9 })
      }
    }
    if (arrivedByCeremony(freshId)) {
      // It already fell in, full screen: here it's simply in place, still glowing, the water still moving.
      falling.current = null
      const now = performance.now()
      glow.current = { id: freshId, t0: now }
      if (d) ripples.current.push({ x: d.x, y: Math.max(SURFACE + 16, d.y - 40), t0: now, strength: 1.2 })
      return
    }
    falling.current = { id: freshId, t0: performance.now(), from: -16 }
    if (d) setTimeout(() => splash(1.4), 380)
  }, [freshId, width])

  useEffect(() => {
    const c = canvas.current
    if (!c || !width) return
    const dpr = window.devicePixelRatio || 1
    c.width = width * dpr
    c.height = HEIGHT * dpr
    const ctx = c.getContext('2d')!
    const still = reducedMotion()
    let raf = 0
    let last = 0
    let visible = true
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting))
    io.observe(c)

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (!visible) return
      const t = still ? 2 : now / 1000
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, HEIGHT)
      ripples.current = ripples.current.filter((r) => now - r.t0 < 2600)
      const dt = Math.min(0.05, (now - (last || now)) / 1000)
      last = now

      const surface = (x: number) => SURFACE + 7 * Math.sin(x * 0.028 - t * 0.9) + 2.5 * Math.sin(x * 0.083 + t * 1.4)
      /** Wave height field: drives dot size, so swells read as halftone bands. */
      const field = (x: number, y: number, d: number) =>
        Math.sin(x * 0.028 - t * 0.9 - d * 2.4) * Math.exp(-d * 1.2) + 0.55 * Math.sin(x * 0.06 + y * 0.045 + t * 0.6) * Math.exp(-d * 0.8)
      /** Water particles travel in small circles that shrink with depth; ripples push outward. */
      const move = (x: number, y: number, d: number) => {
        const A = 3.6 * Math.exp(-d * 2.6) + 0.35
        const ph = x * 0.028 - t * 0.9 + d * 1.4
        let dx = A * Math.cos(ph) * 0.7
        let dy = A * Math.sin(ph)
        let stir = 0
        for (const r of ripples.current) {
          const age = (now - r.t0) / 1000
          const dist = Math.hypot(x - r.x, y - r.y)
          const band = dist - age * 120
          if (Math.abs(band) > 36) continue
          const amp = r.strength * 5 * Math.exp(-age * 1.6) * Math.cos((band / 36) * Math.PI * 0.5)
          dx += ((x - r.x) / (dist || 1)) * amp
          dy += ((y - r.y) / (dist || 1)) * amp
          stir += Math.abs(amp) / 5
        }
        return { dx, dy, stir }
      }

      // The waterline: a crisp string of dots.
      ctx.fillStyle = `rgba(${INK}, 0.6)`
      for (let x = 0; x <= width; x += GAP / 2.2) {
        ctx.beginPath()
        ctx.arc(x, surface(x), 1.35, 0, Math.PI * 2)
        ctx.fill()
      }

      // The water: a staggered halftone lattice, ink thinning with depth.
      const rowGap = GAP * 0.86
      for (let r = 0, y0 = SURFACE + 6; y0 < HEIGHT + 4; r++, y0 += rowGap) {
        const d = Math.min(1, (y0 - SURFACE) / (HEIGHT - SURFACE))
        for (let x0 = (r % 2 ? 0 : -GAP / 2); x0 < width + GAP; x0 += GAP) {
          const { dx, dy, stir } = move(x0, y0, d)
          const x = x0 + dx, y = y0 + dy
          if (y < surface(x) + 4) continue
          const h = field(x0, y0, d)
          const radius = 0.55 + 0.95 * (0.5 + 0.5 * h) * (1 - d * 0.45) + stir * 0.5
          const a = Math.max(0.04, 0.08 + 0.34 * Math.pow(1 - d, 1.6) + 0.07 * h + stir * 0.2)
          ctx.fillStyle = `rgba(${INK}, ${a})`
          ctx.beginPath()
          ctx.arc(x, y, radius, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // Spray from a splash: flung up, pulled back down, gone once it's back in the water.
      if (spray.current.length) {
        ctx.fillStyle = `rgba(${BLUE}, 0.75)`
        for (const s of spray.current) {
          s.vy += 520 * dt
          s.x += s.vx * dt
          s.y += s.vy * dt
          ctx.beginPath()
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
          ctx.fill()
        }
        spray.current = spray.current.filter((s) => s.vy < 0 || s.y < surface(s.x))
      }

      // The drops.
      const { selected, dailyId } = live.current
      for (const d of drops) {
        const id = d.q.id
        const isSel = id === selected
        // The selected drop rises toward the surface; others drift back down.
        const target = isSel ? Math.max(SURFACE + 16, d.y - 40) : d.y
        const cur = lift.current.get(id) ?? d.y
        let y = still ? target : cur + (target - cur) * 0.07
        lift.current.set(id, y)
        const f = falling.current
        if (f && f.id === id) {
          const fromSurface = f.from >= SURFACE
          const p = Math.min(1, (now - f.t0) / (fromSurface ? 1100 : 900))
          // From above it falls in; from the surface it sinks, quick then slowing like a pebble.
          const ease = fromSurface ? 1 - Math.pow(1 - p, 4) : 1 - Math.pow(1 - p, 3)
          y = f.from + (y - f.from) * ease
          if (p >= 1) falling.current = null
        }
        const { dx, dy } = move(d.x, y, Math.min(1, (y - SURFACE) / (HEIGHT - SURFACE)))
        const x = d.x + dx * 0.9, yy = y + dy * 0.9
        drawn.current.set(id, { x, y: yy })
        const isToday = id === dailyId
        const color = isSel ? BLUE : isToday ? GOLD : INK
        if (isSel || isToday) {
          const pulse = still ? 0.5 : 0.5 + 0.5 * Math.sin(now / 650)
          ctx.fillStyle = `rgba(${color}, ${0.1 + 0.08 * pulse})`
          ctx.beginPath()
          ctx.arc(x, yy, 8 + 3 * pulse, 0, Math.PI * 2)
          ctx.fill()
        } else {
          // A clear ring of water around each drop so it reads apart from the sea.
          ctx.fillStyle = '#fff'
          dropPath(ctx, x, yy, 4, 2.1)
          ctx.fill()
        }
        const g = glow.current
        if (g && g.id === id) {
          // Fresh from the ceremony: a gold glow that breathes out and fades.
          const p = (now - g.t0) / 3200
          if (p >= 1) glow.current = null
          else {
            const fade = 1 - p
            ctx.fillStyle = `rgba(${GOLD}, ${0.22 * fade})`
            ctx.beginPath()
            ctx.arc(x, yy, 7 + 9 * Math.sin(Math.min(1, p * 3) * Math.PI * 0.5), 0, Math.PI * 2)
            ctx.fill()
          }
        }
        ctx.fillStyle = `rgba(${color}, ${isSel || isToday ? 1 : 0.85})`
        dropPath(ctx, x, yy, isSel ? 3.2 : 2.4)
        ctx.fill()
      }
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
    }
  }, [drops, width])

  const tap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - r.left, py = e.clientY - r.top
    let best: (typeof drops)[number] | undefined, bestD = 24
    for (const d of drops) {
      const at = drawn.current.get(d.q.id) ?? d
      const dist = Math.hypot(px - at.x, py - at.y)
      if (dist < bestD) (bestD = dist), (best = d)
    }
    if (!best) {
      // Touching open water still makes a ripple.
      ripples.current.push({ x: px, y: py, t0: performance.now(), strength: 0.6 })
      return
    }
    if (best.q.id === selected) return open(best.q.id)
    const at = drawn.current.get(best.q.id) ?? best
    ripples.current.push({ x: at.x, y: at.y, t0: performance.now(), strength: 1 })
    haptic('tick')
    setSelected(best.q.id)
  }

  const open = (id: string) => {
    markTransition('quote', id, 'sea')
    document.querySelector<HTMLElement>('.sea-caption .quote-text')?.style.setProperty('view-transition-name', 'morph-quote')
    location.hash = `/quote/${id}`
  }

  const q = quotes.find((x) => x.id === selected) ?? quotes.find((x) => x.id === dailyId) ?? quotes[0]
  const book = q && bookOf(q.bookId)

  return (
    <section className="sea">
      <div className="sea-head">
        <span className="label">{q?.id === dailyId ? `Today · ${dateLabel(Date.now())}` : q ? `Kept ${dateLabel(q.createdAt)}` : ''}</span>
        <a className="meta-mono dive-link" href="#/ocean">
          {quotes.length} {quotes.length === 1 ? 'drop' : 'drops'} · Dive ↓
        </a>
      </div>
      <div ref={wrap} className="sea-water">
        <canvas
          ref={canvas}
          style={{ width, height: HEIGHT }}
          onPointerUp={tap}
          role="img"
          aria-label={`${quotes.length} quotes as drops in a sea; tap one to read it`}
        />
      </div>
      {q && (
        <a
          className="sea-caption"
          key={q.id}
          href={`#/quote/${q.id}`}
          onClick={(e) => {
            e.preventDefault()
            open(q.id)
          }}
        >
          <QuoteText text={q.text} className="clamp-sea" morph={morphName('quote', q.id, 'sea')} />
          {(book || q.page) && (
            <div className="attribution">
              {book && <span className="attr-title">{book.title}</span>}
              <span className="attr-mono">{[book?.author, q.page && `p.${q.page}`].filter(Boolean).join(' · ')}</span>
            </div>
          )}
        </a>
      )}
    </section>
  )
}
