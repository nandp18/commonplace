/**
 * ISBNs: checking them, and turning one into a title, authors and a cover.
 * Open Library first (free, no key), Google Books to fill whatever it lacks.
 */

export interface BookInfo {
  title: string
  /** Comma-separated. */
  author: string
  publisher?: string
  year?: string
  /** https link to the cover image. */
  cover?: string
  /** Where the details came from, for the "found on …" line. */
  source: string
}

const digits = (raw: string) => raw.toUpperCase().replace(/[^0-9X]/g, '')

function valid13(s: string) {
  if (!/^\d{13}$/.test(s)) return false
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(s[i]) * (i % 2 ? 3 : 1)
  return (10 - (sum % 10)) % 10 === Number(s[12])
}

function valid10(s: string) {
  if (!/^\d{9}[\dX]$/.test(s)) return false
  let sum = 0
  for (let i = 0; i < 10; i++) sum += (s[i] === 'X' ? 10 : Number(s[i])) * (10 - i)
  return sum % 11 === 0
}

/**
 * Any ISBN as typed or scanned — with hyphens, spaces, ISBN-10 or 13 — as a checked
 * ISBN-13, or null if it isn't one. A book's EAN-13 barcode is its ISBN-13.
 */
export function toIsbn13(raw: string): string | null {
  const s = digits(raw)
  if (s.length === 13) return /^97[89]/.test(s) && valid13(s) ? s : null
  if (s.length === 10 && valid10(s)) {
    const body = '978' + s.slice(0, 9)
    let sum = 0
    for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 ? 3 : 1)
    return body + ((10 - (sum % 10)) % 10)
  }
  return null
}

/** Readable, without needing the ISBN range tables: 978-0-14-118776-1 → "978 0141187761". */
export const formatIsbn = (isbn: string) => (isbn.length === 13 ? `${isbn.slice(0, 3)} ${isbn.slice(3)}` : isbn)

const yearOf = (date?: string) => date?.match(/\b(1[4-9]\d\d|20\d\d)\b/)?.[1]
const clean = (s?: string) => s?.replace(/\s+/g, ' ').trim() || undefined
const https = (url?: string) => url?.replace(/^http:\/\//, 'https://')

/** `https://openlibrary.org/api/books?bibkeys=ISBN:…&format=json&jscmd=data` */
export function parseOpenLibrary(json: unknown, isbn: string): BookInfo | null {
  type OL = {
    title?: string
    authors?: { name?: string }[]
    publishers?: { name?: string }[]
    publish_date?: string
    cover?: { small?: string; medium?: string; large?: string }
  }
  const d = (json as Record<string, OL> | null)?.[`ISBN:${isbn}`]
  const title = clean(d?.title)
  if (!d || !title) return null
  return {
    title,
    author: (d.authors ?? []).map((a) => clean(a.name)).filter(Boolean).join(', '),
    publisher: clean(d.publishers?.[0]?.name),
    year: yearOf(d.publish_date),
    cover: https(d.cover?.large ?? d.cover?.medium),
    source: 'Open Library',
  }
}

/** `https://www.googleapis.com/books/v1/volumes?q=isbn:…` */
export function parseGoogleBooks(json: unknown): BookInfo | null {
  type GB = {
    items?: {
      volumeInfo?: {
        title?: string
        authors?: string[]
        publisher?: string
        publishedDate?: string
        imageLinks?: { thumbnail?: string; smallThumbnail?: string }
      }
    }[]
  }
  const v = (json as GB | null)?.items?.[0]?.volumeInfo
  const title = clean(v?.title)
  if (!v || !title) return null
  const thumb = v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail
  return {
    title,
    author: (v.authors ?? []).map(clean).filter(Boolean).join(', '),
    publisher: clean(v.publisher),
    year: yearOf(v.publishedDate),
    // The page-curl effect is drawn into the image; ask for it flat.
    cover: https(thumb)?.replace(/&edge=curl/, ''),
    source: 'Google Books',
  }
}

/** The first source wins; the second only fills its gaps. */
export function mergeInfo(a: BookInfo | null, b: BookInfo | null): BookInfo | null {
  if (!a || !b) return a ?? b
  return {
    title: a.title,
    author: a.author || b.author,
    publisher: a.publisher ?? b.publisher,
    year: a.year ?? b.year,
    cover: a.cover ?? b.cover,
    source: a.source,
  }
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>

async function getJson(f: Fetch, url: string): Promise<unknown> {
  try {
    const res = await f(url, { signal: AbortSignal.timeout(9000) })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

/** Throws only when neither service could be reached; null means they had no such book. */
export async function lookupIsbn(isbn: string, f: Fetch = fetch): Promise<BookInfo | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('You’re offline. Fill it in by hand, or try again later.')
  const olUrl = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`
  const gbUrl = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`
  const ol = await getJson(f, olUrl)
  let info = parseOpenLibrary(ol, isbn)
  let gb: unknown = undefined
  if (!info || !info.author || !info.cover || !info.year) {
    gb = await getJson(f, gbUrl)
    info = mergeInfo(info, parseGoogleBooks(gb))
  }
  if (ol === null && gb === null) throw new Error('Couldn’t reach Open Library or Google Books. Check your connection.')
  if (info && !info.cover) {
    // Open Library sometimes has a cover for an ISBN whose record lacks one.
    const url = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`
    try {
      const res = await f(url, { method: 'HEAD', signal: AbortSignal.timeout(6000) })
      if (res.ok) info.cover = url
    } catch {}
  }
  return info
}
