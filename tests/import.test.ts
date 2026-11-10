import assert from 'node:assert'
import { buildReview, parseClippings, parseNotion } from '../scripts/highlights.ts'
import { parseImportFile, planImport, type ImportFile } from '../src/importFile.ts'
import type { Collection } from '../src/types.ts'

const SEP = '=========='
const entry = (book: string, meta: string, text: string) => `${book}\n- ${meta}\n\n${text}\n${SEP}\n`
const HP = 'Harry Potter - 7 - The Deathly Hallows (J.K. Rowling)'
const added = 'Added on Monday, January 21, 2019 9:24:42 PM'

// The real format, from the user's Apple Note
const sample = parseClippings(
  entry(HP, `Your Highlight on page 79 | Location 1204-1205 | ${added}`, '“Someone else might kill off Voldemort while she’s holding us here making vol-au-vents?”'),
)
assert.equal(sample.highlights.length, 1)
const h = sample.highlights[0]
assert.equal(h.title, 'Harry Potter - 7 - The Deathly Hallows')
assert.equal(h.author, 'J.K. Rowling')
assert.equal(h.page, '79')
assert.equal(h.date, '2019-01-21T21:24:42')
assert.ok(h.text.startsWith('“Someone'))

// Extended highlight replaced; bookmark skipped; note attached; adjacent highlight survives
const c = parseClippings(
  '﻿' +
    entry('Book (Doe, Jane)', `Your Highlight on page 1 | Location 10-11 | ${added}`, 'The quick brown fox') +
    entry('Book (Doe, Jane)', `Your Highlight on page 1 | Location 10-14 | ${added}`, 'The quick brown fox jumps over the lazy dog') +
    entry('Book (Doe, Jane)', `Your Highlight on page 2 | Location 14-16 | ${added}`, 'A different passage entirely') +
    entry('Book (Doe, Jane)', `Your Note on page 1 | Location 12 | ${added}`, 'Mine') +
    entry('Book (Doe, Jane)', `Your Bookmark on page 9 | Location 90 | ${added}`, '') +
    entry('Book (Doe, Jane)', `Your Note on page 50 | Location 500 | ${added}`, 'Orphan') +
    'garbage with no metadata\n' + SEP,
)
assert.equal(c.superseded, 1)
assert.equal(c.bookmarks, 1)
assert.equal(c.unparsed.length, 1)
assert.equal(c.highlights.length, 3)
const fox = c.highlights.find((x) => x.text.includes('fox'))!
assert.ok(fox.text.includes('lazy dog'))
assert.equal(fox.note, 'Mine')
assert.equal(fox.author, 'Jane Doe')
assert.deepEqual(c.highlights.find((x) => x.text === 'Orphan')!.flags, ['your-note-without-highlight'])

// The real format, from the user's Notion page
const notion = parseNotion(
  `# Deep Work

Author: Cal Newport

**Page 62**

This clarity simplifies decisions about what work habits a professor adopts or
abandons. Here is Feynman:

*To do real good physics work, you do need
absolute solid lengths of time.*

**Page 63**

Clarity about what matters provides clarity about what does not.
`,
  'From file name',
)
assert.equal(notion.highlights.length, 2)
assert.equal(notion.highlights[0].title, 'Deep Work')
assert.equal(notion.highlights[0].author, 'Cal Newport')
assert.equal(notion.highlights[0].page, '62')
assert.equal(
  notion.highlights[0].text,
  'This clarity simplifies decisions about what work habits a professor adopts or abandons. Here is Feynman:\n\nTo do real good physics work, you do need absolute solid lengths of time.',
)
assert.equal(parseNotion('**Page 1**\n\nHello there', 'Title From File').highlights[0].title, 'Title From File')
assert.equal(parseNotion('# Shopping\n\nMilk\n', 'x').skipped, 'no-headings')

// Shapes from the user's real table export
const props = 'Author: A Writer\nImage: https://example.com/' + 'x'.repeat(150) + '.jpg\nCategory: Satsang\nDate Started: March 23, 2020\nDate Finished: April 22, 2020'
assert.equal(parseNotion(`# Empty Book\n\n${props}`, 'x').skipped, 'empty')
assert.equal(
  parseNotion(`# Grit\n\n${props}\n\nGrit (A) - Your Highlight on page 14 | Location 208-209 | Added on Monday, March 4, 2019\n\n**Some line.**`, 'x').skipped,
  'kindle-paste',
)
assert.equal(parseNotion(`# Notes\n\n${props}\n\n- **Chapter 1**\n    - Point\n    \n    ### **“Nested”**\n`, 'x').skipped, 'outline')
const sections = parseNotion(
  `# Essence\n\n${props}\n\n### Kartapanu\n\n**Bold start.** Then more.\n\n### 4 Forms of Akshar (Page 93)\n\nFirst para.\n\n![](a/image.jpg)\n\nSecond para.\n`,
  'x',
)
assert.equal(sections.highlights.length, 2, 'properties and long image urls are not quotes')
assert.equal(sections.highlights[0].author, 'A Writer')
assert.equal(sections.highlights[0].note, 'Kartapanu')
assert.equal(sections.highlights[0].page, undefined)
assert.equal(sections.highlights[0].text, 'Bold start. Then more.')
assert.equal(sections.highlights[1].note, '4 Forms of Akshar')
assert.equal(sections.highlights[1].page, '93')
assert.equal(sections.highlights[1].text, 'First para.\n\nSecond para.')
assert.equal(buildReview(sections.highlights).file.books[0].date, '2020-04-22', 'Date Finished is the fallback date')
assert.equal(parseNotion(`# B\n\n${props}\n\n### Section (Page 7)\n\nIntro:\n\n- a point\n`, 'x').highlights.length, 1, 'a bullet inside a section is not an outline')
assert.equal(parseNotion(`# B\n\nGoodreads: https://example.com/a b c ${'long '.repeat(40)}\n`, 'x').skipped, 'empty')
assert.deepEqual(parseNotion('# B\n\nLoose line\n\n**Page 1**\n\nText', 'x').highlights[0].flags, ['before-first-page-heading'])

// Review: duplicates merged across sources, long and overlapping flagged, grouped by book
const base = { author: '', flags: [] as string[] }
const review = buildReview([
  { ...base, title: 'A', text: 'Same words, here.', origin: 'kindle', date: '2019-01-01T00:00:00' },
  { ...base, title: 'A', text: 'same words here', origin: 'notion', page: '5' },
  { ...base, title: 'A', text: Array(130).fill('word').join(' '), origin: 'notion', page: '2' },
  { ...base, title: 'B', text: 'This is a sentence long enough to count as a match.', origin: 'kindle' },
  { ...base, title: 'C', text: 'Before. This is a sentence long enough to count as a match. After.', origin: 'notion' },
  { ...base, title: 'ગીતા', text: 'કર્મણ્યેવાધિકારસ્તે', origin: 'notion' },
])
assert.equal(review.duplicates, 1)
const a = review.file.books.find((b) => b.title === 'A')!
assert.equal(a.quotes[0].page, '2')
assert.deepEqual(a.quotes[0].flags, ['long'])
assert.equal(a.quotes[1].page, '5')
assert.equal(a.quotes[1].date, '2019-01-01T00:00:00')
assert.deepEqual(review.file.books.find((b) => b.title === 'B')!.quotes[0].flags, ['possible-duplicate'])
assert.equal(review.file.books.find((b) => b.title === 'ગીતા')!.quotes[0].lang, 'guj')

// App side: validation names the problem before anything is written
assert.throws(() => parseImportFile('{nope'), /valid JSON/)
assert.throws(() => parseImportFile('{"version":1,"books":[{"title":"x"}]}'), /import file/)
assert.throws(() => parseImportFile(JSON.stringify({ version: 1, books: [{ title: 'Emma', author: '', date: 'someday', quotes: [] }] })), /Emma.*someday/)

const NOW = Date.parse('2026-11-09T12:00:00')
const file: ImportFile = {
  version: 1,
  books: [
    { title: 'Walden', author: 'Thoreau', date: '2019-03', quotes: [{ text: 'Undated quote' }, { text: 'Dated quote', date: '2018-05-02', page: '4', note: 'Hm' }] },
    { title: 'Brand New', author: 'Someone', quotes: [{ text: 'No date at all', lang: 'eng' }, { text: 'I typed this one already!' }] },
    { title: '', author: '', quotes: [{ text: 'Unfiled quote' }] },
  ],
}
const empty: Collection = { version: 1, books: [], quotes: [] }
const lib: Collection = {
  version: 1,
  books: [{ id: 'w', title: 'walden', author: 'T', createdAt: 1, updatedAt: 1 }],
  quotes: [{ id: 'x', text: 'I typed this one already', tags: [], lang: 'eng', createdAt: 1, updatedAt: 1 }],
}

const plan = planImport(file, lib, NOW)
assert.equal(plan.skipped, 1)
assert.equal(plan.quotes.length, 4)
assert.deepEqual(plan.books.map((b) => b.title), ['Brand New'], 'existing Walden is reused, case-insensitively')
const undated = plan.quotes.find((q) => q.text === 'Undated quote')!
assert.equal(undated.bookId, 'w')
assert.equal(new Date(undated.createdAt).getMonth(), 2, 'book date is the fallback')
assert.equal(new Date(plan.quotes.find((q) => q.text === 'Dated quote')!.createdAt).getDate(), 2, 'a bare date stays on its day')
assert.equal(plan.quotes.find((q) => q.text === 'No date at all')!.createdAt, NOW)
assert.equal(plan.quotes.find((q) => q.text === 'Unfiled quote')!.bookId, undefined)

// Importing twice adds nothing, ids are stable, and a deleted quote stays deleted
const first = planImport(file, empty, NOW)
const after: Collection = { version: 1, books: first.books, quotes: first.quotes }
const second = planImport(file, after, NOW + 1000)
assert.equal(second.quotes.length, 0)
assert.equal(second.skipped, first.quotes.length)
const tombs = first.quotes.map((q) => ({ ...q, deleted: true }))
assert.equal(planImport(file, { ...after, quotes: tombs }, NOW).quotes.length, 0)

// Covers fill in books you already have, once, without touching their quotes
const COVER = 'https://example.com/a.jpg'
const coverFile: ImportFile = { version: 1, books: [{ title: 'WALDEN', author: '', cover: COVER, quotes: [] }, { title: 'Not In Library', author: '', cover: COVER, quotes: [] }] }
const withCover = planImport(coverFile, lib, NOW)
assert.equal(withCover.covers, 1, 'a cover for a book you do not have is ignored')
assert.equal(withCover.quotes.length, 0)
assert.deepEqual(withCover.books.map((b) => [b.id, b.title, b.cover, b.updatedAt]), [['w', 'walden', COVER, NOW]])
assert.equal(withCover.books[0].createdAt, 1)
const covered = { ...lib, books: withCover.books }
assert.equal(planImport(coverFile, covered, NOW + 1).covers, 0, 'an existing cover is kept')
const brandNew = planImport({ version: 1, books: [{ title: 'Fresh', author: 'A', cover: COVER, quotes: [{ text: 'A new one' }] }] }, empty, NOW)
assert.equal(brandNew.books[0].cover, COVER)
assert.equal(brandNew.covers, 1)
assert.equal(brandNew.books.length, 1)
assert.throws(() => parseImportFile(JSON.stringify({ version: 1, books: [{ title: 'X', author: '', cover: 'javascript:alert(1)', quotes: [] }] })), /https link/)

console.log('import tests passed')
