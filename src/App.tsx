import { useEffect, useState } from 'react'
import { Capture } from './Capture'
import { BookView, Books, Library, NewQuote, QuoteView, Settings } from './screens'
import { useStore } from './store'

function useRoute() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const on = () => {
      setHash(location.hash)
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const [path, query = ''] = hash.replace(/^#/, '').split('?')
  return { parts: path.split('/').filter(Boolean), params: new URLSearchParams(query) }
}

export function App() {
  const store = useStore()
  const { parts, params } = useRoute()
  const [section, id] = parts

  let screen
  switch (section) {
    case 'capture':
      screen = <Capture key={location.hash} store={store} />
      break
    case 'new':
      screen = <NewQuote store={store} />
      break
    case 'books':
      screen = <Books store={store} />
      break
    case 'book':
      screen = <BookView key={id} store={store} id={id} />
      break
    case 'quote':
      screen = <QuoteView key={id} store={store} id={id} saved={params.has('saved')} />
      break
    case 'settings':
      screen = <Settings store={store} />
      break
    default:
      screen = <Library store={store} />
  }

  const s = store.syncState
  const nav = (href: string, label: string, match: string[]) => (
    <a href={href} className={match.includes(section ?? '') ? 'on' : ''}>
      {label}
    </a>
  )

  return (
    <>
      <header className="topbar">
        <a href="#/" className="brand">
          Commonplace
        </a>
        <a
          href="#/settings"
          className={`sync-dot ${s.kind}`}
          title={s.kind === 'error' ? s.message : s.kind === 'off' ? 'Backup not set up' : s.kind}
          aria-label="Sync status"
        />
      </header>
      <main>{screen}</main>
      <nav className="tabbar">
        {nav('#/', 'Library', ['', 'quote'])}
        <a href="#/capture" className="capture-tab" aria-label="Capture">
          +
        </a>
        {nav('#/books', 'Books', ['books', 'book'])}
        {nav('#/settings', 'Settings', ['settings'])}
      </nav>
    </>
  )
}
