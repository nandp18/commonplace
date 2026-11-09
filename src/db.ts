import type { Book, Collection, Quote } from './types'

const DB_NAME = 'commonplace'
const STORES = ['books', 'quotes'] as const
type StoreName = (typeof STORES)[number]

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      for (const name of STORES) {
        if (!req.result.objectStoreNames.contains(name)) {
          req.result.createObjectStore(name, { keyPath: 'id' })
        }
      }
    }
    req.onsuccess = () => resolve(req.result)
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

export const putBooks = (books: Book[]) => putMany('books', books)
export const putQuotes = (quotes: Quote[]) => putMany('quotes', quotes)

export function newId(): string {
  // crypto.randomUUID needs a secure context; the dev server over LAN is plain http.
  if (window.isSecureContext && 'randomUUID' in crypto) return crypto.randomUUID()
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}
