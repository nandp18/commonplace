import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Capture } from './Capture'
import { CaptureButton } from './components'
import { Icon } from './icons'
import { BookView, Library, NewQuote, QuoteView, Settings, Shelf } from './screens'
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
      document.documentElement.dataset.nav = d > 0 ? 'push' : d < 0 ? 'pop' : 'fade'
      doc.startViewTransition(apply)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const [path, query = ''] = hash.replace(/^#/, '').split('?')
  return { hash, parts: path.split('/').filter(Boolean), params: new URLSearchParams(query) }
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
    default:
      screen = <Library store={store} freshId={params.get('new') ?? undefined} />
  }

  const inLibrary = !section || section === 'quote'
  const inBooks = section === 'books' || section === 'book'

  return (
    <>
      <main className={section === 'capture' ? 'full' : ''}>{screen}</main>
      {section !== 'capture' && (
        <nav className="tabbar" aria-label="Tabs">
          <div className="glass tabs">
            <a href="#/" className={inLibrary ? 'on' : ''}>
              <Icon name="quote" size={22} />
              <span>Library</span>
            </a>
            <a href="#/books" className={inBooks ? 'on' : ''}>
              <Icon name="book" size={22} />
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
