import { useEffect, useRef } from 'react'
import { reducedMotion } from './motion'
import type { OcrWord } from './selection'

/**
 * The page being read, drawn in the app's dot matrix. A beam sweeps down the photo;
 * wherever it finds ink, the dots catch gold and stay lit, so the lines of text
 * appear one by one. When the words arrive, each one flares in a wave down the page.
 */
export function ScanVeil({ img, run, reading, words }: { img: HTMLImageElement | null; run: number; reading: boolean; words: OcrWord[] | null }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const phase = useRef<'scan' | 'reveal' | 'done'>('scan')
  const live = useRef({ reading, words })
  live.current = { reading, words }

  useEffect(() => {
    const c = canvas.current
    if (!c || !img || !img.clientWidth || !run || reducedMotion()) return
    const W = img.clientWidth, H = img.clientHeight
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    c.width = Math.round(W * dpr)
    c.height = Math.round(H * dpr)
    c.style.width = `${W}px`
    c.style.height = `${H}px`
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const grid = inkGrid(img, W, H)
    const { cols, rows, gap, ink } = grid
    const seen = new Float32Array(cols * rows)
    const t0 = performance.now()
    let revealAt = 0
    let raf = 0
    let lastBeam = -Infinity
    phase.current = 'scan'

    const PERIOD = 2600
    const frame = (now: number) => {
      const t = now - t0
      ctx.clearRect(0, 0, W, H)
      const { reading, words } = live.current
      if (phase.current === 'scan' && !reading && words) {
        phase.current = 'reveal'
        revealAt = now
      }
      // Dots fade out as the words take over.
      const fade = phase.current === 'reveal' ? Math.max(0, 1 - (now - revealAt) / 450) : 1
      const p = (t % PERIOD) / PERIOD
      const beam = easeInOut(p) * 1.15 - 0.075 // just past each edge, so it enters and leaves cleanly
      const beamY = beam * H

      // Everything the beam swept over since the last frame counts as found, even if frames were dropped.
      const from = beamY < lastBeam ? -Infinity : lastBeam
      if (phase.current === 'scan') lastBeam = beamY

      if (fade > 0) {
        for (let r = 0; r < rows; r++) {
          const y = (r + 0.5) * gap
          const d = (y - beamY) / (H * 0.05)
          const glow = phase.current === 'scan' ? Math.exp(-d * d) : 0
          const swept = phase.current === 'scan' && y > from && y <= beamY
          for (let col = 0; col < cols; col++) {
            const i = r * cols + col
            const k = ink[i]
            if (swept && k > 0.25) seen[i] = 1
            const lit = Math.max(seen[i] * 0.75, glow * k)
            const x = (col + 0.5) * gap
            if (lit > 0.05) {
              // Ink the beam has found: gold, and a touch larger.
              ctx.globalAlpha = fade * Math.min(1, 0.25 + lit)
              ctx.fillStyle = '#f0c869'
              ctx.beginPath()
              ctx.arc(x, y, 0.55 + 0.6 * lit * k, 0, Math.PI * 2)
              ctx.fill()
            } else {
              // Paper: a faint grid that brightens as the beam passes.
              ctx.globalAlpha = fade * (0.1 + 0.35 * glow)
              ctx.fillStyle = '#fff'
              ctx.fillRect(x - 0.6, y - 0.6, 1.2, 1.2)
            }
          }
        }
        if (phase.current === 'scan') {
          // The beam itself: a bright hairline with a soft wake above it.
          const wake = ctx.createLinearGradient(0, beamY - H * 0.12, 0, beamY)
          wake.addColorStop(0, 'rgba(240, 200, 105, 0)')
          wake.addColorStop(1, 'rgba(240, 200, 105, 0.16)')
          ctx.globalAlpha = 1
          ctx.fillStyle = wake
          ctx.fillRect(0, beamY - H * 0.12, W, H * 0.12)
          ctx.fillStyle = 'rgba(255, 236, 190, 0.9)'
          ctx.fillRect(0, beamY - 0.75, W, 1.5)
        }
      }

      if (phase.current === 'reveal' && words) {
        // Every word flares in turn, top to bottom, like the page lighting up.
        const kx = img.naturalWidth / W
        const age = now - revealAt
        let active = false
        ctx.fillStyle = '#f0c869'
        for (const w of words) {
          const delay = (w.y0 / img.naturalHeight) * 650 + (w.x0 / img.naturalWidth) * 140
          const a = (age - delay) / 520
          if (a < 0) {
            active = true
            continue
          }
          if (a >= 1) continue
          active = true
          ctx.globalAlpha = 0.55 * Math.sin(a * Math.PI)
          const grow = (1 - a) * 2
          ctx.beginPath()
          ctx.roundRect(w.x0 / kx - grow, w.y0 / kx - grow, (w.x1 - w.x0) / kx + 2 * grow, (w.y1 - w.y0) / kx + 2 * grow, 2)
          ctx.fill()
        }
        if (!active && fade === 0) {
          phase.current = 'done'
          ctx.clearRect(0, 0, W, H)
          return
        }
      }
      // Reading failed or was cancelled: just let the dots go.
      if (!reading && !words && phase.current === 'scan') {
        ctx.clearRect(0, 0, W, H)
        return
      }
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
    // Each read (say, after switching language) starts the scan over.
  }, [img, run])

  return <canvas ref={canvas} className="scan-veil" aria-hidden />
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

  // Paper brightness per dot: the brightest sample in a neighbourhood.
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
