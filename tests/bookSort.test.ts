import assert from 'node:assert/strict'
import { sortBooks } from '../src/bookSort.ts'
import type { Book, Quote } from '../src/types.ts'

const day = (n: number) => Date.UTC(2025, 0, n)
const book = (id: string, title: string, author: string, read: number): Book => ({ id, title, author, createdAt: day(read), updatedAt: 0 })
const quote = (bookId: string, on: number): Quote => ({ id: `${bookId}${on}`, bookId, text: '…', tags: [], lang: 'eng', createdAt: day(on), updatedAt: 0 })

const books = [
  book('kings', 'The Way of Kings', 'Brandon Sanderson', 5),
  book('sapiens', 'Sapiens', 'Yuval Noah Harari', 20),
  book('earthsea', 'A Wizard of Earthsea', 'Ursula K. Le Guin', 1),
  book('anon', 'Beowulf', '', 10),
  book('animal', 'Animal Farm', 'George Orwell', 3),
]
// Earthsea was read long ago but quoted yesterday; Kings has the most quotes.
const quotes = [quote('earthsea', 30), quote('kings', 6), quote('kings', 7), quote('kings', 8), quote('animal', 4)]
const ids = (by: Parameters<typeof sortBooks>[2]) => sortBooks(books, quotes, by).map((b) => b.id)

assert.deepEqual(ids('recent'), ['earthsea', 'sapiens', 'anon', 'kings', 'animal'])
// "The" and "A" are skipped: Animal, Beowulf, Sapiens, Way, Wizard.
assert.deepEqual(ids('title'), ['animal', 'anon', 'sapiens', 'kings', 'earthsea'])
// By surname; no author goes last.
assert.deepEqual(ids('author'), ['earthsea', 'sapiens', 'animal', 'kings', 'anon'])
// Most quotes, ties broken by most recent.
assert.deepEqual(ids('quotes'), ['kings', 'earthsea', 'animal', 'sapiens', 'anon'])
// Doesn't reorder the shelf it was given.
assert.equal(books[0].id, 'kings')

console.log('bookSort: ok')
