import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { GlassButton, QuoteText } from './components'
import { haptic, markTransition, reducedMotion } from './motion'
import type { Store } from './store'
import type { Quote } from './types'
import { quoteOfTheDay } from './util'

/**
 * The ocean: dive down through your quotes. Newest just under the surface, older as you
 * go deeper; past the oldest, the tide brings them round again in a new order, forever.
 * Each quote is a drop whose words brighten as they pass the middle of the screen.
 */

const GAP = 14
const SURFACE = 250 // world y of the waterline
const FIRST = SURFACE + 190 // world y of the first quote
const SPACING = 300 // between quotes
const METERS = 0.1 // world px → meters on the gauge
const INK = '30, 35, 29'
const GOLD = '181, 138, 53'

let savedDepth = 0 // where you were, so coming back from a quote returns you there

const hash = (s: string) => {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}

function shuffled<T>(items: T[], seed: number): T[] {
  const out = [...items]
  let s = seed >>> 0
  const rand = () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function Ocean({ store }: { store: Store }) {
  const root = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const items = useRef(new Map<number, HTMLElement>())
  const scroll = useRef(savedDepth)
  const velocity = useRef(0)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [range, setRange] = useState<[number, number]>([0, 4])
  const [meters, setMeters] = useState(0)
  const focused = useRef(-1)
  const dragging = useRef(false)

  const byAge = useMemo(() => [...store.quotes].sort((a, b) => b.createdAt - a.createdAt), [store.quotes])
  const n = byAge.length
  const dailyId = quoteOfTheDay(store.quotes)?.id
  const laps = useRef(new Map<number, Quote[]>())
  /** The k-th quote on the way down: by age on the first lap, then a new shuffle each lap. */
  const quoteAt = (k: number): Quote => {
    const lap = Math.floor(k / n)
    if (lap === 0) return byAge[k]
    let order = laps.current.get(lap)
    if (!order) laps.current.set(lap, (order = shuffled(byAge, lap * 7919)))
    return order[k % n]
  }
  /** Depth of the k-th quote; each lap adds an extra half-gap for its tide marker. */
  const worldY = (k: number) => FIRST + k * SPACING + Math.floor(k / Math.max(1, n)) * SPACING * 0.5
  const kAt = (y: number) => {
    // Inverse of worldY, accounting for the extra half-gap at each lap marker.
    let k = Math.max(0, Math.floor((y - FIRST) / SPACING))
    while (k > 0 && worldY(k) > y) k--
    while (worldY(k + 1) <= y) k++
    return k
  }
  const dropX = (k: number, w: number) => {
    const jitter = (hash(`${k}`) % 1000) / 1000
    return k % 2 === 0 ? 30 + jitter * 26 : w - 30 - jitter * 26
  }

  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])

  // Input: drag with momentum, wheel, keys. The ocean has its own scroll so it can be endless.
  useEffect(() => {
    const el = root.current
    if (!el) return
    let lastY = 0, lastT = 0, moved = 0
    const down = (e: PointerEvent) => {
      dragging.current = true
      moved = 0
      lastY = e.clientY
      lastT = performance.now()
      velocity.current = 0
    }
    const move = (e: PointerEvent) => {
      if (!dragging.current) return
      const dy = e.clientY - lastY
      const now = performance.now()
      moved += Math.abs(dy)
      scroll.current -= dy
      velocity.current = (-dy / Math.max(1, now - lastT)) * 16
      lastY = e.clientY
      lastT = now
    }
    const up = () => {
      if (!dragging.current) return
      dragging.current = false
      el.dataset.dragged = moved > 6 ? '1' : ''
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      scroll.current += e.deltaY
      velocity.current = 0
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === ' ') velocity.current += 18
      if (e.key === 'ArrowUp') velocity.current -= 18
      if (e.key === 'Escape') location.hash = '/'
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })
    window.addEventListener('keydown', key)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
      window.removeEventListener('keydown', key)
      savedDepth = Math.max(0, scroll.current)
    }
  }, [])

  // The render loop: water, snow, drops on canvas; quote text positioned in the DOM.
  useEffect(() => {
    const c = canvas.current
    if (!c || n === 0) return
    const { w, h } = size
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = w * dpr
    c.height = h * dpr
    const ctx = c.getContext('2d')!
    const still = reducedMotion()
    let raf = 0
    let shownRange = ''
    const snow = Array.from({ length: 70 }, (_, i) => ({ x: (hash(`s${i}`) % 1000) / 1000, y: (hash(`t${i}`) % 1000) / 1000, r: 0.5 + (i % 3) * 0.35 }))

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const t = still ? 2 : now / 1000

      // Momentum, with a soft bounce at the surface.
      if (!dragging.current) {
        scroll.current += velocity.current
        velocity.current *= 0.95
        if (Math.abs(velocity.current) < 0.05) velocity.current = 0
        if (scroll.current < 0) {
          scroll.current *= 0.82
          velocity.current = 0
        }
      }
      const top = scroll.current

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const surfaceAt = (x: number) => SURFACE + 7 * Math.sin(x * 0.028 - t * 0.9) + 2.5 * Math.sin(x * 0.083 + t * 1.4)

      // Waterline.
      if (SURFACE - top > -20 && SURFACE - top < h + 20) {
        ctx.fillStyle = `rgba(${INK}, 0.6)`
        for (let x = 0; x <= w; x += GAP / 2.2) {
          ctx.beginPath()
          ctx.arc(x, surfaceAt(x) - top, 1.35, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // Water lattice, only the visible rows.
      const rowGap = GAP * 0.86
      const r0 = Math.max(0, Math.floor((top - SURFACE) / rowGap) - 1)
      const r1 = Math.ceil((top + h - SURFACE) / rowGap) + 1
      for (let r = r0; r <= r1; r++) {
        const y0 = SURFACE + 6 + r * rowGap
        const shallow = Math.min(1, (y0 - SURFACE) / 520) // 0 at surface → 1 in open water
        for (let x0 = r % 2 ? 0 : -GAP / 2; x0 < w + GAP; x0 += GAP) {
          const A = 3.6 * Math.exp(-shallow * 2.6) + 0.45
          const ph = x0 * 0.028 - t * 0.9 + y0 * 0.0035
          const x = x0 + A * Math.cos(ph) * 0.7
          const y = y0 + A * Math.sin(ph)
          if (y < surfaceAt(x) + 4) continue
          // Currents: slow bands of slightly denser water the deeper you go.
          const current = Math.sin(y0 * 0.0042 + Math.sin(x0 * 0.006 + t * 0.15) * 1.2)
          const swell = Math.sin(x0 * 0.028 - t * 0.9 - y0 * 0.005) * (1 - shallow * 0.6)
          // The deeper you go, the more ink: it builds over the first ~250 m, then holds.
          const deep = Math.min(1, Math.max(0, (y0 - SURFACE - 520) / 2400))
          const radius = 0.55 + 0.8 * (0.5 + 0.5 * (swell * 0.5 + current * 0.5)) + 0.25 * deep
          const a = 0.055 + 0.28 * Math.pow(1 - shallow, 1.6) + 0.08 * deep + 0.05 * (current + 1) + 0.04 * swell
          ctx.fillStyle = `rgba(${INK}, ${Math.max(0.035, a)})`
          ctx.beginPath()
          ctx.arc(x, y - top, radius, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // Marine snow drifts slowly upward at its own depth — it's what makes the dive feel deep.
      if (top > SURFACE - h) {
        ctx.fillStyle = `rgba(${INK}, 0.22)`
        for (const s of snow) {
          const yy = ((s.y * h * 3 - top * 0.55 - t * 6) % (h * 3) + h * 3) % (h * 3) - h
          if (yy < SURFACE - top + 10 || yy > h) continue
          ctx.beginPath()
          ctx.arc(s.x * w + Math.sin(t * 0.4 + s.y * 9) * 6, yy, s.r, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // Depth gauge along the right edge.
      ctx.fillStyle = `rgba(${INK}, 0.32)`
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.textAlign = 'right'
      const step = 100 // 10 m
      for (let y = Math.ceil(Math.max(SURFACE, top) / step) * step; y < top + h; y += step) {
        const m = Math.round((y - SURFACE) * METERS)
        const yy = y - top
        ctx.fillRect(w - 8, yy, m % 50 === 0 ? 7 : 4, 0.75)
        if (m % 50 === 0 && m > 0) ctx.fillText(`${m} m`, w - 12, yy + 3)
      }

      // Which quotes are near the viewport.
      const k0 = Math.max(0, kAt(top - 260))
      const k1 = kAt(top + h + 260) + 1
      const key = `${k0}-${k1}`
      if (key !== shownRange) {
        shownRange = key
        setRange([k0, k1])
      }

      // Drops, and the words beside them brightening near the middle.
      const focusY = top + h * 0.45
      let nearest = -1, nearestD = Infinity
      for (let k = k0; k <= k1; k++) {
        const q = quoteAt(k)
        const wy = worldY(k)
        const x = dropX(k, w)
        const bob = 2.5 * Math.sin(t * 1.1 + k)
        const y = wy - top + bob
        const dist = Math.abs(wy - focusY)
        if (dist < nearestD) (nearestD = dist), (nearest = k)
        const glow = Math.max(0, 1 - dist / (h * 0.42))
        const isToday = q.id === dailyId
        const color = isToday ? GOLD : INK
        ctx.fillStyle = `rgba(${color}, ${0.08 + 0.12 * glow})`
        ctx.beginPath()
        ctx.arc(x, y, 7 + 5 * glow, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(x, y, 4.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = `rgba(${color}, ${0.55 + 0.45 * glow})`
        ctx.beginPath()
        ctx.arc(x, y, 2.6 + glow * 0.9, 0, Math.PI * 2)
        ctx.fill()

        const el = items.current.get(k)
        if (el) {
          const o = Math.max(0, Math.min(1, 1.25 - dist / (h * 0.34)))
          el.style.transform = `translate3d(0, ${y - 14}px, 0)`
          el.style.opacity = String(0.12 + 0.88 * o)
          el.style.filter = o > 0.85 ? '' : `blur(${(1 - o) * 2.2}px)`
        }
      }
      if (nearest !== focused.current && nearestD < SPACING * 0.3) {
        focused.current = nearest
        if (!still) haptic('tick')
      }

      // Lap markers: where the tide turns.
      root.current?.querySelectorAll<HTMLElement>('.tide-marker').forEach((el) => {
        const lap = Number(el.dataset.lap)
        el.style.transform = `translate3d(0, ${worldY(lap * n) - SPACING * 0.75 - top}px, 0)`
      })
      const head = root.current?.querySelector<HTMLElement>('.ocean-sky')
      if (head) head.style.transform = `translate3d(0, ${-top}px, 0)`

      const m = Math.max(0, Math.round((top + h * 0.45 - SURFACE) * METERS))
      setMeters((prev) => (prev === m ? prev : m))
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [size, n, byAge])

  useLayoutEffect(() => {
    document.documentElement.classList.add('ocean-open')
    return () => document.documentElement.classList.remove('ocean-open')
  }, [])

  if (n === 0) {
    return (
      <div className="ocean empty-ocean">
        <p className="secondary">The ocean fills as you keep quotes.</p>
        <a className="text-button" href="#/">
          Back to the library
        </a>
      </div>
    )
  }

  const visible: number[] = []
  for (let k = range[0]; k <= range[1]; k++) visible.push(k)
  const lapMarkers = new Set(visible.filter((k) => k > 0 && k % n === 0).map((k) => k / n))

  return (
    <div ref={root} className="ocean">
      <canvas ref={canvas} style={{ width: size.w, height: size.h }} />

      <div className="ocean-sky">
        <h1>The ocean</h1>
        <p className="meta-mono">
          {n} {n === 1 ? 'drop' : 'drops'} · scroll to dive
        </p>
      </div>

      {[...lapMarkers].map((lap) => (
        <div key={lap} className="tide-marker label" data-lap={lap}>
          The tide brings them round again
        </div>
      ))}

      {visible.map((k) => {
        const q = quoteAt(k)
        const book = q.bookId ? store.bookMap.get(q.bookId) : undefined
        const left = k % 2 === 0
        return (
          <a
            key={k}
            ref={(el) => void (el ? items.current.set(k, el) : items.current.delete(k))}
            className={`ocean-quote ${left ? 'left' : 'right'}`}
            href={`#/quote/${q.id}`}
            draggable={false}
            onClick={(e) => {
              if (root.current?.dataset.dragged) return e.preventDefault()
              markTransition('quote', q.id, 'ocean')
              e.currentTarget.querySelector<HTMLElement>('.quote-text')?.style.setProperty('view-transition-name', 'morph-quote')
            }}
          >
            <QuoteText text={q.text} className="clamp-ocean" />
            <span className="ocean-attr">
              {book && <span className="attr-title">{book.title}</span>}
              {q.page && <span className="attr-mono">p.{q.page}</span>}
            </span>
          </a>
        )
      })}

      <header className="ocean-bar">
        <GlassButton icon="close" ariaLabel="Back to library" href="#/" />
        <span className="depth glass">{meters} m</span>
      </header>
    </div>
  )
}
