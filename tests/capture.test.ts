import assert from 'node:assert'
import { formatSelection, sharperRead } from '../src/format.ts'
import { trimHeading, type OcrWord } from '../src/selection.ts'

/** Lines of text → words, each line given as [text, paragraph]. */
const page = (lines: [string, number][], conf = 90): OcrWord[] =>
  lines.flatMap(([text, para], line) =>
    text.split(' ').map((t, i) => ({ text: t, conf, x0: i * 100, x1: i * 100 + 90, y0: line * 50, y1: line * 50 + 40, line, para })),
  )
const all = (w: OcrWord[]): [number, number] => [0, w.length - 1]

// False paragraph breaks in the middle of a sentence are joined; real ones stay
const split = page([
  ['One should take refuge in Mulji Bhakta. He is like an unsinkable', 0],
  ['ship that can take one across the ocean of worldly', 1],
  ['existence. He will inspire them.', 2],
  ['A new thought begins here.', 3],
])
assert.equal(
  formatSelection(split, all(split)).text,
  'One should take refuge in Mulji Bhakta. He is like an unsinkable ship that can take one across the ocean of worldly existence. He will inspire them.\n\nA new thought begins here.',
)

// A heading caught at the top of a selection is dropped
const headed = page([
  ['SHOULD TAKE IN MULJI', 0],
  ['Then, as if something had been left unsaid, Maharaj declared.', 0],
])
assert.deepEqual(trimHeading(headed, all(headed)), [4, headed.length - 1])
assert.equal(formatSelection(headed, [4, headed.length - 1]).text, 'Then, as if something had been left unsaid, Maharaj declared.', 'no ellipsis after a heading')

const twoLineHeading = page([['CHAPTER NINE', 0], ['THE LONG ROAD', 0], ['It was a very long road indeed.', 1]])
assert.deepEqual(trimHeading(twoLineHeading, all(twoLineHeading)), [5, twoLineHeading.length - 1])

// …but ordinary text is left alone
for (const lines of [
  [['Then, as if something had been left', 0], ['unsaid, Maharaj declared this to all.', 0]],
  [['NASA', 0], ['launched the rocket into a clear sky.', 0]],
  [['STOP RIGHT THERE!', 0], ['He said it twice before he left.', 0]],
] as [string, number][][]) {
  const w = page(lines)
  assert.equal(trimHeading(w, all(w))[0], 0, lines[0][0])
}
const onlyHeading = page([['SHOULD TAKE IN MULJI', 0]])
assert.deepEqual(trimHeading(onlyHeading, all(onlyHeading)), all(onlyHeading), 'a heading you selected on its own stays')
const midLine = page([['SHOULD TAKE IN MULJI', 0], ['Then he spoke to all of them.', 0]])
assert.equal(trimHeading(midLine, [1, midLine.length - 1])[0], 1, 'a selection starting mid-line is left alone')

// The closer read is used only when it's better and saw the same words
const blurry = page([['He is like an unpaialieled ship', 0]], 60)
const sharp = page([['He is like an unparalleled ship', 0]], 92)
const worse = page([['He is like an unpaialieled ship', 0]], 40)
const lost = page([['He', 0]], 99)
assert.equal(sharperRead(blurry, sharp), sharp)
assert.equal(sharperRead(blurry, worse), undefined)
assert.equal(sharperRead(blurry, lost), undefined)
assert.equal(formatSelection(blurry, all(blurry), sharp).text, 'He is like an unparalleled ship')
assert.equal(formatSelection(blurry, all(blurry), worse).text, 'He is like an unpaialieled ship')
assert.deepEqual(formatSelection(blurry, all(blurry), sharp).uncertain, [], 'unsure marks follow the read that was used')

console.log('capture tests passed')
