import assert from 'node:assert'
import { goodreadsFile, isGoodreadsCsv, parseCsv, parseGoodreads, stripSeries } from '../src/goodreads.ts'
import { planImport } from '../src/importFile.ts'
import type { Book, Collection } from '../src/types.ts'

const NOW = Date.parse('2026-11-12T12:00:00Z')

// The columns and quirks of a real "Export library" file
const HEADER =
  'Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies'
const CSV = [
  '﻿' + HEADER,
  '7235533,"The Way of Kings (The Stormlight Archive, #1)",Brandon Sanderson,"Sanderson, Brandon",,"=""0765326353""","=""9780765326355""",5,4.65,Tor Books,Hardcover,1007,2010,2010,2019/03/14,2018/12/01,,,read,"Loved it.\nSecond paragraph, with ""quotes"".",,,1,0',
  '5470,1984,George Orwell,"Orwell, George",Erich Fromm,"=""0451524934""","=""9780451524935""",4,4.19,Signet Classic,Mass Market Paperback,328,1950,1949,,2020/01/05,,,read,,,,1,0',
  '1420,Hamlet,William Shakespeare,"Shakespeare, William","Harold Bloom, Rex Gibson, Israel Gollancz",,,0,4.0,Simon & Schuster,Paperback,342,2003,1600,2017/09/09,2017/09/01,,,read,,,,1,0',
  '12345,Some Ebook,An Author,"Author, An",,"=""""","=""""",0,3.9,,Kindle Edition,200,,2015,,2021/06/01,,,currently-reading,,,,0,0',
  '999,A Book I Want,Someone Else,"Else, Someone",,"=""""","=""""",0,4.0,,Paperback,300,2022,2022,,2024/02/02,,,to-read,,,,0,0',
].join('\r\n')

assert.ok(isGoodreadsCsv(CSV))
assert.ok(!isGoodreadsCsv('{"version":1}'))

// CSV: quoted commas, doubled quotes, and line breaks inside a review
const rows = parseCsv(CSV)
assert.equal(rows.length, 6)
assert.equal(rows[1][19], 'Loved it.\nSecond paragraph, with "quotes".')
assert.equal(rows[1].length, 24)

assert.equal(stripSeries('The Way of Kings (The Stormlight Archive, #1)'), 'The Way of Kings')
assert.equal(stripSeries('Dune (Dune #1.5)'), 'Dune')
assert.equal(stripSeries('Meditations (Penguin Classics)'), 'Meditations (Penguin Classics)', 'only series markers go')

const lib = parseGoodreads(CSV)
assert.equal(lib.read.length, 4, 'read and currently-reading')
assert.equal(lib.toRead.length, 1)
const [kings, orwell, hamlet, ebook] = lib.read
assert.equal(kings.title, 'The Way of Kings')
assert.equal(kings.author, 'Brandon Sanderson')
assert.equal(kings.isbn, '9780765326355')
assert.equal(kings.publisher, 'Tor Books')
assert.equal(kings.year, '2010')
assert.equal(kings.date, '2019-03-14', 'when you read it')
assert.equal(kings.cover, 'https://covers.openlibrary.org/b/isbn/9780765326355-L.jpg?default=false')
assert.ok(kings.keepEmpty)
assert.deepEqual(kings.quotes, [])
assert.equal(orwell.author, 'George Orwell, Erich Fromm', 'one additional author is a co-author')
assert.equal(hamlet.author, 'William Shakespeare', 'a crowd of additional authors is editors')
assert.equal(orwell.date, '2020-01-05', 'unread date falls back to when it was shelved')
assert.equal(ebook.isbn, undefined, 'an ebook without an ISBN')
assert.equal(ebook.cover, undefined)
assert.equal(ebook.year, '2015', 'original year when the edition has none')

assert.equal(goodreadsFile(lib, false).books.length, 4)
assert.equal(goodreadsFile(lib, true).books.length, 5)
assert.throws(() => parseGoodreads('a,b\n1,2'), /Goodreads/)

// Into an empty library: every book, no quotes
const empty: Collection = { version: 1, books: [], quotes: [] }
const plan = planImport(goodreadsFile(lib, false), empty, NOW)
assert.equal(plan.newBooks, 4)
assert.equal(plan.quotes.length, 0)
assert.equal(plan.books.find((b) => b.title === 'The Way of Kings')!.createdAt, Date.parse('2019-03-14T12:00'))

// Books already here are matched by ISBN (even under another title) or by title, never doubled
const book = (id: string, title: string, more: Partial<Book> = {}): Book => ({ id, title, author: '', createdAt: 1, updatedAt: 1, ...more })
const mine: Collection = {
  version: 1,
  books: [book('scanned', 'Nineteen Eighty-Four', { isbn: '9780451524935' }), book('typed', 'the way of kings')],
  quotes: [],
}
const merged = planImport(goodreadsFile(lib, false), mine, NOW)
assert.equal(merged.newBooks, 2, 'only Hamlet and the ebook are new')
const typed = merged.books.find((b) => b.id === 'typed')!
assert.equal(typed.isbn, '9780765326355', 'a typed-in book gains its details')
assert.equal(typed.title, 'the way of kings', 'but keeps the title you gave it')
const scanned = merged.books.find((b) => b.id === 'scanned')
assert.ok(!scanned || scanned.title === 'Nineteen Eighty-Four', 'the scanned book is not renamed')
assert.ok(!merged.books.some((b) => b.title === '1984'), 'and not added again as "1984"')

// Importing the same export twice adds nothing
const after: Collection = { version: 1, books: [...mine.books.filter((b) => !merged.books.some((m) => m.id === b.id)), ...merged.books], quotes: [] }
assert.equal(planImport(goodreadsFile(lib, false), after, NOW).newBooks, 0)

console.log('goodreads tests passed')
