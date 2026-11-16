import assert from 'node:assert'
import { diffWords, distance, normalize, pool, samePageNumber, scorePage, textOfWords, wordsOf } from '../src/bench/score.ts'

// Typography that varies between readers but not between pages is folded away
assert.equal(normalize('“It’s —  done…”\n'), `"It's - done..."`)
assert.equal(normalize('ક્‍ષ'), 'ક્ષ')
assert.equal(normalize('ક઼'), 'ક઼'.normalize('NFC'))

assert.deepEqual(wordsOf('The cat, “sat.”  ON'), ['the', 'cat', 'sat', 'on'])
assert.deepEqual(wordsOf('સાંજ પડી.'), ['સાંજ', 'પડી'], 'Gujarati vowel signs stay part of the word')

assert.equal(distance([...'kitten'], [...'sitting']), 3)
assert.equal(distance([], [...'abc']), 3)
assert.equal(distance(['a', 'b'], ['a', 'b']), 0)

// A perfect read scores zero; line breaks and spacing don't count
const perfect = scorePage('He is like an\nunsinkable ship.', 'He is like an unsinkable  ship.')
assert.equal(perfect.cer, 0)
assert.equal(perfect.wer, 0)

// One wrong letter is one character edit and one word edit
const typo = scorePage('He is like an unsinkab1e ship.', 'He is like an unsinkable ship.')
assert.equal(typo.charEdits, 1)
assert.equal(typo.wordEdits, 1)
assert.equal(typo.words, 6)
assert.ok(Math.abs(typo.wer - 1 / 6) < 1e-9)

// Nothing read at all is every character missed
assert.equal(scorePage('', 'abc').cer, 1)

// Words come back as lines in reading order
assert.equal(
  textOfWords([
    { text: 'one', line: 0 },
    { text: 'two', line: 0 },
    { text: 'three', line: 1 },
  ]),
  'one two\nthree',
)

assert.ok(samePageNumber('૧૨૩', '123'), 'Gujarati digits match Western ones')
assert.ok(samePageNumber(undefined, undefined), 'no page number, none found')
assert.ok(!samePageNumber('12', '123'))

// Pooling weights by size: a long clean page outweighs a short bad one
const long = { ...scorePage('a'.repeat(99) + 'b', 'a'.repeat(100)), pageNumberRight: true }
const short = { ...scorePage('xx', 'ab'), pageNumberRight: false }
const both = pool([long, short])
assert.ok(Math.abs(both.cer - 3 / 102) < 1e-9)
assert.equal(both.pageNumbers, 0.5)

assert.deepEqual(diffWords('the cat sat', 'the bat sat'), [
  { op: 'same', text: 'the' },
  { op: 'extra', text: 'cat' },
  { op: 'missing', text: 'bat' },
  { op: 'same', text: 'sat' },
])

console.log('score tests passed')
