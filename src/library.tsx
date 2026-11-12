import { useMemo, useState } from 'react'
import { BookCover, CaptureButton, GlassButton, Page, QuoteCard } from './components'
import { DotSea } from './sea'
import { Icon } from './icons'
import { haptic } from './motion'
import { PageArt } from './screens'
import type { Store } from './store'
import type { Quote } from './types'
import { byPage, quoteOfTheDay, search } from './util'

type View = 'timeline' | 'books' | 'tags'
type Tab = View | 'ocean'
const VIEWS: { value: View; label: string }[] = [
  { value: 'timeline', label: 'Timeline' },
  { value: 'books', label: 'By book' },
  { value: 'tags', label: 'Tags' },
]
/** The ocean is its own immersive screen, so its tab dives rather than switching views. */
const TABS: { value: Tab; label: string }[] = [...VIEWS, { value: 'ocean', label: 'Ocean' }]
const VIEW_KEY = 'commonplace.view'

function SettingsButton({ store }: { store: Store }) {
  const k = store.syncState.kind
  return (
    <span className="badge-wrap">
      <GlassButton icon="settings" href="#/settings" ariaLabel="Settings" />
      {k !== 'ok' && <span className={`sync-badge ${k}`} />}
    </span>
  )
}

/** Shadowfax-style text tabs: the current one in ink, the rest quiet. */
function TextTabs<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="text-tabs" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => {
            if (o.value !== value) haptic('tick')
            onChange(o.value)
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Library({ store, freshId }: { store: Store; freshId?: string }) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [view, setViewState] = useState<View>(() => {
    // A just-filed quote falls into the sea, which lives on the timeline.
    if (freshId) return 'timeline'
    const saved = localStorage.getItem(VIEW_KEY) as View
    return VIEWS.some((v) => v.value === saved) ? saved : 'timeline'
  })
  const setView = (v: View) => {
    setViewState(v)
    localStorage.setItem(VIEW_KEY, v)
  }
  const results = useMemo(() => search(store.quotes, store.bookMap, query), [store.quotes, store.bookMap, query])
  const bookOf = (id?: string) => (id ? store.bookMap.get(id) : undefined)

  const nav = {
    leading: <SettingsButton store={store} />,
    trailing: store.quotes.length > 0 && (
      <GlassButton
        icon={searching ? 'close' : 'search'}
        ariaLabel="Search"
        onClick={() => {
          setSearching(!searching)
          setQuery('')
        }}
      />
    ),
  }

  if (store.ready && store.quotes.length === 0) {
    return (
      <Page title="Commonplace" {...nav}>
        <div className="empty">
          <PageArt />
          <h2>Keep the lines that keep you.</h2>
          <p className="secondary">Photograph a page, run your finger over a passage, and it’s filed — in English or ગુજરાતી.</p>
          <CaptureButton className="ink-button wide">
            <Icon name="camera" size={20} /> Capture a quote
          </CaptureButton>
          <a className="text-button" href="#/new">
            Type one instead
          </a>
          <button className="text-button" onClick={store.loadSamples}>
            Load a sample library
          </button>
        </div>
      </Page>
    )
  }

  return (
    <Page title="Commonplace" {...nav}>
      {searching && (
        <div className="search-field">
          <Icon name="search" size={16} />
          <input type="search" autoFocus placeholder="Search quotes, books, notes" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}

      {query ? (
        <>
          <h3 className="label">
            {results.length} {results.length === 1 ? 'result' : 'results'}
          </h3>
          <div className="quote-list">
            {results.map((q, i) => (
              <QuoteCard key={q.id} quote={q} book={bookOf(q.bookId)} highlight={query} index={i} source="search" />
            ))}
          </div>
        </>
      ) : (
        <>
          <TextTabs<Tab> value={view} options={TABS} onChange={(v) => (v === 'ocean' ? (location.hash = '/ocean') : setView(v))} />
          <div key={view} className="view-swap">
            {view === 'timeline' && <Timeline store={store} freshId={freshId} />}
            {view === 'books' && <ByBook store={store} />}
            {view === 'tags' && <Tags store={store} />}
          </div>
        </>
      )}
    </Page>
  )
}

/* ───────────── Timeline: deck, then months ───────────── */

const monthLabel = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

function Timeline({ store, freshId }: { store: Store; freshId?: string }) {
  const bookOf = (id?: string) => (id ? store.bookMap.get(id) : undefined)
  const months = useMemo(() => {
    const m = new Map<string, Quote[]>()
    for (const q of store.quotes) {
      const k = monthLabel(q.createdAt)
      m.set(k, [...(m.get(k) ?? []), q])
    }
    return [...m]
  }, [store.quotes])
  const daily = quoteOfTheDay(store.quotes)

  return (
    <>
      <DotSea quotes={store.quotes} dailyId={daily?.id} freshId={freshId} bookOf={bookOf} />
      {months.map(([month, qs]) => (
        <section key={month}>
          <h3 className="label sticky-label">
            {month} <span className="label-count">{qs.length}</span>
          </h3>
          <div className="quote-list">
            {qs.map((q, i) => (
              <QuoteCard key={q.id} quote={q} book={bookOf(q.bookId)} fresh={q.id === freshId} index={i} />
            ))}
          </div>
        </section>
      ))}
    </>
  )
}

/* ───────────── By book: a few from each, the rest one tap away ───────────── */

const PER_BOOK = 2

function ByBook({ store }: { store: Store }) {
  const groups = useMemo(() => {
    const m = new Map<string, Quote[]>()
    for (const q of store.quotes) {
      const k = q.bookId && store.bookMap.has(q.bookId) ? q.bookId : ''
      m.set(k, [...(m.get(k) ?? []), q])
    }
    // Books you've quoted most recently first; loose pages last.
    return [...m].sort(([a, qa], [b, qb]) => (a === '' ? 1 : b === '' ? -1 : qb[0].createdAt - qa[0].createdAt))
  }, [store.quotes, store.bookMap])

  return (
    <>
      {groups.map(([bookId, qs]) => {
        const book = store.bookMap.get(bookId)
        const href = `#/book/${bookId || 'loose'}`
        return (
          <section key={bookId || 'loose'} className="book-group">
            <a className="book-group-head" href={href}>
              {book ? <BookCover book={book} size="small" /> : <span className="loose-mark"><Icon name="page" size={18} /></span>}
              <span className="book-group-text">
                <span className="book-group-title">{book?.title ?? 'Loose pages'}</span>
                <span className="meta-mono">
                  {[book?.author, `${qs.length} ${qs.length === 1 ? 'quote' : 'quotes'}`].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="chevron">›</span>
            </a>
            <div className="quote-list">
              {[...qs].sort(byPage).slice(0, PER_BOOK).map((q, i) => (
                <QuoteCard key={q.id} quote={q} showBook={false} index={i} source="bybook" />
              ))}
            </div>
            {qs.length > PER_BOOK && (
              <a className="more-link" href={href}>
                {qs.length - PER_BOOK} more
              </a>
            )}
          </section>
        )
      })}
    </>
  )
}

/* ───────────── Tags ───────────── */

function Tags({ store }: { store: Store }) {
  const tags = useMemo(() => {
    const m = new Map<string, number>()
    for (const q of store.quotes) for (const t of q.tags) m.set(t, (m.get(t) ?? 0) + 1)
    return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [store.quotes])
  const [tag, setTag] = useState<string | null>(null)
  const active = tag ?? tags[0]?.[0]
  const quotes = store.quotes.filter((q) => q.tags.includes(active ?? ''))

  if (tags.length === 0) return <p className="secondary center pad">Add #tags to quotes to group them by theme.</p>
  return (
    <>
      <div className="chips">
        {tags.map(([t, n]) => (
          <button
            key={t}
            className={`chip ${t === active ? 'on' : ''}`}
            onClick={() => {
              if (t !== active) haptic('tick')
              setTag(t)
            }}
          >
            #{t} <span className="chip-count">{n}</span>
          </button>
        ))}
      </div>
      <div className="quote-list" key={active}>
        {quotes.map((q, i) => (
          <QuoteCard key={q.id} quote={q} book={q.bookId ? store.bookMap.get(q.bookId) : undefined} index={i} source="tags" />
        ))}
      </div>
    </>
  )
}
