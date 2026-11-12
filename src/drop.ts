import { haptic, reducedMotion } from './motion'

/**
 * Filing a quote, as a short film.
 *
 * Letterbox bars slide in and night falls. The camera pushes in on the quote as its words
 * glow gold, then dollies in as they gather into a single drop, which shines. The drop lets
 * go; the camera tilts down after it, pulling back as it falls a long way to reveal a dark
 * ocean. Impact: the camera shakes, light flashes, gold spray crowns up and rings race
 * across the water. The drop sinks, a glowing mote, into the depths, and the night lifts
 * on the library, where the new drop is already in its sea.
 *
 * The scene is a "world" (DOM for the words and drop, a canvas for sea and sky) seen through
 * one camera, so both move together. Plain DOM on <body>, outside React, so it plays
 * across the change of screen. A tap anywhere skips to the end.
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
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

interface Cam {
  x: number
  y: number
  s: number
}

/** Each word of the quote, where it is on screen and how it's styled. */
interface Word {
  text: string
  r: DOMRect
  style: Partial<CSSStyleDeclaration>
}

const TYPE_PROPS = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'color'] as const

/** The words on screen: the quote's word spans, or, for a text box, its words laid out the same way. */
function wordsIn(box: HTMLElement): Word[] {
  const styleOf = (cs: CSSStyleDeclaration) => Object.fromEntries(TYPE_PROPS.map((p) => [p, cs[p]])) as Partial<CSSStyleDeclaration>
  const spans = [...box.querySelectorAll<HTMLElement>('.quote-text .w')]
  if (spans.length) return spans.map((w) => ({ text: w.textContent ?? '', r: w.getBoundingClientRect(), style: styleOf(getComputedStyle(w)) }))

  const ta = box instanceof HTMLTextAreaElement ? box : box.querySelector('textarea')
  if (ta) {
    // A hidden twin of the text box with each word in a span, to find where each word sits.
    const cs = getComputedStyle(ta), r = ta.getBoundingClientRect()
    const twin = document.createElement('div')
    for (const p of [...TYPE_PROPS, 'lineHeight', 'wordSpacing', 'textAlign', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'boxSizing'] as const)
      twin.style[p] = cs[p]
    Object.assign(twin.style, {
      position: 'fixed', left: `${r.left}px`, top: `${r.top - ta.scrollTop}px`, width: `${r.width - 2}px`, // a text box keeps room for the caret at each line's end
      borderStyle: 'solid', borderColor: 'transparent', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', visibility: 'hidden',
    })
    const spans: HTMLSpanElement[] = []
    for (const tok of ta.value.split(/(\s+)/)) {
      if (!tok) continue
      if (/^\s+$/.test(tok)) twin.append(tok)
      else {
        const s = document.createElement('span')
        s.textContent = tok
        twin.append(s)
        spans.push(s)
      }
    }
    document.body.append(twin)
    const style = styleOf(cs)
    const words = spans
      .map((s) => ({ text: s.textContent ?? '', r: s.getBoundingClientRect(), style }))
      .filter((w) => w.r.bottom > r.top && w.r.top < r.bottom) // only what's showing in the box
    twin.remove()
    return words
  }

  const q = box.querySelector<HTMLElement>('.quote-text') ?? box
  return [{ text: q.textContent ?? '', r: q.getBoundingClientRect(), style: styleOf(getComputedStyle(q)) }]
}

/**
 * Play the ceremony for the quote shown in `source` (a filing card, or a text box),
 * then call `navigate` underneath it and lift the night.
 */
export async function fileIntoSea(source: HTMLElement, id: string, navigate: () => void): Promise<void> {
  if (reducedMotion() || active) return navigate()
  active = true
  landed = null
  const W = innerWidth, H = innerHeight
  const center = { x: W / 2, y: H * 0.38 } // where the drop forms, in world coordinates
  const surfaceY = Math.round(H * 1.3) // the sea is far below: the camera has to travel to it

  // ── A tap skips to the end. ──
  let skipped = false
  let wakers: (() => void)[] = []
  const wait = (ms: number) =>
    skipped
      ? Promise.resolve()
      : new Promise<void>((r) => {
          const t = setTimeout(r, ms)
          wakers.push(() => (clearTimeout(t), r()))
        })

  // ── The stage. ──
  const overlay = el('div', 'ceremony')
  const night = el('div', 'ceremony-night')
  const canvas = el('canvas', 'ceremony-sea')
  const world = el('div', 'ceremony-world')
  const vignette = el('div', 'ceremony-vignette')
  const flash = el('div', 'ceremony-flash')
  const barTop = el('div', 'ceremony-bar top')
  const barBottom = el('div', 'ceremony-bar bottom')
  overlay.append(night, canvas, world, vignette, flash, barTop, barBottom)
  document.body.append(overlay)
  overlay.addEventListener('pointerdown', () => {
    skipped = true
    wakers.forEach((w) => w())
    wakers = []
  })

  // ── The camera: one transform for the DOM world and the canvas alike. ──
  const cam: Cam = { x: W / 2, y: H / 2, s: 1 }
  let tween: { from: Cam; to: Cam; t0: number; dur: number; ease: (t: number) => number } | null = null
  let follow: ((now: number) => Cam) | null = null
  let shake = { t0: 0, amp: 0 }
  const camTo = (to: Partial<Cam>, dur: number, ease = easeInOut) => {
    follow = null
    tween = { from: { ...cam }, to: { ...cam, ...to }, t0: performance.now(), dur, ease }
  }
  const view = (now: number): Cam => {
    if (follow) Object.assign(cam, follow(now))
    else if (tween) {
      const p = Math.min(1, (now - tween.t0) / tween.dur), e = tween.ease(p)
      cam.x = lerp(tween.from.x, tween.to.x, e)
      cam.y = lerp(tween.from.y, tween.to.y, e)
      cam.s = lerp(tween.from.s, tween.to.s, e)
      if (p >= 1) tween = null
    }
    const age = (now - shake.t0) / 1000, a = shake.amp * Math.exp(-age * 9)
    return a > 0.1 ? { x: cam.x + a * Math.sin(age * 83), y: cam.y + a * Math.cos(age * 71), s: cam.s } : cam
  }

  // ── The drop's fall, driven here so the camera can track it. ──
  let dropY = center.y
  let sinking: { t0: number } | null = null
  const sea = startSea(canvas, W, H, surfaceY, () => sinking)

  const drop = el('div', 'ceremony-drop')
  const halo = el('div', 'ceremony-halo')
  const bead = el('div', 'ceremony-bead')
  const ring = el('div', 'ceremony-ring')
  drop.append(halo, ring, bead)
  // Nothing shows until the words gather.
  bead.style.transform = 'scale(0)'
  halo.style.opacity = '0'
  ring.style.opacity = '0'

  let raf = 0
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame)
    const c = view(now)
    world.style.transform = `translate(${W / 2}px, ${H / 2}px) scale(${c.s}) translate(${-c.x}px, ${-c.y}px)`
    drop.style.transform = `translate(${center.x}px, ${dropY}px)`
    sea.draw(now, c)
  }
  raf = requestAnimationFrame(frame)

  // ── The words lift off the page into the world. ──
  const box = source.querySelector<HTMLElement>('.saved-quote') ?? source
  const words = wordsIn(box).map((w) => {
    const c = el('span', 'ceremony-word')
    c.textContent = w.text
    Object.assign(c.style, w.style, { left: `${w.r.left}px`, top: `${w.r.top}px`, lineHeight: `${w.r.height}px` })
    world.append(c)
    return { c, r: w.r, color: w.style.color ?? '' }
  })
  box.style.visibility = 'hidden'
  world.append(drop)

  const fade = (e: Element, from: number, to: number, duration: number, delay = 0) =>
    e.animate([{ opacity: from }, { opacity: to }], { duration, delay, fill: 'both', easing: 'ease-in-out' })

  if (!skipped) {
    // 1. Bars slide in, night falls, the words glow. The camera begins a slow push in.
    barTop.animate([{ transform: 'translateY(-100%)' }, { transform: 'none' }], { duration: 900, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', fill: 'both' })
    barBottom.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 900, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', fill: 'both' })
    fade(night, 0, 1, 700)
    fade(vignette, 0, 1, 1200, 200)
    fade(canvas, 0, 1, 1000, 300)
    words.forEach(({ c, color }, i) =>
      c.animate(
        [
          { color, textShadow: `0 0 0 rgba(${GOLD}, 0)` },
          { color: `rgb(${CREAM})`, textShadow: `0 0 16px rgba(${GOLD}, 0.7)` },
        ],
        { duration: 700, delay: 150 + Math.min(i * 14, 300), easing: 'ease', fill: 'both' },
      ),
    )
    const quoteMid = words.length ? (Math.min(...words.map((w) => w.r.top)) + Math.max(...words.map((w) => w.r.bottom))) / 2 : center.y
    camTo({ y: lerp(H / 2, quoteMid, 0.35), s: 1.07 }, 1400, easeInOut)
    await wait(1000)
  }

  if (!skipped) {
    // 2. The words gather into one drop of gold; the camera dollies in on it.
    const spread = Math.min(460, words.length * 24)
    const fly = 680
    words.forEach(({ c, r }, i) => {
      const dx = center.x - (r.left + r.width / 2), dy = center.y - (r.top + r.height / 2)
      c.animate(
        [
          { transform: 'none', opacity: 1, filter: 'blur(0px)' },
          { opacity: 1, offset: 0.72 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.06)`, opacity: 0, filter: 'blur(1.5px)' },
        ],
        { duration: fly, delay: words.length > 1 ? (i / (words.length - 1)) * spread : 0, easing: 'cubic-bezier(0.55, 0, 0.75, 0.2)', fill: 'forwards' },
      )
    })
    bead.animate(
      [
        { transform: 'scale(0)' },
        { transform: 'scale(0.6)', offset: 0.6 },
        { transform: 'scale(1.22, 0.85)', offset: 0.88 },
        { transform: 'scale(0.95, 1.05)', offset: 0.95 },
        { transform: 'scale(1)' },
      ],
      { duration: spread + fly + 200, delay: 120, easing: 'ease-out', fill: 'both' },
    )
    halo.animate([{ opacity: 0, transform: 'scale(0.3)' }, { opacity: 1, transform: 'scale(1)' }], { duration: spread + fly, delay: 200, easing: 'ease-out', fill: 'both' })
    camTo({ x: center.x, y: center.y, s: 1.45 }, spread + fly + 300, easeInOut)
    await wait(spread + fly + 260)
  }

  if (!skipped) {
    // 3. It shines: a pulse, a ring of light, and a breath of stillness.
    haptic('tap')
    ring.animate(
      [
        { opacity: 0.9, width: '12px', height: '12px', left: '-6px', top: '-6px' },
        { opacity: 0, width: '240px', height: '240px', left: '-120px', top: '-120px' },
      ],
      { duration: 1100, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)', fill: 'both' },
    )
    bead.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 560, easing: 'ease-in-out' })
    halo.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.7)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 560, easing: 'ease-in-out' })
    camTo({ s: 1.52 }, 700, easeOut)
    await wait(700)
  }

  if (!skipped) {
    // 4. It lets go. The camera tilts down after it, pulling back to show the ocean below.
    const drip = 200, fall = 950
    const t0 = performance.now()
    const startCam = { ...cam }
    const endCam = { x: W / 2, y: surfaceY - H * 0.12, s: 0.92 }
    bead.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.12, 0.88)', offset: drip / (drip + fall) },
        { transform: 'scale(0.62, 1.5)', offset: 0.8 },
        { transform: 'scale(0.55, 1.7)' },
      ],
      { duration: drip + fall, easing: 'ease-in', fill: 'forwards' },
    )
    halo.animate([{ opacity: 1 }, { opacity: 0.35 }], { duration: drip + fall, fill: 'forwards' })
    follow = (now) => {
      const t = now - t0
      if (t < drip) {
        // Gathering itself: a small rise before the drop.
        dropY = center.y - 6 * Math.sin((t / drip) * Math.PI * 0.5)
        return startCam
      }
      const p = Math.min(1, (t - drip) / fall)
      const q = p * p // gravity; the camera keeps pace, so the drop stays near the middle
      dropY = lerp(center.y - 6, surfaceY, q)
      return { x: lerp(startCam.x, endCam.x, q), y: lerp(startCam.y, endCam.y, q), s: lerp(startCam.s, endCam.s, easeInOut(p)) }
    }
    await wait(drip + fall)
  }

  if (!skipped) {
    // 5. Impact.
    follow = null
    tween = null
    drop.style.opacity = '0'
    sea.splash(center.x)
    shake = { t0: performance.now(), amp: 9 }
    flash.animate([{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 0 }], { duration: 700, easing: 'ease-out' })
    haptic('success')
    await wait(220)
    // 6. The drop sinks, glowing, into the depths, as the camera rises and pulls back on the whole sea.
    sinking = { t0: performance.now() }
    camTo({ y: surfaceY - H * 0.08, s: 0.8 }, 2200, easeOut)
    await wait(1700)
  }

  // ── The night lifts on the library. ──
  landed = { id, at: performance.now() }
  navigate()
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  const out = skipped ? 250 : 750
  barTop.animate([{ transform: 'none' }, { transform: 'translateY(-100%)' }], { duration: out, easing: 'ease-in', fill: 'forwards' })
  barBottom.animate([{ transform: 'none' }, { transform: 'translateY(100%)' }], { duration: out, easing: 'ease-in', fill: 'forwards' })
  await overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: out, easing: 'ease-in-out', fill: 'forwards' }).finished
  cancelAnimationFrame(raf)
  overlay.remove()
  active = false
}

/**
 * The night: stars far off (they barely move with the camera), and the sea, a halftone
 * lattice of pale dots on slow swells. A splash sends gold rings racing across the water,
 * lights the dots they pass and throws gold spray; then the drop sinks as a glowing mote.
 */
function startSea(canvas: HTMLCanvasElement, W: number, H: number, surfaceY: number, sinkingNow: () => { t0: number } | null) {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = W * dpr
  canvas.height = H * dpr
  const ctx = canvas.getContext('2d')!
  const GAP = 14
  let seed = 7
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const stars = Array.from({ length: 90 }, () => ({ x: rand() * W * 1.4 - W * 0.2, y: rand() * H * 1.6 - H * 0.5, ph: rand() * 6.28, r: 0.35 + rand() * 0.9 }))
  const ripples: { x: number; t0: number }[] = []
  const spray: { x: number; y: number; vx: number; vy: number; r: number }[] = []
  let last = 0
  const RINGS = [0, 0.28, 0.56, 0.9]
  const SPEED = 230

  const surface = (x: number, t: number) => surfaceY + 7 * Math.sin(x * 0.02 - t * 0.8) + 2.5 * Math.sin(x * 0.065 + t * 1.3)

  /** How strongly the rings light a point, and how far they lift it. */
  const stir = (x: number, y: number, now: number) => {
    let light = 0, push = 0
    for (const r of ripples) {
      const age = (now - r.t0) / 1000
      for (const k of RINGS) {
        if (age <= k) continue
        const R = (age - k) * SPEED, ry = R / 3.4
        const band = (Math.hypot((x - r.x) / R, (y - surfaceY - 2 - ry) / ry) - 1) * R
        if (Math.abs(band) > 34) continue
        const a = Math.exp(-(age - k) * 0.9) * Math.cos((band / 34) * Math.PI * 0.5)
        light += a
        push += a * 5
      }
    }
    return { light: Math.min(1, light), push }
  }

  const draw = (now: number, cam: Cam) => {
    const t = now / 1000
    const dt = Math.min(0.05, (now - (last || now)) / 1000)
    last = now
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    const horizon = H / 2 + (surfaceY - cam.y) * cam.s

    // Stars, far away: a little parallax, and none below the horizon.
    for (const s of stars) {
      const sx = s.x - (cam.x - W / 2) * 0.12, sy = s.y - (cam.y - H / 2) * 0.12
      if (sy > horizon - 12 || sy < -4 || sx < -4 || sx > W + 4) continue
      ctx.fillStyle = `rgba(${CREAM}, ${0.22 + 0.25 * Math.sin(t * 1.3 + s.ph)})`
      ctx.beginPath()
      ctx.arc(sx, sy, s.r, 0, Math.PI * 2)
      ctx.fill()
    }

    // Everything else is in the world, seen through the camera.
    ctx.setTransform(dpr * cam.s, 0, 0, dpr * cam.s, dpr * (W / 2 - cam.x * cam.s), dpr * (H / 2 - cam.y * cam.s))
    const x0 = cam.x - W / 2 / cam.s - GAP, x1 = cam.x + W / 2 / cam.s + GAP
    const yBottom = cam.y + H / 2 / cam.s + GAP
    if (surfaceY - 20 < yBottom) {
      const step = GAP / 2.2
      for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
        const y = surface(x, t)
        const { light } = stir(x, y, now)
        ctx.fillStyle = light > 0.05 ? `rgba(${GOLD}, ${0.5 + 0.5 * light})` : `rgba(${CREAM}, 0.55)`
        ctx.beginPath()
        ctx.arc(x, y, 1.4 + light * 1.2, 0, Math.PI * 2)
        ctx.fill()
      }
      const rowGap = GAP * 0.8
      for (let r = 0, y0 = surfaceY + 8; y0 < yBottom; r++, y0 += rowGap) {
        const d = Math.min(1, (y0 - surfaceY) / (H * 0.7))
        const start = Math.floor(x0 / GAP) * GAP + (r % 2 ? 0 : -GAP / 2)
        for (let xg = start; xg < x1; xg += GAP) {
          const ph = xg * 0.02 - t * 0.8 + d * 1.4
          const A = 3.2 * Math.exp(-d * 2.2) + 0.3
          const { light, push } = stir(xg, y0, now)
          const x = xg + A * Math.cos(ph) * 0.7, y = y0 + A * Math.sin(ph) - push
          if (y < surface(x, t) + 4) continue
          const swell = Math.sin(xg * 0.02 - t * 0.8 - d * 2.4) * Math.exp(-d * 1.2)
          const radius = 0.55 + 0.85 * (0.5 + 0.5 * swell) * (1 - d * 0.4) + light * 1.3
          ctx.fillStyle =
            light > 0.05
              ? `rgba(${GOLD}, ${0.15 + 0.8 * light})`
              : `rgba(${CREAM}, ${Math.max(0.05, 0.09 + 0.28 * Math.pow(1 - d, 1.5) + 0.05 * swell)})`
          ctx.beginPath()
          ctx.arc(x, y, radius, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    // Rings racing out across the surface, flattened by the low angle.
    for (const r of ripples) {
      const age = (now - r.t0) / 1000
      for (const k of RINGS) {
        const a = age - k
        if (a <= 0) continue
        const rad = a * SPEED, alpha = 0.75 * Math.exp(-a * 1.1)
        if (alpha < 0.02) continue
        ctx.strokeStyle = `rgba(${GOLD}, ${alpha})`
        ctx.lineWidth = 1.5 / cam.s
        ctx.beginPath()
        // Its far edge stays at the waterline; the near edge comes toward us.
        ctx.ellipse(r.x, surfaceY + 2 + rad / 3.4, rad, rad / 3.4, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      // And a glow where it went in.
      const g = Math.max(0, 0.6 * Math.exp(-age * 1.1))
      if (g > 0.01) {
        const grad = ctx.createRadialGradient(r.x, surfaceY, 0, r.x, surfaceY, 200)
        grad.addColorStop(0, `rgba(${GOLD}, ${g})`)
        grad.addColorStop(1, `rgba(${GOLD}, 0)`)
        ctx.fillStyle = grad
        ctx.fillRect(r.x - 200, surfaceY - 200, 400, 400)
      }
    }

    // The drop, sunk: a glowing mote drifting down into the dark.
    const sinking = sinkingNow()
    if (sinking) {
      const p = Math.min(1, (now - sinking.t0) / 2400)
      const y = surfaceY + 14 + H * 0.34 * easeOut(p)
      const x = W / 2 + 6 * Math.sin(p * 5)
      const a = 1 - p * 0.75
      const grad = ctx.createRadialGradient(x, y, 0, x, y, 26)
      grad.addColorStop(0, `rgba(${GOLD}, ${0.55 * a})`)
      grad.addColorStop(1, `rgba(${GOLD}, 0)`)
      ctx.fillStyle = grad
      ctx.fillRect(x - 26, y - 26, 52, 52)
      ctx.fillStyle = `rgba(255, 240, 205, ${a})`
      ctx.beginPath()
      ctx.arc(x, y, 2.6, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.fillStyle = `rgb(${GOLD})`
    for (const s of spray) {
      s.vy += 1100 * dt
      s.x += s.vx * dt
      s.y += s.vy * dt
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
      ctx.fill()
    }
    for (let i = spray.length - 1; i >= 0; i--) if (spray[i].vy > 0 && spray[i].y > surface(spray[i].x, t)) spray.splice(i, 1)
  }

  return {
    draw,
    splash(x: number) {
      ripples.push({ x, t0: performance.now() })
      // A crown of spray, tallest in the middle, and a few fine droplets flung wide.
      for (let i = 0; i < 34; i++) {
        const u = i / 33 - 0.5
        const a = -Math.PI / 2 + u * 2.3 + (rand() - 0.5) * 0.2
        const v = 220 + 300 * (1 - Math.abs(u) * 1.4) * (0.7 + rand() * 0.5)
        spray.push({ x, y: surfaceY - 2, vx: Math.cos(a) * v * 0.75, vy: Math.sin(a) * v * 1.35, r: 1 + rand() * 2 })
      }
      for (let i = 0; i < 14; i++) {
        const a = -Math.PI / 2 + (rand() - 0.5) * 2.8
        const v = 380 + rand() * 260
        spray.push({ x, y: surfaceY - 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 0.6 + rand() * 0.6 })
      }
    },
  }
}
