import { useState } from 'react'
import type { Store } from './store'
import type { Book, Lang, Quote } from './types'
import { parseTags } from './util'

export const go = (path: string) => {
  location.hash = path
}

export function QuoteCard({ quote, book, showBook = true }: { quote: Quote; book?: Book; showBook?: boolean }) {
  return (
    <a className="quote-card" href={`#/quote/${quote.id}`}>
      <blockquote>{quote.text}</blockquote>
      <div className="quote-meta">
        {showBook && book && (
          <span className="quote-book">
            {book.title}
            {book.author && <span className="muted"> · {book.author}</span>}
          </span>
        )}
        {quote.page && <span className="muted">p. {quote.page}</span>}
      </div>
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
    </a>
  )
}

export const LANGS: { value: Lang; label: string }[] = [
  { value: 'eng', label: 'English' },
  { value: 'guj', label: 'ગુજરાતી' },
  { value: 'eng+guj', label: 'Both' },
]

export function LangPicker({ value, onChange }: { value: Lang; onChange: (l: Lang) => void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label="Language">
      {LANGS.map((l) => (
        <button
          key={l.value}
          type="button"
          role="radio"
          aria-checked={value === l.value}
          className={value === l.value ? 'on' : ''}
          onClick={() => onChange(l.value)}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}

const NEW_BOOK = '__new__'

interface FormProps {
  store: Store
  initial?: Quote
  initialText?: string
  lang: Lang
  onLangChange?: (l: Lang) => void
  onSaved: (q: Quote) => void
  children?: React.ReactNode
}

/** Shared by capture review, manual add, and edit. */
export function QuoteForm({ store, initial, initialText = '', lang, onLangChange, onSaved, children }: FormProps) {
  const lastBook = localStorage.getItem('commonplace.lastBook')
  const defaultBook =
    initial?.bookId ?? (store.books.some((b) => b.id === lastBook) ? lastBook! : store.books[0]?.id ?? NEW_BOOK)
  const [text, setText] = useState(initial?.text ?? initialText)
  const [bookId, setBookId] = useState(defaultBook)
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [page, setPage] = useState(initial?.page ?? '')
  const [tags, setTags] = useState(initial?.tags.join(', ') ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [saving, setSaving] = useState(false)

  const isNew = bookId === NEW_BOOK
  const canSave = text.trim() && (!isNew || title.trim()) && !saving

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    setSaving(true)
    const book = isNew ? await store.saveBook(title, author) : null
    const q = await store.saveQuote({
      id: initial?.id,
      createdAt: initial?.createdAt,
      bookId: book?.id ?? bookId,
      text: text.trim(),
      page: page.trim() || undefined,
      tags: parseTags(tags),
      note: note.trim() || undefined,
      lang,
    })
    onSaved(q)
  }

  return (
    <form className="quote-form" onSubmit={submit}>
      {children}
      <label>
        <span>Quote</span>
        <textarea className="quote-text" value={text} onChange={(e) => setText(e.target.value)} rows={6} required />
      </label>
      {onLangChange && (
        <label>
          <span>Language</span>
          <LangPicker value={lang} onChange={onLangChange} />
        </label>
      )}
      <label>
        <span>Book</span>
        <select value={bookId} onChange={(e) => setBookId(e.target.value)}>
          {store.books.map((b: Book) => (
            <option key={b.id} value={b.id}>
              {b.title}
              {b.author ? ` — ${b.author}` : ''}
            </option>
          ))}
          <option value={NEW_BOOK}>+ New book…</option>
        </select>
      </label>
      {isNew && (
        <div className="row">
          <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus={!!text} />
          <input placeholder="Author" value={author} onChange={(e) => setAuthor(e.target.value)} />
        </div>
      )}
      <div className="row">
        <label className="narrow">
          <span>Page</span>
          <input inputMode="numeric" value={page} onChange={(e) => setPage(e.target.value)} />
        </label>
        <label>
          <span>Tags</span>
          <input placeholder="love, courage" value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
      </div>
      <label>
        <span>Note</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Why it stayed with you…" />
      </label>
      <button className="primary" disabled={!canSave}>
        {saving ? 'Saving…' : 'Save quote'}
      </button>
    </form>
  )
}
