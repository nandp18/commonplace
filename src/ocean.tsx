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
 * The water darkens through the real ocean zones until the drops glow in the dark.
 */

const GAP = 14
const SURFACE = 250 // world y of the waterline
const FIRST = SURFACE + 200 // world y of the first quote
const SPACING = 320 // between quotes
const METERS = 0.4 // world px → meters
const FOCUS = 0.44 // where a settled quote sits, as a fraction of screen height

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
/** 0 in sunlit water → 1 in the dark. */
const darknessAt = (m: number) => 0.82 * smooth(140, 1100, m) + 0.18 * smooth(1100, 2600, m)
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const LIGHT_BG = [255, 255, 255], DARK_BG = [9, 12, 17]
const LIGHT_INK = [30, 35, 29], DARK_INK = [200, 214, 228]
const LIGHT_TEXT = [29, 29, 27], DARK_TEXT = [236, 232, 222]
const LIGHT_MUTED = [119, 115, 106], DARK_MUTED = [128, 140, 154]
const GLOW = [150, 205, 255]
const GOLD = [181, 138, 53]

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

interface Ripple {
  x: number
  y: number // world
  t0: number
}

export function Ocean({ store }: { store: Store }) {
  const root = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const dropTarget = useRef<HTMLDivElement>(null)
  const items = useRef(new Map<number, HTMLElement>())
  const heights = useRef(new Map<number, number>())
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const depthLabel = useRef<HTMLSpanElement>(null)

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
  /** Depth of the k-th quote; each lap adds a half-gap for its tide marker. */
  const worldY = (k: number) => FIRST + k * SPACING + Math.floor(k / Math.max(1, n)) * SPACING * 0.5
  const kAt = (y: number) => {
    let k = Math.max(0, Math.floor((y - FIRST) / SPACING))
    while (k > 0 && worldY(k) > y) k--
    while (worldY(k + 1) <= y) k++
    return k
  }
  const dropX = (k: number, w: number) => {
    const jitter = (hash(`${k}`) % 1000) / 1000
    return k % 2 === 0 ? 30 + jitter * 22 : w - 30 - jitter * 22
  }
  /** The scroll position that settles quote k's words at the focus line. */
  const snapPoint = (k: number, h: number) => worldY(k) - 14 + (heights.current.get(k) ?? 150) / 2 - h * FOCUS
  const nearestSnap = (y: number, h: number) => {
    const k = kAt(y + h * FOCUS)
    let best = { k: -1, y: 0 }, bestD = y < snapPoint(0, h) ? Math.abs(y) : Infinity // -1 = the surface
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
    mode: 'idle' as 'idle' | 'drag' | 'spring' | 'wheel',
    target: savedDepth,
    targetK: -1,
    raw: savedDepth,
    samples: [] as { t: number; x: number }[],
    moved: 0,
    landed: true,
  })
  const ripples = useRef<Ripple[]>([])

  /** Put a quote's words where they belong for the current depth (the loop refines this every frame). */
  const placeItem = (el: HTMLElement, k: number) => {
    const h = window.innerHeight
    const y = worldY(k) - phys.current.x
    const mid = worldY(k) - 14 + (heights.current.get(k) ?? 150) / 2
    const o = smooth(h * 0.42, h * 0.06, Math.abs(mid - (phys.current.x + h * FOCUS)))
    el.style.transform = `translate3d(0, ${y - 14}px, 0)`
    el.style.opacity = String(0.1 + 0.9 * o)
  }
  const placeMarker = (el: HTMLElement | null) => {
    if (el) el.style.transform = `translate3d(0, ${Number(el.dataset.worldY) - phys.current.x}px, 0)`
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
    root.current?.querySelectorAll<HTMLElement>('[data-world-y]').forEach(placeMarker)
    // The view transition morphs the quote into this dot.
    const dot = dropTarget.current
    if (dot) {
      dot.style.transform = `translate3d(${dropX(r.k, w) - 5}px, ${worldY(r.k) - y - 5}px, 0)`
      dot.style.display = 'block'
      setTimeout(() => (dot.style.display = 'none'), 900)
    }
    el?.classList.add('emerging')
    setTimeout(() => ripples.current.push({ x: dropX(r.k, w), y: worldY(r.k), t0: performance.now() }), 380)
    returning = null
  }, [])

  // Input: drag (with detents), flicks, wheel, keys.
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
      const h = window.innerHeight
      const s = nearestSnap(p.raw, h)
      const d = s.y - p.raw
      const pull = Math.abs(d) < 70 ? d * 0.22 * (1 - Math.abs(d) / 70) : 0
      // Rubber band above the surface.
      p.x = p.raw < 0 ? p.raw * 0.35 : p.raw + pull
      const now = performance.now()
      p.samples.push({ t: now, x: p.raw })
      while (p.samples.length > 2 && now - p.samples[0].t > 90) p.samples.shift()
    }
    const up = () => {
      const p = phys.current
      if (p.mode !== 'drag') return
      el.dataset.dragged = p.moved > 6 ? '1' : ''
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
    let shownDark = -1
    let focusK = -2
    const snow = Array.from({ length: 80 }, (_, i) => ({ x: (hash(`s${i}`) % 1000) / 1000, y: (hash(`t${i}`) % 1000) / 1000, r: 0.5 + (i % 3) * 0.35 }))

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
      } else if (p.mode === 'idle' && p.x < 0) {
        p.x *= 0.8
      }
      const top = p.x
      const speed = p.mode === 'drag' ? 0 : Math.abs(p.v)

      // Light → dark with depth.
      const m = Math.max(0, (top + h * FOCUS - SURFACE) * METERS)
      const dk = darknessAt(m)
      const bg = mix(LIGHT_BG, DARK_BG, dk)
      const ink = mix(LIGHT_INK, DARK_INK, dk)
      if (Math.abs(dk - shownDark) > 0.004) {
        shownDark = dk
        el.style.setProperty('--o-bg', `rgb(${bg})`)
        el.style.setProperty('--o-text', `rgb(${mix(LIGHT_TEXT, DARK_TEXT, dk)})`)
        el.style.setProperty('--o-muted', `rgb(${mix(LIGHT_MUTED, DARK_MUTED, dk)})`)
        el.dataset.dark = dk > 0.5 ? '1' : ''
        meta?.setAttribute('content', `rgb(${bg})`)
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = `rgb(${bg})`
      ctx.fillRect(0, 0, w, h)

      // Shafts of light in the twilight, drifting slowly.
      const shafts = 4 * dk * (1 - dk)
      if (shafts > 0.02) {
        for (let i = 0; i < 3; i++) {
          const cx = ((i * 0.37 + 0.15 + Math.sin(t * 0.07 + i) * 0.05) % 1) * w - top * 0.04
          const g = ctx.createLinearGradient(cx, 0, cx + w * 0.25, h)
          g.addColorStop(0, `rgba(255,255,255,${0.09 * shafts})`)
          g.addColorStop(1, 'rgba(255,255,255,0)')
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.moveTo(cx - 30, 0)
          ctx.lineTo(cx + 40, 0)
          ctx.lineTo(cx + w * 0.35, h)
          ctx.lineTo(cx + w * 0.12, h)
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

      // Waterline.
      if (SURFACE - top > -20 && SURFACE - top < h + 20) {
        ctx.fillStyle = `rgba(${ink}, 0.6)`
        for (let x = 0; x <= w; x += GAP / 2.2) {
          ctx.beginPath()
          ctx.arc(x, surfaceAt(x) - top, 1.35, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // Water.
      const rowGap = GAP * 0.86
      const streak = Math.min(9, speed * 0.004) // dots stretch at speed
      const r0 = Math.max(0, Math.floor((top - SURFACE) / rowGap) - 1)
      const r1 = Math.ceil((top + h - SURFACE) / rowGap) + 1
      for (let r = r0; r <= r1; r++) {
        const y0 = SURFACE + 6 + r * rowGap
        const shallow = Math.min(1, (y0 - SURFACE) / 520)
        const deep = Math.min(1, Math.max(0, (y0 - SURFACE - 520) / 2400))
        for (let x0 = r % 2 ? 0 : -GAP / 2; x0 < w + GAP; x0 += GAP) {
          const A = 3.6 * Math.exp(-shallow * 2.6) + 0.45
          const ph = x0 * 0.028 - t * 0.9 + y0 * 0.0035
          const rip = ripples.current.length ? stir(x0, y0) : { dx: 0, dy: 0, s: 0 }
          const x = x0 + A * Math.cos(ph) * 0.7 + rip.dx
          const wy = y0 + A * Math.sin(ph) + rip.dy
          if (wy < surfaceAt(x) + 4) continue
          const current = Math.sin(y0 * 0.0042 + Math.sin(x0 * 0.006 + t * 0.15) * 1.2)
          const swell = Math.sin(x0 * 0.028 - t * 0.9 - y0 * 0.005) * (1 - shallow * 0.6)
          const radius = 0.55 + 0.8 * (0.5 + 0.5 * (swell * 0.5 + current * 0.5)) + 0.25 * deep + rip.s * 0.5
          let a = 0.055 + 0.28 * Math.pow(1 - shallow, 1.6) + 0.08 * deep + 0.05 * (current + 1) + 0.04 * swell + rip.s * 0.2
          a *= 1 - dk * 0.45 // luminous dots are fainter than ink
          // In the dark, now and then a speck of water lights up.
          let color = ink
          if (dk > 0.4) {
            const phase = ((x0 * 73.1 + r * 19.7) % 6.283) + r
            const tw = Math.pow(Math.max(0, Math.sin(t * 0.7 + phase)), 30) * (dk - 0.4) * 1.6
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

      // Marine snow, at its own depth.
      if (top > SURFACE - h) {
        ctx.fillStyle = `rgba(${dk > 0.5 ? GLOW : ink}, ${0.22 - dk * 0.06})`
        for (const s of snow) {
          const yy = ((s.y * h * 3 - top * 0.55 - t * 6) % (h * 3) + h * 3) % (h * 3) - h
          if (yy < SURFACE - top + 10 || yy > h) continue
          ctx.beginPath()
          ctx.ellipse(s.x * w + Math.sin(t * 0.4 + s.y * 9) * 6, yy, s.r, s.r + streak * 0.6, 0, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // Depth gauge.
      ctx.fillStyle = `rgba(${ink}, ${0.34 - dk * 0.1})`
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

      // Which quotes exist in the DOM right now.
      const k0 = Math.max(0, kAt(top - 300))
      const k1 = kAt(top + h + 300) + 1
      const key = `${k0}-${k1}`
      if (key !== shownRange) {
        shownRange = key
        setRange([k0, k1])
      }

      // Drops and their words.
      const focusY = top + h * FOCUS
      let nearest = -1, nearestD = Infinity
      for (let k = k0; k <= k1; k++) {
        const q = quoteAt(k)
        const wy = worldY(k)
        const textMid = wy - 14 + (heights.current.get(k) ?? 150) / 2
        const dist = Math.abs(textMid - focusY)
        if (dist < nearestD) (nearestD = dist), (nearest = k)
        const o = smooth(h * 0.42, h * 0.06, dist) // 1 at focus → 0 far away
        const rip = stir(dropX(k, w), wy)
        const x = dropX(k, w) + rip.dx
        const y = wy - top + 2.5 * Math.sin(t * 1.1 + k) + rip.dy
        const isToday = q.id === dailyId
        const base = isToday ? GOLD : dk > 0.45 ? GLOW : ink

        // Halo: soft in daylight, bioluminescent in the dark.
        const haloR = 8 + 7 * o + dk * 10
        const g = ctx.createRadialGradient(x, y, 0, x, y, haloR)
        g.addColorStop(0, `rgba(${base}, ${0.14 + 0.16 * o + dk * 0.25})`)
        g.addColorStop(1, `rgba(${base}, 0)`)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, haloR, 0, Math.PI * 2)
        ctx.fill()
        if (dk < 0.45) {
          ctx.fillStyle = `rgb(${bg})`
          ctx.beginPath()
          ctx.arc(x, y, 4.5, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.fillStyle = `rgba(${base}, ${0.6 + 0.4 * o})`
        ctx.beginPath()
        ctx.arc(x, y, 2.6 + o * 0.9, 0, Math.PI * 2)
        ctx.fill()

        const item = items.current.get(k)
        if (item) {
          item.style.transform = `translate3d(0, ${y - 14}px, 0)`
          item.style.opacity = String(0.1 + 0.9 * o)
          item.style.filter = o > 0.92 ? '' : `blur(${(1 - o) * 2.4}px)`
        }
      }
      // A tick as each quote passes the focus line during a glide.
      if (nearest !== focusK && nearestD < 60 && p.mode !== 'idle') {
        focusK = nearest
        if (p.mode === 'spring' && nearest !== p.targetK) haptic('tick')
      }

      // Markers travel with the water.
      el.querySelectorAll<HTMLElement>('[data-world-y]').forEach((mk) => {
        mk.style.transform = `translate3d(0, ${Number(mk.dataset.worldY) - top}px, 0)`
      })
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

      <div className="ocean-sky" data-world-y={0} ref={placeMarker}>
        <h1>The ocean</h1>
        <p className="meta-mono">
          {n} {n === 1 ? 'drop' : 'drops'} · scroll to dive
        </p>
      </div>

      {ZONES.map((z) => (
        <div key={z.m} className="zone-marker label" data-world-y={SURFACE + z.m / METERS} ref={placeMarker}>
          {z.name} · {z.m.toLocaleString()} m
        </div>
      ))}

      {lapMarkers.map((lap) => (
        <div key={lap} className="zone-marker label" data-world-y={worldY(lap * n) - SPACING * 0.75} ref={placeMarker}>
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
              if (items.current.get(k) === el) return
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
        <span className="depth glass" ref={depthLabel}>
          {`${Math.round(Math.max(0, (savedDepth + window.innerHeight * FOCUS - SURFACE) * METERS))} m`}
        </span>
      </header>
    </div>
  )
}
