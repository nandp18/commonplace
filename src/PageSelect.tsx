import { useCallback, useEffect, useRef, useState } from 'react'
import { haptic, reducedMotion } from './motion'
import { ScanVeil } from './ScanVeil'
import { extendTo, lineHeight, nearestWord, selectRange, sentenceAt, wordAt, type OcrWord, type Pt, type Range } from './selection'

interface Props {
  src: string
  words: OcrWord[] | null
  reading: boolean
  /** Bumped for each read of the page, to start the scan animation over. */
  run: number
  /** A gesture made before the words were ready; shown until it can snap. */
  pendingStroke: Pt[] | null
  range: Range | null
  onImage: (img: HTMLImageElement) => void
  onRange: (r: Range | null) => void
  /** Raw gesture in photo pixels, for when there are no words to snap to. */
  onStroke: (stroke: Pt[] | null) => void
}

const HIGHLIGHT = 'rgba(112, 148, 236, 0.5)'
const INK = 'rgba(112, 148, 236, 0.55)'
const HANDLE = '#3478F6'

type Mode = 'none' | 'draw' | 'pinch' | 'start' | 'end'

/** Movement (screen px) before a touch counts as drawing rather than a tap. */
const TAP_SLOP = 9
const LOUPE = 128
const LOUPE_ZOOM = 2.2

/**
 * The photo, full screen, with a highlighter. Tap a sentence to select it, tap another to
 * reach to it, or draw any rough loop or swipe; the selection snaps to whole words.
 * Drag the handles to adjust, with a magnifier under your finger. Pinch to zoom in on small print.
 */
export function PageSelect({ src, words, reading, run, pendingStroke, range, onImage, onRange, onStroke }: Props) {
  const stage = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const img = useRef<HTMLImageElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)

  const view = useRef({ s: 1, tx: 0, ty: 0 })
  const pointers = useRef(new Map<number, Pt>())
  const mode = useRef<Mode>('none')
  const stroke = useRef<Pt[]>([]) // display px (unzoomed)
  const pinch0 = useRef({ d: 1, mid: { x: 0, y: 0 }, s: 1, tx: 0, ty: 0 })
  const beforeDraw = useRef<Range | null>(null)
  const down = useRef({ x: 0, y: 0, at: 0, moved: false })
  const loupe = useRef<HTMLCanvasElement>(null)
  const [loupeAt, setLoupeAt] = useState<Pt | null>(null)
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null)
  /** The finished stroke melting away as the highlight settles. */
  const fading = useRef<{ pts: Pt[]; a: number } | null>(null)
  const live = useRef({ words, range, pendingStroke })
  live.current = { words, range, pendingStroke }

  /** Photo pixels per display pixel. */
  const k = () => (img.current ? img.current.naturalWidth / img.current.clientWidth : 1)

  const redraw = useCallback(() => {
    const c = canvas.current, el = img.current
    if (!c || !el) return
    const ctx = c.getContext('2d')!
    const ratio = c.width / el.clientWidth
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, el.clientWidth, el.clientHeight)
    const { words, range } = live.current
    const kk = k()
    const s = view.current.s

    ctx.globalCompositeOperation = 'multiply'
    if (words && range) {
      // One highlighter band per line, like a real highlighter.
      const bands = new Map<number, { x0: number; y0: number; x1: number; y1: number }>()
      for (let i = range[0]; i <= range[1]; i++) {
        const w = words[i]
        const b = bands.get(w.line)
        if (!b) bands.set(w.line, { x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1 })
        else Object.assign(b, { x0: Math.min(b.x0, w.x0), y0: Math.min(b.y0, w.y0), x1: Math.max(b.x1, w.x1), y1: Math.max(b.y1, w.y1) })
      }
      ctx.fillStyle = HIGHLIGHT
      for (const b of bands.values()) {
        const pad = (b.y1 - b.y0) * 0.14
        ctx.beginPath()
        ctx.roundRect((b.x0 - pad) / kk, (b.y0 - pad) / kk, (b.x1 - b.x0 + 2 * pad) / kk, (b.y1 - b.y0 + 2 * pad) / kk, 3 / s)
        ctx.fill()
      }
    }

    const drawing = mode.current === 'draw'
    const fade = fading.current
    const pts = drawing
      ? stroke.current
      : fade
        ? fade.pts
        : (live.current.pendingStroke ?? []).map((p) => ({ x: p.x / kk, y: p.y / kk }))
    if (pts.length > 1) {
      ctx.globalAlpha = !drawing && fade ? fade.a : 1
      ctx.strokeStyle = INK
      ctx.lineWidth = words ? Math.max(8, (lineHeight(words) / kk) * 0.8) : 14 / s
      ctx.lineCap = ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    ctx.globalCompositeOperation = 'source-over'

    // Selection handles, iOS style: a stem with a knob.
    if (words && range && mode.current !== 'draw') {
      const a = words[range[0]], b = words[range[1]]
      const r = 6 / s
      ctx.fillStyle = ctx.strokeStyle = HANDLE
      ctx.lineWidth = 2 / s
      const pad = (a.y1 - a.y0) * 0.14
      const ax = (a.x0 - pad) / kk, bx = (b.x1 + pad) / kk
      ctx.beginPath()
      ctx.moveTo(ax, (a.y0 - pad) / kk)
      ctx.lineTo(ax, (a.y1 + pad) / kk)
      ctx.moveTo(bx, (b.y0 - pad) / kk)
      ctx.lineTo(bx, (b.y1 + pad) / kk)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(ax, (a.y0 - pad) / kk - r, r, 0, Math.PI * 2)
      ctx.arc(bx, (b.y1 + pad) / kk + r, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [])

  const fit = useCallback(() => {
    const c = canvas.current, el = img.current
    if (!c || !el || !el.clientWidth) return
    // Extra resolution so highlights stay crisp when zoomed in.
    const ratio = Math.min((window.devicePixelRatio || 1) * 2, 4096 / el.clientWidth, 4096 / el.clientHeight)
    c.width = Math.round(el.clientWidth * ratio)
    c.height = Math.round(el.clientHeight * ratio)
    c.style.width = `${el.clientWidth}px`
    c.style.height = `${el.clientHeight}px`
    redraw()
  }, [redraw])

  useEffect(() => {
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [fit])

  useEffect(redraw, [range, pendingStroke, redraw])

  const applyView = () => {
    const { s, tx, ty } = view.current
    if (inner.current) inner.current.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`
  }

  /** Pointer → unzoomed display coordinates of the photo. */
  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = inner.current!.getBoundingClientRect()
    const s = view.current.s
    return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s }
  }
  const toPhoto = (p: Pt): Pt => ({ x: p.x * k(), y: p.y * k() })

  const handleAt = (p: Pt): Mode | null => {
    const { words, range } = live.current
    if (!words || !range) return null
    const kk = k(), s = view.current.s, reach = 34 / s, r = 6 / s
    const a = words[range[0]], b = words[range[1]]
    const pa = (a.y1 - a.y0) * 0.14, pb = (b.y1 - b.y0) * 0.14
    // Measured to the knobs, and to the middle of the stems.
    const da = Math.min(Math.hypot(p.x - (a.x0 - pa) / kk, p.y - ((a.y0 - pa) / kk - r)), Math.hypot(p.x - (a.x0 - pa) / kk, p.y - (a.y0 + a.y1) / 2 / kk))
    const db = Math.min(Math.hypot(p.x - (b.x1 + pb) / kk, p.y - ((b.y1 + pb) / kk + r)), Math.hypot(p.x - (b.x1 + pb) / kk, p.y - (b.y0 + b.y1) / 2 / kk))
    if (Math.min(da, db) > reach) return null
    return da <= db ? 'start' : 'end'
  }

  /** A magnifier above the finger, so you can see the words you're touching. */
  const showLoupe = (e: { clientX: number; clientY: number }) => {
    const el = img.current, overlay = canvas.current, out = loupe.current
    if (!el || !overlay || !out) return
    const p = local(e)
    const kk = k()
    // The loupe shows LOUPE_ZOOM times what's on screen now.
    const span = LOUPE / (view.current.s * LOUPE_ZOOM) // display px
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    if (out.width !== LOUPE * dpr) out.width = out.height = LOUPE * dpr
    const g = out.getContext('2d')!
    g.fillStyle = '#111'
    g.fillRect(0, 0, out.width, out.height)
    const sx = p.x - span / 2, sy = p.y - span / 2
    g.drawImage(el, sx * kk, sy * kk, span * kk, span * kk, 0, 0, out.width, out.height)
    const ratio = overlay.width / el.clientWidth
    g.globalCompositeOperation = 'multiply'
    g.drawImage(overlay, sx * ratio, sy * ratio, span * ratio, span * ratio, 0, 0, out.width, out.height)
    g.globalCompositeOperation = 'source-over'
    const host = stage.current!.parentElement!.getBoundingClientRect()
    setLoupeAt({ x: e.clientX - host.left, y: e.clientY - host.top })
  }

  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      // Second finger: this is a pinch, not a stroke. Undo the stroke in progress.
      if (mode.current === 'draw') {
        stroke.current = []
        onRange(beforeDraw.current)
      }
      const [p, q] = [...pointers.current.values()]
      const { s, tx, ty } = view.current
      pinch0.current = { d: Math.hypot(p.x - q.x, p.y - q.y), mid: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, s, tx, ty }
      mode.current = 'pinch'
      redraw()
      return
    }
    if (pointers.current.size > 2) return
    const p = local(e)
    const h = handleAt(p)
    if (h) {
      mode.current = h
      return
    }
    mode.current = 'draw'
    beforeDraw.current = live.current.range
    stroke.current = [p]
    down.current = { x: e.clientX, y: e.clientY, at: performance.now(), moved: false }
  }

  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const { words, range } = live.current

    if (mode.current === 'pinch' && pointers.current.size >= 2) {
      const [p, q] = [...pointers.current.values()]
      const z = pinch0.current
      const rect = stage.current!.getBoundingClientRect()
      const s = Math.min(5, Math.max(1, (z.s * Math.hypot(p.x - q.x, p.y - q.y)) / z.d))
      const mid = { x: (p.x + q.x) / 2 - rect.left, y: (p.y + q.y) / 2 - rect.top }
      // Keep the content point that was under the fingers under the fingers.
      const cx = (z.mid.x - rect.left - z.tx) / z.s
      const cy = (z.mid.y - rect.top - z.ty) / z.s
      const W = rect.width, H = rect.height
      view.current = {
        s,
        tx: Math.min(0, Math.max(W - W * s, mid.x - cx * s)),
        ty: Math.min(0, Math.max(H - H * s, mid.y - cy * s)),
      }
      applyView()
      redraw()
      return
    }

    if (mode.current === 'draw') {
      stroke.current.push(local(e))
      // Wait until it's clearly a stroke, so a tap doesn't flash a selection.
      if (!down.current.moved && Math.hypot(e.clientX - down.current.x, e.clientY - down.current.y) > TAP_SLOP) down.current.moved = true
      if (!down.current.moved) return
      if (words && stroke.current.length > 2) onRange(selectRange(words, stroke.current.map(toPhoto)))
      redraw()
      showLoupe(e)
    } else if ((mode.current === 'start' || mode.current === 'end') && words && range) {
      const i = nearestWord(words, toPhoto(local(e)))
      const next: Range = mode.current === 'start' ? [Math.min(i, range[1]), range[1]] : [range[0], Math.max(i, range[0])]
      if (next[0] !== range[0] || next[1] !== range[1]) {
        haptic('tick') // a tick per word, like iOS text selection
        onRange(next)
      }
      showLoupe(e)
    }
  }

  /** Tap a word: select its sentence. With a selection, tap another sentence to reach to it, or the margin to clear. */
  const tap = (p: Pt | undefined) => {
    const words = live.current.words
    if (!p || !words?.length) return
    const i = wordAt(words, p, lineHeight(words) * 0.6)
    const current = live.current.range
    if (i === null) {
      if (current) {
        onRange(null)
        onStroke(null)
        haptic('tick')
      }
      return
    }
    const next = current ? extendTo(words, current, i) : sentenceAt(words, i)
    onStroke(null)
    onRange(next)
    haptic('tap')
  }

  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    setLoupeAt(null)
    if (mode.current === 'draw') {
      const pts = stroke.current.map(toPhoto)
      stroke.current = []
      if (!down.current.moved) {
        tap(pts[0])
      } else if (pts.length < 3) {
        onRange(beforeDraw.current)
      } else {
        onStroke(pts)
        const words = live.current.words
        if (words) {
          const r = selectRange(words, pts)
          onRange(r)
          if (r) haptic('tap')
          // Let the raw stroke melt into the snapped highlight.
          if (r && !reducedMotion()) {
            const displayPts = pts.map((p) => ({ x: p.x / k(), y: p.y / k() }))
            const t0 = performance.now()
            const tick = (t: number) => {
              const a = 1 - Math.min(1, (t - t0) / 280)
              fading.current = a > 0 ? { pts: displayPts, a } : null
              redraw()
              if (a > 0) requestAnimationFrame(tick)
            }
            requestAnimationFrame(tick)
          }
        }
      }
    }
    if (pointers.current.size === 0) {
      mode.current = 'none'
      if (view.current.s < 1.05) {
        view.current = { s: 1, tx: 0, ty: 0 }
        applyView()
      }
    }
    redraw()
  }

  return (
    <div className="page-select">
      <div
        ref={stage}
        className={`stage ${reading ? 'reading' : ''}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div ref={inner} className="stage-inner">
          <img
            ref={img}
            src={src}
            alt="Page"
            draggable={false}
            onLoad={(e) => {
              setImgEl(e.currentTarget)
              onImage(e.currentTarget)
              fit()
            }}
          />
          <canvas ref={canvas} />
          <ScanVeil img={imgEl} run={run} reading={reading} words={words} />
        </div>
      </div>
      <canvas
        ref={loupe}
        className={`loupe ${loupeAt ? 'on' : ''}`}
        // Above the finger, or below it near the top of the screen.
        style={loupeAt ? { left: loupeAt.x, top: loupeAt.y < 220 ? loupeAt.y + 260 : loupeAt.y } : undefined}
        aria-hidden
      />
    </div>
  )
}
