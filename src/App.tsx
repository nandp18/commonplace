import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Capture } from './Capture'
import { CaptureButton } from './components'
import { Icon } from './icons'
import { haptic, hasMorph } from './motion'
import { Library } from './library'
import { BookView, NewQuote, QuoteView, Settings, Shelf } from './screens'
import { useStore } from './store'

/** How deep a route sits, so navigation can slide forward or back like iOS. */
const depth = (hash: string) => {
  const s = hash.replace(/^#\/?/, '').split(/[/?]/)[0]
  return s === 'book' || s === 'quote' || s === 'settings' || s === 'new' ? 1 : s === 'capture' ? 2 : 0
}

function useRoute() {
  const [hash, setHash] = useState(location.hash)
  const current = useRef(hash)
  useEffect(() => {
    const on = () => {
      const next = location.hash
      const apply = () => {
        current.current = next
        flushSync(() => setHash(next))
        window.scrollTo(0, 0)
      }
      const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
      if (!doc.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return apply()
      const d = depth(next) - depth(current.current)
      const detail = (h: string) => /^#\/(quote|book)\//.test(h)
      // A tapped card grows into its page (iOS zoom transition); otherwise push/pop.
      const zoom = hasMorph() && (detail(next) || detail(current.current))
      document.documentElement.dataset.nav = zoom ? 'zoom' : d > 0 ? 'push' : d < 0 ? 'pop' : 'fade'
      doc.startViewTransition(apply)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const [path, query = ''] = hash.replace(/^#/, '').split('?')
  return { hash, parts: path.split('/').filter(Boolean), params: new URLSearchParams(query) }
}

/** iOS 26 tab bar: shrinks while you scroll down to read, comes back when you scroll up. */
function useMinimizeOnScroll() {
  const [min, setMin] = useState(false)
  useEffect(() => {
    let last = window.scrollY
    const on = () => {
      const y = window.scrollY
      if (y < 60 || y < last - 8) setMin(false)
      else if (y > last + 8) setMin(true)
      if (Math.abs(y - last) > 8) last = y
    }
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return min
}

export function App() {
  const store = useStore()
  const { hash, parts, params } = useRoute()
  const minimized = useMinimizeOnScroll()
  const [section, id] = parts

  let screen
  switch (section) {
    case 'capture':
      screen = <Capture key={hash} store={store} />
      break
    case 'new':
      screen = <NewQuote store={store} />
      break
    case 'books':
      screen = <Shelf store={store} />
      break
    case 'book':
      screen = <BookView key={id} store={store} id={id} />
      break
    case 'quote':
      screen = <QuoteView key={id} store={store} id={id} />
      break
    case 'settings':
      screen = <Settings store={store} />
      break
    default:
      screen = <Library store={store} freshId={params.get('new') ?? undefined} />
  }

  const inLibrary = !section || section === 'quote'
  const inBooks = section === 'books' || section === 'book'

  return (
    <>
      <main className={section === 'capture' ? 'full' : ''}>{screen}</main>
      {section !== 'capture' && (
        <nav className={`tabbar ${minimized ? 'minimized' : ''}`} aria-label="Tabs">
          <div className="glass tabs" style={{ ['--tab' as string]: inLibrary ? 0 : inBooks ? 1 : -1 }}>
            {(inLibrary || inBooks) && <span className="tab-indicator" aria-hidden />}
            <a href="#/" className={inLibrary ? 'on' : ''} onClick={() => !inLibrary && haptic('tick')}>
              <Icon name="quote" size={22} animate={inLibrary} />
              <span>Library</span>
            </a>
            <a href="#/books" className={inBooks ? 'on' : ''} onClick={() => !inBooks && haptic('tick')}>
              <Icon name="book" size={22} animate={inBooks} />
              <span>Books</span>
            </a>
          </div>
          <CaptureButton className="glass capture-fab">
            <Icon name="camera" size={26} />
            <span className="sr-only">Capture</span>
          </CaptureButton>
        </nav>
      )}
    </>
  )
}
