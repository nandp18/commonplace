import assert from 'node:assert'
import { parseImportFile, planImport } from '../src/importFile.ts'
import type { Book, Collection, Quote } from '../src/types.ts'
import { toBackup } from '../src/util.ts'

const NOW = Date.parse('2026-11-09T12:00:00Z')
const empty: Collection = { version: 1, books: [], quotes: [] }
const book = (id: string, title: string, more: Partial<Book> = {}): Book => ({ id, title, author: 'An Author', createdAt: 1000, updatedAt: 2000, ...more })
const quote = (id: string, text: string, more: Partial<Quote> = {}): Quote => ({ id, text, tags: [], lang: 'eng', createdAt: 1_600_000_000_123, updatedAt: 2000, ...more })

const books = [
  book('b1', 'Quiet', { cover: 'https://example.com/quiet.jpg' }),
  book('b2', 'કલાપીનો કેકારવ', { author: 'કલાપી' }),
  book('b3', 'Not started yet'),
  book('b4', 'Odd cover', { cover: 'http://example.com/insecure.jpg' }),
]
const quotes = [
  quote('q1', 'A filed quote.', { bookId: 'b1', page: '313', tags: ['work', 'calm'], note: 'Reread this.' }),
  quote('q2', 'જ્યાં જ્યાં નજર મારી ઠરે', { bookId: 'b2', lang: 'guj', createdAt: 1_300_000_000_000 }),
  quote('q3', 'A loose page.\n\nWith two paragraphs.'),
  quote('q4', 'Its book was deleted.', { bookId: 'gone' }),
  quote('q5', 'Under the odd cover.', { bookId: 'b4' }),
]

// Through real JSON and the real importer, into an empty library
const file = parseImportFile(JSON.stringify(toBackup(quotes, books)))
const plan = planImport(file, empty, NOW)
assert.equal(plan.quotes.length, 5)
assert.equal(plan.skipped, 0)
assert.equal(plan.books.length, 4, 'every book comes back, including one with no quotes yet')

const titleOf = (id?: string) => plan.books.find((b) => b.id === id)?.title
const byText = (t: string) => plan.quotes.find((q) => q.text === t)!

for (const q of quotes) {
  const back = byText(q.text)
  assert.ok(back, q.text)
  assert.equal(back.createdAt, q.createdAt, 'exact date')
  assert.equal(back.lang, q.lang)
  assert.deepEqual(back.tags, q.tags)
  assert.equal(back.page, q.page)
  assert.equal(back.note, q.note)
}
assert.equal(titleOf(byText('A filed quote.').bookId), 'Quiet')
assert.equal(titleOf(byText('જ્યાં જ્યાં નજર મારી ઠરે').bookId), 'કલાપીનો કેકારવ')
assert.equal(byText('A loose page.\n\nWith two paragraphs.').bookId, undefined)
assert.equal(byText('Its book was deleted.').bookId, undefined)
assert.equal(plan.books.find((b) => b.title === 'કલાપીનો કેકારવ')!.author, 'કલાપી')
assert.equal(plan.books.find((b) => b.title === 'Quiet')!.cover, 'https://example.com/quiet.jpg')
assert.equal(plan.books.find((b) => b.title === 'Odd cover')!.cover, undefined, 'a non-https cover cannot block a restore')

// Restoring onto a library that already has it all adds nothing
const restored: Collection = { version: 1, books: plan.books, quotes: plan.quotes }
const again = planImport(file, restored, NOW)
assert.equal(again.quotes.length, 0)
assert.equal(again.books.length, 0)
assert.equal(again.skipped, 5)

// An empty library makes a valid, empty backup
assert.equal(planImport(parseImportFile(JSON.stringify(toBackup([], []))), empty, NOW).quotes.length, 0)

console.log('backup tests passed')
