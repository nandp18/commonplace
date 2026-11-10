import { useLayoutEffect, useRef } from 'react'

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/* ───────────── Haptics ─────────────
   Android: the Vibration API. iOS Safari has none, but toggling a native
   `<input type="checkbox" switch>` plays the system selection tick (iOS 18+). */

let iosSwitch: HTMLLabelElement | null = null
let lastTick = 0

export function haptic(kind: 'tick' | 'tap' | 'success' = 'tap') {
  const now = performance.now()
  if (kind === 'tick' && now - lastTick < 35) return // don't buzz continuously
  lastTick = now
  if (navigator.vibrate) {
    navigator.vibrate(kind === 'success' ? [10, 40, 14] : kind === 'tick' ? 4 : 8)
    return
  }
  if (!iosSwitch) {
    iosSwitch = document.createElement('label')
    iosSwitch.setAttribute('aria-hidden', 'true')
    iosSwitch.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;overflow:hidden'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.setAttribute('switch', '')
    input.tabIndex = -1
    iosSwitch.appendChild(input)
    document.body.appendChild(iosSwitch)
  }
  iosSwitch.click()
}

/* ───────────── Scroll reveal ───────────── */

let observer: IntersectionObserver | null = null

/**
 * Fades and lifts an element into place when a screen opens. Anything off screen at
 * that moment simply appears, so a long list has nothing left to animate while scrolling.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const box = el.getBoundingClientRect()
    const offScreen = box.top > window.innerHeight || box.bottom < 0
    // The element a view transition is morphing into must be visible right away.
    if (offScreen || reducedMotion() || el.querySelector('[style*="view-transition-name"]')) {
      el.classList.add('in', 'instant')
      return
    }
    observer ??= new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            e.target.classList.add('in')
            observer!.unobserve(e.target)
          }
      },
      { rootMargin: '0px 0px -6% 0px' },
    )
    observer.observe(el)
    return () => observer?.unobserve(el)
  }, [])
  return ref
}

/* ───────────── Shared-element transitions ─────────────
   When you tap a quote or a cover, remember which element it was, so only that
   element (and its counterpart on the next screen) carries the view-transition name.
   Names must be unique on the page, or the browser skips the transition. */

let target: { kind: 'quote' | 'cover'; id: string; source: string } | null = null

export function markTransition(kind: 'quote' | 'cover', id: string, source: string) {
  target = { kind, id, source }
}

/** The view-transition-name for this element, if it's the one being morphed. */
export function morphName(kind: 'quote' | 'cover', id: string, source: string): string | undefined {
  if (!target || target.kind !== kind || target.id !== id) return undefined
  if (source !== 'detail' && target.source !== source) return undefined
  return `morph-${kind}`
}

export const hasMorph = () => target !== null
/** Which screen the current morph started from, e.g. 'ocean'. */
export const morphSource = () => target?.source
export const clearMorph = () => {
  target = null
}
