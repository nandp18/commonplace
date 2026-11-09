import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { bare, isGujarati, tidy } from './format'
import { Icon, type IconName } from './icons'
import { setPendingPhoto } from './pending'
import type { Store } from './store'
import { parseTags } from './util'
import type { Book, Lang, Quote } from './types'

export const go = (path: string) => {
  location.hash = path
}

/* ───────────── Navigation ───────────── */

/**
 * iOS 26 bar button: a Liquid Glass circle (icon) or capsule (label).
 * `prominent` is the tinted glass used for the primary action, e.g. Done.
 */
export function GlassButton({
  icon,
  label,
  prominent,
  destructive,
  href,
  onClick,
  disabled,
  ariaLabel,
}: {
  icon?: IconName
  label?: string
  prominent?: boolean
  destructive?: boolean
  href?: string
  onClick?: () => void
  disabled?: boolean
  ariaLabel?: string
}) {
  const cls = `glass-button glass ${label ? 'capsule' : 'circle'} ${prominent ? 'prominent-glass' : ''} ${destructive ? 'destructive' : ''}`
  const body = (
    <>
      {icon && <Icon name={icon} size={label ? 18 : 21} />}
      {label && <span>{label}</span>}
    </>
  )
  if (href)
    return (
      <a className={cls} href={href} aria-label={ariaLabel ?? label}>
        {body}
      </a>
    )
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled} aria-label={ariaLabel ?? label}>
      {body}
    </button>
  )
}

/** Several bar buttons sharing one piece of glass, as iOS 26 groups them. */
export function GlassGroup({ children }: { children: ReactNode }) {
  return <div className="glass-group glass">{children}</div>
}

/**
 * iOS 26 page: a transparent navigation bar with floating glass buttons. The large title
 * scrolls away and the inline title fades in over a soft scroll-edge blur.
 */
export function Page({
  title,
  large = true,
  back,
  trailing,
  children,
}: {
  title: string
  large?: boolean
  back?: string
  trailing?: ReactNode
  children: ReactNode
}) {
  const sentinel = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(!large)
  useEffect(() => {
    if (!large || !sentinel.current) return
    const io = new IntersectionObserver(([e]) => setCollapsed(!e.isIntersecting), { rootMargin: '-56px 0px 0px 0px' })
    io.observe(sentinel.current)
    return () => io.disconnect()
  }, [large])

  return (
    <div className="page">
      <header className={`navbar ${collapsed ? 'collapsed' : ''}`}>
        <div className="navbar-side">{back && <GlassButton icon="back" href={back} ariaLabel="Back" />}</div>
        <div className="navbar-title">{title}</div>
        <div className="navbar-side end">{trailing}</div>
      </header>
      {large && (
        <h1 className="large-title" ref={sentinel}>
          {title}
        </h1>
      )}
      <div className="page-body">{children}</div>
    </div>
  )
}

/** Opens the camera straight from the tab bar: one tap from anywhere to capture. */
export function CaptureButton({ className = '', children, library = false }: { className?: string; children: ReactNode; library?: boolean }) {
  return (
    <label className={className}>
      {children}
      <input
        type="file"
        accept="image/*"
        {...(library ? {} : { capture: 'environment' as const })}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          setPendingPhoto(file)
          go(`/capture?t=${Date.now()}`)
        }}
      />
    </label>
  )
}

/* ───────────── Quote typography ───────────── */

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Renders a quote as paragraphs, with optional search highlights or OCR-uncertainty marks. */
export function QuoteText({
  text,
  highlight,
  uncertain,
  className = '',
}: {
  text: string
  highlight?: string
  uncertain?: string[]
  className?: string
}) {
  const gu = isGujarati(text)
  const terms = highlight?.trim().split(/\s+/).filter(Boolean) ?? []
  const re = terms.length ? new RegExp(`(${terms.map(escapeRe).join('|')})`, 'giu') : null
  const unsure = new Set(uncertain ?? [])

  const renderPara = (p: string) => {
    if (re) return p.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part))
    if (unsure.size)
      return p.split(/(\s+)/).map((tok, i) =>
        unsure.has(bare(tok)) ? (
          <span key={i} className="unsure">
            {tok}
          </span>
        ) : (
          tok
        ),
      )
    return p
  }

  return (
    <div className={`quote-text ${gu ? 'gu' : ''} ${className}`} lang={gu ? 'gu' : 'en'}>
      {text.split(/\n{2,}/).map((p, i) => (
        <p key={i}>{renderPara(p)}</p>
      ))}
    </div>
  )
}

export function attribution(book?: Book, page?: string) {
  return [book?.title, book?.author, page && `p. ${page}`].filter(Boolean).join(' · ')
}

/** A quote in a list, styled like an Apple Books highlight. */
export function QuoteCard({
  quote,
  book,
  showBook = true,
  highlight,
  fresh,
}: {
  quote: Quote
  book?: Book
  showBook?: boolean
  highlight?: string
  fresh?: boolean
}) {
  const meta = showBook ? attribution(book, quote.page) : quote.page ? `p. ${quote.page}` : ''
  return (
    <a className={`quote-card ${fresh ? 'fresh' : ''}`} href={`#/quote/${quote.id}`}>
      <QuoteText text={quote.text} highlight={highlight} className="clamp" />
      {quote.note && <p className="quote-card-note">{quote.note}</p>}
      {(meta || quote.tags.length > 0) && (
        <div className="quote-card-meta">
          {meta && <span>{meta}</span>}
          {quote.tags.map((t) => (
            <span key={t} className="tag">
              #{t}
            </span>
          ))}
        </div>
      )}
    </a>
  )
}

/* ───────────── Controls ───────────── */

export const LANGS: { value: Lang; label: string }[] = [
  { value: 'eng', label: 'English' },
  { value: 'guj', label: 'ગુજરાતી' },
]

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className = '',
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  className?: string
}) {
  const i = Math.max(0, options.findIndex((o) => o.value === value))
  return (
    <div className={`segmented ${className}`} role="radiogroup" style={{ ['--n' as string]: options.length, ['--i' as string]: i }}>
      <span className="segmented-thumb" />
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Group({ header, footer, children }: { header?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="group">
      {header && <h3 className="group-header">{header}</h3>}
      <div className="group-body">{children}</div>
      {footer && <p className="group-footer">{footer}</p>}
    </section>
  )
}

export function Row({
  icon,
  label,
  value,
  placeholder,
  onClick,
  href,
  chevron,
  destructive,
  tint,
  children,
}: {
  icon?: IconName
  label?: ReactNode
  value?: ReactNode
  placeholder?: string
  onClick?: () => void
  href?: string
  chevron?: boolean
  destructive?: boolean
  tint?: boolean
  children?: ReactNode
}) {
  const cls = `row ${destructive ? 'destructive' : ''} ${tint ? 'tint' : ''} ${onClick || href ? 'tappable' : ''}`
  const body = (
    <>
      {icon && (
        <span className="row-icon" data-icon={icon}>
          <Icon name={icon} size={19} />
        </span>
      )}
      {label && <span className="row-label">{label}</span>}
      {children}
      {(value || placeholder) && <span className={`row-value ${value ? '' : 'placeholder'}`}>{value || placeholder}</span>}
      {chevron && <span className="chevron">›</span>}
    </>
  )
  if (href)
    return (
      <a className={cls} href={href}>
        {body}
      </a>
    )
  if (onClick)
    return (
      <button type="button" className={cls} onClick={onClick}>
        {body}
      </button>
    )
  return <div className={cls}>{body}</div>
}

/* ───────────── Sheet ───────────── */

export function Sheet({
  open,
  onClose,
  title,
  leading,
  trailing,
  children,
  tall,
}: {
  open: boolean
  onClose: () => void
  title?: string
  leading?: ReactNode
  trailing?: ReactNode
  children: ReactNode
  tall?: boolean
}) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  useLayoutEffect(() => {
    if (open) {
      setMounted(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
    } else {
      setShown(false)
      const t = setTimeout(() => setMounted(false), 380)
      return () => clearTimeout(t)
    }
  }, [open])
  if (!mounted) return null
  return createPortal(
    <div className={`sheet-root ${shown ? 'shown' : ''}`}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className={`sheet glass-sheet ${tall ? 'tall' : ''}`} role="dialog" aria-modal>
        <div className="sheet-grabber" />
        {(title || leading || trailing) && (
          <div className="sheet-nav">
            <div className="navbar-side">{leading}</div>
            <div className="sheet-title">{title}</div>
            <div className="navbar-side end">{trailing}</div>
          </div>
        )}
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

/* ───────────── Book picker ───────────── */

export function BookPicker({
  store,
  open,
  selected,
  onClose,
  onPick,
}: {
  store: Store
  open: boolean
  selected?: string
  onClose: () => void
  onPick: (bookId: string | undefined) => void
}) {
  const [query, setQuery] = useState('')
  const [author, setAuthor] = useState('')
  useEffect(() => {
    if (open) setQuery(''), setAuthor('')
  }, [open])

  // Most recently quoted first: the book you're reading floats to the top.
  const recent = useMemo(() => {
    const last = new Map<string, number>()
    for (const q of store.quotes) if (q.bookId) last.set(q.bookId, Math.max(last.get(q.bookId) ?? 0, q.createdAt))
    return [...store.books].sort((a, b) => (last.get(b.id) ?? b.createdAt) - (last.get(a.id) ?? a.createdAt))
  }, [store.books, store.quotes])

  const q = query.trim().toLocaleLowerCase()
  const matches = q ? recent.filter((b) => `${b.title} ${b.author}`.toLocaleLowerCase().includes(q)) : recent
  const exact = recent.some((b) => b.title.toLocaleLowerCase() === q)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Book"
      tall
      leading={<GlassButton icon="close" onClick={onClose} ariaLabel="Close" />}
    >
      <div className="search-field">
        <Icon name="search" size={17} />
        <input
          placeholder="Search or add a book"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          enterKeyHint="done"
        />
      </div>
      {q && !exact && (
        <Group>
          <div className="row new-book">
            <span className="row-icon tint">
              <Icon name="book" size={19} />
            </span>
            <div className="new-book-fields">
              <strong>{query.trim()}</strong>
              <input placeholder="Author (optional)" value={author} onChange={(e) => setAuthor(e.target.value)} />
            </div>
            <button
              className="pill small"
              onClick={async () => {
                const book = await store.saveBook(query, author)
                onPick(book.id)
                onClose()
              }}
            >
              Add
            </button>
          </div>
        </Group>
      )}
      <Group>
        <Row
          label={<span className="muted">No book</span>}
          onClick={() => {
            onPick(undefined)
            onClose()
          }}
        >
          {!selected && <Icon name="check" size={18} />}
        </Row>
        {matches.map((b) => (
          <Row
            key={b.id}
            label={
              <span className="book-row">
                <BookCover book={b} size="mini" />
                <span>
                  <span className="book-row-title">{b.title}</span>
                  {b.author && <span className="book-row-author">{b.author}</span>}
                </span>
              </span>
            }
            onClick={() => {
              onPick(b.id)
              onClose()
            }}
          >
            {selected === b.id && <Icon name="check" size={18} />}
          </Row>
        ))}
      </Group>
    </Sheet>
  )
}

/* ───────────── Covers ───────────── */

const CLOTH = ['#8E3B2F', '#2F5D50', '#2B3F66', '#B7802F', '#5B4E7A', '#6F7451', '#A15C45', '#2F6670', '#3D3B38', '#7D2E4B']

function hash(s: string) {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}

export const coverColor = (b: Book) => CLOTH[hash(b.id + b.title) % CLOTH.length]

/** A generated cloth-bound cover, so every book looks like a book. */
export function BookCover({ book, size = 'grid' }: { book: Book; size?: 'grid' | 'large' | 'mini' }) {
  const gu = isGujarati(book.title)
  return (
    <div className={`cover ${size}`} style={{ ['--cloth' as string]: coverColor(book) }}>
      {size !== 'mini' && (
        <>
          <span className={`cover-title ${gu ? 'gu' : ''}`}>{book.title}</span>
          <span className="cover-rule" />
          {book.author && <span className="cover-author">{book.author}</span>}
        </>
      )}
    </div>
  )
}

/* ───────────── Editing a saved quote ───────────── */

/** The quote, typeset; tap to edit. Saves on blur. */
export function EditableQuote({
  store,
  quote,
  uncertain,
  large,
}: {
  store: Store
  quote: Quote
  uncertain?: string[]
  large?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(quote.text)
  const [edited, setEdited] = useState(false)
  const ta = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ta.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft, editing])

  const commit = async () => {
    setEditing(false)
    const text = tidy(draft)
    setDraft(text)
    if (text && text !== quote.text) {
      setEdited(true)
      await store.updateQuote(quote, { text })
    }
  }

  if (editing)
    return (
      <textarea
        ref={ta}
        className={`quote-text quote-editor ${large ? 'large' : ''} ${isGujarati(draft) ? 'gu' : ''}`}
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
      />
    )
  return (
    <button type="button" className="editable" onClick={() => setEditing(true)} aria-label="Edit text">
      <QuoteText text={quote.text} uncertain={edited ? undefined : uncertain} className={large ? 'large' : ''} />
    </button>
  )
}

/** Book · page · tags · note, as an inset grouped list. Everything optional, saved instantly. */
export function QuoteDetails({ store, quote }: { store: Store; quote: Quote }) {
  const [picker, setPicker] = useState(false)
  const book = quote.bookId ? store.bookMap.get(quote.bookId) : undefined
  const [page, setPage] = useState(quote.page ?? '')
  const [tags, setTags] = useState(quote.tags.join(', '))
  const [note, setNote] = useState(quote.note ?? '')
  useEffect(() => {
    setPage(quote.page ?? '')
    setTags(quote.tags.join(', '))
    setNote(quote.note ?? '')
  }, [quote.id])

  const save = (patch: Partial<Quote>) => store.updateQuote(quote, patch)

  return (
    <>
      <Group>
        <Row icon="book" label="Book" value={book?.title} placeholder="None" chevron onClick={() => setPicker(true)} />
        <Row icon="page" label="Page">
          <input
            className="row-input"
            inputMode="numeric"
            placeholder="—"
            value={page}
            onChange={(e) => setPage(e.target.value)}
            onBlur={() => page.trim() !== (quote.page ?? '') && save({ page: page.trim() || undefined })}
          />
        </Row>
        <Row icon="tag" label="Tags">
          <input
            className="row-input"
            placeholder="love, courage"
            value={tags}
            autoCapitalize="off"
            onChange={(e) => setTags(e.target.value)}
            onBlur={() => {
              const next = parseTags(tags)
              if (next.join() !== quote.tags.join()) save({ tags: next })
            }}
          />
        </Row>
      </Group>
      <Group>
        <div className="row note-row">
          <span className="row-icon" data-icon="note">
            <Icon name="note" size={19} />
          </span>
          <textarea
            className="note-input"
            rows={2}
            placeholder="Add a note — why did this stay with you?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note.trim() !== (quote.note ?? '') && save({ note: note.trim() || undefined })}
          />
        </div>
      </Group>
      <BookPicker
        store={store}
        open={picker}
        selected={quote.bookId}
        onClose={() => setPicker(false)}
        onPick={(bookId) => save({ bookId })}
      />
    </>
  )
}
