import { haptic, reducedMotion } from './motion'

/**
 * Filing a quote, as a small ceremony. Night falls over the whole screen; the quote's
 * words glow gold and gather into a single drop; the drop hangs, shines, and falls into
 * a dark sea below, where it lands with gold ripples and spray. Then the night lifts on
 * the library, with the new drop already in its sea.
 *
 * Everything here is plain DOM on <body>, outside React, so it can play across the
 * change of screen. A tap anywhere skips to the end.
 */

const GOLD = '232, 194, 122'
const CREAM = '245, 228, 190'

let active = false
let landed: { id: string; at: number } | null = null

/** The ceremony is playing; the router should change screens without its own transition. */
export const ceremonyActive = () => active

/** This quote just arrived by ceremony, so the library's sea shouldn't drop it in again. */
export const arrivedByCeremony = (id: string) => !!landed && landed.id === id && performance.now() - landed.at < 6000

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string) => {
  const e = document.createElement(tag)
  e.className = className
  return e
}

export async function fileIntoSea(filing: HTMLElement, id: string, navigate: () => void): Promise<void> {
  if (reducedMotion() || active) return navigate()
  active = true
  landed = null
  const W = innerWidth, H = innerHeight
  const center = { x: W / 2, y: H * 0.36 }
  const surfaceY = Math.round(H * 0.72)

  // A tap skips ahead: every animation jumps to its end and every pause is cut short.
  let skipped = false
  const anims: Animation[] = []
  let wakers: (() => void)[] = []
  const play = (target: Element, frames: Keyframe[], opts: KeyframeAnimationOptions) => {
    const a = target.animate(frames, { fill: 'forwards', ...opts })
    anims.push(a)
    if (skipped) a.finish()
    return a
  }
  const wait = (ms: number) =>
    skipped
      ? Promise.resolve()
      : new Promise<void>((r) => {
          const t = setTimeout(r, ms)
          wakers.push(() => (clearTimeout(t), r()))
        })

  const overlay = el('div', 'ceremony')
  const night = el('div', 'ceremony-night')
  const canvas = el('canvas', 'ceremony-sea')
  overlay.append(night, canvas)
  document.body.append(overlay)
  overlay.addEventListener('pointerdown', () => {
    skipped = true
    anims.forEach((a) => a.finish())
    wakers.forEach((w) => w())
    wakers = []
  })
  const sea = startSea(canvas, W, H, surfaceY)

  // The words lift off the card: each one is replaced by a copy floating over the night.
  const box = filing.querySelector<HTMLElement>('.saved-quote') ?? filing
  const sources = [...box.querySelectorAll<HTMLElement>('.quote-text .w')]
  const parts = sources.length ? sources : [...box.querySelectorAll<HTMLElement>('.quote-text')]
  const words = parts.map((w) => {
    const r = w.getBoundingClientRect()
    const cs = getComputedStyle(w)
    const c = el('span', 'ceremony-word')
    c.textContent = w.textContent
    Object.assign(c.style, {
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      fontStyle: cs.fontStyle,
      lineHeight: `${r.height}px`,
      letterSpacing: cs.letterSpacing,
      color: cs.color,
    })
    overlay.append(c)
    return { c, r, color: cs.color }
  })
  box.style.visibility = 'hidden'

  // 1. Night falls, and the words begin to glow.
  play(night, [{ opacity: 0 }, { opacity: 1 }], { duration: 650, easing: 'ease-in-out' })
  play(canvas, [{ opacity: 0 }, { opacity: 1 }], { duration: 900, delay: 250, easing: 'ease-out' })
  words.forEach(({ c, color }, i) =>
    play(
      c,
      [
        { color, textShadow: `0 0 0 rgba(${GOLD}, 0)` },
        { color: `rgb(${CREAM})`, textShadow: `0 0 14px rgba(${GOLD}, 0.6)` },
      ],
      { duration: 700, delay: 150 + Math.min(i * 12, 240), easing: 'ease' },
    ),
  )
  await wait(950)

  // 2. They gather into one drop of gold.
  const spread = Math.min(420, words.length * 22)
  const fly = 640
  words.forEach(({ c, r }, i) => {
    const dx = center.x - (r.left + r.width / 2), dy = center.y - (r.top + r.height / 2)
    play(
      c,
      [
        { transform: 'none', opacity: 1, filter: 'blur(0px)' },
        { opacity: 1, offset: 0.7 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.08)`, opacity: 0, filter: 'blur(1.5px)' },
      ],
      {
        duration: fly,
        delay: words.length > 1 ? (i / (words.length - 1)) * spread : 0,
        easing: 'cubic-bezier(0.55, 0, 0.75, 0.2)',
      },
    )
  })
  const drop = el('div', 'ceremony-drop')
  drop.style.left = `${center.x}px`
  drop.style.top = `${center.y}px`
  const bead = el('div', 'ceremony-bead')
  const halo = el('div', 'ceremony-halo')
  drop.append(halo, bead)
  overlay.append(drop)
  play(
    bead,
    [
      { transform: 'scale(0)' },
      { transform: 'scale(0.6)', offset: 0.6 },
      { transform: 'scale(1.2, 0.86)', offset: 0.88 },
      { transform: 'scale(0.95, 1.05)', offset: 0.95 },
      { transform: 'scale(1)' },
    ],
    { duration: spread + fly + 180, delay: 120, easing: 'ease-out', fill: 'both' },
  )
  play(halo, [{ opacity: 0, transform: 'scale(0.3)' }, { opacity: 1, transform: 'scale(1)' }], {
    duration: spread + fly,
    delay: 200,
    easing: 'ease-out',
    fill: 'both',
  })
  await wait(spread + fly + 240)

  // 3. It shines: a pulse, and a ring of light going out from it.
  haptic('tap')
  const ring = el('div', 'ceremony-ring')
  drop.append(ring)
  // Grown by size rather than scale, so its line stays hairline-thin as it spreads.
  play(
    ring,
    [
      { opacity: 0.9, width: '12px', height: '12px', left: '-6px', top: '-6px' },
      { opacity: 0, width: '220px', height: '220px', left: '-110px', top: '-110px' },
    ],
    { duration: 1000, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
  )
  play(bead, [{ transform: 'scale(1)' }, { transform: 'scale(1.22)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 520, easing: 'ease-in-out', composite: 'replace' })
  play(halo, [{ transform: 'scale(1)' }, { transform: 'scale(1.6)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 520, easing: 'ease-in-out' })
  await wait(620)

  // 4. It lets go and falls, stretching into a teardrop.
  const fall = surfaceY - center.y
  const drip = 160, down = Math.sqrt(fall) * 30
  play(
    drop,
    [
      { transform: 'translateY(0)', easing: 'ease-out' },
      { transform: 'translateY(-6px)', offset: drip / (drip + down), easing: 'cubic-bezier(0.55, 0, 0.95, 0.5)' },
      { transform: `translateY(${fall}px)` },
    ],
    { duration: drip + down },
  )
  play(
    bead,
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.1, 0.9)', offset: drip / (drip + down) },
      { transform: 'scale(0.7, 1.35)', offset: 0.85 },
      { transform: 'scale(0.6, 1.45)' },
    ],
    { duration: drip + down, easing: 'ease-in' },
  )
  play(halo, [{ opacity: 1 }, { opacity: 0.4 }], { duration: drip + down })
  await wait(drip + down)

  // 5. Into the sea: gold rings, spray, and a glow spreading through the water.
  play(drop, [{ opacity: 1 }, { opacity: 0 }], { duration: 90 })
  sea.splash(center.x)
  haptic('success')
  await wait(1300)

  // 6. The night lifts on the library, the new drop already in its sea.
  landed = { id, at: performance.now() }
  navigate()
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  await overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: skipped ? 250 : 700, easing: 'ease-in-out', fill: 'forwards' }).finished
  sea.stop()
  overlay.remove()
  active = false
}

/**
 * The night sea under the drop: a halftone lattice of pale dots rocking on slow swells,
 * with a few stars above. A splash sends gold rings across the surface, lights the dots
 * it passes, and throws gold spray that falls back in.
 */
function startSea(canvas: HTMLCanvasElement, W: number, H: number, surfaceY: number) {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = W * dpr
  canvas.height = H * dpr
  const ctx = canvas.getContext('2d')!
  const GAP = 14
  const stars = Array.from({ length: 46 }, () => ({ x: Math.random() * W, y: Math.random() * surfaceY * 0.8, ph: Math.random() * 6.28, r: 0.4 + Math.random() * 0.8 }))
  const ripples: { x: number; t0: number }[] = []
  const spray: { x: number; y: number; vx: number; vy: number; r: number }[] = []
  let raf = 0, last = 0

  const surface = (x: number, t: number) => surfaceY + 6 * Math.sin(x * 0.022 - t * 0.8) + 2 * Math.sin(x * 0.07 + t * 1.3)

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame)
    const t = now / 1000
    const dt = Math.min(0.05, (now - (last || now)) / 1000)
    last = now
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)

    for (const s of stars) {
      ctx.fillStyle = `rgba(${CREAM}, ${0.25 + 0.25 * Math.sin(t * 1.3 + s.ph)})`
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
      ctx.fill()
    }

    /** How strongly ripples light this point, and how far they push it. */
    const stir = (x: number, y: number) => {
      let light = 0, push = 0
      for (const r of ripples) {
        const age = (now - r.t0) / 1000
        for (const k of [0, 0.32, 0.64]) {
          if (age <= k) continue
          // The same flattened rings that are drawn on the surface: how far is this point from one?
          const R = (age - k) * 150, ry = R / 3.4
          const band = (Math.hypot((x - r.x) / R, (y - surfaceY - 2 - ry) / ry) - 1) * R
          if (Math.abs(band) > 30) continue
          const a = Math.exp(-(age - k) * 1.3) * Math.cos((band / 30) * Math.PI * 0.5)
          light += a
          push += a * 4
        }
      }
      return { light: Math.min(1, light), push }
    }

    // The waterline, then the lattice beneath it.
    for (let x = 0; x <= W; x += GAP / 2.2) {
      const y = surface(x, t)
      const { light } = stir(x, y)
      ctx.fillStyle = light > 0.05 ? `rgba(${GOLD}, ${0.5 + 0.5 * light})` : `rgba(${CREAM}, 0.5)`
      ctx.beginPath()
      ctx.arc(x, y, 1.3 + light, 0, Math.PI * 2)
      ctx.fill()
    }
    const rowGap = GAP * 0.8
    for (let r = 0, y0 = surfaceY + 8; y0 < H + 4; r++, y0 += rowGap) {
      const d = Math.min(1, (y0 - surfaceY) / (H - surfaceY))
      for (let x0 = r % 2 ? 0 : -GAP / 2; x0 < W + GAP; x0 += GAP) {
        const ph = x0 * 0.022 - t * 0.8 + d * 1.4
        const A = 3 * Math.exp(-d * 2.2) + 0.3
        const { light, push } = stir(x0, y0)
        const x = x0 + A * Math.cos(ph) * 0.7, y = y0 + A * Math.sin(ph) - push
        if (y < surface(x, t) + 4) continue
        const swell = Math.sin(x0 * 0.022 - t * 0.8 - d * 2.4) * Math.exp(-d * 1.2)
        const radius = 0.5 + 0.8 * (0.5 + 0.5 * swell) * (1 - d * 0.4) + light * 1.1
        ctx.fillStyle = light > 0.05
          ? `rgba(${GOLD}, ${0.15 + 0.75 * light})`
          : `rgba(${CREAM}, ${Math.max(0.05, 0.08 + 0.26 * Math.pow(1 - d, 1.5) + 0.05 * swell)})`
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // Rings spreading across the surface, flattened by the low angle we see it from.
    for (const r of ripples) {
      const age = (now - r.t0) / 1000
      for (const k of [0, 0.32, 0.64]) {
        const a = age - k
        if (a <= 0) continue
        const rad = a * 150, alpha = 0.7 * Math.exp(-a * 1.5)
        if (alpha < 0.02) continue
        ctx.strokeStyle = `rgba(${GOLD}, ${alpha})`
        ctx.lineWidth = 1.4
        ctx.beginPath()
        // Its far edge stays at the waterline; the near edge comes toward us.
        ctx.ellipse(r.x, surfaceY + 2 + rad / 3.4, rad, rad / 3.4, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    // A glow where it went in.
    for (const r of ripples) {
      const age = (now - r.t0) / 1000
      const a = Math.max(0, 0.55 * Math.exp(-age * 1.4))
      if (a < 0.01) continue
      const g = ctx.createRadialGradient(r.x, surfaceY, 0, r.x, surfaceY, 140)
      g.addColorStop(0, `rgba(${GOLD}, ${a})`)
      g.addColorStop(1, `rgba(${GOLD}, 0)`)
      ctx.fillStyle = g
      ctx.fillRect(r.x - 140, surfaceY - 140, 280, 280)
    }

    ctx.fillStyle = `rgb(${GOLD})`
    for (const s of spray) {
      s.vy += 900 * dt
      s.x += s.vx * dt
      s.y += s.vy * dt
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
      ctx.fill()
    }
    for (let i = spray.length - 1; i >= 0; i--) if (spray[i].vy > 0 && spray[i].y > surface(spray[i].x, t)) spray.splice(i, 1)
  }
  raf = requestAnimationFrame(frame)

  return {
    splash(x: number) {
      ripples.push({ x, t0: performance.now() })
      // A crown of spray, tallest in the middle.
      for (let i = 0; i < 22; i++) {
        const u = i / 21 - 0.5
        const a = -Math.PI / 2 + u * 2.2 + (Math.random() - 0.5) * 0.2
        const v = 160 + 200 * (1 - Math.abs(u) * 1.4) * (0.7 + Math.random() * 0.5)
        spray.push({ x, y: surfaceY - 2, vx: Math.cos(a) * v * 0.8, vy: Math.sin(a) * v * 1.4, r: 0.9 + Math.random() * 1.6 })
      }
    },
    stop() {
      cancelAnimationFrame(raf)
    },
  }
}
