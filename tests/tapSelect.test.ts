import assert from 'node:assert'
import { extendTo, sentenceAt, wordAt } from '../src/selection.ts'

// Two lines: "The sea is wide. It holds every drop" / "we keep. Then the tide turns."
const text = ['The', 'sea', 'is', 'wide.', 'It', 'holds', 'every', 'drop', 'we', 'keep.', 'Then', 'the', 'tide', 'turns.']
const words = text.map((t, i) => {
  const line = i < 8 ? 0 : 1
  const col = line ? i - 8 : i
  return { text: t, conf: 90, x0: col * 100, x1: col * 100 + 80, y0: line * 50, y1: line * 50 + 30, line, para: 0 }
})

assert.deepEqual(sentenceAt(words, 1), [0, 3])
// A sentence carries across the line break
assert.deepEqual(sentenceAt(words, 6), [4, 9])
assert.deepEqual(sentenceAt(words, 13), [10, 13])
// Tapping a later sentence extends to its end; tapping inside leaves it
assert.deepEqual(extendTo(words, [0, 3], 12), [0, 13])
assert.deepEqual(extendTo(words, [10, 13], 1), [0, 13])
assert.deepEqual(extendTo(words, [4, 9], 5), [4, 9])
// A finger on a word hits it; one in a wide margin doesn't
assert.equal(wordAt(words, { x: 140, y: 15 }, 20), 1)
assert.equal(wordAt(words, { x: 2000, y: 15 }, 20), null)
console.log('tapSelect tests passed')
