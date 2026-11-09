import { useMemo, useState } from 'react'
import { go, QuoteCard, QuoteForm } from './components'
import type { Store } from './store'
import { loadSyncConfig, saveSyncConfig, testConfig, type SyncConfig } from './sync'
import type { Lang } from './types'
import { byPage, download, quoteOfTheDay, search, toCsv, toMarkdown } from './util'

export function Library({ store }: { store: Store }) {
  const [query, setQuery] = useState('')
  const [shuffled, setShuffled] = useState<string | null>(null)
  const results = useMemo(() => search(store.quotes, store.bookMap, query), [store.quotes, store.bookMap, query])
  const daily = quoteOfTheDay(store.quotes)
  const featured = store.quotes.find((q) => q.id === shuffled) ?? daily

  const shuffle = () => {
    if (store.quotes.length < 2) return
    let next
    do next = store.quotes[Math.floor(Math.random() * store.quotes.length)]
    while (next.id === featured?.id)
    setShuffled(next.id)
  }

  if (store.ready && store.quotes.length === 0) {
    return (
      <div className="screen empty">
        <h1>Your commonplace book</h1>
        <p className="muted">Capture lines that stay with you, in English or ગુજરાતી.</p>
        <a className="big-button primary" href="#/capture">
          📷 Capture your first quote
        </a>
      </div>
    )
  }

  return (
    <div className="screen">
      <input
        className="search"
        type="search"
        placeholder={`Search ${store.quotes.length} quotes…`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query ? (
        <>
          <p className="muted small">
            {results.length} result{results.length === 1 ? '' : 's'}
          </p>
          {results.map((q) => (
            <QuoteCard key={q.id} quote={q} book={store.bookMap.get(q.bookId)} />
          ))}
        </>
      ) : (
        <>
          {featured && (
            <section className="featured">
              <div className="row between">
                <h2 className="eyebrow">{featured.id === daily?.id ? 'Quote of the day' : 'Random quote'}</h2>
                <button className="small" onClick={shuffle}>
                  Shuffle
                </button>
              </div>
              <QuoteCard quote={featured} book={store.bookMap.get(featured.bookId)} />
            </section>
          )}
          <h2 className="eyebrow">Recent</h2>
          {store.quotes.slice(0, 50).map((q) => (
            <QuoteCard key={q.id} quote={q} book={store.bookMap.get(q.bookId)} />
          ))}
        </>
      )}
    </div>
  )
}

export function Books({ store }: { store: Store }) {
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const q of store.quotes) m.set(q.bookId, (m.get(q.bookId) ?? 0) + 1)
    return m
  }, [store.quotes])
  const books = store.books.filter((b) => counts.get(b.id))

  return (
    <div className="screen">
      <h1>Books</h1>
      {books.length === 0 && <p className="muted">No books yet.</p>}
      <ul className="book-list">
        {books.map((b) => (
          <li key={b.id}>
            <a href={`#/book/${b.id}`}>
              <span>
                <span className="book-title">{b.title}</span>
                {b.author && <span className="muted"> · {b.author}</span>}
              </span>
              <span className="count">{counts.get(b.id)}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function BookView({ store, id }: { store: Store; id: string }) {
  const book = store.bookMap.get(id)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(book?.title ?? '')
  const [author, setAuthor] = useState(book?.author ?? '')
  if (!book) return <div className="screen muted">Book not found.</div>
  const quotes = store.quotes.filter((q) => q.bookId === id).sort(byPage)

  return (
    <div className="screen">
      <a className="link small" href="#/books">
        ← Books
      </a>
      {editing ? (
        <form
          className="quote-form"
          onSubmit={async (e) => {
            e.preventDefault()
            await store.updateBook({ ...book, title: title.trim(), author: author.trim() })
            setEditing(false)
          }}
        >
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author" />
          <button className="primary">Save</button>
        </form>
      ) : (
        <header className="book-header" onClick={() => setEditing(true)}>
          <h1>{book.title}</h1>
          {book.author && <p className="muted">{book.author}</p>}
        </header>
      )}
      <p className="muted small">
        {quotes.length} quote{quotes.length === 1 ? '' : 's'}
      </p>
      {quotes.map((q) => (
        <QuoteCard key={q.id} quote={q} showBook={false} />
      ))}
    </div>
  )
}

export function QuoteView({ store, id, saved }: { store: Store; id: string; saved: boolean }) {
  const quote = store.quotes.find((q) => q.id === id)
  const [editing, setEditing] = useState(false)
  const [lang, setLang] = useState<Lang>(quote?.lang ?? 'eng')
  if (!quote) return <div className="screen muted">{store.ready ? 'Quote not found.' : ''}</div>
  const book = store.bookMap.get(quote.bookId)

  if (editing) {
    return (
      <div className="screen">
        <QuoteForm store={store} initial={quote} lang={lang} onLangChange={setLang} onSaved={() => setEditing(false)} />
        <button className="ghost" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="screen">
      {saved && <div className="toast">Saved to your collection ✓</div>}
      <blockquote className="quote-large">{quote.text}</blockquote>
      <p>
        {book && <a href={`#/book/${book.id}`}>{book.title}</a>}
        {book?.author && <span className="muted"> · {book.author}</span>}
        {quote.page && <span className="muted"> · p. {quote.page}</span>}
      </p>
      {quote.note && <p className="quote-note">{quote.note}</p>}
      {quote.tags.length > 0 && (
        <div className="tags">
          {quote.tags.map((t) => (
            <span key={t} className="tag">
              #{t}
            </span>
          ))}
        </div>
      )}
      <div className="row actions">
        <button onClick={() => setEditing(true)}>Edit</button>
        <button
          onClick={() => navigator.clipboard?.writeText(`${quote.text}\n— ${book?.title ?? ''}${book?.author ? `, ${book.author}` : ''}`)}
        >
          Copy
        </button>
        <button
          className="danger"
          onClick={async () => {
            if (!confirm('Delete this quote?')) return
            await store.deleteQuote(quote)
            go('/')
          }}
        >
          Delete
        </button>
      </div>
      {saved && (
        <a className="big-button primary" href="#/capture">
          📷 Capture another
        </a>
      )}
    </div>
  )
}

export function NewQuote({ store }: { store: Store }) {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('commonplace.lang') as Lang) || 'eng')
  return (
    <div className="screen">
      <h1>Add a quote</h1>
      <QuoteForm store={store} lang={lang} onLangChange={setLang} onSaved={(q) => go(`/quote/${q.id}?saved=1`)} />
    </div>
  )
}

export function Settings({ store }: { store: Store }) {
  const existing = loadSyncConfig()
  const [cfg, setCfg] = useState<SyncConfig>(existing ?? { owner: '', repo: 'commonplace-data', path: 'quotes.json', token: '' })
  const [msg, setMsg] = useState('')
  const set = (k: keyof SyncConfig) => (e: React.ChangeEvent<HTMLInputElement>) => setCfg({ ...cfg, [k]: e.target.value.trim() })

  const s = store.syncState
  const status =
    s.kind === 'off' ? 'Not set up — quotes are only on this device.'
    : s.kind === 'syncing' ? 'Syncing…'
    : s.kind === 'ok' ? `Synced ${new Date(s.at).toLocaleTimeString()}`
    : `Error: ${s.message}`

  return (
    <div className="screen">
      <h1>Settings</h1>

      <section className="card">
        <h2>Backup &amp; sync</h2>
        <p className="muted small">
          Saves your quotes to <code>quotes.json</code> in a <strong>private</strong> GitHub repo, so they're backed up
          and show up on all your devices.
        </p>
        <details>
          <summary className="small">How to set up</summary>
          <ol className="small">
            <li>
              Create a <strong>private</strong> repo on github.com, e.g. <code>commonplace-data</code>.
            </li>
            <li>
              Go to Settings → Developer settings → Fine-grained tokens → Generate. Under Repository access, pick only that
              repo. Under Permissions, set <em>Contents: Read and write</em>.
            </li>
            <li>Paste your username, the repo name, and the token below.</li>
          </ol>
        </details>
        <form
          className="quote-form"
          onSubmit={async (e) => {
            e.preventDefault()
            setMsg('Checking…')
            try {
              setMsg(await testConfig(cfg))
              saveSyncConfig(cfg)
              store.runSync()
            } catch (err) {
              setMsg((err as Error).message)
            }
          }}
        >
          <div className="row">
            <input placeholder="GitHub username" value={cfg.owner} onChange={set('owner')} autoCapitalize="off" />
            <input placeholder="Repo" value={cfg.repo} onChange={set('repo')} autoCapitalize="off" />
          </div>
          <input type="password" placeholder="Fine-grained token (github_pat_…)" value={cfg.token} onChange={set('token')} />
          <button className="primary">Save &amp; connect</button>
          {msg && <p className="small">{msg}</p>}
        </form>
        <div className="row between">
          <span className="small muted">{status}</span>
          {existing && (
            <span className="row">
              <button className="small" onClick={store.runSync}>
                Sync now
              </button>
              <button
                className="small danger"
                onClick={() => {
                  saveSyncConfig(null)
                  setCfg({ ...cfg, token: '' })
                  setMsg('Disconnected. Your quotes are still on this device.')
                  store.runSync()
                }}
              >
                Disconnect
              </button>
            </span>
          )}
        </div>
      </section>

      <section className="card">
        <h2>Export</h2>
        <p className="muted small">{store.quotes.length} quotes from {store.books.length} books.</p>
        <div className="row">
          <button onClick={() => download('commonplace.md', toMarkdown(store.quotes, store.books), 'text/markdown')}>
            Markdown
          </button>
          <button onClick={() => download('commonplace.csv', toCsv(store.quotes, store.bookMap), 'text/csv')}>CSV</button>
        </div>
      </section>
    </div>
  )
}
