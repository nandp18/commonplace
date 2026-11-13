import type { ImportBook, ImportFile } from './importFile'
import { toIsbn13 } from './isbn.ts'

/**
 * Goodreads' library export (My Books → Import and export → Export library), turned into
 * an import file of books. It has no quotes in it, only the books, so they arrive empty,
 * ready for quotes to be filed under them.
 */

/** RFC 4180: commas, quoted fields, doubled quotes, and line breaks inside quotes (reviews have them). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') (field += '"'), i++
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') row.push(field), (field = '')
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      ;(row = []), (field = '')
    } else field += c
  }
  if (field || row.length) row.push(field), rows.push(row)
  return rows.filter((r) => r.some((f) => f.trim()))
}

export const isGoodreadsCsv = (text: string) => /^﻿?Book Id,Title,Author/.test(text)

/** "The Way of Kings (The Stormlight Archive, #1)" → "The Way of Kings". Other brackets stay. */
export const stripSeries = (title: string) => title.replace(/\s*\([^()]*#\s*\d+(?:\.\d+)?\)\s*$/, '').trim() || title.trim()

/** Goodreads writes ISBNs as ="9780141187761" so spreadsheets keep the zeros. */
const cleanIsbn = (cell = '') => cell.replace(/^="?|"$/g, '').trim()

/** "2019/03/14" → "2019-03-14", or nothing. */
const dateOf = (cell = '') => {
  const m = cell.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : undefined
}

export interface GoodreadsLibrary {
  /** Everything but the want-to-read shelf. */
  read: ImportBook[]
  toRead: ImportBook[]
}

export function parseGoodreads(text: string): GoodreadsLibrary {
  const [header, ...rows] = parseCsv(text)
  const col = (name: string) => header?.indexOf(name) ?? -1
  const at = { title: col('Title'), author: col('Author'), more: col('Additional Authors'), isbn: col('ISBN'), isbn13: col('ISBN13'), publisher: col('Publisher'), year: col('Year Published'), original: col('Original Publication Year'), read: col('Date Read'), added: col('Date Added'), shelf: col('Exclusive Shelf') }
  if (at.title < 0 || at.author < 0) throw new Error('That isn’t a Goodreads library export.')

  const lib: GoodreadsLibrary = { read: [], toRead: [] }
  for (const r of rows) {
    const get = (i: number) => (i >= 0 ? (r[i] ?? '').trim() : '')
    const title = stripSeries(get(at.title))
    if (!title) continue
    const isbn = toIsbn13(cleanIsbn(get(at.isbn13))) ?? toIsbn13(cleanIsbn(get(at.isbn)))
    // "Additional Authors" mixes co-authors with editors, translators and introductions
    // (a Shakespeare play lists six). One extra is usually a co-author; a crowd is editors.
    const more = get(at.more).split(',').map((a) => a.trim()).filter(Boolean)
    const authors = [get(at.author), ...(more.length === 1 ? more : [])].filter(Boolean)
    const year = get(at.year) || get(at.original)
    const date = dateOf(get(at.read)) ?? dateOf(get(at.added))
    const book: ImportBook = {
      title,
      author: [...new Set(authors)].join(', '),
      ...(isbn ? { isbn } : {}),
      ...(get(at.publisher) ? { publisher: get(at.publisher) } : {}),
      ...(/^\d{3,4}$/.test(year) ? { year } : {}),
      // When you read it, or else when you shelved it: the book's place in time.
      ...(date ? { date } : {}),
      // Open Library's cover for that ISBN; a book it has none for keeps its cloth cover.
      ...(isbn ? { cover: `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false` } : {}),
      keepEmpty: true,
      quotes: [],
    }
    ;(get(at.shelf) === 'to-read' ? lib.toRead : lib.read).push(book)
  }
  return lib
}

export const goodreadsFile = (lib: GoodreadsLibrary, includeToRead: boolean): ImportFile => ({
  version: 1,
  books: includeToRead ? [...lib.read, ...lib.toRead] : lib.read,
})
