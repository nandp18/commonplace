import { isGujarati, reflow, tidy } from '../src/format.ts'
import { quoteKey } from '../src/importFile.ts'
import type { ImportBook, ImportFile, ImportQuote } from '../src/importFile.ts'

/** Passages longer than this get flagged: they may read better trimmed. */
const LONG_WORDS = 120

export interface Highlight {
  title: string
  author: string
  text: string
  origin: 'kindle' | 'notion'
  page?: string
  start?: number
  end?: number
  date?: string
  note?: string
  flags: string[]
}

export interface Clippings {
  highlights: Highlight[]
  bookmarks: number
  /** Replaced by a longer version of the same highlight. */
  superseded: number
  /** Entries this parser couldn't read, so nothing vanishes silently. */
  unparsed: string[]
}

const META = /^[-–—•*]\s*(?:Your\s+)?(Highlight|Note|Bookmark)\b(.*)$/i

/** "Monday, January 21, 2019 9:24:42 PM" → "2019-01-21T21:24:42" */
function kindleDate(s: string): string | undefined {
  const d = new Date(s.replace(/^[^\d,]+,\s*/, '').trim())
  if (Number.isNaN(d.getTime())) return undefined
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function splitBook(source: string): { title: string; author: string } {
  const m = source.trim().match(/^(.*\S)\s*\(([^()]+)\)$/)
  if (!m) return { title: source.trim(), author: '' }
  const name = m[2].trim().match(/^([^,;]+),\s*([^,;]+)$/)
  return { title: m[1], author: name ? `${name[2]} ${name[1]}` : m[2].trim() }
}

function location(meta: string): { start?: number; end?: number } {
  const m = meta.match(/\b(?:location|loc\.?)\s+(\d+)(?:\s*-\s*(\d+))?/i)
  if (!m) return {}
  const start = Number(m[1])
  // Older Kindles shorten ranges: "Loc. 1204-05" means 1204 to 1205.
  const end = m[2] ? Number(m[1].slice(0, Math.max(0, m[1].length - m[2].length)) + m[2]) : start
  return { start, end }
}

const sameSpot = (a: Highlight, b: Highlight) =>
  a.start !== undefined && b.start !== undefined
    ? a.start <= (b.end ?? b.start) && b.start <= (a.end ?? a.start)
    : a.page !== undefined && a.page === b.page

/** Extending a highlight on a Kindle saves a second entry; keep only the longest. */
function dropSuperseded(items: Highlight[]): Highlight[] {
  const kept: Highlight[] = []
  for (const h of [...items].sort((a, b) => b.text.length - a.text.length)) {
    const key = quoteKey(h.text)
    if (!kept.some((k) => sameSpot(k, h) && quoteKey(k.text).includes(key))) kept.push(h)
  }
  return kept
}

const bookKey = (b: { title: string }) => quoteKey(b.title)

export function parseClippings(raw: string): Clippings {
  const highlights: Highlight[] = []
  const notes: Highlight[] = []
  const unparsed: string[] = []
  let bookmarks = 0

  for (const entry of raw.replace(/﻿/g, '').replace(/\r/g, '').split(/^\s*={8,}\s*$/m)) {
    if (!entry.trim()) continue
    const lines = entry.split('\n')
    const at = lines.findIndex((l) => META.test(l.trim()))
    const source = lines.slice(0, Math.max(at, 0)).filter((l) => l.trim()).pop()
    if (at < 0 || !source) {
      unparsed.push(entry.trim())
      continue
    }
    const [, kind, meta] = lines[at].trim().match(META)!
    if (kind.toLowerCase() === 'bookmark') {
      bookmarks++
      continue
    }
    const text = tidy(reflow(lines.slice(at + 1).join('\n').trim()))
    if (!text) continue
    const added = meta.match(/added on\s+(.+)$/i)
    const item: Highlight = {
      ...splitBook(source),
      text,
      origin: 'kindle',
      page: meta.match(/\bpage\s+([\w-]+)/i)?.[1],
      ...location(meta),
      date: added ? kindleDate(added[1]) : undefined,
      flags: [],
    }
    if (!added || !item.date) item.flags.push('no-date')
    ;(kind.toLowerCase() === 'note' ? notes : highlights).push(item)
  }

  const byBook = new Map<string, Highlight[]>()
  for (const h of highlights) byBook.set(bookKey(h), [...(byBook.get(bookKey(h)) ?? []), h])
  const kept = [...byBook.values()].flatMap(dropSuperseded)

  for (const n of notes) {
    const home = kept
      .filter((h) => bookKey(h) === bookKey(n) && sameSpot(h, n))
      .sort((a, b) => (b.start ?? 0) - (a.start ?? 0))[0]
    if (home) home.note = home.note ? `${home.note}\n\n${n.text}` : n.text
    else kept.push({ ...n, flags: [...n.flags, 'your-note-without-highlight'] })
  }
  return { highlights: kept, bookmarks, superseded: highlights.length - kept.filter((h) => !h.flags.includes('your-note-without-highlight')).length, unparsed }
}

const PAGE_HEADING = /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*(?:page|pg\.?|p\.)\s*(\d[\w–-]*)\s*:?\s*(?:\*\*|__)?\s*$/i
const PROPERTY = /^[\p{L} ]{1,30}:\s.{0,120}$/u

/** Markdown syntax out, characters Notion escaped back in. */
export function cleanMarkdown(s: string): string {
  return s
    .replace(/<\/?aside>/g, '')
    .replace(/^\s*(?:-{3,}|\*{3,})\s*$/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\\\*/g, '\u0001')
    .replace(/\*+/g, '')
    .replace(/\u0001/g, '*')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\\([_[\]()#.!~`>+-])/g, '$1')
}

export interface NotionPage {
  highlights: Highlight[]
  /** No `Page N` headings: probably not a highlights page, so it's left out and reported. */
  skipped: boolean
}

/** One `Page N` heading, up to the next one, is one quote. The page title is the book. */
export function parseNotion(markdown: string, fileTitle: string): NotionPage {
  const lines = markdown.replace(/﻿/g, '').replace(/\r/g, '').split('\n')
  const first = lines.findIndex((l) => PAGE_HEADING.test(l))
  if (first < 0) return { highlights: [], skipped: true }

  const preamble = lines.slice(0, first)
  const heading = preamble.findIndex((l) => /^#\s+\S/.test(l))
  const title = heading >= 0 ? cleanMarkdown(preamble[heading].replace(/^#\s+/, '')).trim() : fileTitle
  const author = preamble.map((l) => l.match(/^\W*author\W*:\W*(.+?)\s*$/i)?.[1]).find(Boolean) ?? ''
  if (heading >= 0) preamble.splice(heading, 1)

  const make = (body: string, page?: string, flags: string[] = []): Highlight | undefined => {
    const text = tidy(reflow(cleanMarkdown(body).trim()))
    return text ? { title, author, text, origin: 'notion', page, flags } : undefined
  }

  const out: (Highlight | undefined)[] = []
  const intro = preamble
    .join('\n')
    .split(/\n\s*\n/)
    .filter((block) => block.trim() && !block.trim().split('\n').every((l) => PROPERTY.test(l.trim())))
    .join('\n\n')
  if (intro) out.push(make(intro, undefined, ['before-first-page-heading']))

  let page = lines[first].match(PAGE_HEADING)![1]
  let body: string[] = []
  for (const line of lines.slice(first + 1)) {
    const m = line.match(PAGE_HEADING)
    if (m) {
      out.push(make(body.join('\n'), page))
      page = m[1]
      body = []
    } else body.push(line)
  }
  out.push(make(body.join('\n'), page))
  return { highlights: out.filter((h): h is Highlight => !!h), skipped: false }
}

const pageOrder = (q: ImportQuote) => Number.parseInt(q.page ?? '', 10) || Number.MAX_SAFE_INTEGER

export interface Review {
  file: ImportFile
  duplicates: number
}

/** One file to read through: duplicates merged, books grouped, doubtful quotes flagged. */
export function buildReview(all: Highlight[]): Review {
  const unique = new Map<string, Highlight>()
  for (const h of all) {
    const key = quoteKey(h.text)
    const cur = unique.get(key)
    if (!cur) unique.set(key, { ...h, flags: [...h.flags] })
    else {
      // The same quote from both sources: keep every detail either one had.
      cur.date ??= h.date
      cur.page ??= h.page
      cur.note ??= h.note
    }
  }

  const items = [...unique.values()]
  for (const h of items) {
    if (h.text.split(/\s+/).length > LONG_WORDS) h.flags.push('long')
    const key = quoteKey(h.text)
    if (key.length >= 40 && items.some((o) => o !== h && o.origin !== h.origin && o.text.length > h.text.length && quoteKey(o.text).includes(key))) {
      h.flags.push('possible-duplicate')
    }
  }

  const books = new Map<string, ImportBook>()
  for (const h of items) {
    const book = books.get(bookKey(h)) ?? { title: h.title, author: '', date: '', quotes: [] }
    book.author ||= h.author
    books.set(bookKey(h), book)
    book.quotes.push({
      text: h.text,
      page: h.page,
      date: h.date,
      note: h.note,
      lang: isGujarati(h.text) ? 'guj' : 'eng',
      ...(h.flags.length ? { flags: h.flags } : {}),
    })
  }
  for (const book of books.values()) book.quotes.sort((a, b) => pageOrder(a) - pageOrder(b))
  return {
    file: { version: 1, books: [...books.values()].sort((a, b) => a.title.localeCompare(b.title)) },
    duplicates: all.length - items.length,
  }
}
