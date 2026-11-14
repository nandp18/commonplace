import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { deleteBooks, deleteQuotes, loadAll, newId, putBooks, putQuotes } from './db'
import { planImport, type ImportFile, type ImportPlan } from './importFile'
import { isSample, sampleLibrary } from './samples'
import { explainSyncError, loadSyncConfig, sync } from './sync'
import type { Book, Collection, Quote } from './types'

const LAST_BOOK = 'commonplace.lastBook'
const LAST_SYNC = 'commonplace.lastSync'
/** After a failure worth retrying, wait this long before each next try. */
const RETRY_AFTER = [30_000, 120_000, 600_000, 1_800_000]

/** The book you're probably still reading: new captures are filed under it. */
export const currentBookId = () => localStorage.getItem(LAST_BOOK) ?? undefined

/** What you fill in for a book; the rest is bookkeeping. */
export type BookDraft = Pick<Book, 'title' | 'author'> & Partial<Pick<Book, 'cover' | 'isbn' | 'publisher' | 'year'>>

/** Trimmed, with empty optional fields left out rather than stored as "". */
function tidyBook(d: BookDraft): BookDraft {
  const opt = (v?: string) => v?.trim() || undefined
  return compact({
    title: d.title.trim(),
    author: d.author.split(',').map((a) => a.trim()).filter(Boolean).join(', '),
    cover: opt(d.cover),
    isbn: opt(d.isbn),
    publisher: opt(d.publisher),
    year: opt(d.year),
  })
}

const compact = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T

export type SyncState =
  | { kind: 'off' }
  | { kind: 'syncing' }
  | { kind: 'ok'; at: number }
  | { kind: 'offline' }
  | { kind: 'error'; message: string; retry: boolean }

export function useStore() {
  const [all, setAll] = useState<Collection>({ version: 1, books: [], quotes: [] })
  const [ready, setReady] = useState(false)
  const [syncState, setSyncState] = useState<SyncState>(() =>
    loadSyncConfig() ? { kind: 'syncing' } : { kind: 'off' },
  )
  /** When the last sync that finished started: anything changed after it isn't on GitHub yet. */
  const [lastSync, setLastSync] = useState(() => Number(localStorage.getItem(LAST_SYNC)) || 0)
  const syncTimer = useRef<number | undefined>(undefined)
  const retryTimer = useRef<number | undefined>(undefined)
  const failures = useRef(0)
  const syncing = useRef(false)
  /** A sync was asked for while one was running: run again when it ends, so that change isn't left behind. */
  const again = useRef(false)
  const latest = useRef(all)
  latest.current = all

  const runSync = useCallback(async () => {
    const cfg = loadSyncConfig()
    clearTimeout(retryTimer.current)
    if (!cfg) return setSyncState({ kind: 'off' })
    if (syncing.current) return void (again.current = true)
    if (!navigator.onLine) return setSyncState({ kind: 'offline' })
    syncing.current = true
    setSyncState({ kind: 'syncing' })
    const started = Date.now()
    try {
      // Sample quotes are for trying the app out; they never leave the device.
      const local = await loadAll()
      const merged = await sync(cfg, {
        ...local,
        books: local.books.filter((b) => !isSample(b.id)),
        quotes: local.quotes.filter((q) => !isSample(q.id)),
      })
      await putBooks(merged.books)
      await putQuotes(merged.quotes)
      setAll(await loadAll())
      localStorage.setItem(LAST_SYNC, String(started))
      setLastSync(started)
      failures.current = 0
      setSyncState({ kind: 'ok', at: Date.now() })
    } catch (e) {
      const problem = explainSyncError(e, cfg, navigator.onLine)
      setSyncState(problem.offline ? { kind: 'offline' } : { kind: 'error', message: problem.message, retry: problem.retry })
      if (problem.retry && !problem.offline) {
        const wait = RETRY_AFTER[Math.min(failures.current++, RETRY_AFTER.length - 1)]
        retryTimer.current = window.setTimeout(() => runSync(), wait)
      }
    } finally {
      syncing.current = false
      if (again.current) {
        again.current = false
        runSync()
      }
    }
  }, [])

  const scheduleSync = useCallback(() => {
    clearTimeout(syncTimer.current)
    syncTimer.current = window.setTimeout(runSync, 1500)
  }, [runSync])

  useEffect(() => {
    loadAll().then((c) => {
      setAll(c)
      setReady(true)
      runSync()
    })
    const onVisible = () => document.visibilityState === 'visible' && runSync()
    const onOnline = () => runSync()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [runSync])

  // Ask the browser not to clear this library when it's short on space or the app sits unused.
  const hasQuotes = all.quotes.length > 0
  useEffect(() => {
    if (hasQuotes) navigator.storage?.persist?.().catch(() => {})
  }, [hasQuotes])

  const books = useMemo(
    () => all.books.filter((b) => !b.deleted).sort((a, b) => a.title.localeCompare(b.title)),
    [all.books],
  )
  const bookMap = useMemo(() => new Map(all.books.map((b) => [b.id, b])), [all.books])
  const quotes = useMemo(
    () => all.quotes.filter((q) => !q.deleted).sort((a, b) => b.createdAt - a.createdAt),
    [all.quotes],
  )

  const saveBook = useCallback(
    async (draft: BookDraft): Promise<Book> => {
      const now = Date.now()
      const book: Book = { ...tidyBook(draft), id: newId(), createdAt: now, updatedAt: now }
      await putBooks([book])
      setAll((c) => ({ ...c, books: [...c.books, book] }))
      scheduleSync()
      return book
    },
    [scheduleSync],
  )

  const updateBook = useCallback(
    async (book: Book) => {
      const next: Book = compact({ ...book, cover: undefined, isbn: undefined, publisher: undefined, year: undefined, ...tidyBook(book), updatedAt: Date.now() })
      await putBooks([next])
      setAll((c) => ({ ...c, books: c.books.map((b) => (b.id === next.id ? next : b)) }))
      scheduleSync()
    },
    [scheduleSync],
  )

  /** Small changes to many books at once, each onto its newest copy (a cover search finishing). */
  const patchBooks = useCallback(
    async (patches: { book: Book; patch: Partial<Book> }[]) => {
      if (!patches.length) return
      const now = Date.now()
      const next = patches.map(({ book, patch }) => ({ ...(latest.current.books.find((b) => b.id === book.id) ?? book), ...patch, updatedAt: now }))
      const byId = new Map(next.map((b) => [b.id, b]))
      latest.current = { ...latest.current, books: latest.current.books.map((b) => byId.get(b.id) ?? b) }
      await putBooks(next)
      setAll((c) => ({ ...c, books: c.books.map((b) => byId.get(b.id) ?? b) }))
      scheduleSync()
    },
    [scheduleSync],
  )

  const saveQuote = useCallback(
    async (q: Omit<Quote, 'id' | 'createdAt' | 'updatedAt'> & Partial<Pick<Quote, 'id' | 'createdAt'>>) => {
      const now = Date.now()
      const quote: Quote = { ...q, id: q.id ?? newId(), createdAt: q.createdAt ?? now, updatedAt: now }
      await putQuotes([quote])
      setAll((c) => ({ ...c, quotes: [...c.quotes.filter((x) => x.id !== quote.id), quote] }))
      if (quote.bookId) localStorage.setItem(LAST_BOOK, quote.bookId)
      scheduleSync()
      return quote
    },
    [scheduleSync],
  )

  const updateQuote = useCallback(
    async (q: Quote, patch: Partial<Quote>) => {
      // Merge onto the newest copy, so quick successive edits don't clobber each other.
      const base = latest.current.quotes.find((x) => x.id === q.id) ?? q
      const next: Quote = { ...base, ...patch, updatedAt: Date.now() }
      latest.current = { ...latest.current, quotes: latest.current.quotes.map((x) => (x.id === q.id ? next : x)) }
      await putQuotes([next])
      setAll((c) => ({ ...c, quotes: c.quotes.map((x) => (x.id === q.id ? next : x)) }))
      if ('bookId' in patch) {
        if (patch.bookId) localStorage.setItem(LAST_BOOK, patch.bookId)
        else localStorage.removeItem(LAST_BOOK)
      }
      scheduleSync()
      return next
    },
    [scheduleSync],
  )

  const deleteQuote = useCallback(
    async (q: Quote) => {
      const tomb: Quote = { ...q, deleted: true, updatedAt: Date.now() }
      await putQuotes([tomb])
      setAll((c) => ({ ...c, quotes: c.quotes.map((x) => (x.id === q.id ? tomb : x)) }))
      scheduleSync()
    },
    [scheduleSync],
  )

  const loadSamples = useCallback(async () => {
    const { books, quotes } = sampleLibrary()
    await putBooks(books)
    await putQuotes(quotes)
    setAll(await loadAll())
  }, [])

  const removeSamples = useCallback(async () => {
    const c = await loadAll()
    await deleteBooks(c.books.filter((b) => isSample(b.id)).map((b) => b.id))
    await deleteQuotes(c.quotes.filter((q) => isSample(q.id)).map((q) => q.id))
    if (isSample(localStorage.getItem(LAST_BOOK) ?? '')) localStorage.removeItem(LAST_BOOK)
    setAll(await loadAll())
  }, [])

  const previewImport = useCallback(async (file: ImportFile) => {
    const c = await loadAll()
    // Samples are throwaway: a real quote shouldn't count as a duplicate of one.
    return planImport(
      file,
      { ...c, books: c.books.filter((b) => !isSample(b.id)), quotes: c.quotes.filter((q) => !isSample(q.id)) },
      Date.now(),
    )
  }, [])

  const applyImport = useCallback(
    async (plan: ImportPlan) => {
      await putBooks(plan.books)
      await putQuotes(plan.quotes)
      setAll(await loadAll())
      scheduleSync()
    },
    [scheduleSync],
  )

  const hasSamples = useMemo(() => all.quotes.some((q) => isSample(q.id)), [all.quotes])

  /** Quotes and books changed on this device since the last sync, so not on GitHub yet. */
  const unsynced = useMemo(
    () => [...all.quotes, ...all.books].filter((r) => r.updatedAt > lastSync && !isSample(r.id)).length,
    [all, lastSync],
  )

  return {
    ready, books, bookMap, quotes, saveBook, updateBook, patchBooks, saveQuote, updateQuote, deleteQuote,
    syncState, runSync, unsynced, lastSync, loadSamples, removeSamples, hasSamples, previewImport, applyImport,
  }
}

export type Store = ReturnType<typeof useStore>
