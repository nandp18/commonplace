/**
 * Saving a quote: the chosen words lift off the photo in gold, hover while the save finishes,
 * then burst into motes that fly down into the quote card. Pure canvas over everything;
 * nothing to clean up if it's interrupted beyond removing the canvas.
 */

export interface WordBox {
  /** Where the word is on screen now (CSS px). */
  screen: { x: number; y: number; w: number; h: number }
  /** The same word in the photo's own pixels. */
  src: { x: number; y: number; w: number; h: number }
}

interface Sprite {
  canvas: HTMLCanvasElement
  box: WordBox['screen']
  delay: number
  /** Ink positions inside the word (0–1), where motes will burst from. */
  ink: { x: number; y: number }[]
}

interface Mote {
  x0: number
  y0: number
  cx: number
  cy: number
  /** Where in the card it lands (0–1 across and down), resolved each frame as the sheet moves. */
  tx: number
  ty: number
  t0: number
  span: number
  size: number
}

const GOLD = [240, 200, 105] as const
const RISE = 520

export interface LiftOff {
  /** The save is done: burst into motes and fly to `target`. Resolves when the last one lands. */
  burst: (target: () => DOMRect | null) => Promise<void>
  /** Stop and remove everything (say, the save failed). */
  cancel: () => void
}

export function liftOff(img: HTMLImageElement, words: WordBox[]): LiftOff {
  const W = window.innerWidth, H = window.innerHeight
  const dpr = Math.min(window.devicePixelRatio || 1, 3)
  const canvas = document.createElement('canvas')
  canvas.className = 'lift-off'
  canvas.width = Math.round(W * dpr)
  canvas.height = Math.round(H * dpr)
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const step = Math.min(14, 360 / Math.max(1, words.length))
  const sprites = words.map((w, i) => goldWord(img, w, i * step, dpr))
  const motes: Mote[] = []
  const t0 = performance.now()
  let burstAt = 0
  let target: () => DOMRect | null = () => null
  let landed: () => void = () => {}
  let raf = 0

  const frame = (now: number) => {
    const t = now - t0
    ctx.clearRect(0, 0, W, H)

    for (const s of sprites) {
      const local = t - s.delay
      if (local < 0) continue
      const rise = easeOut(Math.min(1, local / RISE))
      // Hover with a gentle bob until the save is done.
      const bob = Math.sin((local / 1000) * 3 + s.delay) * 2 * rise
      let alpha = 1
      if (burstAt) {
        const gone = (now - burstAt - s.delay * 0.6) / 220
        if (gone >= 1) continue
        alpha = 1 - Math.max(0, gone)
      }
      const scale = 1 + 0.08 * rise
      const { x, y, w, h } = s.box
      const cx = x + w / 2, cy = y + h / 2 - 26 * rise + bob
      ctx.globalAlpha = alpha * Math.min(1, local / 120)
      // A soft glow behind each word.
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.75)
      g.addColorStop(0, `rgba(${GOLD}, ${0.35 * rise})`)
      g.addColorStop(1, `rgba(${GOLD}, 0)`)
      ctx.fillStyle = g
      ctx.fillRect(cx - w, cy - h * 2, w * 2, h * 4)
      ctx.drawImage(s.canvas, cx - (w * scale) / 2, cy - (h * scale) / 2, w * scale, h * scale)
    }

    if (burstAt) {
      const r = target()
      const dest = r ?? new DOMRect(W * 0.1, H * 0.45, W * 0.8, 60)
      ctx.globalCompositeOperation = 'lighter'
      for (let m = motes.length - 1; m >= 0; m--) {
        const o = motes[m]
        const q = (now - o.t0) / o.span
        if (q < 0) continue
        if (q >= 1) {
          motes.splice(m, 1)
          continue
        }
        const e = easeInOut(q)
        const tx = dest.left + o.tx * dest.width, ty = dest.top + o.ty * dest.height
        // A curve through a control point, so the motes swoop rather than slide.
        const x = (1 - e) ** 2 * o.x0 + 2 * (1 - e) * e * o.cx + e * e * tx
        const y = (1 - e) ** 2 * o.y0 + 2 * (1 - e) * e * o.cy + e * e * ty
        ctx.globalAlpha = Math.min(1, q * 6) * (1 - q * q)
        ctx.fillStyle = q > 0.85 ? '#fff6dc' : `rgb(${GOLD})`
        ctx.beginPath()
        ctx.arc(x, y, o.size * (1 - q * 0.5), 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'
      if (!motes.length && now - burstAt > 400) {
        canvas.remove()
        landed()
        return
      }
    }
    ctx.globalAlpha = 1
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)

  return {
    burst(to) {
      target = to
      burstAt = performance.now()
      const t = burstAt - t0
      for (const s of sprites) {
        // Each word bursts from where it's hovering now.
        const rise = easeOut(Math.min(1, Math.max(0, t - s.delay) / RISE))
        const { x, y, w, h } = s.box
        const top = y - 26 * rise
        const count = Math.max(4, Math.min(14, Math.round(w / 6)))
        for (let j = 0; j < count; j++) {
          const p = s.ink[Math.floor(Math.random() * s.ink.length)] ?? { x: Math.random(), y: 0.5 }
          const x0 = x + p.x * w, y0 = top + p.y * h
          motes.push({
            x0,
            y0,
            // Up and out first, then down into the card.
            cx: x0 + (Math.random() - 0.5) * 120,
            cy: y0 - 40 - Math.random() * 80,
            tx: 0.05 + Math.random() * 0.9,
            ty: 0.2 + Math.random() * 0.6,
            t0: burstAt + s.delay * 0.6 + Math.random() * 120,
            span: 650 + Math.random() * 350,
            size: 0.9 + Math.random() * 1.3,
          })
        }
      }
      return new Promise<void>((resolve) => (landed = resolve))
    },
    cancel() {
      cancelAnimationFrame(raf)
      canvas.remove()
      landed()
    },
  }
}

/** The word's ink, recoloured gold on transparent, at screen resolution. */
function goldWord(img: HTMLImageElement, box: WordBox, delay: number, dpr: number): Sprite {
  const { screen, src } = box
  const cw = Math.max(1, Math.round(screen.w * dpr)), ch = Math.max(1, Math.round(screen.h * dpr))
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const g = canvas.getContext('2d', { willReadFrequently: true })!
  g.drawImage(img, src.x, src.y, src.w, src.h, 0, 0, cw, ch)
  const data = g.getImageData(0, 0, cw, ch)
  const px = data.data
  let paper = 0, inkLum = 255
  for (let i = 0; i < px.length; i += 4) {
    const l = 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]
    if (l > paper) paper = l
    if (l < inkLum) inkLum = l
  }
  const range = Math.max(30, paper - inkLum)
  const ink: { x: number; y: number }[] = []
  for (let i = 0, n = 0; i < px.length; i += 4, n++) {
    const l = 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]
    const a = Math.max(0, Math.min(1, ((paper - l) / range - 0.25) * 1.8))
    px[i] = 255
    px[i + 1] = 200 + 40 * a
    px[i + 2] = 100 + 90 * a
    px[i + 3] = Math.round(255 * a)
    if (a > 0.6 && n % 7 === 0) ink.push({ x: (n % cw) / cw, y: Math.floor(n / cw) / ch })
  }
  g.putImageData(data, 0, 0)
  return { canvas, box: screen, delay, ink }
}

const easeOut = (p: number) => 1 - (1 - p) ** 3
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2)
