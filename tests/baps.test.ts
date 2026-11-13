import assert from 'node:assert/strict'
import { bapsCover, isBapsBook } from '../src/baps.ts'

const AP = 'Swaminarayan Aksharpith'
const id = (url?: string) => url?.match(/ProductCategoryImages\/(\d+)\//)?.[1]

// Exact, and across "&"/"and" and the catalog's "- " for a colon.
assert.equal(id(bapsCover('Brahmaswarup Shri Pramukh Swami Maharaj (Part 3)', 'Sadhu Adarshjivandas', AP)), '1375')
assert.equal(id(bapsCover('Invaluable Scriptures of Brahmavidya: Vachanamrut and Swamini Vato', 'Sadhu Brahmadarshandas', AP)), '966')
assert.equal(id(bapsCover('Yogiji Maharaj: An Unforgettable Guru', 'Mohanbhai Patel', AP)), '1276')
// Subtitle dropped; a one-letter spelling difference ("Upnishads").
assert.equal(id(bapsCover('In the Joy of Others: A Life Sketch of Pramukh Swami Maharaj', 'Mohanlal Patel', AP)), '969')
assert.equal(id(bapsCover('Essence of the Upanishads: The Wisdom of the Ancient Rishis', 'Sadhu Bhadreshdas', AP)), '756')
// Parts: "Divine Memories - Part 4: …" and "Impressions - Part 1".
assert.equal(id(bapsCover('Divine Memories - Part 4: An account of …', 'Sadhu Keshavjivandas', AP)), '335')
assert.equal(id(bapsCover('Impressions - Part 1', 'Sadhu Vivekjivandas', 'BAPS Aksharpith')), '51')
// The catalog title is the start of the book's; or the book is one volume of a set.
assert.equal(id(bapsCover('101 Tales of Wisdom as told by Yogiji Maharaj', 'Yogiji Maharaj', AP)), '1277')
assert.equal(id(bapsCover('Aksharbrahman Gunatitanand Swami: Life and Work (Part 1)', 'Sadhu Aksharvatsaldas', AP)), '1298')
// A sadhu author is enough when there's no publisher.
assert.equal(id(bapsCover('Akshar Purushottam Upasana', 'Sadhu Paramtattvadas')), '671')
// The URL: .jpg unless the catalog says otherwise.
assert.match(bapsCover('Eternal Virtues', '', AP)!, /^https:\/\/www\.baps\.org\/Data\/Sites\/1\/Media\/ProductCategoryImages\/337\/Thumbnails\/[0-9a-f-]{36}\.jpg$/)
assert.match(bapsCover('Hidden Horizons', '', AP)!, /\.JPG$/)

// Not a BAPS book: same title, no cover from the catalog.
assert.equal(isBapsBook('Shashi Tharoor', 'Penguin'), false)
assert.equal(bapsCover('India', 'John Keay', 'Grove Press'), undefined)
assert.equal(bapsCover('Impressions', 'Someone Else', 'Random House'), undefined)
// Not in the catalog, and short titles aren't stretched to fit.
assert.equal(bapsCover('Rajipo: The Purpose and Process of Pleasing God', 'Sadhu Adarshjivandas', AP), undefined)
assert.equal(bapsCover('Bhagwan', 'Sadhu X', AP), undefined)

console.log('baps: ok')
