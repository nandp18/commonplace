import { useMemo, useState } from 'react'
import {
  attribution,
  BookCover,
  CaptureButton,
  EditableQuote,
  GlassButton,
  GlassGroup,
  go,
  Group,
  LANGS,
  Page,
  QuoteCard,
  QuoteDetails,
  QuoteText,
  Row,
  Segmented,
} from './components'
import { reflow, tidy } from './format'
import { Icon } from './icons'
import { currentBookId, type Store } from './store'
import { loadSyncConfig, saveSyncConfig, testConfig, type SyncConfig } from './sync'
import type { Lang } from './types'
import { byPage, download, quoteOfTheDay, search, toCsv, toMarkdown } from './util'

const today = () => new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

export function Library({ store, freshId }: { store: Store; freshId?: string }) {
  const [query, setQuery] = useState('')
  const [shuffled, setShuffled] = useState<string | null>(null)
  const results = useMemo(() => search(store.quotes, store.bookMap, query), [store.quotes, store.bookMap, query])
  const daily = quoteOfTheDay(store.quotes)
  const featured = store.quotes.find((q) => q.id === shuffled) ?? daily
  const bookOf = (id?: string) => (id ? store.bookMap.get(id) : undefined)

  const shuffle = () => {
    if (store.quotes.length < 2) return
    let next
    do next = store.quotes[Math.floor(Math.random() * store.quotes.length)]
    while (next.id === featured?.id)
    setShuffled(next.id)
  }

  if (store.ready && store.quotes.length === 0) {
    return (
      <Page title="Library">
        <div className="empty">
          <div className="pick-art" aria-hidden>
            <span className="pick-line" />
            <span className="pick-line hl" />
            <span className="pick-line hl short" />
            <span className="pick-line" />
          </div>
          <h2>Keep the lines that keep you.</h2>
          <p className="secondary">
            Photograph a page, run your finger over a passage, and it’s saved — in English or ગુજરાતી.
          </p>
          <CaptureButton className="prominent wide">
            <Icon name="camera" size={20} /> Capture Your First Quote
          </CaptureButton>
          <a className="nav-button" href="#/new">
            Type one instead
          </a>
        </div>
      </Page>
    )
  }

  return (
    <Page
      title="Library"
      trailing={
        <span className="badge-wrap">
          <GlassButton icon="settings" href="#/settings" ariaLabel="Settings" />
          <SyncBadge store={store} />
        </span>
      }
    >
      <div className="search-field">
        <Icon name="search" size={17} />
        <input type="search" placeholder="Search quotes, books, notes" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {query ? (
        <>
          <h3 className="section-header">
            {results.length} {results.length === 1 ? 'Result' : 'Results'}
          </h3>
          <div className="quote-list">
            {results.map((q) => (
              <QuoteCard key={q.id} quote={q} book={bookOf(q.bookId)} highlight={query} />
            ))}
          </div>
        </>
      ) : (
        <>
          {featured && (
            <section className="today">
              <div className="today-head">
                <span className="today-eyebrow">{featured.id === daily?.id ? today() : 'Rediscovered'}</span>
                <button className="text-icon" onClick={shuffle} aria-label="Shuffle">
                  <Icon name="shuffle" size={20} />
                </button>
              </div>
              <a href={`#/quote/${featured.id}`} className="today-card" key={featured.id}>
                <QuoteText text={featured.text} className="large clamp-today" />
                <span className="today-attr">{attribution(bookOf(featured.bookId), featured.page) || 'Loose page'}</span>
              </a>
            </section>
          )}
          <h3 className="section-header">Recent</h3>
          <div className="quote-list">
            {store.quotes.slice(0, 60).map((q) => (
              <QuoteCard key={q.id} quote={q} book={bookOf(q.bookId)} fresh={q.id === freshId} />
            ))}
          </div>
        </>
      )}
    </Page>
  )
}

function SyncBadge({ store }: { store: Store }) {
  const k = store.syncState.kind
  return k === 'ok' ? null : <span className={`sync-badge ${k}`} />
}

export function Shelf({ store }: { store: Store }) {
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const q of store.quotes) m.set(q.bookId ?? '', (m.get(q.bookId ?? '') ?? 0) + 1)
    return m
  }, [store.quotes])
  const books = store.books.filter((b) => counts.get(b.id))
  const loose = store.quotes.filter((q) => !q.bookId || !store.bookMap.has(q.bookId)).length

  return (
    <Page title="Books">
      {books.length === 0 && loose === 0 && <p className="secondary center pad">Books appear here as you file quotes under them.</p>}
      <div className="cover-grid">
        {books.map((b) => (
          <a key={b.id} href={`#/book/${b.id}`} className="cover-cell">
            <BookCover book={b} />
            <span className="cover-caption">
              {counts.get(b.id)} {counts.get(b.id) === 1 ? 'quote' : 'quotes'}
            </span>
          </a>
        ))}
      </div>
      {loose > 0 && (
        <Group>
          <Row icon="page" label="Loose Pages" value={String(loose)} chevron href="#/book/loose" />
        </Group>
      )}
    </Page>
  )
}

export function BookView({ store, id }: { store: Store; id: string }) {
  const isLoose = id === 'loose'
  const book = isLoose ? undefined : store.bookMap.get(id)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(book?.title ?? '')
  const [author, setAuthor] = useState(book?.author ?? '')
  const quotes = store.quotes
    .filter((q) => (isLoose ? !q.bookId || !store.bookMap.has(q.bookId) : q.bookId === id))
    .sort(byPage)

  if (!isLoose && !book) return <Page title="Book" back="#/books">{null}</Page>

  return (
    <Page
      title={book?.title ?? 'Loose Pages'}
      large={false}
      back="#/books"
      trailing={
        book && <GlassButton label={editing ? 'Cancel' : 'Edit'} onClick={() => setEditing(!editing)} />
      }
    >
      {book && (
        <div className="book-hero">
          <BookCover book={{ ...book, title: editing ? title || book.title : book.title }} size="large" />
          {editing ? (
            <Group>
              <Row label="Title">
                <input className="row-input" value={title} onChange={(e) => setTitle(e.target.value)} />
              </Row>
              <Row label="Author">
                <input className="row-input" value={author} placeholder="—" onChange={(e) => setAuthor(e.target.value)} />
              </Row>
              <Row
                tint
                label="Save"
                onClick={async () => {
                  if (title.trim()) await store.updateBook({ ...book, title: title.trim(), author: author.trim() })
                  setEditing(false)
                }}
              />
            </Group>
          ) : (
            <>
              <h1 className="book-hero-title">{book.title}</h1>
              {book.author && <p className="secondary">{book.author}</p>}
            </>
          )}
        </div>
      )}
      <h3 className="section-header">
        {quotes.length} {quotes.length === 1 ? 'Quote' : 'Quotes'}
      </h3>
      <div className="quote-list margin">
        {quotes.map((q) => (
          <div key={q.id} className="margin-row">
            <span className="margin-page">{q.page ?? ''}</span>
            <QuoteCard quote={q} showBook={false} />
          </div>
        ))}
      </div>
    </Page>
  )
}

export function QuoteView({ store, id }: { store: Store; id: string }) {
  const quote = store.quotes.find((q) => q.id === id)
  const [copied, setCopied] = useState(false)
  if (!quote) return <Page title="" large={false} back="#/">{null}</Page>
  const book = quote.bookId ? store.bookMap.get(quote.bookId) : undefined
  const shareText = `${quote.text}\n\n— ${attribution(book, quote.page) || 'Commonplace'}`
  const copy = async () => {
    await navigator.clipboard?.writeText(shareText)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Page
      title={book?.title ?? ''}
      large={false}
      back="#/"
      trailing={
        <GlassGroup>
          {'share' in navigator && (
            <GlassButton icon="share" ariaLabel="Share" onClick={() => navigator.share({ text: shareText }).catch(() => {})} />
          )}
          <GlassButton icon={copied ? 'check' : 'copy'} ariaLabel="Copy" onClick={copy} />
        </GlassGroup>
      }
    >
      <article className="quote-hero">
        <EditableQuote store={store} quote={quote} large />
        {book && <p className="quote-hero-attr">{attribution(book, quote.page)}</p>}
      </article>
      <QuoteDetails store={store} quote={quote} />
      <Group>
        <Row
          label="Delete Quote"
          destructive
          onClick={async () => {
            if (!confirm('Delete this quote?')) return
            await store.deleteQuote(quote)
            go('/')
          }}
        />
      </Group>
      <p className="footnote center">
        Added {new Date(quote.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
    </Page>
  )
}

export function NewQuote({ store }: { store: Store }) {
  const [text, setText] = useState('')
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('commonplace.lang') as Lang) || 'eng')
  const save = async () => {
    const bookId = currentBookId()
    const q = await store.saveQuote({
      text: tidy(text),
      bookId: bookId && store.bookMap.has(bookId) ? bookId : undefined,
      tags: [],
      lang,
    })
    go(`/quote/${q.id}`)
  }
  return (
    <Page
      title="New Quote"
      large={false}
      back="#/"
      trailing={<GlassButton icon="check" prominent ariaLabel="Save" disabled={!text.trim()} onClick={save} />}
    >
      <textarea
        className="quote-text quote-editor large compose"
        placeholder="Type or paste a passage…"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => {
          // Pasted text from PDFs and e-books carries hard line breaks; reflow it.
          const pasted = e.clipboardData.getData('text')
          if (!pasted.includes('\n')) return
          e.preventDefault()
          const el = e.currentTarget
          const next = text.slice(0, el.selectionStart) + tidy(reflow(pasted)) + text.slice(el.selectionEnd)
          setText(next)
        }}
      />
      <Segmented value={lang} options={LANGS} onChange={setLang} />
      <p className="footnote">You can add the book, page and a note after saving.</p>
    </Page>
  )
}

export function Settings({ store }: { store: Store }) {
  const existing = loadSyncConfig()
  const [cfg, setCfg] = useState<SyncConfig>(existing ?? { owner: '', repo: 'commonplace-data', path: 'quotes.json', token: '' })
  const [msg, setMsg] = useState('')
  const set = (k: keyof SyncConfig) => (e: React.ChangeEvent<HTMLInputElement>) => setCfg({ ...cfg, [k]: e.target.value.trim() })

  const s = store.syncState
  const status =
    s.kind === 'off'
      ? 'Off — quotes are stored only on this device.'
      : s.kind === 'syncing'
        ? 'Syncing…'
        : s.kind === 'ok'
          ? `Up to date${s.at ? ` · ${new Date(s.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}`
          : s.message

  return (
    <Page title="Settings" back="#/">
      <Group
        header="Backup & Sync"
        footer={
          <>
            Quotes are saved to <code>quotes.json</code> in a <strong>private</strong> repository you own, so they’re
            backed up and appear on all your devices.
          </>
        }
      >
        <Row label="Status" value={<span className={`status ${s.kind}`}>{status}</span>} />
        <Row label="Username">
          <input className="row-input" placeholder="octocat" value={cfg.owner} onChange={set('owner')} autoCapitalize="off" autoCorrect="off" />
        </Row>
        <Row label="Repository">
          <input className="row-input" value={cfg.repo} onChange={set('repo')} autoCapitalize="off" autoCorrect="off" />
        </Row>
        <Row label="Token">
          <input className="row-input" type="password" placeholder="github_pat_…" value={cfg.token} onChange={set('token')} />
        </Row>
        <Row
          tint
          label={existing ? 'Save & Sync Now' : 'Connect'}
          onClick={async () => {
            setMsg('Checking…')
            try {
              setMsg(await testConfig(cfg))
              saveSyncConfig(cfg)
              store.runSync()
            } catch (err) {
              setMsg((err as Error).message)
            }
          }}
        />
        {existing && (
          <Row
            destructive
            label="Disconnect"
            onClick={() => {
              saveSyncConfig(null)
              setCfg({ ...cfg, token: '' })
              setMsg('Disconnected. Your quotes are still on this device.')
              store.runSync()
            }}
          />
        )}
      </Group>
      {msg && <p className="footnote">{msg}</p>}

      <Group header="Setup">
        <details className="row disclosure">
          <summary>How to create a token</summary>
          <ol>
            <li>
              On github.com, create a <strong>private</strong> repository named <code>commonplace-data</code>.
            </li>
            <li>Settings → Developer settings → Fine-grained tokens → Generate new token.</li>
            <li>Repository access: only that repository. Permissions: Contents → Read and write.</li>
            <li>Copy the token and paste it above.</li>
          </ol>
        </details>
      </Group>

      <Group header="Export" footer={`${store.quotes.length} quotes from ${store.books.length} books.`}>
        <Row
          icon="share"
          label="Export as Markdown"
          tint
          onClick={() => download('commonplace.md', toMarkdown(store.quotes, store.books), 'text/markdown')}
        />
        <Row icon="share" label="Export as CSV" tint onClick={() => download('commonplace.csv', toCsv(store.quotes, store.bookMap), 'text/csv')} />
      </Group>
    </Page>
  )
}
