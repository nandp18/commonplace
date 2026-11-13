import { useMemo, useRef, useState } from 'react'
import {
  BookCover,
  EditableQuote,
  GlassButton,
  GlassGroup,
  go,
  Group,
  LANGS,
  Page,
  QuoteCard,
  QuoteFields,
  Row,
  Segmented,
} from './components'
import { bookDetails, BookForm } from './books'
import { findCovers, needsCover, useCoverSearch } from './coverSearch'
import { VIEW_KEY } from './library'
import { swipeTo, SwipeArea } from './swipe'
import { reflow, tidy } from './format'
import { ShareSheet } from './ShareSheet'
import { Icon } from './icons'
import { goodreadsFile, isGoodreadsCsv, parseGoodreads, type GoodreadsLibrary } from './goodreads'
import { parseImportFile, type ImportFile, type ImportPlan } from './importFile'
import { fileIntoSea } from './drop'
import { haptic, markTransition, morphName, morphSource } from './motion'
import { currentBookId, type Store } from './store'
import { loadSyncConfig, saveSyncConfig, testConfig, type SyncConfig } from './sync'
import type { Lang } from './types'
import { isSample } from './samples'
import { byPage, download, toBackup, toCsv, toMarkdown } from './util'

const BACKUP_KEY = 'commonplace.lastBackup'

function SettingsButton({ store }: { store: Store }) {
  const k = store.syncState.kind
  return (
    <span className="badge-wrap">
      <GlassButton icon="settings" href="#/settings" ariaLabel="Settings" />
      {k !== 'ok' && <span className={`sync-badge ${k}`} />}
    </span>
  )
}

export function PageArt() {
  return (
    <div className="page-art" aria-hidden>
      <span className="art-line" />
      <span className="art-line hl" />
      <span className="art-line hl" />
      <span className="art-line hl short" />
      <span className="art-line" />
      <span className="art-line short" />
    </div>
  )
}

/** Covers lean toward your finger, like picking a book off the shelf. */
function tilt(e: React.PointerEvent<HTMLElement>) {
  const cover = e.currentTarget.querySelector<HTMLElement>('.cover')
  if (!cover) return
  const r = cover.getBoundingClientRect()
  const x = (e.clientX - r.left) / r.width - 0.5
  const y = (e.clientY - r.top) / r.height - 0.5
  cover.style.setProperty('--ry', `${x * 16}deg`)
  cover.style.setProperty('--rx', `${-y * 16}deg`)
  cover.style.setProperty('--gx', `${(x + 0.5) * 100}%`)
  cover.style.setProperty('--gy', `${(y + 0.5) * 100}%`)
}
function untilt(e: React.PointerEvent<HTMLElement>) {
  const cover = e.currentTarget.querySelector<HTMLElement>('.cover')
  cover?.style.removeProperty('--rx')
  cover?.style.removeProperty('--ry')
}

export function Shelf({ store }: { store: Store }) {
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const q of store.quotes) m.set(q.bookId ?? '', (m.get(q.bookId ?? '') ?? 0) + 1)
    return m
  }, [store.quotes])
  // Quoted books first, the ones you've only added after them.
  const books = [...store.books].sort((a, b) => Number(!counts.get(a.id)) - Number(!counts.get(b.id)))
  const loose = store.quotes.filter((q) => !q.bookId || !store.bookMap.has(q.bookId)).length
  const quoteCount = (n = 0) => (n ? `${n} ${n === 1 ? 'quote' : 'quotes'}` : 'no quotes yet')

  return (
    <Page
      title="Books"
      leading={<SettingsButton store={store} />}
      trailing={<GlassButton icon="plus" href="#/addbook" ariaLabel="Add a book" />}
    >
      <SwipeArea onStep={(dir) => dir === -1 && (localStorage.setItem(VIEW_KEY, 'tags'), swipeTo('/', -1))}>
      {books.length === 0 && loose === 0 && (
        <div className="secondary center pad shelf-add-hint">
          <p>Scan a book’s barcode to put it on your shelf, or file a quote under it.</p>
          <a className="ink-button" href="#/addbook?scan=1">
            <Icon name="barcode" size={18} /> Scan a book
          </a>
        </div>
      )}
      <div className="cover-grid">
        {books.map((b) => (
          <a
            key={b.id}
            href={`#/book/${b.id}`}
            className="cover-cell"
            onPointerMove={tilt}
            onPointerLeave={untilt}
            onPointerUp={untilt}
            onClick={(e) => {
              markTransition('cover', b.id, 'grid')
              e.currentTarget.querySelector<HTMLElement>('.cover')?.style.setProperty('view-transition-name', 'morph-cover')
            }}
          >
            <BookCover book={b} morph={morphName('cover', b.id, 'grid')} />
            <span className="cover-caption-title">{b.title}</span>
            <span className="cover-caption-mono">
              {[b.author, quoteCount(counts.get(b.id))].filter(Boolean).join(' · ')}
            </span>
          </a>
        ))}
      </div>
      {loose > 0 && (
        <Group>
          <Row icon="page" label="Loose pages" value={String(loose)} chevron href="#/book/loose" />
        </Group>
      )}
      <FindCovers store={store} />
      </SwipeArea>
    </Page>
  )
}

/** Covers by title for books that came without one. Quiet until there's something to find. */
function FindCovers({ store }: { store: Store }) {
  const search = useCoverSearch()
  const missing = store.books.filter(needsCover)
  const result = search.total
    ? `${search.found ? `Found ${search.found} of ${search.total} covers.` : `No cover found for ${search.total === 1 ? 'that book' : `those ${search.total} books`}.`}${
        search.found < search.total ? ` ${search.found ? 'The rest keep' : 'They keep'} their cloth covers; you can add a photo from a book’s Edit screen.` : ''
      }`
    : undefined
  if (!search.running && !missing.length && !search.error && !result) return null
  return (
    <Group footer={search.error ?? (search.running ? 'Searching Open Library by title and author.' : result)}>
      {search.running ? (
        <Row icon="search" label="Finding covers…" value={`${search.done} of ${search.total}`} />
      ) : missing.length ? (
        <Row icon="search" tint label={`Find covers for ${missing.length === 1 ? '1 book' : `${missing.length} books`}`} onClick={() => findCovers(store.patchBooks, missing)} />
      ) : null}
    </Group>
  )
}

export function BookView({ store, id }: { store: Store; id: string }) {
  const isLoose = id === 'loose'
  const book = isLoose ? undefined : store.bookMap.get(id)
  const [editing, setEditing] = useState(false)
  const quotes = store.quotes
    .filter((q) => (isLoose ? !q.bookId || !store.bookMap.has(q.bookId) : q.bookId === id))
    .sort(byPage)

  if (!isLoose && !book) return <Page title="" back="#/books">{null}</Page>

  return (
    <Page
      title=""
      back="#/books"
      trailing={book && <GlassButton label={editing ? 'Cancel' : 'Edit'} onClick={() => setEditing(!editing)} />}
    >
      {book ? (
        <div className="book-hero">
          {editing ? (
            <BookForm store={store} book={book} onSaved={(b) => (b.id === book.id ? setEditing(false) : go(`/book/${b.id}`))} />
          ) : (
            <>
              <BookCover book={book} size="large" morph={morphName('cover', book.id, 'detail')} />
              <h1 className="book-hero-title">{book.title}</h1>
              {book.author && <p className="book-hero-author">by {book.author}</p>}
              {bookDetails(book) && <p className="book-hero-details">{bookDetails(book)}</p>}
              <span className="count-pill">
                {quotes.length} {quotes.length === 1 ? 'quote' : 'quotes'}
              </span>
            </>
          )}
        </div>
      ) : (
        <div className="book-hero">
          <h1 className="book-hero-title">Loose pages</h1>
          <p className="book-hero-author">quotes not filed under a book</p>
        </div>
      )}
      <div className="numbered">
        {quotes.map((q, i) => (
          <div key={q.id} className="numbered-row">
            <span className="numbered-index">{String(i + 1).padStart(2, '0')}</span>
            <QuoteCard quote={q} showBook={false} index={i} source="book" />
          </div>
        ))}
      </div>
    </Page>
  )
}

export function QuoteView({ store, id }: { store: Store; id: string }) {
  const quote = store.quotes.find((q) => q.id === id)
  const [copied, setCopied] = useState(false)
  const [sharing, setSharing] = useState(false)
  if (!quote) return <Page title="" back="#/">{null}</Page>
  const book = quote.bookId ? store.bookMap.get(quote.bookId) : undefined
  const credit = [book?.title, book?.author, quote.page && `p. ${quote.page}`].filter(Boolean).join(', ')
  const shareText = `“${quote.text}”${credit ? `\n— ${credit}` : ''}`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareText)
    } catch {
      return // Nothing was copied, so don't say it was.
    }
    haptic('success')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // Back goes where you came from: the ocean keeps your depth.
  const back = morphSource() === 'ocean' ? '#/ocean' : '#/'

  return (
    <Page
      title="Quote"
      back={back}
      trailing={
        <GlassGroup>
          <GlassButton icon="share" ariaLabel="Share" onClick={() => setSharing(true)} />
          <GlassButton icon={copied ? 'check' : 'copy'} animate={copied} ariaLabel={copied ? 'Copied' : 'Copy'} onClick={copy} className={copied ? 'copied' : ''} />
        </GlassGroup>
      }
    >
      <ShareSheet open={sharing} onClose={() => setSharing(false)} quote={quote} book={book} shareText={shareText} />
      <article className={`quote-hero ${copied ? 'copied' : ''}`}>
        <EditableQuote store={store} quote={quote} large morph={morphName('quote', quote.id, 'detail')} />
      </article>
      <div className="rise-in">
        <QuoteFields store={store} quote={quote} />
      </div>
      <div className="quiet-actions rise-in">
        <span className="meta-mono">
          Filed {new Date(quote.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
        </span>
        <button
          className="text-button destructive"
          onClick={async () => {
            if (!confirm('Delete this quote?')) return
            await store.deleteQuote(quote)
            go('/')
          }}
        >
          Delete
        </button>
      </div>
    </Page>
  )
}

export function NewQuote({ store }: { store: Store }) {
  const [text, setText] = useState('')
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('commonplace.lang') as Lang) || 'eng')
  const editor = useRef<HTMLTextAreaElement>(null)
  const [filing, setFiling] = useState(false)
  const save = async () => {
    if (filing) return
    setFiling(true)
    const bookId = currentBookId()
    const q = await store.saveQuote({
      text: tidy(text),
      bookId: bookId && store.bookMap.has(bookId) ? bookId : undefined,
      tags: [],
      lang,
    })
    // The same ceremony as a captured quote: it gathers into a drop and falls into the sea.
    // Put the keyboard away for the show, and let the screen grow back before it starts.
    if (document.activeElement === editor.current) {
      editor.current?.blur()
      const vv = window.visualViewport
      if (vv && vv.height < innerHeight - 80) await new Promise((r) => { vv.addEventListener('resize', r, { once: true }); setTimeout(r, 450) })
      else await new Promise((r) => setTimeout(r, 120))
    }
    if (editor.current) await fileIntoSea(editor.current, q.id, () => go(`/?new=${q.id}`))
    else go(`/?new=${q.id}`)
  }
  return (
    <Page title="New quote" back="#/">
      <textarea
        ref={editor}
        className="quote-text quote-editor large compose"
        placeholder="Type or paste a passage…"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => {
          // Text pasted from PDFs and e-books carries hard line breaks; reflow it.
          const pasted = e.clipboardData.getData('text')
          if (!pasted.includes('\n')) return
          e.preventDefault()
          const el = e.currentTarget
          setText(text.slice(0, el.selectionStart) + tidy(reflow(pasted)) + text.slice(el.selectionEnd))
        }}
      />
      <Segmented value={lang} options={LANGS} onChange={setLang} />
      <button className="ink-button wide spaced" disabled={!text.trim()} onClick={save}>
        <Icon name="sparkle" size={18} /> File quote
      </button>
      <p className="footnote center">Add the book, page and a note after filing.</p>
    </Page>
  )
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
const importSummary = (plan: ImportPlan) =>
  [
    plan.quotes.length && plural(plan.quotes.length, 'quote'),
    plan.newBooks && plural(plan.newBooks, 'book'),
    // Covers only count on their own for books you already had.
    !plan.newBooks && plan.covers && plural(plan.covers, 'cover'),
  ]
    .filter(Boolean)
    .join(' and ') || `details for ${plural(plan.books.length, 'book')}`

export function Settings({ store }: { store: Store }) {
  const existing = loadSyncConfig()
  const [cfg, setCfg] = useState<SyncConfig>(existing ?? { owner: '', repo: 'commonplace-data', path: 'quotes.json', token: '' })
  const [msg, setMsg] = useState('')
  const set = (k: keyof SyncConfig) => (e: React.ChangeEvent<HTMLInputElement>) => setCfg({ ...cfg, [k]: e.target.value.trim() })
  const fileInput = useRef<HTMLInputElement>(null)
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [importMsg, setImportMsg] = useState('')
  /** A Goodreads export waiting for you to decide about its want-to-read shelf. */
  const [goodreads, setGoodreads] = useState<{ lib: GoodreadsLibrary; toRead: boolean } | null>(null)

  const preview = async (file: ImportFile, from = '') => {
    const next = await store.previewImport(file)
    // A file of books alone (Goodreads, or a backup of an empty shelf) skips books, not quotes.
    const shelved = file.books.every((b) => !b.quotes.length) ? file.books.length - next.newBooks : 0
    const already = next.skipped
      ? ` ${next.skipped} already here will be skipped.`
      : shelved
        ? ` ${shelved} already on your shelf.`
        : ''
    if (next.quotes.length || next.books.length || next.covers) {
      setPlan(next)
      setImportMsg(`Ready to add ${importSummary(next)}${from}.${already}`)
    } else {
      setPlan(null)
      setImportMsg(`Nothing new to add${from}.${already}`)
    }
  }

  const previewGoodreads = (lib: GoodreadsLibrary, toRead: boolean) => {
    setGoodreads({ lib, toRead })
    return preview(goodreadsFile(lib, toRead), ' from Goodreads')
  }

  const chooseImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0]
    e.target.value = '' // so picking the same file again still fires
    if (!picked) return
    setPlan(null)
    setGoodreads(null)
    try {
      const text = await picked.text()
      if (isGoodreadsCsv(text)) await previewGoodreads(parseGoodreads(text), false)
      else if (/\.csv$/i.test(picked.name)) throw new Error('Only a Goodreads library export can be imported as CSV.')
      else await preview(parseImportFile(text))
    } catch (err) {
      setImportMsg((err as Error).message)
    }
  }
  const cancelImport = () => {
    setPlan(null)
    setGoodreads(null)
    setImportMsg('')
  }

  const [backedUp, setBackedUp] = useState(() => Number(localStorage.getItem(BACKUP_KEY)) || 0)
  const s = store.syncState
  const status =
    s.kind === 'off'
      ? 'Off — stored on this device only'
      : s.kind === 'syncing'
        ? 'Syncing…'
        : s.kind === 'ok'
          ? `Up to date${s.at ? ` · ${new Date(s.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}`
          : s.message

  return (
    <Page title="Settings" back="#/">
      <Group
        header="Backup & sync"
        footer={
          <>
            Saved to <code>quotes.json</code> in a <strong>private</strong> GitHub repository you own, so your quotes are
            backed up and on every device.
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
          label={existing ? 'Save & sync now' : 'Connect'}
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

      <Group
        header="Sample library"
        footer="16 public-domain quotes from 9 sources, in English and ગુજરાતી, for trying out browsing. Samples stay on this device and never sync."
      >
        {store.hasSamples ? (
          <Row destructive label="Remove sample quotes" onClick={store.removeSamples} />
        ) : (
          <Row tint label="Load sample quotes" onClick={store.loadSamples} />
        )}
      </Group>

      <Group
        header="Import"
        footer={
          importMsg || (
            <>
              Restores a backup, adds quotes from an import file, or brings in your Goodreads books (on goodreads.com: My Books →
              Import and export → Export library). Anything you already have is skipped.
            </>
          )
        }
      >
        <input ref={fileInput} type="file" accept=".json,application/json,.csv,text/csv" hidden onChange={chooseImport} />
        {goodreads && goodreads.lib.toRead.length > 0 && (
          <Row label={`Include want-to-read (${goodreads.lib.toRead.length})`}>
            <input
              type="checkbox"
              className="row-switch"
              {...{ switch: '' }}
              checked={goodreads.toRead}
              onChange={(e) => previewGoodreads(goodreads.lib, e.target.checked)}
            />
          </Row>
        )}
        {plan ? (
          <>
            <Row
              tint
              label={`Add ${importSummary(plan)}`}
              onClick={async () => {
                await store.applyImport(plan)
                const coverless = plan.books.filter(needsCover)
                setImportMsg(
                  `Added ${importSummary(plan)}.${coverless.length ? ` Looking up covers by title for ${coverless.length} without one; watch them arrive on the Books tab.` : ''}`,
                )
                setPlan(null)
                setGoodreads(null)
                // Books from Goodreads often lack an ISBN; find what covers we can, in the background.
                if (coverless.length) findCovers(store.patchBooks, coverless)
              }}
            />
            <Row label="Cancel" onClick={cancelImport} />
          </>
        ) : goodreads ? (
          <Row label="Cancel" onClick={cancelImport} />
        ) : (
          <Row tint label="Restore or import a file" onClick={() => fileInput.current?.click()} />
        )}
      </Group>

      <Group
        header="Export"
        footer={`${store.quotes.length} quotes from ${store.books.length} books. ${
          backedUp ? `Last backup ${new Date(backedUp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}.` : 'No backup saved from this device yet.'
        } Only a backup can be restored here.`}
      >
        <Row
          icon="share"
          label="Save a backup"
          tint
          onClick={async () => {
            const realQuotes = store.quotes.filter((q) => !isSample(q.id))
            const realBooks = store.books.filter((b) => !isSample(b.id))
            const name = `commonplace-backup-${new Date().toISOString().slice(0, 10)}.json`
            if (!(await download(name, JSON.stringify(toBackup(realQuotes, realBooks), null, 1), 'application/json'))) return
            const now = Date.now()
            localStorage.setItem(BACKUP_KEY, String(now))
            setBackedUp(now)
          }}
        />
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
