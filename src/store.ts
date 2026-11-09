import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadAll, newId, putBooks, putQuotes } from './db'
import { loadSyncConfig, sync } from './sync'
import type { Book, Collection, Quote } from './types'

export type SyncState =
  | { kind: 'off' }
  | { kind: 'syncing' }
  | { kind: 'ok'; at: number }
  | { kind: 'error'; message: string }

export function useStore() {
  const [all, setAll] = useState<Collection>({ version: 1, books: [], quotes: [] })
  const [ready, setReady] = useState(false)
  const [syncState, setSyncState] = useState<SyncState>(() =>
    loadSyncConfig() ? { kind: 'syncing' } : { kind: 'off' },
  )
  const syncTimer = useRef<number | undefined>(undefined)
  const syncing = useRef(false)

  const runSync = useCallback(async () => {
    const cfg = loadSyncConfig()
    if (!cfg) return setSyncState({ kind: 'off' })
    if (syncing.current) return
    syncing.current = true
    setSyncState({ kind: 'syncing' })
    try {
      const merged = await sync(cfg, await loadAll())
      await putBooks(merged.books)
      await putQuotes(merged.quotes)
      setAll(await loadAll())
      setSyncState({ kind: 'ok', at: Date.now() })
    } catch (e) {
      setSyncState({ kind: 'error', message: (e as Error).message })
    } finally {
      syncing.current = false
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
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [runSync])

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
    async (title: string, author: string): Promise<Book> => {
      const now = Date.now()
      const book: Book = { id: newId(), title: title.trim(), author: author.trim(), createdAt: now, updatedAt: now }
      await putBooks([book])
      setAll((c) => ({ ...c, books: [...c.books, book] }))
      scheduleSync()
      return book
    },
    [scheduleSync],
  )

  const updateBook = useCallback(
    async (book: Book) => {
      const next = { ...book, updatedAt: Date.now() }
      await putBooks([next])
      setAll((c) => ({ ...c, books: c.books.map((b) => (b.id === next.id ? next : b)) }))
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
      localStorage.setItem('commonplace.lastBook', quote.bookId)
      scheduleSync()
      return quote
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

  return { ready, books, bookMap, quotes, saveBook, updateBook, saveQuote, deleteQuote, syncState, runSync }
}

export type Store = ReturnType<typeof useStore>
