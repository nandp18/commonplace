import { use } from 'react'

/**
 * A screen kept out of the startup bundle. Unlike `React.lazy`, once its code has
 * arrived it renders straight away, so a preloaded screen never shows a blank frame
 * in the middle of a view transition.
 */
export function preloadable<T>(load: () => Promise<T>) {
  let loaded: T | undefined
  let pending: Promise<T> | undefined
  const get = () =>
    (pending ??= load().then(
      (m) => (loaded = m),
      (err) => {
        pending = undefined // let a later visit try again (say, once back online)
        throw err
      },
    ))
  return {
    preload: () => void get().catch(() => {}),
    /** Call during render: returns the module, or suspends until it's here. */
    useModule: (): T => loaded ?? use(get()),
  }
}

/** Fetch screen code once the app is idle, so opening those screens later is instant. */
export function whenIdle(fn: () => void) {
  if ('requestIdleCallback' in window) requestIdleCallback(fn, { timeout: 4000 })
  else setTimeout(fn, 1500)
}
