import assert from 'node:assert'
import { fitCard, wrap, type CardContent } from '../src/shareCard.ts'

const measure = (s: string, size: number) => s.length * size * 0.5
const card = (text: string, more: Partial<CardContent> = {}): CardContent => ({ text, gu: false, ...more })

assert.deepEqual(wrap('one two three four', 9, (s) => s.length), ['one two', 'three', 'four'])
assert.deepEqual(wrap('first\n\nsecond', 100, (s) => s.length), ['first', '', 'second'], 'keeps paragraph gaps')
assert.deepEqual(wrap('unbreakableword x', 5, (s) => s.length), ['unbreakableword', 'x'], 'a long word still gets a line')

// Short quotes are big, long quotes smaller, and all stay inside the card
const short = fitCard(card('Be here now.'), 880, 830, measure)
const long = fitCard(card('word '.repeat(150).trim()), 880, 830, measure)
assert.equal(short.size, 76)
assert.ok(long.size < short.size)
assert.ok(long.height <= 830)
assert.equal(long.lines.join(' ').replace(/\s+/g, ' '), 'word '.repeat(150).trim(), 'nothing lost when it fits')

// Pronunciation is shown when there's room, and goes before any of the quote does
const withSub = fitCard(card('ટીપે ટીપે સરોવર ભરાય', { translit: 'teepe teepe sarovar bharaay', gu: true }), 880, 830, measure)
assert.ok(withSub.sub.length > 0 && withSub.height <= 830)
const crowded = 'શબ્દ '.repeat(150).trim()
const tight = fitCard(card(crowded, { translit: 'shabd '.repeat(150).trim(), gu: true }), 880, 830, measure)
assert.equal(tight.sub.length, 0)
assert.ok(tight.height <= 830)
assert.equal(tight.lines.join(' ').replace(/\s+/g, ' '), crowded, 'the whole quote still fits without it')

// Only a truly enormous passage gets cut, and it says so
const huge = fitCard(card('word '.repeat(2000).trim()), 880, 830, measure)
assert.ok(huge.height <= 830)
assert.ok(huge.lines[huge.lines.length - 1].endsWith('…'))

console.log('share card tests passed')
