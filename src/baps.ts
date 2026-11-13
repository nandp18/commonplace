import catalog from './bapsCovers.json' with { type: 'json' }

/**
 * Covers for BAPS publications, which Open Library and Google Books mostly don't know.
 * The catalog is baps.org/Publications/books.aspx read once in a browser (the site turns
 * scripts away): title → "category id/image guid[.ext]". Its images are small thumbnails
 * that baps.org won't share with web apps, so they're shown from there, not kept offline.
 */

const BASE = 'https://www.baps.org/Data/Sites/1/Media/ProductCategoryImages/'
const toUrl = (v: string) => {
  const [id, file] = v.split('/')
  return `${BASE}${id}/Thumbnails/${/\.\w+$/.test(file) ? file : `${file}.jpg`}`
}

/** Letters and digits only, accents and case folded, "&" read as "and". */
const fold = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

let byTitle: Map<string, string> | undefined
const titles = () => (byTitle ??= new Map(Object.entries(catalog as Record<string, string>).map(([t, v]) => [fold(t), v])))

/** Only books that say they're BAPS books: by publisher, or by a sadhu author. */
export const isBapsBook = (author = '', publisher = '') =>
  /aksharpith|\bbaps\b|swaminarayan/i.test(publisher) || /\bsadhu\b|\bbaps\b/i.test(author)

/** One letter added, dropped or changed: "Upnishads" for "Upanishads". */
function nearly(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1 || a.length < 12) return false
  let i = 0
  while (i < a.length && a[i] === b[i]) i++
  const rest = (x: string, skip: number) => x.slice(i + skip)
  return rest(a, 1) === rest(b, 1) || rest(a, 1) === rest(b, 0) || rest(a, 0) === rest(b, 1)
}

/**
 * The catalog's cover for this book, or undefined. Tries the whole title, then the title
 * before a subtitle (":" or a spaced dash), then those with one letter's difference, then
 * the longest catalog title of two words or more that the book's title starts with, then
 * a catalog title that starts with the book's (a set holding this volume).
 */
export function bapsCover(title: string, author = '', publisher = ''): string | undefined {
  if (!isBapsBook(author, publisher)) return undefined
  const map = titles()
  const full = fold(title)
  const tries = [...new Set([full, fold(title.split(/[:–—]/)[0]), fold(title.split(/[:–—]|\s-\s/)[0])])].filter(Boolean)
  for (const t of tries) if (map.has(t)) return toUrl(map.get(t)!)
  for (const t of tries) for (const [k, v] of map) if (nearly(t, k)) return toUrl(v)
  let best: [string, string] | undefined
  for (const [k, v] of map)
    if (k.includes(' ') && full.startsWith(k + ' ') && k.length > (best?.[0].length ?? 0)) best = [k, v]
  if (best) return toUrl(best[1])
  // One part of a set the catalog sells together: "… (Part 1)" in "… (Part 1 and 2)".
  if (full.split(' ').length >= 3) for (const [k, v] of map) if (k.startsWith(full + ' ')) return toUrl(v)
  return undefined
}
