import type { Book, Quote } from './types'

const norm = (s: string) => s.normalize('NFC').toLocaleLowerCase()

/** Every whitespace-separated term must appear somewhere in the quote, note, tags, or book. */
export function search(quotes: Quote[], books: Map<string, Book>, query: string): Quote[] {
  const terms = norm(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return quotes
  return quotes.filter((q) => {
    const b = books.get(q.bookId)
    const hay = norm([q.text, q.note, q.tags.join(' '), b?.title, b?.author, q.page].join(' '))
    return terms.every((t) => hay.includes(t))
  })
}

/** Same quote all day, changes at local midnight. */
export function quoteOfTheDay(quotes: Quote[], date = new Date()): Quote | undefined {
  if (quotes.length === 0) return undefined
  const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
  let h = 2166136261
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  const sorted = [...quotes].sort((a, b) => a.id.localeCompare(b.id))
  return sorted[(h >>> 0) % sorted.length]
}

export const parseTags = (s: string) =>
  [...new Set(s.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean))]

const pageNum = (q: Quote) => parseInt(q.page ?? '', 10) || Infinity

export const byPage = (a: Quote, b: Quote) => pageNum(a) - pageNum(b) || a.createdAt - b.createdAt

export function toMarkdown(quotes: Quote[], books: Book[]): string {
  const out = ['# Commonplace', '']
  for (const book of [...books].sort((a, b) => a.title.localeCompare(b.title))) {
    const qs = quotes.filter((q) => q.bookId === book.id).sort(byPage)
    if (qs.length === 0) continue
    out.push(`## ${book.title}${book.author ? ` — ${book.author}` : ''}`, '')
    for (const q of qs) {
      out.push(...q.text.split('\n').map((l) => `> ${l}`))
      const meta = [q.page && `p. ${q.page}`, ...q.tags.map((t) => `#${t}`)].filter(Boolean)
      if (meta.length) out.push('>', `> — ${meta.join(' · ')}`)
      if (q.note) out.push('', q.note)
      out.push('')
    }
  }
  return out.join('\n')
}

export function toCsv(quotes: Quote[], books: Map<string, Book>): string {
  const esc = (v: string | undefined) => `"${(v ?? '').replace(/"/g, '""')}"`
  const rows = [['text', 'book', 'author', 'page', 'tags', 'note', 'language', 'created']]
  for (const q of quotes) {
    const b = books.get(q.bookId)
    rows.push([q.text, b?.title ?? '', b?.author ?? '', q.page ?? '', q.tags.join(', '), q.note ?? '', q.lang, new Date(q.createdAt).toISOString()])
  }
  // BOM so Excel/Sheets read Gujarati as UTF-8.
  return '\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\r\n')
}

export async function download(filename: string, content: string, type: string) {
  const file = new File([content], filename, { type })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(file)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
