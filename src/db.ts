import type { Book, Collection, Quote } from './types'

const DB_NAME = 'commonplace'
// Covers are kept apart from books: they're device-local images that never sync.
const STORES = ['books', 'quotes', 'covers'] as const
type StoreName = (typeof STORES)[number]

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2)
    req.onupgradeneeded = () => {
      for (const name of STORES) {
        if (!req.result.objectStoreNames.contains(name)) {
          req.result.createObjectStore(name, { keyPath: 'id' })
        }
      }
    }
    req.onsuccess = () => {
      // Let a newer version of the app, open in another tab, upgrade the database.
      req.result.onversionchange = () => {
        req.result.close()
        dbPromise = null
      }
      resolve(req.result)
    }
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).getAll()
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror = () => reject(req.error)
  })
}

async function putMany(store: StoreName, records: object[]): Promise<void> {
  if (records.length === 0) return
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const os = tx.objectStore(store)
    for (const r of records) os.put(r)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Everything, including soft-deleted tombstones (needed for sync). */
export async function loadAll(): Promise<Collection> {
  const [books, quotes] = await Promise.all([getAll<Book>('books'), getAll<Quote>('quotes')])
  return { version: 1, books, quotes }
}

async function deleteMany(store: StoreName, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const os = tx.objectStore(store)
    for (const id of ids) os.delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export const putBooks = (books: Book[]) => putMany('books', books)
export const deleteBooks = (ids: string[]) => deleteMany('books', ids)
export const deleteQuotes = (ids: string[]) => deleteMany('quotes', ids)
export const putQuotes = (quotes: Quote[]) => putMany('quotes', quotes)

/** A book's cover image, saved on this device so it shows offline. */
export interface StoredCover {
  /** The book's id. */
  id: string
  blob: Blob
  /** The link it was downloaded from, or 'photo' for one you took yourself. */
  src: string
}
export const loadCovers = () => getAll<StoredCover>('covers')
export const putCover = (c: StoredCover) => putMany('covers', [c])
export const deleteCover = (bookId: string) => deleteMany('covers', [bookId])

export function newId(): string {
  // crypto.randomUUID needs a secure context; the dev server over LAN is plain http.
  if (window.isSecureContext && 'randomUUID' in crypto) return crypto.randomUUID()
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}
