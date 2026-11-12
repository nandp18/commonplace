import { useEffect, useRef, useState } from 'react'
import { GlassButton, Segmented } from './components'
import { createSea } from './glsea'

/**
 * A playground for the WebGL sea (see glsea.ts): switch between dots and dither, day and
 * night. Drag up and down to tilt the camera. Tap the water to drop a ripple into it.
 */

type Look = 'dots' | 'dither'
type Light = 'day' | 'night'

export function SeaLab() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [look, setLook] = useState<Look>('dots')
  const [light, setLight] = useState<Light>('night')
  const settings = useRef({ look, light })
  settings.current = { look, light }

  useEffect(() => {
    const cv = canvas.current!
    const sea = createSea(cv)
    if (!sea) return
    addEventListener('resize', sea.resize)

    const cam = { pitch: -0.1, target: -0.1 }
    const t0 = performance.now()
    let night = settings.current.light === 'night' ? 1 : 0

    let press: { x: number; y: number; pitch: number } | null = null
    const down = (e: PointerEvent) => {
      press = { x: e.clientX, y: e.clientY, pitch: cam.target }
      cv.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (press) cam.target = Math.max(-0.75, Math.min(-0.03, press.pitch - (e.clientY - press.y) * 0.003))
    }
    const up = (e: PointerEvent) => {
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 8) sea.ripple(e.clientX, e.clientY)
      press = null
    }
    const cancel = () => (press = null)
    cv.addEventListener('pointerdown', down)
    cv.addEventListener('pointermove', move)
    cv.addEventListener('pointerup', up)
    cv.addEventListener('pointercancel', cancel)

    let raf = 0
    const frame = () => {
      raf = requestAnimationFrame(frame)
      const t = (performance.now() - t0) / 1000
      const s = settings.current
      night += ((s.light === 'night' ? 1 : 0) - night) * 0.06
      cam.pitch += (cam.target - cam.pitch) * 0.12
      sea.render({ time: t, pitch: cam.pitch, night, look: s.look, drift: t * 0.6 })
    }
    raf = requestAnimationFrame(frame)
    return () => {
      // The context is kept: StrictMode remounts on the same canvas.
      cancelAnimationFrame(raf)
      removeEventListener('resize', sea.resize)
      cv.removeEventListener('pointerdown', down)
      cv.removeEventListener('pointermove', move)
      cv.removeEventListener('pointerup', up)
      cv.removeEventListener('pointercancel', cancel)
    }
  }, [])

  return (
    <div className={`sealab ${light}`}>
      <canvas ref={canvas} className="sealab-canvas" />
      <div className="sealab-top">
        <GlassButton icon="back" href="#/" ariaLabel="Back" />
      </div>
      <div className="sealab-controls">
        <Segmented value={look} options={[{ value: 'dots', label: 'Dots' }, { value: 'dither', label: 'Dither' }]} onChange={setLook} />
        <Segmented value={light} options={[{ value: 'day', label: 'Day' }, { value: 'night', label: 'Night' }]} onChange={setLight} />
      </div>
    </div>
  )
}
