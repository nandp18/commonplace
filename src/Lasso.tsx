import { useEffect, useRef, useState } from 'react'
import type { Box } from './ocr'

interface Props {
  src: string
  onImage: (img: HTMLImageElement) => void
  onBox: (box: Box | null) => void
}

type Pt = { x: number; y: number }

/** Shows a photo and lets you draw a loop around the passage with a finger. */
export function Lasso({ src, onImage, onBox }: Props) {
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const points = useRef<Pt[]>([])
  const drawing = useRef(false)
  const [hasLoop, setHasLoop] = useState(false)

  const fitCanvas = () => {
    const img = imgRef.current
    const canvas = canvasRef.current
    if (!img || !canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = img.clientWidth * dpr
    canvas.height = img.clientHeight * dpr
    canvas.style.width = `${img.clientWidth}px`
    canvas.style.height = `${img.clientHeight}px`
    redraw()
  }

  useEffect(() => {
    window.addEventListener('resize', fitCanvas)
    return () => window.removeEventListener('resize', fitCanvas)
  })

  const redraw = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const pts = points.current
    if (pts.length < 2) return
    const path = new Path2D()
    path.moveTo(pts[0].x, pts[0].y)
    for (const p of pts.slice(1)) path.lineTo(p.x, p.y)
    if (!drawing.current) {
      // Dim everything outside the loop.
      path.closePath()
      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fill(path)
      ctx.globalCompositeOperation = 'source-over'
    }
    ctx.lineWidth = 3
    ctx.lineJoin = ctx.lineCap = 'round'
    ctx.strokeStyle = '#E8590C'
    ctx.stroke(path)
  }

  const pos = (e: React.PointerEvent): Pt => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const finish = () => {
    if (!drawing.current) return
    drawing.current = false
    const pts = points.current
    const img = imgRef.current!
    if (pts.length < 5) {
      points.current = []
      setHasLoop(false)
      onBox(null)
      redraw()
      return
    }
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const sx = img.naturalWidth / img.clientWidth
    const sy = img.naturalHeight / img.clientHeight
    // Pad so a loop that clips the ends of words still gets the whole word.
    const pad = 0.02 * Math.max(img.naturalWidth, img.naturalHeight)
    const x0 = Math.max(0, Math.min(...xs) * sx - pad)
    const y0 = Math.max(0, Math.min(...ys) * sy - pad)
    const x1 = Math.min(img.naturalWidth, Math.max(...xs) * sx + pad)
    const y1 = Math.min(img.naturalHeight, Math.max(...ys) * sy + pad)
    setHasLoop(true)
    onBox({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 })
    redraw()
  }

  return (
    <div className="lasso">
      <div className="lasso-stage">
        <img
          ref={imgRef}
          src={src}
          alt="Page"
          draggable={false}
          onLoad={(e) => {
            onImage(e.currentTarget)
            fitCanvas()
          }}
        />
        <canvas
          ref={canvasRef}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            drawing.current = true
            points.current = [pos(e)]
            redraw()
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return
            points.current.push(pos(e))
            redraw()
          }}
          onPointerUp={finish}
          onPointerCancel={finish}
        />
      </div>
      <p className="hint">{hasLoop ? 'Draw again to redo.' : 'Circle the passage with your finger.'}</p>
    </div>
  )
}
