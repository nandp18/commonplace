import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { GlassButton, QuoteText } from './components'
import { haptic, markTransition, reducedMotion } from './motion'
import type { Store } from './store'
import type { Quote } from './types'
import { quoteOfTheDay } from './util'

/**
 * The ocean: dive down through your quotes. Newest just under the surface, older as you
 * go deeper; past the oldest, the tide brings them round again in a new order, forever.
 *
 * Scrolling is a small physics system: a soft detent at each quote while you drag, then a
 * spring that settles the nearest quote (or the one your flick was heading for) into place.
 *
 * Above the water hangs tonight's moon. Below: caustics and a moon path in the shallows,
 * bubbles, schools of fish, the occasional whale, and jellyfish glowing in the dark.
 */

const GAP = 14
const SURFACE = 250 // world y of the waterline
const FIRST = SURFACE + 200 // world y of the first quote
const SPACING = 320 // between quotes
const METERS = 0.4 // world px → meters
const FOCUS = 0.44 // where a settled quote sits, as a fraction of screen height
const yAtMeters = (m: number) => SURFACE + m / METERS

const ZONES = [
  { m: 200, name: 'Twilight zone' },
  { m: 1000, name: 'Midnight zone' },
  { m: 4000, name: 'The abyss' },
]
const zoneAt = (m: number) => (m >= 4000 ? 'Abyss' : m >= 1000 ? 'Midnight' : m >= 200 ? 'Twilight' : 'Sunlight')

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
/** Re-blurring text on every frame is too slow for phones, so depth of field is desktop only. */
const softFocus = matchMedia('(pointer: fine)').matches
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const mix3 = (a: number[], b: number[], c: number[], ab: number, bc: number) => mix(mix(a, b, ab), c, bc)

// Three waters. Twilight stays pale enough for dark text; the plunge to midnight happens
// inside a single gap between quotes, so a settled quote is never on murky grey.
const BG = { sun: [255, 255, 255], twi: [220, 227, 234], mid: [9, 12, 17], abyss: [3, 5, 8] }
const INK = { sun: [30, 35, 29], twi: [34, 48, 62], mid: [200, 214, 228] }
const TEXT = { dark: [29, 29, 27], light: [236, 232, 222] }
const MUTED = { sun: [119, 115, 106], twi: [84, 94, 106], mid: [134, 146, 160] }
const GLOW = [150, 205, 255]
const GOLD = [181, 138, 53]
const MOONLIT = [196, 166, 96]

/** Tonight's moon: 0 = new, 0.5 = full. */
function moonPhase(now = Date.now()) {
  const synodic = 29.530588853
  const days = (now - Date.UTC(2000, 0, 6, 18, 14)) / 86400000
  return (((days % synodic) + synodic) % synodic) / synodic
}
function phaseName(p: number) {
  const names = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent']
  return names[Math.round(p * 8) % 8]
}
/** Fraction of the disc that's lit. */
const illumination = (p: number) => (1 - Math.cos(p * Math.PI * 2)) / 2

/** Distance from a point to a segment, and how far along it the nearest point is. */
function toSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return { d: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t }
}

/** A humpback in profile, as a mask in local coordinates (head toward −x). */
function inWhale(x: number, y: number) {
  if (x >= -70 && x <= 56) {
    const u = (x + 8) / 63, v = (x + 14) / 58
    const back = -14 * Math.sqrt(Math.max(0, 1 - u * u)) - 2.5 * Math.exp(-(((x - 18) / 14) ** 2)) // arched, a small hump
    const belly = 10 * Math.sqrt(Math.max(0, 1 - v * v)) + 1
    if (y > back && y < belly) return true
  }
  if (x > 52 && x <= 80 && Math.abs(y + (x - 52) * 0.12) < 4.2 - (x - 52) * 0.09) return true // tail stock
  if (x > 78 && x <= 96) {
    // Flukes are horizontal, so side-on they're a thin, swept V.
    const s = x - 78
    if (Math.abs(y - (-3.4 - s * 0.42)) < 1.7 || Math.abs(y - (-3.4 + s * 0.22)) < 1.7) return true
  }
  const f = toSegment(x, y, -34, 5, -4, 27) // the long pectoral flipper
  return f.d < 3.4 - f.t * 1.8
}

// Survives navigating to a quote and back.
let savedDepth = 0
let returning: { id: string; k: number } | null = null

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

interface Ripple { x: number; y: number; t0: number } // y in world px
interface Bubble { x: number; y: number; r: number; vy: number; ph: number }
interface School { x: number; y: number; dir: number; fish: { ox: number; oy: number; ph: number }[] }
interface Whale { x: number; y: number; dir: number }
interface Jelly { x: number; y: number; ph: number; size: number }

export function Ocean({ store }: { store: Store }) {
  const root = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const dropTarget = useRef<HTMLDivElement>(null)
  const depthLabel = useRef<HTMLSpanElement>(null)
  const items = useRef(new Map<number, HTMLElement>())
  const heights = useRef(new Map<number, number>())
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })

  const byAge = useMemo(() => [...store.quotes].sort((a, b) => b.createdAt - a.createdAt), [store.quotes])
  const n = byAge.length
  const dailyId = quoteOfTheDay(store.quotes)?.id
  const laps = useRef(new Map<number, Quote[]>())
  const phase = useMemo(() => moonPhase(), [])

  /** The k-th quote on the way down: by age on the first lap, then a new shuffle each lap. */
  const quoteAt = (k: number): Quote => {
    const lap = Math.floor(k / n)
    if (lap === 0) return byAge[k]
    let order = laps.current.get(lap)
    if (!order) laps.current.set(lap, (order = shuffled(byAge, lap * 7919)))
    return order[k % n]
  }
  /** Depth of the k-th quote; each lap adds a half-gap for its tide marker. */
  const worldY = (k: number) => FIRST + k * SPACING + Math.floor(k / Math.max(1, n)) * SPACING * 0.5
  const kAt = (y: number) => {
    let k = Math.max(0, Math.floor((y - FIRST) / SPACING))
    while (k > 0 && worldY(k) > y) k--
    while (worldY(k + 1) <= y) k++
    return k
  }
  const textH = (k: number) => heights.current.get(k) ?? 150
  const dropX = (k: number, w: number) => {
    const jitter = (hash(`${k}`) % 1000) / 1000
    return k % 2 === 0 ? 30 + jitter * 22 : w - 30 - jitter * 22
  }
  /** The open water between quote k and k+1 (k = −1: between the sky and the first quote). */
  const gap = (k: number) =>
    k < 0
      ? { start: SURFACE + 70, end: worldY(0) - 30 }
      : { start: worldY(k) - 14 + textH(k) + 18, end: worldY(k + 1) - 32 }
  /** The gap nearest a world depth, so labels and the plunge into darkness land between quotes. */
  const gapNear = (y: number) => {
    if (y < worldY(0)) return -1
    const k = kAt(y)
    const mid = (g: { start: number; end: number }) => (g.start + g.end) / 2
    return Math.abs(mid(gap(k - 1)) - y) < Math.abs(mid(gap(k)) - y) ? k - 1 : k
  }
  const gapMid = (k: number) => {
    const g = gap(k)
    return (g.start + g.end) / 2
  }

  /** The scroll position that settles quote k's words at the focus line. */
  const snapPoint = (k: number, h: number) => worldY(k) - 14 + textH(k) / 2 - h * FOCUS
  const nearestSnap = (y: number, h: number) => {
    const k = kAt(y + h * FOCUS)
    let best = { k: -1, y: 0 }, bestD = y < snapPoint(0, h) ? Math.abs(y) : Infinity // −1 = the surface
    for (const c of [k - 1, k, k + 1, k + 2]) {
      if (c < 0) continue
      const s = snapPoint(c, h)
      if (Math.abs(s - y) < bestD) (bestD = Math.abs(s - y)), (best = { k: c, y: s })
    }
    return best
  }

  // Physics state.
  const phys = useRef({
    x: savedDepth,
    v: 0, // px/s
    mode: 'idle' as 'idle' | 'drag' | 'spring' | 'wheel' | 'ascend',
    ascent: { from: 0, start: 0, dur: 1 },
    target: savedDepth,
    targetK: -1,
    raw: savedDepth,
    samples: [] as { t: number; x: number }[],
    moved: 0,
    landed: true,
  })
  const ripples = useRef<Ripple[]>([])
  const bubbles = useRef<Bubble[]>([])
  /** Tapping the moon fills it for a while. */
  const moonBoost = useRef(0)
  const moonAt = (w: number, top: number) => ({ x: w * 0.74, y: SURFACE * 0.4 - top * 0.6, r: 30 })

  /** Rise all the way back to the surface: eased, with the time scaled to the depth. */
  const surface = () => {
    const p = phys.current
    if (p.x < 4) return
    const dur = Math.min(1.8, Math.max(0.7, 0.7 + p.x / 6000))
    Object.assign(p, { mode: 'ascend', ascent: { from: p.x, start: performance.now(), dur } })
    haptic('tap')
  }

  const burst = (x: number, wy: number, count: number) => {
    for (let i = 0; i < count; i++)
      bubbles.current.push({ x: x + (Math.random() - 0.5) * 24, y: wy + (Math.random() - 0.5) * 16, r: 1.4 + Math.random() * 2.4, vy: 40 + Math.random() * 55, ph: Math.random() * 6 })
  }

  /** Put a quote's words where they belong for the current depth (the loop refines this every frame). */
  const placeItem = (el: HTMLElement, k: number) => {
    const h = window.innerHeight
    const mid = worldY(k) - 14 + textH(k) / 2
    const o = smooth(h * 0.42, h * 0.06, Math.abs(mid - (phys.current.x + h * FOCUS)))
    el.style.transform = `translate3d(0, ${worldY(k) - phys.current.x - 14}px, 0)`
    el.style.opacity = String(0.1 + 0.9 * o)
  }
  const placeSky = (el: HTMLElement | null) => {
    if (el) el.style.transform = `translate3d(0, ${-phys.current.x}px, 0)`
  }

  const initialRange = (): [number, number] => {
    const h = window.innerHeight
    return [Math.max(0, kAt(savedDepth - 300)), kAt(savedDepth + h + 300) + 1]
  }
  const [range, setRange] = useState<[number, number]>(initialRange)

  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])

  // Coming back from a quote: land exactly on it, and let it shrink into its drop.
  useLayoutEffect(() => {
    const r = returning
    if (!r || n === 0) return
    const { w, h } = size
    const el = items.current.get(r.k)
    if (el) heights.current.set(r.k, el.offsetHeight)
    const y = Math.max(0, snapPoint(r.k, h))
    Object.assign(phys.current, { x: y, raw: y, target: y, targetK: r.k, v: 0, mode: 'idle', landed: true })
    items.current.forEach(placeItem)
    placeSky(root.current?.querySelector('.ocean-sky') ?? null)
    // The view transition morphs the quote into this dot.
    const dot = dropTarget.current
    if (dot) {
      dot.style.transform = `translate3d(${dropX(r.k, w) - 5}px, ${worldY(r.k) - y - 5}px, 0)`
      dot.style.display = 'block'
      setTimeout(() => (dot.style.display = 'none'), 900)
    }
    el?.classList.add('emerging')
    setTimeout(() => {
      ripples.current.push({ x: dropX(r.k, w), y: worldY(r.k), t0: performance.now() })
      burst(dropX(r.k, w), worldY(r.k), 5)
    }, 380)
    returning = null
  }, [])

  // Input: drag (with detents), flicks, wheel, keys, taps on the water and the moon.
  useEffect(() => {
    const el = root.current
    if (!el) return
    let lastY = 0
    let wheelTimer = 0
    const settle = (projected: number, v: number) => {
      const p = phys.current
      const h = window.innerHeight
      let s = nearestSnap(projected, h)
      // A deliberate flick always moves at least one quote.
      const here = nearestSnap(p.x, h)
      if (Math.abs(v) > 260 && s.k === here.k) {
        const k = Math.max(-1, here.k + Math.sign(v))
        s = k < 0 ? { k: -1, y: 0 } : { k, y: snapPoint(k, h) }
      }
      Object.assign(p, { mode: 'spring', target: Math.max(0, s.y), targetK: s.k, landed: false })
    }
    const down = (e: PointerEvent) => {
      const p = phys.current
      Object.assign(p, { mode: 'drag', raw: p.x, v: 0, samples: [], moved: 0 })
      lastY = e.clientY
    }
    const move = (e: PointerEvent) => {
      const p = phys.current
      if (p.mode !== 'drag') return
      const dy = e.clientY - lastY
      lastY = e.clientY
      p.moved += Math.abs(dy)
      p.raw -= dy
      // Detent: a gentle pull toward the nearest quote as it passes the focus line.
      const s = nearestSnap(p.raw, window.innerHeight)
      const d = s.y - p.raw
      const pull = Math.abs(d) < 70 ? d * 0.22 * (1 - Math.abs(d) / 70) : 0
      // Rubber band above the surface.
      p.x = p.raw < 0 ? p.raw * 0.35 : p.raw + pull
      const now = performance.now()
      p.samples.push({ t: now, x: p.raw })
      while (p.samples.length > 2 && now - p.samples[0].t > 90) p.samples.shift()
    }
    const up = (e: PointerEvent) => {
      const p = phys.current
      if (p.mode !== 'drag') return
      const tapped = p.moved <= 6
      el.dataset.dragged = tapped ? '' : '1'
      if (tapped && !(e.target as HTMLElement).closest('.ocean-quote, .ocean-bar')) {
        const moon = moonAt(window.innerWidth, p.x)
        if (Math.hypot(e.clientX - moon.x, e.clientY - moon.y) < moon.r + 14) {
          moonBoost.current = 1 // a full moon, for a while
          haptic('success')
        } else if (e.clientY + p.x > SURFACE) {
          ripples.current.push({ x: e.clientX, y: e.clientY + p.x, t0: performance.now() })
          burst(e.clientX, e.clientY + p.x, 9)
          haptic('tick')
        }
      }
      const a = p.samples[0], b = p.samples[p.samples.length - 1]
      const v = a && b && b.t > a.t ? ((b.x - a.x) / (b.t - a.t)) * 1000 : 0
      p.v = v
      settle(p.x + v * 0.32, v)
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const p = phys.current
      p.mode = 'wheel'
      p.x = Math.max(-80, p.x + e.deltaY)
      p.v = 0
      clearTimeout(wheelTimer)
      wheelTimer = window.setTimeout(() => settle(p.x, 0), 140)
    }
    const key = (e: KeyboardEvent) => {
      const p = phys.current
      const h = window.innerHeight
      if (e.key === 'Escape') location.hash = '/'
      if (e.key === 'Home') return surface()
      if (!['ArrowDown', 'ArrowUp', ' '].includes(e.key)) return
      e.preventDefault()
      const k = Math.max(-1, nearestSnap(p.target, h).k + (e.key === 'ArrowUp' ? -1 : 1))
      Object.assign(p, { mode: 'spring', target: k < 0 ? 0 : snapPoint(k, h), targetK: k, landed: false })
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
      clearTimeout(wheelTimer)
      savedDepth = Math.max(0, phys.current.mode === 'spring' ? phys.current.target : phys.current.x)
    }
  }, [n])

  // Render loop.
  useEffect(() => {
    const c = canvas.current
    const el = root.current
    if (!c || !el || n === 0) return
    const { w, h } = size
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = w * dpr
    c.height = h * dpr
    const ctx = c.getContext('2d')!
    const still = reducedMotion()
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    let raf = 0
    let last = performance.now()
    let shownRange = ''
    let shownTone = ''
    let focusK = -2
    let school: School | null = null
    let whale: Whale | null = null
    const jellies: Jelly[] = []
    const snow = Array.from({ length: 80 }, (_, i) => ({ x: (hash(`s${i}`) % 1000) / 1000, y: (hash(`t${i}`) % 1000) / 1000, r: 0.5 + (i % 3) * 0.35 }))
    const dot = (x: number, y: number, r: number) => {
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.032, (now - last) / 1000)
      last = now
      const t = still ? 2 : now / 1000
      const p = phys.current

      // Spring toward the chosen quote: slightly underdamped, so it settles with a breath.
      if (p.mode === 'spring') {
        const k = 150, damping = 2 * Math.sqrt(k) * 0.74
        const a = k * (p.target - p.x) - damping * p.v
        p.v += a * dt
        p.x += p.v * dt
        if (Math.abs(p.target - p.x) < 0.4 && Math.abs(p.v) < 4) {
          Object.assign(p, { x: p.target, v: 0, mode: 'idle' })
          if (!p.landed) {
            p.landed = true
            haptic('tap') // click into place
          }
        }
      } else if (p.mode === 'ascend') {
        const { from, start, dur } = p.ascent
        const u = Math.min(1, (now - start) / 1000 / dur)
        const eased = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2 // ease in-out
        const x = from * (1 - eased)
        p.v = (x - p.x) / Math.max(dt, 0.001) // for streaks and bubbles
        p.x = x
        if (u >= 1) {
          Object.assign(p, { x: 0, v: 0, mode: 'idle', target: 0, landed: true })
          haptic('success')
        }
      } else if (p.mode === 'idle' && p.x < 0) {
        p.x *= 0.8
      }
      const top = p.x
      const speed = p.mode === 'drag' ? 0 : Math.abs(p.v)
      const focusWorld = top + h * FOCUS
      const m = Math.max(0, (focusWorld - SURFACE) * METERS)

      // ── Light and colour, by zone ──
      const twilight = smooth(SURFACE + 60, gapMid(gapNear(yAtMeters(200))) + 120, focusWorld)
      const midGap = gapMid(gapNear(yAtMeters(1000)))
      const night = smooth(midGap - 110, midGap + 110, focusWorld) // the plunge, inside one gap
      const abyssGap = gapMid(gapNear(yAtMeters(4000)))
      const abyss = smooth(abyssGap - 110, abyssGap + 110, focusWorld)
      const bg = mix(mix3(BG.sun, BG.twi, BG.mid, twilight, night), BG.abyss, abyss)
      const ink = mix3(INK.sun, INK.twi, INK.mid, twilight, night)
      const daylight = (1 - night) * twilight // how much moonlight reaches here
      const dark = night
      const tone = `${bg}`
      if (tone !== shownTone) {
        shownTone = tone
        el.style.setProperty('--o-bg', `rgb(${bg})`)
        el.style.setProperty('--o-text', `rgb(${mix(TEXT.dark, TEXT.light, smooth(0.4, 0.6, night))})`)
        el.style.setProperty('--o-muted', `rgb(${mix3(MUTED.sun, MUTED.twi, MUTED.mid, twilight, night)})`)
        el.dataset.dark = night > 0.5 ? '1' : ''
        meta?.setAttribute('content', `rgb(${bg})`)
      }

      // ── The moon ──
      moonBoost.current = Math.max(0, moonBoost.current - dt / 14)
      const boost = smooth(0, 0.35, moonBoost.current)
      const shown = phase + (0.5 - phase) * boost
      const lit = Math.max(illumination(shown), 0.04)
      const moon = moonAt(w, top)

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = `rgb(${bg})`
      ctx.fillRect(0, 0, w, h)

      if (moon.y > -moon.r * 3) {
        const halo = ctx.createRadialGradient(moon.x, moon.y, moon.r * 0.6, moon.x, moon.y, moon.r * 2.6)
        halo.addColorStop(0, `rgba(${MOONLIT}, ${0.16 * lit})`)
        halo.addColorStop(1, `rgba(${MOONLIT}, 0)`)
        ctx.fillStyle = halo
        dot(moon.x, moon.y, moon.r * 2.6)
        // A disc of dots; the terminator follows the phase. The dark side keeps a faint earthshine.
        const waxing = shown < 0.5
        const kk = Math.cos(shown * Math.PI * 2)
        for (let dy = -moon.r; dy <= moon.r; dy += 4.2) {
          const half = Math.sqrt(Math.max(0, moon.r * moon.r - dy * dy))
          for (let dx = -half; dx <= half; dx += 4.2) {
            const u = half ? dx / half : 0
            const isLit = waxing ? u > kk : u < -kk
            const crater = Math.sin(dx * 0.31 + dy * 0.17) * Math.sin(dx * 0.13 - dy * 0.29) > 0.55
            ctx.fillStyle = isLit ? `rgba(${MOONLIT}, ${crater ? 0.62 : 0.9})` : `rgba(${INK.sun}, 0.07)`
            dot(moon.x + dx, moon.y + dy + Math.sin(t * 0.3) * 1.2, isLit ? 1.45 : 1.1)
          }
        }
      }

      // ── Moonbeams slanting down into the twilight ──
      const beams = daylight * (0.35 + 0.65 * lit)
      if (beams > 0.02) {
        for (let i = 0; i < 4; i++) {
          const x0 = moon.x - 70 + i * 46 + Math.sin(t * 0.08 + i * 1.7) * 14
          const spread = (i - 1.5) * w * 0.12 - w * 0.18
          const g = ctx.createLinearGradient(x0, 0, x0 + spread, h)
          g.addColorStop(0, `rgba(255,255,255,${0.32 * beams})`)
          g.addColorStop(1, 'rgba(255,255,255,0)')
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.moveTo(x0 - 10, 0)
          ctx.lineTo(x0 + 16, 0)
          ctx.lineTo(x0 + spread + 60, h)
          ctx.lineTo(x0 + spread - 20, h)
          ctx.fill()
        }
      }

      ripples.current = ripples.current.filter((r) => now - r.t0 < 2600)
      const stir = (x: number, wy: number) => {
        let dx = 0, dy = 0, s = 0
        for (const r of ripples.current) {
          const age = (now - r.t0) / 1000
          const dist = Math.hypot(x - r.x, wy - r.y)
          const band = dist - age * 120
          if (Math.abs(band) > 36) continue
          const amp = 5 * Math.exp(-age * 1.5) * Math.cos((band / 36) * Math.PI * 0.5)
          dx += ((x - r.x) / (dist || 1)) * amp
          dy += ((wy - r.y) / (dist || 1)) * amp
          s += Math.abs(amp) / 5
        }
        return { dx, dy, s }
      }
      const surfaceAt = (x: number) => SURFACE + 7 * Math.sin(x * 0.028 - t * 0.9) + 2.5 * Math.sin(x * 0.083 + t * 1.4)

      // ── A whale, far off, now and then (drawn behind the water) ──
      if (!whale && twilight > 0.5 && Math.random() < dt / 30) {
        const dir = Math.random() < 0.5 ? -1 : 1
        whale = { x: dir < 0 ? w + 120 : -120, y: top + h * (0.3 + Math.random() * 0.35), dir }
      }
      if (whale) {
        whale.x += whale.dir * 20 * dt
        const sy = whale.y - top
        if (whale.x < -160 || whale.x > w + 160 || sy < -200 || sy > h + 200) whale = null
        else {
          ctx.fillStyle = dark > 0.5 ? `rgba(${GLOW}, 0.2)` : `rgba(${ink}, 0.13)`
          for (let lx = -72; lx <= 98; lx += 3.8)
            for (let ly = -24; ly <= 32; ly += 3.8) {
              // The tail beats slowly; the body barely moves.
              const sway = Math.sin(t * 1.1 - lx * 0.035) * 2.4 * Math.max(0, (lx - 20) / 76)
              if (inWhale(lx, ly - sway)) dot(whale.x - whale.dir * lx, sy + ly, 1.2)
            }
        }
      }

      // ── Waterline, with moonlight glinting on it ──
      if (SURFACE - top > -20 && SURFACE - top < h + 20) {
        for (let x = 0; x <= w; x += GAP / 2.2) {
          const glint = Math.abs(x - moon.x) < 40 ? Math.pow(Math.max(0, Math.sin(t * 3 + x * 0.8)), 6) * lit : 0
          ctx.fillStyle = glint > 0.1 ? `rgba(${MOONLIT}, ${0.5 + 0.5 * glint})` : `rgba(${ink}, 0.6)`
          dot(x, surfaceAt(x) - top, 1.35 + glint * 0.6)
        }
      }

      // ── The water ──
      const rowGap = GAP * 0.86
      const streak = Math.min(9, speed * 0.004) // dots stretch at speed
      const r0 = Math.max(0, Math.floor((top - SURFACE) / rowGap) - 1)
      const r1 = Math.ceil((top + h - SURFACE) / rowGap) + 1
      for (let r = r0; r <= r1; r++) {
        const y0 = SURFACE + 6 + r * rowGap
        const below = y0 - SURFACE
        const shallow = Math.min(1, below / 520)
        const deep = Math.min(1, Math.max(0, (below - 520) / 2400))
        for (let x0 = r % 2 ? 0 : -GAP / 2; x0 < w + GAP; x0 += GAP) {
          const A = 3.6 * Math.exp(-shallow * 2.6) + 0.45
          const ph = x0 * 0.028 - t * 0.9 + y0 * 0.0035
          const rip = ripples.current.length ? stir(x0, y0) : { dx: 0, dy: 0, s: 0 }
          const x = x0 + A * Math.cos(ph) * 0.7 + rip.dx
          const wy = y0 + A * Math.sin(ph) + rip.dy
          if (wy < surfaceAt(x) + 4) continue
          const current = Math.sin(y0 * 0.0042 + Math.sin(x0 * 0.006 + t * 0.15) * 1.2)
          const swell = Math.sin(x0 * 0.028 - t * 0.9 - y0 * 0.005) * (1 - shallow * 0.6)
          let radius = 0.55 + 0.8 * (0.5 + 0.5 * (swell * 0.5 + current * 0.5)) + 0.25 * deep + rip.s * 0.5
          let a = 0.055 + 0.28 * Math.pow(1 - shallow, 1.6) + 0.08 * deep + 0.05 * (current + 1) + 0.04 * swell + rip.s * 0.2
          let color = ink

          if (shallow < 1 && night < 1) {
            // Caustics: veins of light rippling through the shallows (light = less ink here).
            const cz =
              Math.sin(x0 * 0.045 + t * 0.9 + Math.sin(y0 * 0.035 - t * 0.6) * 1.8) *
              Math.sin(y0 * 0.05 - t * 0.7 + Math.sin(x0 * 0.03 + t * 0.5) * 1.8)
            const caustic = Math.pow(1 - Math.abs(cz), 10) * (1 - shallow) * (1 - night)
            a *= 1 - caustic * 0.8
            radius *= 1 - caustic * 0.4
            // The moon path: a glittering column under the moon.
            if (below < 260 && Math.abs(x0 - moon.x) < 16 + below * 0.2) {
              const glint = Math.pow(Math.max(0, Math.sin(t * 2.6 + x0 * 0.9 + r * 1.7)), 8) * lit * (1 - below / 260)
              if (glint > 0.06) {
                color = MOONLIT
                a = 0.35 + 0.6 * glint
                radius += 0.4
              }
            }
          }
          a *= 1 - dark * 0.45 // luminous dots are fainter than ink
          if (dark > 0.4) {
            // In the dark, now and then a speck of water lights up.
            const phase2 = ((x0 * 73.1 + r * 19.7) % 6.283) + r
            const tw = Math.pow(Math.max(0, Math.sin(t * 0.7 + phase2)), 30) * (dark - 0.4) * 1.6
            if (tw > 0.05) {
              a += tw * 0.7
              color = GLOW
            }
          }
          ctx.fillStyle = `rgba(${color}, ${Math.max(0.03, a)})`
          ctx.beginPath()
          if (streak > 0.5) ctx.ellipse(x, wy - top, radius, radius + streak, 0, 0, Math.PI * 2)
          else ctx.arc(x, wy - top, radius, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // ── Marine snow, at its own depth ──
      if (top > SURFACE - h) {
        ctx.fillStyle = `rgba(${dark > 0.5 ? GLOW : ink}, ${0.22 - dark * 0.06})`
        for (const s of snow) {
          const yy = ((s.y * h * 3 - top * 0.55 - t * 6) % (h * 3) + h * 3) % (h * 3) - h
          if (yy < SURFACE - top + 10 || yy > h) continue
          ctx.beginPath()
          ctx.ellipse(s.x * w + Math.sin(t * 0.4 + s.y * 9) * 6, yy, s.r, s.r + streak * 0.6, 0, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // ── Bubbles: a few always rising; more when you dive fast; a burst where you tap ──
      if (!still && top + h > SURFACE) {
        const rate = 0.8 + (Math.abs(p.v) > 500 ? Math.abs(p.v) / 400 : 0)
        if (Math.random() < rate * dt) bubbles.current.push({ x: Math.random() * w, y: top + h + 10, r: 1.2 + Math.random() * 2.2, vy: 30 + Math.random() * 40, ph: Math.random() * 6 })
      }
      bubbles.current = bubbles.current.filter((b) => {
        b.y -= b.vy * dt
        b.x += Math.sin(t * 2.2 + b.ph) * 0.35
        if (b.y < surfaceAt(b.x) + 2) {
          if (b.y - top > -20) ripples.current.push({ x: b.x, y: SURFACE, t0: now }) // pop
          return false
        }
        return b.y > top - 60
      }).slice(-60)
      ctx.lineWidth = 0.8
      for (const b of bubbles.current) {
        const sy = b.y - top
        const wob = 1 + Math.sin(t * 6 + b.ph) * 0.08
        ctx.strokeStyle = dark > 0.5 ? `rgba(${GLOW}, 0.55)` : `rgba(${ink}, 0.38)`
        ctx.beginPath()
        ctx.ellipse(b.x, sy, b.r * wob, b.r / wob, 0, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = dark > 0.5 ? `rgba(${GLOW}, 0.8)` : 'rgba(255,255,255,0.9)'
        dot(b.x - b.r * 0.35, sy - b.r * 0.35, 0.5)
      }

      // ── A school of fish crossing the lit water ──
      if (!school && night < 0.3 && top + h > SURFACE + 120 && Math.random() < dt / 9) {
        const dir = Math.random() < 0.5 ? -1 : 1
        school = {
          x: dir > 0 ? -90 : w + 90,
          y: Math.max(SURFACE + 60, top + h * (0.2 + Math.random() * 0.6)),
          dir,
          fish: Array.from({ length: 9 + Math.floor(Math.random() * 6) }, () => ({ ox: (Math.random() - 0.5) * 80, oy: (Math.random() - 0.5) * 40, ph: Math.random() * 6 })),
        }
      }
      if (school) {
        school.x += school.dir * 46 * dt
        const sy = school.y - top
        if (school.x < -160 || school.x > w + 160 || sy < -120 || sy > h + 120) school = null
        else {
          ctx.fillStyle = `rgba(${ink}, ${0.5 * (1 - night)})`
          for (const f of school.fish) {
            const fx = school.x + f.ox + Math.sin(t * 0.9 + f.ph) * 4
            const fy = sy + f.oy + Math.sin(t * 1.3 + f.ox * 0.05) * 5
            const wig = Math.sin(t * 10 + f.ph) * 0.9
            const d = -school.dir
            dot(fx, fy, 1.6)
            dot(fx + d * 3.2, fy, 1.3)
            dot(fx + d * 6.2, fy + wig, 1.1)
            dot(fx + d * 8.8, fy + wig * 1.9, 1.2)
          }
        }
      }

      // ── Jellyfish, glowing in the dark ──
      if (night > 0.5) {
        const want = 2 + Math.round(abyss * 2)
        while (jellies.length < want)
          jellies.push({ x: 40 + Math.random() * (w - 80), y: top + h * (0.1 + Math.random() * 1.1), ph: Math.random() * 6, size: 0.8 + Math.random() * 0.5 })
      }
      for (let i = jellies.length - 1; i >= 0; i--) {
        const j = jellies[i]
        const pulse = (Math.sin(t * 2.3 + j.ph) + 1) / 2
        j.y -= (2 + 9 * pulse) * dt
        j.x += Math.sin(t * 0.3 + j.ph) * 0.15
        const sy = j.y - top
        if (sy < -140 || sy > h + 240 || night < 0.3) {
          jellies.splice(i, 1)
          continue
        }
        const s = j.size * night
        const halo = ctx.createRadialGradient(j.x, sy, 0, j.x, sy, 30 * j.size)
        halo.addColorStop(0, `rgba(${GLOW}, ${0.16 * s})`)
        halo.addColorStop(1, `rgba(${GLOW}, 0)`)
        ctx.fillStyle = halo
        dot(j.x, sy, 30 * j.size)
        const rx = (11 + 2.5 * pulse) * j.size, ry = (9 - 2.5 * pulse) * j.size
        ctx.fillStyle = `rgba(${GLOW}, ${0.75 * s})`
        for (let ring = 0; ring < 3; ring++) {
          const f = 1 - ring * 0.32
          for (let k = 0; k <= 10; k++) {
            const ang = Math.PI + (k / 10) * Math.PI
            dot(j.x + Math.cos(ang) * rx * f, sy + Math.sin(ang) * ry * f, 1.25 - ring * 0.2)
          }
        }
        ctx.fillStyle = `rgba(${GLOW}, ${0.45 * s})`
        for (let tn = 0; tn < 5; tn++) {
          const bx = j.x + (tn - 2) * 4.2 * j.size
          for (let seg = 1; seg <= 8; seg++)
            dot(bx + Math.sin(t * 2 + seg * 0.6 + tn) * seg * 0.45, sy + seg * 4.6 * j.size + (1 - pulse) * seg * 0.6, 0.9)
        }
      }

      // ── Depth gauge ──
      ctx.fillStyle = `rgba(${ink}, ${0.36 - dark * 0.1})`
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.textAlign = 'right'
      const step = 125 // 50 m
      for (let y = Math.ceil(Math.max(SURFACE, top) / step) * step; y < top + h; y += step) {
        const mm = Math.round((y - SURFACE) * METERS)
        const yy = y - top
        const major = mm % 250 === 0
        ctx.fillRect(w - 8, yy, major ? 7 : 4, 0.75)
        if (major && mm > 0) ctx.fillText(`${mm} m`, w - 12, yy + 3)
      }

      // ── Which quotes are in the DOM ──
      const k0 = Math.max(0, kAt(top - 300))
      const k1 = kAt(top + h + 300) + 1
      const key = `${k0}-${k1}`
      if (key !== shownRange) {
        shownRange = key
        setRange([k0, k1])
      }

      // ── Drops and their words ──
      let nearest = -1, nearestD = Infinity
      for (let k = k0; k <= k1; k++) {
        const q = quoteAt(k)
        const wy = worldY(k)
        const dist = Math.abs(wy - 14 + textH(k) / 2 - focusWorld)
        if (dist < nearestD) (nearestD = dist), (nearest = k)
        const o = smooth(h * 0.42, h * 0.06, dist) // 1 at focus → 0 far away
        const rip = stir(dropX(k, w), wy)
        const x = dropX(k, w) + rip.dx
        const y = wy - top + 2.5 * Math.sin(t * 1.1 + k) + rip.dy
        const base = q.id === dailyId ? GOLD : dark > 0.45 ? GLOW : ink

        const haloR = 8 + 7 * o + dark * 10
        const g = ctx.createRadialGradient(x, y, 0, x, y, haloR)
        g.addColorStop(0, `rgba(${base}, ${0.14 + 0.16 * o + dark * 0.25})`)
        g.addColorStop(1, `rgba(${base}, 0)`)
        ctx.fillStyle = g
        dot(x, y, haloR)
        if (dark < 0.45) {
          ctx.fillStyle = `rgb(${bg})`
          dot(x, y, 4.5)
        }
        ctx.fillStyle = `rgba(${base}, ${0.6 + 0.4 * o})`
        dot(x, y, 2.6 + o * 0.9)

        const item = items.current.get(k)
        if (item) {
          item.style.transform = `translate3d(0, ${y - 14}px, 0)`
          item.style.opacity = String(0.1 + 0.9 * o)
          if (softFocus) item.style.filter = o > 0.92 ? '' : `blur(${(1 - o) * 2.4}px)`
        }
      }
      // A tick as each quote passes the focus line during a glide.
      if (nearest !== focusK && nearestD < 60 && p.mode !== 'idle') {
        focusK = nearest
        if (p.mode === 'spring' && nearest !== p.targetK) haptic('tick')
      }

      // ── Labels live in the gaps between quotes; two in one gap share it ──
      const markers = [...el.querySelectorAll<HTMLElement>('[data-marker-y]')]
      const byGap = new Map<number, HTMLElement[]>()
      for (const mk of markers) {
        const gi = gapNear(Number(mk.dataset.markerY))
        byGap.set(gi, [...(byGap.get(gi) ?? []), mk])
      }
      byGap.forEach((list, gi) => {
        const g = gap(gi)
        list.sort((a, b) => Number(a.dataset.markerY) - Number(b.dataset.markerY))
        list.forEach((mk, i) => {
          const y = g.start + ((g.end - g.start) * (i + 1)) / (list.length + 1)
          mk.style.transform = `translate3d(0, ${y - top - 7}px, 0)`
        })
      })
      const sky = el.querySelector<HTMLElement>('.ocean-sky')
      if (sky) sky.style.transform = `translate3d(0, ${-top}px, 0)`

      el.dataset.deep = top > 400 ? '1' : ''
      const label = `${Math.round(m).toLocaleString()} m · ${zoneAt(m)}`
      if (depthLabel.current && depthLabel.current.textContent !== label) depthLabel.current.textContent = label
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      meta?.setAttribute('content', '#FFFFFF')
    }
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
  const lapMarkers = [...new Set(visible.filter((k) => k > 0 && k % n === 0).map((k) => k / n))]

  return (
    <div ref={root} className="ocean">
      <canvas ref={canvas} style={{ width: size.w, height: size.h }} />

      <div className="ocean-sky" ref={placeSky}>
        <h1>The ocean</h1>
        <p className="meta-mono">
          {n} {n === 1 ? 'drop' : 'drops'} · {phaseName(phase).toLowerCase()}
        </p>
        <p className="meta-mono sky-hint">scroll to dive · tap the moon</p>
      </div>

      {ZONES.map((z) => (
        <div key={z.m} className="zone-marker label" data-marker-y={yAtMeters(z.m)}>
          {z.name} · {z.m.toLocaleString()} m
        </div>
      ))}

      {lapMarkers.map((lap) => (
        <div key={lap} className="zone-marker label" data-marker-y={worldY(lap * n) - SPACING * 0.5}>
          The tide brings them round again
        </div>
      ))}

      {visible.map((k) => {
        const q = quoteAt(k)
        const book = q.bookId ? store.bookMap.get(q.bookId) : undefined
        return (
          <a
            key={k}
            ref={(el) => {
              if (!el) return void items.current.delete(k)
              items.current.set(k, el)
              if (!heights.current.has(k)) heights.current.set(k, el.offsetHeight)
              placeItem(el, k)
            }}
            className={`ocean-quote ${k % 2 === 0 ? 'left' : 'right'}`}
            href={`#/quote/${q.id}`}
            draggable={false}
            onClick={(e) => {
              if (root.current?.dataset.dragged) return e.preventDefault()
              returning = { id: q.id, k }
              savedDepth = Math.max(0, snapPoint(k, window.innerHeight))
              markTransition('quote', q.id, 'ocean')
              e.currentTarget.querySelector<HTMLElement>('.quote-text')?.style.setProperty('view-transition-name', 'morph-quote')
              haptic('tap')
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

      {/* What a quote shrinks into when you come back. */}
      <div ref={dropTarget} className="ocean-drop" style={{ viewTransitionName: 'morph-quote', display: 'none' }} />

      <header className="ocean-bar">
        <GlassButton icon="close" ariaLabel="Back to library" href="#/" />
        <button className="depth glass" onClick={surface} aria-label="Rise to the surface">
          <span className="depth-up" aria-hidden>
            ↑
          </span>
          <span ref={depthLabel}>{`${Math.round(Math.max(0, (savedDepth + window.innerHeight * FOCUS - SURFACE) * METERS))} m`}</span>
        </button>
      </header>
    </div>
  )
}
