import assert from 'node:assert'
import { formatIsbn, lookupIsbn, mergeInfo, parseGoogleBooks, parseOpenLibrary, pickGoogleCover, pickSearchCover, searchCover, toIsbn13 } from '../src/isbn.ts'

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

// Covers by title: only a clear match, never a near miss
const search = (docs: unknown[]) => ({ docs })
const pir = { title: 'Piranesi', author_name: ['Susanna Clarke'], cover_i: 10226290 }
assert.equal(pickSearchCover(search([pir]), 'Piranesi', 'Susanna Clarke'), 'https://covers.openlibrary.org/b/id/10226290-L.jpg')
assert.equal(
  pickSearchCover(search([{ title: 'Supercommunicators', author_name: ['Charles Duhigg'], cover_i: 1 }]), 'Supercommunicators: How to Unlock the Secret Language of Connection', 'Charles Duhigg'),
  'https://covers.openlibrary.org/b/id/1-L.jpg',
  'the subtitle can differ',
)
assert.equal(pickSearchCover(search([{ ...pir, cover_i: undefined }]), 'Piranesi', 'Susanna Clarke'), undefined, 'no picture, no cover')
assert.equal(pickSearchCover(search([{ title: 'A Study Guide for Piranesi', author_name: ['Gale'], cover_i: 2 }]), 'Piranesi', 'Susanna Clarke'), undefined, 'not a study guide')
assert.equal(pickSearchCover(search([{ title: 'Inkheart', author_name: ['Sonia Sander'], cover_i: 3 }]), 'Inkheart', 'Cornelia Funke, Anthea Bell'), undefined, 'same title, another author')
assert.equal(pickSearchCover(search([{ title: 'Inkheart 4', author_name: ['Cornelia Funke'], cover_i: 4 }]), 'Inkheart', 'Cornelia Funke'), undefined, 'not a sequel')
assert.equal(pickSearchCover(search([{ title: 'Vachanamrut', author_name: ['Bhagwan Swaminarayan'], cover_i: 5 }]), 'Vachanāmrut', 'Bhagwan Swaminarayan'), 'https://covers.openlibrary.org/b/id/5-L.jpg', 'accents fold')
assert.equal(pickSearchCover(search([{ title: 'Kafka on the Shore', author_name: ['村上春樹', 'Haruki Murakami'], cover_i: 6 }]), 'Kafka on the Shore', 'Haruki Murakami, Philip Gabriel'), 'https://covers.openlibrary.org/b/id/6-L.jpg', 'any shared surname')

const gbook = (title: string, authors: string[], thumb = 'http://books.google.com/books/content?id=k&img=1&zoom=1&edge=curl') => ({ volumeInfo: { title, authors, imageLinks: { thumbnail: thumb } } })
assert.equal(pickGoogleCover({ items: [gbook('Inkheart', ['Cornelia Funke'])] }, 'Inkheart', 'Cornelia Funke, Anthea Bell'), 'https://books.google.com/books/content?id=k&img=1&zoom=1')
assert.equal(pickGoogleCover({ items: [gbook('Inkspell', ['Cornelia Funke'])] }, 'Inkheart', 'Cornelia Funke'), undefined)

// Open Library first; Google only for what it misses, and not at all once it refuses
calls.length = 0
assert.ok(await searchCover('Piranesi', 'Susanna Clarke', fake({ 'search.json': search([pir]) })))
assert.equal(calls.length, 1)
calls.length = 0
assert.ok(await searchCover('Inkheart', 'Cornelia Funke', fake({ 'search.json': search([]), googleapis: { items: [gbook('Inkheart', ['Cornelia Funke'])] } })))
assert.equal(calls.length, 2)
const refusing = async (url: string) => (calls.push(url), url.includes('googleapis') ? ({ ok: false, status: 429 }) as Response : json(search([])))
calls.length = 0
assert.equal(await searchCover('Inkheart', 'Cornelia Funke', refusing), undefined)
assert.equal(await searchCover('Inkheart', 'Cornelia Funke', refusing), undefined)
assert.equal(calls.filter((u) => u.includes('googleapis')).length, 1, 'a refused quota is not asked again')
await assert.rejects(searchCover('Piranesi', '', fake({ 'search.json': new Error('offline') })))

console.log('isbn tests passed')
