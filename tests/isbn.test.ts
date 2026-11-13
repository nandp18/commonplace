import assert from 'node:assert'
import { formatIsbn, lookupIsbn, mergeInfo, parseGoogleBooks, parseOpenLibrary, toIsbn13 } from '../src/isbn.ts'

// Checking and converting
assert.equal(toIsbn13('978-0-14-118776-1'), '9780141187761')
assert.equal(toIsbn13('9780141187761'), '9780141187761')
assert.equal(toIsbn13('0-14-118776-X'), '9780141187761', 'ISBN-10 becomes its ISBN-13')
assert.equal(toIsbn13('080442957X'), '9780804429573', 'X check digit')
assert.equal(toIsbn13('9780141187762'), null, 'bad check digit')
assert.equal(toIsbn13('5012345678900'), null, 'a grocery EAN-13 is not an ISBN')
assert.equal(toIsbn13('12345'), null)
assert.equal(toIsbn13(''), null)
assert.equal(formatIsbn('9780141187761'), '978 0141187761')

// Open Library's shape
const OL = {
  'ISBN:9780141187761': {
    title: ' Nineteen  Eighty-Four ',
    authors: [{ name: 'George Orwell' }],
    publishers: [{ name: 'Penguin Books' }],
    publish_date: 'May 2004',
    cover: { small: 'https://covers.openlibrary.org/b/id/1-S.jpg', large: 'https://covers.openlibrary.org/b/id/1-L.jpg' },
  },
}
const ol = parseOpenLibrary(OL, '9780141187761')!
assert.equal(ol.title, 'Nineteen Eighty-Four')
assert.equal(ol.author, 'George Orwell')
assert.equal(ol.publisher, 'Penguin Books')
assert.equal(ol.year, '2004')
assert.equal(ol.cover, 'https://covers.openlibrary.org/b/id/1-L.jpg')
assert.equal(parseOpenLibrary({}, '9780141187761'), null)

// Google Books' shape
const GB = {
  items: [
    {
      volumeInfo: {
        title: 'Good Omens',
        authors: ['Terry Pratchett', 'Neil Gaiman'],
        publishedDate: '2006-11-28',
        imageLinks: { thumbnail: 'http://books.google.com/books/content?id=x&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api' },
      },
    },
  ],
}
const gb = parseGoogleBooks(GB)!
assert.equal(gb.author, 'Terry Pratchett, Neil Gaiman', 'several authors')
assert.equal(gb.year, '2006')
assert.equal(gb.publisher, undefined)
assert.ok(gb.cover!.startsWith('https://'), 'covers are fetched over https')
assert.ok(!gb.cover!.includes('edge=curl'))
assert.equal(parseGoogleBooks({ totalItems: 0 }), null)

// The first source wins; the second fills its gaps
const merged = mergeInfo({ ...ol, cover: undefined, author: '' }, gb)!
assert.equal(merged.title, 'Nineteen Eighty-Four')
assert.equal(merged.author, 'Terry Pratchett, Neil Gaiman')
assert.equal(merged.cover, gb.cover)
assert.equal(merged.source, 'Open Library')

// Lookup: Open Library, then Google Books only when something's missing
const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response
const calls: string[] = []
const fake = (answers: Record<string, unknown>) => async (url: string) => {
  calls.push(url)
  for (const [k, v] of Object.entries(answers)) if (url.includes(k)) return v instanceof Error ? Promise.reject(v) : json(v)
  return json(null, false)
}
assert.equal((await lookupIsbn('9780141187761', fake({ 'openlibrary.org/api': OL })))!.title, 'Nineteen Eighty-Four')
assert.equal(calls.length, 1, 'a complete Open Library record needs nothing more')

calls.length = 0
const fromGoogle = await lookupIsbn('9780060853983', fake({ 'openlibrary.org/api': {}, googleapis: GB }))
assert.equal(fromGoogle!.title, 'Good Omens')
assert.equal(fromGoogle!.source, 'Google Books')

assert.equal(await lookupIsbn('9780060853983', fake({ 'openlibrary.org/api': {}, googleapis: { totalItems: 0 } })), null, 'no such book')
await assert.rejects(lookupIsbn('9780060853983', fake({ 'openlibrary.org': new Error('offline'), googleapis: new Error('offline') })), /Couldn’t reach/)

console.log('isbn tests passed')
