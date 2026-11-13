import type { Book, Quote } from './types'

/** The orders the Books tab can show the shelf in. */
export type BookSort = 'recent' | 'title' | 'author' | 'quotes'

export const BOOK_SORTS: { value: BookSort; label: string }[] = [
  { value: 'recent', label: 'Recently read' },
  { value: 'title', label: 'Title' },
  { value: 'author', label: 'Author' },
  { value: 'quotes', label: 'Most quotes' },
]

const SORT_KEY = 'commonplace.bookSort'

export function loadBookSort(): BookSort {
  try {
    const saved = localStorage.getItem(SORT_KEY)
    return BOOK_SORTS.some((s) => s.value === saved) ? (saved as BookSort) : 'recent'
  } catch {
    return 'recent'
  }
}

export function saveBookSort(by: BookSort) {
  try {
    localStorage.setItem(SORT_KEY, by)
  } catch {}
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

/** "The Way of Kings" files under W, as on a bookshop shelf. */
const titleKey = (t: string) => t.trim().replace(/^(the|a|an)\s+/i, '')

/** The first author's surname, roughly: "Ursula K. Le Guin, Jane Doe" → "Guin". */
const surname = (author: string) => author.split(',')[0].trim().split(/\s+/).pop() ?? ''

/**
 * The shelf in the order asked for. "Recently read" is the later of when you read or added
 * the book and when you last filed a quote from it, so the book you're reading now comes first.
 */
export function sortBooks(books: Book[], quotes: Quote[], by: BookSort): Book[] {
  const count = new Map<string, number>()
  const last = new Map<string, number>()
  for (const q of quotes) {
    if (!q.bookId) continue
    count.set(q.bookId, (count.get(q.bookId) ?? 0) + 1)
    last.set(q.bookId, Math.max(last.get(q.bookId) ?? 0, q.createdAt))
  }
  const byTitle = (a: Book, b: Book) => collator.compare(titleKey(a.title), titleKey(b.title))
  const recent = (b: Book) => Math.max(b.createdAt, last.get(b.id) ?? 0)
  const compare: Record<BookSort, (a: Book, b: Book) => number> = {
    recent: (a, b) => recent(b) - recent(a) || byTitle(a, b),
    title: byTitle,
    // Books without an author go last, not first.
    author: (a, b) =>
      Number(!a.author.trim()) - Number(!b.author.trim()) ||
      collator.compare(surname(a.author), surname(b.author)) ||
      collator.compare(a.author, b.author) ||
      byTitle(a, b),
    quotes: (a, b) => (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0) || recent(b) - recent(a) || byTitle(a, b),
  }
  return [...books].sort(compare[by])
}
