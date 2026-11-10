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
import { reflow, tidy } from './format'
import { Icon } from './icons'
import { parseImportFile, type ImportPlan } from './importFile'
import { haptic, markTransition, morphName, morphSource } from './motion'
import { currentBookId, type Store } from './store'
import { loadSyncConfig, saveSyncConfig, testConfig, type SyncConfig } from './sync'
import type { Lang } from './types'
import { byPage, download, toCsv, toMarkdown } from './util'

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
  const books = store.books.filter((b) => counts.get(b.id))
  const loose = store.quotes.filter((q) => !q.bookId || !store.bookMap.has(q.bookId)).length

  return (
    <Page title="Books" leading={<SettingsButton store={store} />}>
      {books.length === 0 && loose === 0 && (
        <p className="secondary center pad">Books appear here as you file quotes under them.</p>
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
              {[b.author, `${counts.get(b.id)} ${counts.get(b.id) === 1 ? 'quote' : 'quotes'}`].filter(Boolean).join(' · ')}
            </span>
          </a>
        ))}
      </div>
      {loose > 0 && (
        <Group>
          <Row icon="page" label="Loose pages" value={String(loose)} chevron href="#/book/loose" />
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

  if (!isLoose && !book) return <Page title="" back="#/books">{null}</Page>

  return (
    <Page
      title=""
      back="#/books"
      trailing={book && <GlassButton label={editing ? 'Cancel' : 'Edit'} onClick={() => setEditing(!editing)} />}
    >
      {book ? (
        <div className="book-hero">
          <BookCover
            book={{ ...book, title: editing ? title || book.title : book.title }}
            size="large"
            morph={morphName('cover', book.id, 'detail')}
          />
          {editing ? (
            <div className="fields card">
              <label className="field-line">
                <span className="field-label">Title</span>
                <input className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label className="field-line">
                <span className="field-label">Author</span>
                <input className="field-input" value={author} placeholder="—" onChange={(e) => setAuthor(e.target.value)} />
              </label>
              <button
                className="ink-button wide"
                onClick={async () => {
                  if (title.trim()) await store.updateBook({ ...book, title: title.trim(), author: author.trim() })
                  setEditing(false)
                }}
              >
                Save
              </button>
            </div>
          ) : (
            <>
              <h1 className="book-hero-title">{book.title}</h1>
              {book.author && <p className="book-hero-author">by {book.author}</p>}
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
  if (!quote) return <Page title="" back="#/">{null}</Page>
  const book = quote.bookId ? store.bookMap.get(quote.bookId) : undefined
  const credit = [book?.title, book?.author, quote.page && `p. ${quote.page}`].filter(Boolean).join(', ')
  const shareText = `“${quote.text}”${credit ? `\n— ${credit}` : ''}`
  const copy = async () => {
    await navigator.clipboard?.writeText(shareText)
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
          {'share' in navigator && (
            <GlassButton icon="share" ariaLabel="Share" onClick={() => navigator.share({ text: shareText }).catch(() => {})} />
          )}
          <GlassButton icon={copied ? 'check' : 'copy'} animate={copied} ariaLabel="Copy" onClick={copy} />
        </GlassGroup>
      }
    >
      <article className="quote-hero">
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
    <Page title="New quote" back="#/">
      <textarea
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

const importSummary = (plan: ImportPlan) =>
  [plan.quotes.length && `${plan.quotes.length} quotes`, plan.covers && `${plan.covers} covers`].filter(Boolean).join(' and ')

export function Settings({ store }: { store: Store }) {
  const existing = loadSyncConfig()
  const [cfg, setCfg] = useState<SyncConfig>(existing ?? { owner: '', repo: 'commonplace-data', path: 'quotes.json', token: '' })
  const [msg, setMsg] = useState('')
  const set = (k: keyof SyncConfig) => (e: React.ChangeEvent<HTMLInputElement>) => setCfg({ ...cfg, [k]: e.target.value.trim() })
  const fileInput = useRef<HTMLInputElement>(null)
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [importMsg, setImportMsg] = useState('')

  const chooseImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0]
    e.target.value = '' // so picking the same file again still fires
    if (!picked) return
    setPlan(null)
    try {
      const next = await store.previewImport(parseImportFile(await picked.text()))
      const already = next.skipped ? ` ${next.skipped} already here will be skipped.` : ''
      if (next.quotes.length || next.covers) {
        setPlan(next)
        setImportMsg(`Ready to add ${importSummary(next)}.${already}`)
      } else setImportMsg(`Nothing new to add.${already}`)
    } catch (err) {
      setImportMsg((err as Error).message)
    }
  }

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

      <Group header="Import" footer={importMsg || 'Adds quotes from a reviewed import file. Quotes you already have are skipped.'}>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={chooseImport} />
        {plan ? (
          <>
            <Row
              tint
              label={`Add ${importSummary(plan)}`}
              onClick={async () => {
                await store.applyImport(plan)
                setImportMsg(`Added ${importSummary(plan)}.`)
                setPlan(null)
              }}
            />
            <Row
              label="Cancel"
              onClick={() => {
                setPlan(null)
                setImportMsg('')
              }}
            />
          </>
        ) : (
          <Row tint label="Choose import file" onClick={() => fileInput.current?.click()} />
        )}
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
