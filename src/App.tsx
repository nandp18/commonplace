import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Capture } from './Capture'
import { CaptureButton } from './components'
import { Icon } from './icons'
import { ceremonyActive } from './drop'
import { haptic, hasMorph } from './motion'
import { Library } from './library'
import { Ocean } from './ocean'
import { BookView, NewQuote, QuoteView, Settings, Shelf } from './screens'
import { useStore } from './store'

/** How deep a route sits, so navigation can slide forward or back like iOS. */
const depth = (hash: string) => {
  const s = hash.replace(/^#\/?/, '').split(/[/?]/)[0]
  return s === 'book' || s === 'quote' || s === 'settings' || s === 'new' || s === 'ocean' ? 1 : s === 'capture' ? 2 : 0
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
      // While the filing ceremony covers the screen, it does the transition itself.
      if (!doc.startViewTransition || ceremonyActive() || matchMedia('(prefers-reduced-motion: reduce)').matches) return apply()
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

/** Holds its own scroll state, so shrinking the bar never re-renders the screen behind it. */
function TabBar({ inLibrary, inBooks }: { inLibrary: boolean; inBooks: boolean }) {
  const minimized = useMinimizeOnScroll()
  return (
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
      <CaptureMenu />
    </nav>
  )
}

/** The capture button opens three ways in: photograph a page, pick a photo, or type it. */
function CaptureMenu() {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => !root.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', close)
    window.addEventListener('scroll', close, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', close)
      window.removeEventListener('scroll', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  const done = () => setOpen(false)
  return (
    <div ref={root} className={`capture-menu ${open ? 'open' : ''}`}>
      <div className="capture-options glass" role="menu" aria-hidden={!open}>
        <CaptureButton className="capture-option" camera>
          <Icon name="camera" size={20} /> Take photo
        </CaptureButton>
        <CaptureButton className="capture-option">
          <Icon name="photos" size={20} /> Choose photo
        </CaptureButton>
        <a className="capture-option" href="#/new" onClick={done}>
          <Icon name="note" size={20} /> Type it
        </a>
      </div>
      <button
        className="glass capture-fab"
        aria-expanded={open}
        aria-label={open ? 'Close' : 'Add a quote'}
        onClick={() => {
          haptic('tick')
          setOpen(!open)
        }}
      >
        <Icon name={open ? 'close' : 'camera'} size={open ? 20 : 26} />
      </button>
    </div>
  )
}

export function App() {
  const store = useStore()
  const { hash, parts, params } = useRoute()
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
    case 'ocean':
      screen = <Ocean store={store} />
      break
    default:
      screen = <Library store={store} freshId={params.get('new') ?? undefined} />
  }

  const inLibrary = !section || section === 'quote'
  const inBooks = section === 'books' || section === 'book'

  return (
    <>
      <main className={section === 'capture' || section === 'ocean' ? 'full' : ''}>{screen}</main>
      {section !== 'capture' && section !== 'ocean' && <TabBar inLibrary={inLibrary} inBooks={inBooks} />}
    </>
  )
}
