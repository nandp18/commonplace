import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { bare, isGujarati, tidy } from './format'
import { transliterate } from './transliterate'
import { Icon, type IconName } from './icons'
import { haptic, markTransition, morphName, useReveal } from './motion'
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
  animate,
  className = '',
}: {
  className?: string
  icon?: IconName
  label?: string
  animate?: boolean
  prominent?: boolean
  destructive?: boolean
  href?: string
  onClick?: () => void
  disabled?: boolean
  ariaLabel?: string
}) {
  const cls = `glass-button glass ${label ? 'capsule' : 'circle'} ${prominent ? 'prominent-glass' : ''} ${destructive ? 'destructive' : ''} ${className}`
  const body = (
    <>
      {icon && <Icon name={icon} size={label ? 18 : 21} animate={animate} />}
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
    <button
      type="button"
      className={cls}
      onClick={() => {
        haptic('tap')
        onClick?.()
      }}
      disabled={disabled}
      aria-label={ariaLabel ?? label}
    >
      {body}
    </button>
  )
}

/** Several bar buttons sharing one piece of glass, as iOS 26 groups them. */
export function GlassGroup({ children }: { children: ReactNode }) {
  return <div className="glass-group glass">{children}</div>
}

/**
 * iOS 26 page: transparent navigation bar, centered title, floating glass buttons.
 * Content scrolls under a soft blur that fades in at the top edge.
 */
export function Page({
  title,
  back,
  leading,
  trailing,
  children,
}: {
  title: string
  back?: string
  leading?: ReactNode
  trailing?: ReactNode
  children: ReactNode
}) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])

  return (
    <div className="page">
      <header className={`navbar ${scrolled ? 'scrolled' : ''}`}>
        <div className="navbar-side">{back ? <GlassButton icon="back" href={back} ariaLabel="Back" /> : leading}</div>
        <div className="navbar-title">{title}</div>
        <div className="navbar-side end">{trailing}</div>
      </header>
      <div className="page-body">{children}</div>
    </div>
  )
}

/** One tap from anywhere to capture. Offers your photo library too, unless `camera` is set. */
export function CaptureButton({ className = '', children, camera = false }: { className?: string; children: ReactNode; camera?: boolean }) {
  return (
    <label className={className}>
      {children}
      <input
        type="file"
        accept="image/*"
        {...(camera ? { capture: 'environment' as const } : {})}
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
  marks = true,
  morph,
  reveal,
}: {
  text: string
  highlight?: string
  uncertain?: string[]
  className?: string
  /** view-transition-name, when this text is morphing between screens. */
  morph?: string
  /** Fade the words in one after another. */
  reveal?: boolean
  /** Wrap in quotation marks, the opening one hung in the margin in gold. */
  marks?: boolean
}) {
  const gu = isGujarati(text)
  // Don't double up if the passage already opens with its own quotation mark.
  const quoted = marks && !/^[“‘"'…]/.test(text)
  const terms = highlight?.trim().split(/\s+/).filter(Boolean) ?? []
  const re = terms.length ? new RegExp(`(${terms.map(escapeRe).join('|')})`, 'giu') : null
  const unsure = new Set(uncertain ?? [])

  let w = 0
  const renderPara = (p: string) => {
    if (reveal)
      return p.split(/(\s+)/).map((tok, i) =>
        /^\s+$/.test(tok) ? (
          tok
        ) : (
          <span key={i} className={`w ${unsure.has(bare(tok)) ? 'unsure' : ''}`} style={{ ['--w' as string]: Math.min(w++, 40) }}>
            {tok}
          </span>
        ),
      )
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
    <>
      <div
        className={`quote-text ${gu ? 'gu' : ''} ${quoted ? 'quoted' : ''} ${reveal ? 'revealing' : ''} ${className}`}
        lang={gu ? 'gu' : 'en'}
        style={morph ? ({ viewTransitionName: morph } as React.CSSProperties) : undefined}
      >
        {text.split(/\n{2,}/).map((p, i) => (
          <p key={i}>{renderPara(p)}</p>
        ))}
      </div>
      {gu && (
        <div className={`translit ${className.includes('clamp') ? 'clamp' : ''}`} lang="gu-Latn">
          {transliterate(text)}
        </div>
      )}
    </>
  )
}

export function attribution(book?: Book, page?: string) {
  return [book?.title, book?.author, page && `p. ${page}`].filter(Boolean).join(' · ')
}

/** A quote in a list: the passage, then a quiet line of where it came from. */
export function QuoteCard({
  quote,
  book,
  showBook = true,
  highlight,
  fresh,
  index = 0,
  source = 'list',
}: {
  quote: Quote
  book?: Book
  showBook?: boolean
  highlight?: string
  fresh?: boolean
  /** Position in the list, for a staggered entrance. */
  index?: number
  source?: string
}) {
  const ref = useReveal<HTMLAnchorElement>()
  return (
    <a
      ref={ref}
      className={`quote-card reveal ${fresh ? 'fresh' : ''}`}
      style={{ ['--d' as string]: `${Math.min(index, 8) * 45}ms` }}
      href={`#/quote/${quote.id}`}
      onClick={(e) => {
        markTransition('quote', quote.id, source)
        e.currentTarget.querySelector<HTMLElement>('.quote-text')?.style.setProperty('view-transition-name', 'morph-quote')
      }}
    >
      <QuoteText text={quote.text} highlight={highlight} className="clamp" morph={morphName('quote', quote.id, source)} />
      {quote.note && <p className="quote-card-note">{quote.note}</p>}
      <div className="quote-card-meta">
        {showBook && book && <span className="meta-book">{book.title}</span>}
        {quote.page && <span className="meta-mono">p.{quote.page}</span>}
        {quote.tags.map((t) => (
          <span key={t} className="meta-mono">
            #{t}
          </span>
        ))}
        {!book && showBook && !quote.page && <span className="meta-mono">loose page</span>}
      </div>
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
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
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
  const sheet = useRef<HTMLDivElement>(null)
  const pull = useRef<{ y: number; dy: number } | null>(null)

  // Drag the top of the sheet down to dismiss it.
  const dragHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button, a, input, textarea, label')) return
      pull.current = { y: e.clientY, dy: 0 }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove: (e: React.PointerEvent) => {
      const p = pull.current
      if (!p || !sheet.current) return
      p.dy = Math.max(0, e.clientY - p.y)
      // Resist a little, like a rubber band.
      sheet.current.style.transition = 'none'
      sheet.current.style.transform = `translateY(${p.dy * 0.9}px)`
    },
    onPointerUp: () => {
      const p = pull.current
      pull.current = null
      if (!p || !sheet.current) return
      sheet.current.style.transition = ''
      sheet.current.style.transform = ''
      if (p.dy > 110) {
        haptic('tap')
        onClose()
      }
    },
  }
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
      <div ref={sheet} className={`sheet glass-sheet ${tall ? 'tall' : ''}`} role="dialog" aria-modal>
        <div className="sheet-drag" {...dragHandlers}>
          <div className="sheet-grabber" />
        </div>
        {(title || leading || trailing) && (
          <div className="sheet-nav" {...dragHandlers}>
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

const CLOTH = ['#6f2f25', '#2f4a3b', '#23324f', '#8a6428', '#4b3a57', '#5a5b3e', '#24505a', '#2f2e2b', '#7f3e22']

function hash(s: string) {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}

export const coverColor = (b: Book) => CLOTH[hash(b.id + b.title) % CLOTH.length]

/** A generated cloth-bound cover, so every book looks like a book. */
export function BookCover({ book, size = 'grid', morph }: { book: Book; size?: 'grid' | 'large' | 'small' | 'mini'; morph?: string }) {
  const gu = isGujarati(book.title)
  // A dead or offline link falls back to the generated cover.
  const [failed, setFailed] = useState(false)
  const image = book.cover && !failed ? book.cover : undefined
  return (
    <div
      className={`cover ${size} ${image ? 'has-image' : ''}`}
      style={{ ['--cloth' as string]: coverColor(book), viewTransitionName: morph } as React.CSSProperties}
    >
      {image && <img className="cover-img" src={image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />}
      {!image && (size === 'grid' || size === 'large') && (
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
  morph,
  reveal,
}: {
  store: Store
  quote: Quote
  uncertain?: string[]
  large?: boolean
  morph?: string
  reveal?: boolean
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
      <QuoteText
        text={quote.text}
        uncertain={edited ? undefined : uncertain}
        className={large ? 'large' : ''}
        morph={morph}
        reveal={reveal && !edited}
      />
    </button>
  )
}

/**
 * Book · page · note · tags, laid out like a filing card. Everything optional, saved on blur.
 */
export function QuoteFields({ store, quote }: { store: Store; quote: Quote }) {
  const [picker, setPicker] = useState(false)
  const book = quote.bookId ? store.bookMap.get(quote.bookId) : undefined
  const [page, setPage] = useState(quote.page ?? '')
  const [tags, setTags] = useState(quote.tags.map((t) => `#${t}`).join(' '))
  const [note, setNote] = useState(quote.note ?? '')
  useEffect(() => {
    setPage(quote.page ?? '')
    setTags(quote.tags.map((t) => `#${t}`).join(' '))
    setNote(quote.note ?? '')
  }, [quote.id])

  const save = (patch: Partial<Quote>) => store.updateQuote(quote, patch)

  return (
    <div className="fields">
      <button type="button" className="field-line" onClick={() => setPicker(true)}>
        <span className="field-label">Book</span>
        {book ? (
          <span className="field-value">
            {book.title}
            {book.author && <span className="muted"> · {book.author}</span>}
          </span>
        ) : (
          <span className="field-value placeholder">Add a book</span>
        )}
      </button>
      <label className="field-line">
        <span className="field-label">p.</span>
        <input
          className="field-pill"
          inputMode="numeric"
          value={page}
          onChange={(e) => setPage(e.target.value)}
          onBlur={() => page.trim() !== (quote.page ?? '') && save({ page: page.trim() || undefined })}
        />
      </label>
      <textarea
        className="field-box"
        rows={1}
        placeholder="Why it landed (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note.trim() !== (quote.note ?? '') && save({ note: note.trim() || undefined })}
      />
      <input
        className="field-box"
        placeholder="#tags (optional)"
        value={tags}
        autoCapitalize="off"
        onChange={(e) => setTags(e.target.value)}
        onBlur={() => {
          const next = parseTags(tags.replace(/\s+/g, ','))
          if (next.join() !== quote.tags.join()) save({ tags: next })
        }}
      />
      <BookPicker
        store={store}
        open={picker}
        selected={quote.bookId}
        onClose={() => setPicker(false)}
        onPick={(bookId) => save({ bookId })}
      />
    </div>
  )
}
