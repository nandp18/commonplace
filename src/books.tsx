import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BookCover, go, Page } from './components'
import { fetchCover, removeLocalCover, saveLocalCover, shrink } from './covers'
import { Icon } from './icons'
import { formatIsbn, lookupIsbn, toIsbn13 } from './isbn'
import { haptic } from './motion'
import { getDetector, readIsbn } from './scan'
import type { Store } from './store'
import type { Book } from './types'
import './books.css'

/* ───────────── Barcode scanner ───────────── */

/**
 * The camera, full screen, reading the barcode on a book's back cover.
 * Falls back to a photo of the barcode where live video isn't allowed (plain http, or
 * the camera refused), and you can always type the number instead.
 */
export function IsbnScanner({ onIsbn, onClose }: { onIsbn: (isbn: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [live, setLive] = useState<'starting' | 'on' | 'off'>('starting')
  const [hint, setHint] = useState('Line up the barcode on the back cover')
  const [typed, setTyped] = useState('')
  const [typing, setTyping] = useState(false)
  const done = useRef(onIsbn)
  done.current = onIsbn

  useEffect(() => {
    let stopped = false
    let stream: MediaStream | null = null
    let timer = 0
    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('No camera here')
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        if (stopped) return stream.getTracks().forEach((t) => t.stop())
        const v = video.current!
        v.srcObject = stream
        await v.play()
        setLive('on')
        await getDetector()
        const tick = async () => {
          if (stopped) return
          if (v.readyState >= 2 && v.videoWidth) {
            try {
              const r = await readIsbn(v)
              if (stopped) return
              if (r.isbn) {
                stopped = true
                haptic('success')
                return done.current(r.isbn)
              }
              if (r.other) setHint('That barcode isn’t an ISBN — look for the one under “ISBN 978…”')
            } catch {}
          }
          timer = window.setTimeout(tick, 110)
        }
        tick()
      } catch {
        if (!stopped) setLive('off')
      }
    })()
    return () => {
      stopped = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const fromPhoto = async (file: File) => {
    setHint('Reading the barcode…')
    try {
      const bmp = await createImageBitmap(file)
      const r = await readIsbn(bmp)
      bmp.close()
      if (r.isbn) {
        haptic('success')
        return done.current(r.isbn)
      }
      setHint(r.other ? 'That barcode isn’t an ISBN. Try the one marked ISBN.' : 'No barcode found. Get closer, and keep it flat and sharp.')
    } catch {
      setHint('Couldn’t read that photo.')
    }
  }

  const typedIsbn = toIsbn13(typed)

  return createPortal(
    <div className="scanner" role="dialog" aria-modal aria-label="Scan a barcode">
      <video ref={video} className={`scanner-video ${live === 'on' ? 'on' : ''}`} playsInline muted />
      <div className="scanner-top">
        <button type="button" className="scanner-text-button" onClick={onClose}>
          Cancel
        </button>
        <span className="scanner-title">Scan ISBN</span>
        <span className="scanner-text-button" aria-hidden />
      </div>
      <div className="scanner-window" aria-hidden>
        <span className="scanner-corner tl" />
        <span className="scanner-corner tr" />
        <span className="scanner-corner bl" />
        <span className="scanner-corner br" />
        {live === 'on' && <span className="scanner-line" />}
        {live === 'off' && (
          <span className="scanner-off">
            <Icon name="barcode" size={44} />
          </span>
        )}
      </div>
      <div className="scanner-bottom">
        <p className="scanner-hint">
          {live === 'off' ? 'Live camera isn’t available here. Take a photo of the barcode instead.' : live === 'starting' ? 'Starting the camera…' : hint}
        </p>
        {typing ? (
          <form
            className="scanner-type"
            onSubmit={(e) => {
              e.preventDefault()
              if (typedIsbn) done.current(typedIsbn)
            }}
          >
            <input
              autoFocus
              inputMode="numeric"
              placeholder="978…"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              aria-label="ISBN"
            />
            <button className="pill" disabled={!typedIsbn}>
              Look up
            </button>
          </form>
        ) : (
          <div className="scanner-actions">
            <label className="scanner-chip">
              <Icon name="camera" size={18} /> {live === 'off' ? 'Take photo' : 'Use a photo'}
              <input
                type="file"
                accept="image/*"
                {...(live === 'off' ? { capture: 'environment' as const } : {})}
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) fromPhoto(f)
                }}
              />
            </label>
            <button type="button" className="scanner-chip" onClick={() => setTyping(true)}>
              <Icon name="note" size={18} /> Type ISBN
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/* ───────────── The book form ───────────── */

type Status =
  | { kind: 'idle' }
  | { kind: 'looking'; isbn: string }
  | { kind: 'found'; text: string }
  | { kind: 'none'; text: string }
  | { kind: 'dupe'; book: Book }

const fieldsOf = (b?: Book) => ({
  title: b?.title ?? '',
  author: b?.author ?? '',
  publisher: b?.publisher ?? '',
  year: b?.year ?? '',
  isbn: b?.isbn ?? '',
})

/**
 * Scan or type an ISBN, check what came back, fix anything, save.
 * Works for a new book and for filling in one already on the shelf.
 */
export function BookForm({
  store,
  book,
  initialTitle = '',
  scan = false,
  onSaved,
}: {
  store: Store
  book?: Book
  /** Prefilled when you started typing a title somewhere else. */
  initialTitle?: string
  /** Open the camera straight away. */
  scan?: boolean
  onSaved: (book: Book) => void
}) {
  const [f, setF] = useState(() => ({ ...fieldsOf(book), ...(book ? {} : { title: initialTitle }) }))
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }))
  /** The cover link that will be saved with the book. */
  const [cover, setCover] = useState(book?.cover)
  /** An image to show and keep now: a photo you took, or the downloaded link. */
  const [picture, setPicture] = useState<{ blob: Blob; url: string; src: string } | null>(null)
  /** You removed the cover: show cloth, and forget any saved image. */
  const [cleared, setCleared] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [scanning, setScanning] = useState(scan)
  const [saving, setSaving] = useState(false)
  const lookupRun = useRef(0)

  useEffect(() => () => void (picture && URL.revokeObjectURL(picture.url)), [picture])

  const lookup = async (isbn: string) => {
    const run = ++lookupRun.current
    setScanning(false)
    setF((x) => ({ ...x, isbn }))
    const dupe = store.books.find((b) => b.isbn === isbn && b.id !== book?.id)
    if (dupe) return setStatus({ kind: 'dupe', book: dupe })
    setStatus({ kind: 'looking', isbn })
    try {
      const info = await lookupIsbn(isbn)
      if (run !== lookupRun.current) return
      if (!info) return setStatus({ kind: 'none', text: `No record of ISBN ${formatIsbn(isbn)}. Fill it in below.` })
      haptic('success')
      // A new book takes what was found; a book you're editing only gets its blanks filled.
      const pick = (mine: string, found?: string) => (book ? mine.trim() || found || '' : found || mine)
      setF((x) => ({
        ...x,
        title: pick(x.title, info.title),
        author: pick(x.author, info.author),
        publisher: pick(x.publisher, info.publisher),
        year: pick(x.year, info.year),
      }))
      setStatus({ kind: 'found', text: `Found on ${info.source}. Check it over, then save.` })
      const keepMine = book && !cleared && (cover || picture)
      if (info.cover && !keepMine) {
        setCover(info.cover)
        setCleared(false)
        setPicture(null)
        const blob = await fetchCover(info.cover)
        if (blob && run === lookupRun.current) setPicture({ blob, url: URL.createObjectURL(blob), src: info.cover })
      }
    } catch (e) {
      if (run === lookupRun.current) setStatus({ kind: 'none', text: (e as Error).message })
    }
  }

  const typedIsbn = toIsbn13(f.isbn)
  const preview: Book = {
    ...(book ?? { id: 'draft', createdAt: 0, updatedAt: 0 }),
    title: f.title || 'Untitled',
    author: f.author,
    cover: cleared ? undefined : cover,
  }
  // Untouched: let the cover show as it does everywhere else.
  const previewSrc = picture ? picture.url : cleared ? null : !book || cover !== book.cover ? (cover ?? null) : undefined

  const save = async () => {
    if (!f.title.trim() || saving) return
    setSaving(true)
    const draft = {
      title: f.title,
      author: f.author,
      publisher: f.publisher,
      year: f.year,
      isbn: typedIsbn ?? f.isbn.replace(/[^0-9X]/gi, ''),
      cover: cleared ? undefined : cover,
    }
    let saved: Book
    if (book) {
      saved = { ...book, ...draft }
      await store.updateBook(saved)
    } else saved = await store.saveBook(draft)
    if (picture) await saveLocalCover(saved.id, picture.blob, picture.src)
    else if (cleared) await removeLocalCover(saved.id)
    haptic('success')
    onSaved(saved)
  }

  return (
    <div className="book-form">
      <div className="isbn-card">
        <button type="button" className="ink-button wide" onClick={() => setScanning(true)}>
          <Icon name="barcode" size={19} /> Scan barcode
        </button>
        <form
          className="isbn-row"
          onSubmit={(e) => {
            e.preventDefault()
            if (typedIsbn) lookup(typedIsbn)
          }}
        >
          <input
            className="field-input"
            inputMode="numeric"
            placeholder="or type the ISBN"
            value={f.isbn}
            onChange={set('isbn')}
            aria-label="ISBN"
          />
          <button className="pill" disabled={!typedIsbn || status.kind === 'looking'}>
            Look up
          </button>
        </form>
        {f.isbn.replace(/[^0-9X]/gi, '').length >= 10 && !typedIsbn && <p className="isbn-status bad">That number doesn’t check out as an ISBN.</p>}
        {status.kind === 'looking' && <p className="isbn-status looking">Looking up {formatIsbn(status.isbn)}…</p>}
        {(status.kind === 'found' || status.kind === 'none') && <p className={`isbn-status ${status.kind}`}>{status.text}</p>}
        {status.kind === 'dupe' && (
          <p className="isbn-status found">
            <strong>{status.book.title}</strong> is already on your shelf.{' '}
            <button type="button" className="link-button" onClick={() => onSaved(status.book)}>
              {book ? 'Open it' : 'Use it'}
            </button>
          </p>
        )}
      </div>

      <div className={`cover-edit ${status.kind === 'looking' ? 'looking' : ''}`}>
        <BookCover book={preview} size="large" src={previewSrc} />
        <div className="cover-edit-actions">
          <label className="text-button">
            {previewSrc === null || (!cover && !picture && !book?.cover) ? 'Photograph cover' : 'Replace with photo'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                const blob = await shrink(file)
                setPicture({ blob, url: URL.createObjectURL(blob), src: 'photo' })
                setCleared(false)
              }}
            />
          </label>
          {previewSrc !== null && (cover || picture || book?.cover) && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setPicture(null)
                setCover(undefined)
                setCleared(true)
              }}
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <div className="fields card book-fields">
        <label className="field-line">
          <span className="field-label">Title</span>
          <input className="field-input" value={f.title} onChange={set('title')} placeholder="Required" />
        </label>
        <label className="field-line">
          <span className="field-label">Authors</span>
          <input className="field-input" value={f.author} onChange={set('author')} placeholder="Comma between names" />
        </label>
        <label className="field-line">
          <span className="field-label">Publisher</span>
          <input className="field-input" value={f.publisher} onChange={set('publisher')} placeholder="—" />
        </label>
        <label className="field-line">
          <span className="field-label">Year</span>
          <input className="field-input" inputMode="numeric" value={f.year} onChange={set('year')} placeholder="—" />
        </label>
      </div>
      <button className="ink-button wide spaced" disabled={!f.title.trim() || saving} onClick={save}>
        {book ? 'Save' : 'Add to shelf'}
      </button>
      {scanning && <IsbnScanner onIsbn={lookup} onClose={() => setScanning(false)} />}
    </div>
  )
}

/** Books → +: a whole page for adding one. */
export function AddBook({ store, scan }: { store: Store; scan: boolean }) {
  return (
    <Page title="Add a book" back="#/books">
      <BookForm store={store} scan={scan} onSaved={(b) => go(`/book/${b.id}`)} />
    </Page>
  )
}

/** "Penguin · 1974 · ISBN 978 0141187761": the small print under a book's title. */
export function bookDetails(b: Book) {
  return [b.publisher, b.year, b.isbn && `ISBN ${formatIsbn(b.isbn)}`].filter(Boolean).join(' · ')
}
