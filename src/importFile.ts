import type { Book, Collection, Lang, Quote } from './types'

/**
 * The reviewed import file: books with their quotes nested underneath, so it can be
 * read and edited by hand. `scripts/prepare-import.ts` writes it; Settings → Import reads it.
 */
export interface ImportQuote {
  text: string
  page?: string
  /** Local time, or a rough date: 2019, 2019-03, 2019-03-14. */
  date?: string
  note?: string
  lang?: Lang
  tags?: string[]
  /** Why the review script wants a second look. Ignored on import. */
  flags?: string[]
}

export interface ImportBook {
  /** Empty: the quotes come in unfiled. */
  title: string
  author: string
  /** Used for quotes without their own date. */
  date?: string
  /** Link to a cover image. Also fills in books already in the library. */
  cover?: string
  /** Create this book even with no quotes. Backups set it; a covers-only file doesn't. */
  keepEmpty?: boolean
  quotes: ImportQuote[]
}

export interface ImportFile {
  version: 1
  books: ImportBook[]
}

export interface ImportPlan {
  books: Book[]
  quotes: Quote[]
  /** Quotes already in the library, or deleted from it earlier. */
  skipped: number
  /** Books gaining a cover, whether new or already in the library. */
  covers: number
}

/** Text reduced to letters and digits, so punctuation and case can't hide a duplicate. */
export const quoteKey = (s: string) => s.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '')

function hash(s: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

function toTime(date: string | undefined): number | undefined {
  const d = date?.trim()
  if (!d) return undefined
  // A bare date is read at noon local, so it can't slide to a neighbouring day.
  const full = /^\d{4}$/.test(d) ? `${d}-01-01T12:00` : /^\d{4}-\d{2}$/.test(d) ? `${d}-01T12:00` : /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T12:00` : d
  const t = new Date(full).getTime()
  if (Number.isNaN(t)) throw new Error(`“${d}” isn’t a date. Use 2019, 2019-03 or 2019-03-14.`)
  return t
}

/** Checks the whole file first, so a typo can't leave an import half done. */
export function parseImportFile(json: string): ImportFile {
  let data: ImportFile
  try {
    data = JSON.parse(json)
  } catch (e) {
    throw new Error(`That file isn’t valid JSON: ${(e as Error).message}`)
  }
  if (data?.version !== 1 || !Array.isArray(data.books) || data.books.some((b) => !Array.isArray(b?.quotes))) {
    throw new Error('That isn’t a Commonplace import file.')
  }
  for (const book of data.books) {
    const where = `In “${book.title || 'Unfiled'}”`
    if (typeof book.title !== 'string') throw new Error(`A book is missing its title. Use "" for unfiled quotes.`)
    if (book.cover && !/^https:\/\//.test(book.cover)) throw new Error(`${where}: the cover must be an https link.`)
    try {
      toTime(book.date)
    } catch (e) {
      throw new Error(`${where}: ${(e as Error).message}`)
    }
    for (const q of book.quotes) {
      if (typeof q?.text !== 'string' || !q.text.trim()) throw new Error(`${where}: a quote has no text.`)
      try {
        toTime(q.date)
      } catch (e) {
        throw new Error(`${where}: ${(e as Error).message}`)
      }
    }
  }
  return data
}

/**
 * What an import would add. Ids come from the text, so importing the same file twice
 * adds nothing and a quote you deleted stays deleted.
 */
export function planImport(file: ImportFile, existing: Collection, now: number): ImportPlan {
  const bookIds = new Map(existing.books.filter((b) => !b.deleted).map((b) => [quoteKey(b.title), b.id]))
  const usedIds = new Set(existing.quotes.map((q) => q.id))
  const usedText = new Set(existing.quotes.filter((q) => !q.deleted).map((q) => quoteKey(q.text)))
  const liveBooks = new Map(existing.books.filter((b) => !b.deleted).map((b) => [b.id, b]))
  const books = new Map<string, Book>()
  const quotes: Quote[] = []
  let skipped = 0
  let covers = 0

  for (const book of file.books) {
    const titleKey = quoteKey(book.title)
    const fallback = toTime(book.date)
    for (const q of book.quotes) {
      const key = quoteKey(q.text)
      const id = `import-${hash(key)}`
      if (usedIds.has(id) || usedText.has(key)) {
        skipped++
        continue
      }
      usedIds.add(id)
      usedText.add(key)

      const createdAt = toTime(q.date) ?? fallback ?? now
      let bookId: string | undefined
      if (titleKey) {
        bookId = bookIds.get(titleKey)
        if (!bookId) {
          bookId = `import-${hash(titleKey)}`
          bookIds.set(titleKey, bookId)
          books.set(bookId, { id: bookId, title: book.title.trim(), author: (book.author ?? '').trim(), createdAt, updatedAt: now })
        }
        const created = books.get(bookId)
        if (created && createdAt < created.createdAt) created.createdAt = createdAt
      }
      quotes.push({
        id,
        ...(bookId ? { bookId } : {}),
        text: q.text.trim(),
        ...(q.page ? { page: String(q.page) } : {}),
        tags: q.tags ?? [],
        ...(q.note?.trim() ? { note: q.note.trim() } : {}),
        lang: q.lang ?? 'eng',
        createdAt,
        updatedAt: now,
      })
    }

    // A book you've added but not quoted yet still belongs in a restored library.
    if (titleKey && book.keepEmpty && !bookIds.has(titleKey)) {
      const id = `import-${hash(titleKey)}`
      if (!existing.books.some((b) => b.id === id)) {
        bookIds.set(titleKey, id)
        books.set(id, { id, title: book.title.trim(), author: (book.author ?? '').trim(), createdAt: fallback ?? now, updatedAt: now })
      }
    }

    const bookId = titleKey ? bookIds.get(titleKey) : undefined
    const target = bookId ? (books.get(bookId) ?? liveBooks.get(bookId)) : undefined
    if (book.cover && target && !target.cover) {
      books.set(target.id, { ...target, cover: book.cover, updatedAt: now })
      covers++
    }
  }
  return { books: [...books.values()], quotes, skipped, covers }
}
