import { useEffect, useRef, type ReactNode } from 'react'
import { haptic } from './motion'
import './swipe.css'

/* ───────────── Swiping between tabs and views ───────────── */

let pending: 1 | -1 | null = null

/** Goes to another tab by swipe, so the screens slide past each other in that direction. */
export function swipeTo(path: string, dir: 1 | -1) {
  haptic('tick')
  pending = dir
  location.hash = path
  return true
}

/** The direction of the swipe that started this navigation, if one did. Read once. */
export function takeSwipeNav(): 1 | -1 | null {
  const d = pending
  pending = null
  return d
}

/**
 * Swipe sideways to move between the views, like paging through tabs.
 * Only a clearly sideways drag counts, so scrolling down the list is never hijacked.
 */
export function SwipeArea({ onStep, children }: { onStep: (dir: 1 | -1) => boolean; children: ReactNode }) {
  const el = useRef<HTMLDivElement>(null)
  const step = useRef(onStep)
  step.current = onStep

  useEffect(() => {
    const node = el.current
    if (!node) return
    let start: { x: number; y: number; t: number } | null = null
    let axis: 'x' | 'y' | null = null
    let dx = 0
    const reset = (animate: boolean) => {
      node.style.transition = animate ? 'transform 0.35s var(--spring), opacity 0.35s' : ''
      node.style.transform = ''
      node.style.opacity = ''
    }
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0]
      // Leave the screen edges to the system, and text fields to typing.
      if (e.touches.length > 1 || t.clientX < 18 || t.clientX > innerWidth - 18 || (e.target as HTMLElement).closest('input, textarea, .text-tabs')) {
        start = null
        return
      }
      start = { x: t.clientX, y: t.clientY, t: performance.now() }
      axis = null
      dx = 0
    }
    const onMove = (e: TouchEvent) => {
      if (!start) return
      const t = e.touches[0]
      dx = t.clientX - start.x
      const dy = t.clientY - start.y
      if (!axis && Math.hypot(dx, dy) > 10) axis = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y'
      if (axis !== 'x') return
      e.preventDefault()
      node.style.transition = 'none'
      node.style.transform = `translateX(${dx * 0.4}px)`
      node.style.opacity = String(1 - Math.min(Math.abs(dx) / 900, 0.25))
    }
    const onEnd = () => {
      if (!start || axis !== 'x') return reset(false)
      const fast = Math.abs(dx) / (performance.now() - start.t) > 0.45
      start = null
      if ((Math.abs(dx) > 70 || (fast && Math.abs(dx) > 30)) && step.current(dx < 0 ? 1 : -1)) {
        node.style.transition = ''
        node.style.transform = ''
        node.style.opacity = ''
      } else reset(true)
    }
    // A sideways swipe that ends on a quote in the sea shouldn't also open it.
    const swallow = (e: Event) => axis === 'x' && e.stopPropagation()
    node.addEventListener('touchstart', onStart, { passive: true })
    node.addEventListener('touchmove', onMove, { passive: false })
    node.addEventListener('touchend', onEnd)
    node.addEventListener('touchcancel', onEnd)
    node.addEventListener('pointerup', swallow, true)
    node.addEventListener('click', swallow, true)
    return () => {
      node.removeEventListener('touchstart', onStart)
      node.removeEventListener('touchmove', onMove)
      node.removeEventListener('touchend', onEnd)
      node.removeEventListener('touchcancel', onEnd)
      node.removeEventListener('pointerup', swallow, true)
      node.removeEventListener('click', swallow, true)
    }
  }, [])

  return (
    <div ref={el} className="swipe-area">
      {children}
    </div>
  )
}

