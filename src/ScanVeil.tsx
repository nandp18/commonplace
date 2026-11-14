import { useEffect, useRef } from 'react'
import { haptic, reducedMotion } from './motion'
import type { OcrWord } from './selection'

const GOLD = '240, 200, 105'

interface Mote {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  /** Seconds it lasts. */
  span: number
  size: number
  /** Flying in to a word (the finale) rather than drifting up from the beam. */
  to?: { x: number; y: number; delay: number }
}

/**
 * The page being read, drawn in the app's dot matrix, as if by magic.
 * A beam of light sweeps the photo. Wherever it finds ink the dots catch gold and stay lit,
 * twinkling, and sparks of gold dust rise off it. When the words arrive, motes fly in and
 * gather into each word, which flares as it forms, in a wave down the page.
 */
export function ScanVeil({ img, run, reading, words }: { img: HTMLImageElement | null; run: number; reading: boolean; words: OcrWord[] | null }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const bloom = useRef<HTMLCanvasElement>(null)
  const paperGrid = useRef<HTMLDivElement>(null)
  const live = useRef({ reading, words })
  live.current = { reading, words }

  useEffect(() => {
    const c = canvas.current, b = bloom.current
    if (!c || !b || !img || !img.clientWidth || !run || reducedMotion()) return
    const W = img.clientWidth, H = img.clientHeight
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    c.width = Math.round(W * dpr)
    c.height = Math.round(H * dpr)
    c.style.width = b.style.width = `${W}px`
    c.style.height = b.style.height = `${H}px`
    // The glow: a small copy of each frame, blurred by CSS. Cheap, and it makes the gold bloom.
    b.width = Math.round(W / 3)
    b.height = Math.round(H / 3)
    const ctx = c.getContext('2d')!
    const bctx = b.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const { cols, rows, gap, ink } = inkGrid(img, W, H)
    const n = cols * rows
    const seen = new Float32Array(n) // when the beam found this dot (ms since start), 0 = not yet
    const phase = new Float32Array(n)
    for (let i = 0; i < n; i++) phase[i] = Math.random() * Math.PI * 2

    // The paper's faint dot grid never changes, and shouldn't glow: it's a CSS pattern underneath.
    const grid = paperGrid.current!
    grid.style.setProperty('--gap', `${gap}px`)
    grid.classList.add('on')

    const motes: Mote[] = []
    const t0 = performance.now()
    let last = t0
    let lastBeam = -Infinity
    let revealAt = 0
    let raf = 0
    let state: 'scan' | 'gather' = 'scan'
    const PERIOD = 2800

    /** Start of each word's moment in the finale: top to bottom, with a little left to right. */
    const wordDelay = (w: OcrWord) => (w.y0 / img.naturalHeight) * 0.75 + (w.x0 / img.naturalWidth) * 0.15

    const startGathering = (words: OcrWord[]) => {
      haptic('tap')
      const kx = img.naturalWidth / W
      // Motes fly in from all around and gather into each word.
      for (const w of words) {
        const per = Math.max(2, Math.min(6, Math.round((w.x1 - w.x0) / kx / 12)))
        for (let j = 0; j < per; j++) {
          const tx = (w.x0 + Math.random() * (w.x1 - w.x0)) / kx
          const ty = (w.y0 + (w.y1 - w.y0) * (0.3 + Math.random() * 0.4)) / kx
          const angle = Math.random() * Math.PI * 2, dist = 18 + Math.random() * 46
          motes.push({
            x: tx + Math.cos(angle) * dist,
            y: ty + Math.sin(angle) * dist,
            vx: 0,
            vy: -6 - Math.random() * 10,
            life: 0,
            span: 0.45 + Math.random() * 0.25,
            size: 0.8 + Math.random() * 0.9,
            to: { x: tx, y: ty, delay: wordDelay(w) + Math.random() * 0.08 },
          })
        }
      }
    }

    const spark = (x: number, y: number): Mote => ({
      x: x + (Math.random() - 0.5) * gap,
      y,
      vx: (Math.random() - 0.5) * 14,
      vy: -(14 + Math.random() * 26),
      life: 0,
      span: 0.9 + Math.random() * 0.9,
      size: 0.7 + Math.random() * 1.1,
    })

    const frame = (now: number) => {
      const t = now - t0 + 1 // never 0, so it can mark a dot as seen
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const { reading, words } = live.current

      if (state === 'scan' && !reading && words) {
        state = 'gather'
        revealAt = now
        startGathering(words)
      }
      if (state === 'scan' && !reading && !words) {
        // Reading failed or was cancelled: let it all go.
        ctx.clearRect(0, 0, W, H)
        bctx.clearRect(0, 0, b.width, b.height)
        grid.classList.remove('on')
        return
      }

      ctx.clearRect(0, 0, W, H)
      const since = now - revealAt
      // The dots give way as the words take shape.
      const fade = state === 'gather' ? Math.max(0, 1 - since / 700) : 1
      const p = (t % PERIOD) / PERIOD
      const beamY = (easeInOut(p) * 1.15 - 0.075) * H

      // Everything swept since the last frame counts as found, even when frames are dropped.
      const from = beamY < lastBeam ? -Infinity : lastBeam
      if (state === 'scan') lastBeam = beamY

      if (fade > 0) {
        if (state === 'gather') grid.classList.remove('on')
        const band = H * 0.07
        for (let r = 0; r < rows; r++) {
          const y = (r + 0.5) * gap
          const d = (y - beamY) / band
          const glow = state === 'scan' ? Math.exp(-d * d) : 0
          const swept = state === 'scan' && y > from && y <= beamY
          for (let col = 0; col < cols; col++) {
            const i = r * cols + col
            const k = ink[i]
            const x = (col + 0.5) * gap
            if (swept && k > 0.25 && !seen[i]) {
              seen[i] = t
              // Now and then, a spark of gold dust lifts off what was just found.
              if (Math.random() < 0.05 && motes.length < 260) motes.push(spark(x, y))
            }
            if (seen[i]) {
              // Found ink: flashes bright as it's found, then settles into a slow, travelling twinkle.
              const age = (t - seen[i]) / 1000
              const flash = Math.max(0, 1 - age * 2.5)
              const twinkle = 0.5 + 0.5 * Math.sin(t * 0.0025 + x * 0.045 - y * 0.03 + phase[i])
              ctx.globalAlpha = Math.min(1, 0.35 + 0.4 * twinkle + flash) * fade
              ctx.fillStyle = flash > 0.2 ? '#fff6dc' : `rgb(${GOLD})`
              ctx.beginPath()
              ctx.arc(x, y, (0.55 + 0.45 * k + flash * 0.9) * (0.85 + 0.3 * twinkle), 0, Math.PI * 2)
              ctx.fill()
            } else if (glow > 0.08) {
              // Paper the beam is passing over brightens with it.
              ctx.globalAlpha = 0.5 * glow * fade
              ctx.fillStyle = '#fff'
              ctx.fillRect(x - 0.7, y - 0.7, 1.4, 1.4)
            }
          }
        }

        if (state === 'scan') {
          // The beam: a hairline of light with a soft wake.
          const wake = ctx.createLinearGradient(0, beamY - H * 0.14, 0, beamY)
          wake.addColorStop(0, `rgba(${GOLD}, 0)`)
          wake.addColorStop(1, `rgba(${GOLD}, 0.14)`)
          ctx.globalAlpha = 1
          ctx.fillStyle = wake
          ctx.fillRect(0, beamY - H * 0.14, W, H * 0.14)
          const line = ctx.createLinearGradient(0, 0, W, 0)
          line.addColorStop(0, 'rgba(255, 240, 200, 0)')
          line.addColorStop(0.5, 'rgba(255, 244, 214, 1)')
          line.addColorStop(1, 'rgba(255, 240, 200, 0)')
          ctx.fillStyle = line
          ctx.fillRect(0, beamY - 0.8, W, 1.6)
        }
      }

      // Gold dust rising off the beam, and motes gathering into words.
      ctx.globalCompositeOperation = 'lighter'
      for (let m = motes.length - 1; m >= 0; m--) {
        const o = motes[m]
        if (o.to) {
          const local = since / 1000 - o.to.delay
          if (local < 0) continue
          const q = Math.min(1, local / o.span)
          const e = 1 - (1 - q) ** 3
          const x = o.x + (o.to.x - o.x) * e
          const y = o.y + (o.to.y - o.y) * e + Math.sin(q * Math.PI) * o.vy // a little arc on the way in
          ctx.globalAlpha = Math.sin(q * Math.PI) * 0.9
          ctx.fillStyle = `rgb(${GOLD})`
          ctx.beginPath()
          ctx.arc(x, y, o.size * (1 - q * 0.5), 0, Math.PI * 2)
          ctx.fill()
          if (q >= 1) motes.splice(m, 1)
          continue
        }
        o.life += dt
        if (o.life >= o.span) {
          motes.splice(m, 1)
          continue
        }
        o.vx += Math.sin((o.life + o.x) * 3) * 6 * dt // sway as it rises
        o.x += o.vx * dt
        o.y += o.vy * dt
        const q = o.life / o.span
        ctx.globalAlpha = Math.sin(q * Math.PI) * 0.85
        ctx.fillStyle = q < 0.15 ? '#fff6dc' : `rgb(${GOLD})`
        ctx.beginPath()
        ctx.arc(o.x, o.y, o.size * (1 - q * 0.6), 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'

      // The finale: each word flares as its motes arrive, in a wave down the page.
      let busy = motes.length > 0 || fade > 0
      if (state === 'gather' && words) {
        const kx = img.naturalWidth / W
        ctx.fillStyle = `rgb(${GOLD})`
        for (const w of words) {
          const a = (since / 1000 - wordDelay(w) - 0.45) / 0.6
          if (a < 0) {
            busy = true
            continue
          }
          if (a >= 1) continue
          busy = true
          ctx.globalAlpha = 0.6 * Math.sin(a * Math.PI)
          const grow = (1 - a) * 2.5
          ctx.beginPath()
          ctx.roundRect(w.x0 / kx - grow, w.y0 / kx - grow, (w.x1 - w.x0) / kx + 2 * grow, (w.y1 - w.y0) / kx + 2 * grow, 2)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1

      bctx.clearRect(0, 0, b.width, b.height)
      bctx.drawImage(c, 0, 0, b.width, b.height)

      if (state === 'gather' && !busy) {
        ctx.clearRect(0, 0, W, H)
        bctx.clearRect(0, 0, b.width, b.height)
        return
      }
      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      grid.classList.remove('on')
    }
    // Each read (say, after switching language) starts the scan over.
  }, [img, run])

  return (
    <>
      <div ref={paperGrid} className="scan-paper" aria-hidden />
      <canvas ref={bloom} className="scan-bloom" aria-hidden />
      <canvas ref={canvas} className="scan-veil" aria-hidden />
    </>
  )
}

const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2)

/**
 * How much ink sits under each dot. The photo is shrunk to a few samples per dot, and each
 * sample is compared with the brightest paper nearby, so shadows and uneven light don't read as text.
 */
function inkGrid(img: HTMLImageElement, W: number, H: number) {
  const gap = Math.max(3, Math.min(W, H) / 110)
  const cols = Math.ceil(W / gap), rows = Math.ceil(H / gap)
  const sub = 3
  const sw = cols * sub, sh = rows * sub
  const cv = document.createElement('canvas')
  cv.width = sw
  cv.height = sh
  const cx = cv.getContext('2d', { willReadFrequently: true })!
  cx.drawImage(img, 0, 0, sw, sh)
  const px = cx.getImageData(0, 0, sw, sh).data
  const lum = new Float32Array(sw * sh)
  for (let i = 0; i < sw * sh; i++) lum[i] = 0.3 * px[i * 4] + 0.59 * px[i * 4 + 1] + 0.11 * px[i * 4 + 2]

  const cellMax = new Float32Array(cols * rows)
  const cellMin = new Float32Array(cols * rows)
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      let hi = 0, lo = 255
      for (let y = r * sub; y < r * sub + sub; y++)
        for (let x = c * sub; x < c * sub + sub; x++) {
          const v = lum[y * sw + x]
          if (v > hi) hi = v
          if (v < lo) lo = v
        }
      cellMax[r * cols + c] = hi
      cellMin[r * cols + c] = lo
    }
  // Paper brightness per dot: the brightest sample in a neighbourhood.
  const ink = new Float32Array(cols * rows)
  const R = 3
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      let paper = 0
      for (let y = Math.max(0, r - R); y <= Math.min(rows - 1, r + R); y++)
        for (let x = Math.max(0, c - R); x <= Math.min(cols - 1, c + R); x++) paper = Math.max(paper, cellMax[y * cols + x])
      const contrast = paper - cellMin[r * cols + c]
      // Dark paper (the table, the next page) has no text to find.
      ink[r * cols + c] = paper < 90 ? 0 : Math.max(0, Math.min(1, (contrast - 28) / 55))
    }
  return { cols, rows, gap, ink }
}
