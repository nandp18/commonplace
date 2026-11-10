import assert from 'node:assert'
import { applyWarp, findSkew, mapWords, measureWarp, preferFlat, shiftAt, unflatten, type Ink, type Warp } from '../src/flatten.ts'
import { formatSelection, readsAsEnglish } from '../src/format.ts'
import type { OcrWord } from '../src/selection.ts'

const W = 1200, H = 900

/** Lines of dashes, like words, with each line's height at x given by `bend`. */
function page(bend: (x: number) => number): Ink {
  const data = new Uint8Array(W * H)
  for (let top = 100; top < H - 120; top += 60)
    for (let x = 80; x < W - 80; x++) {
      if ((x % 90) > 72) continue // gaps between words
      const y0 = Math.round(top + bend(x))
      for (let y = y0; y < y0 + 26; y++) if (y >= 0 && y < H) data[y * W + x] = 1
    }
  return { w: W, h: H, data }
}

const near = (a: number, b: number, tol: number, msg: string) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, wanted ${b}±${tol}`)

// Tilt is measured with the right sign: positive means text runs downhill
const tilt = (deg: number) => (x: number) => (x - W / 2) * Math.tan((deg * Math.PI) / 180)
near(findSkew(page(tilt(3))), 3, 0.3, 'downhill')
near(findSkew(page(tilt(-2))), -2, 0.3, 'uphill')
near(findSkew(page(() => 0)), 0, 0.3, 'level')

// A bowed page: shifts follow the bow and flattening straightens it
const bow = (x: number) => 18 * Math.sin(((x - W / 2) / W) * Math.PI)
const bowed = page(bow)
const warp = measureWarp(bowed, W)
near(shiftAt(warp, W * 0.8, H / 2) - shiftAt(warp, W / 2, H / 2), bow(W * 0.8), 6, 'right side of the bow')
near(shiftAt(warp, W * 0.2, H / 2) - shiftAt(warp, W / 2, H / 2), bow(W * 0.2), 6, 'left side of the bow')

const rgba = new Uint8ClampedArray(W * H * 4).fill(255)
bowed.data.forEach((v, i) => {
  if (v) rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = 0
})
const out = new Uint8ClampedArray(W * H * 4)
applyWarp(rgba, out, W, H, warp)
const rowsWithInk = (px: Uint8ClampedArray, x0: number, x1: number) => {
  const rows = new Set<number>()
  for (let y = 0; y < H; y++) for (let x = x0; x < x1; x++) if (px[(y * W + x) * 4] < 128) rows.add(y)
  return rows
}
const overlap = (a: Set<number>, b: Set<number>) => [...a].filter((y) => b.has(y)).length / Math.max(a.size, b.size)
const before = overlap(rowsWithInk(rgba, 200, 280), rowsWithInk(rgba, 920, 1000))
const after = overlap(rowsWithInk(out, 200, 280), rowsWithInk(out, 920, 1000))
assert.ok(after > before + 0.2, `lines should line up after flattening: ${before.toFixed(2)} → ${after.toFixed(2)}`)

// Positions come back to the photo: rotating a point forward then unflattening is a round trip
const noWarp: Warp = { field: Array.from({ length: 7 }, () => new Float32Array(28)), scale: 1, stripW: W / 28, zoneH: H / 7 }
for (const deg of [2.4, -1.1, 0]) {
  const a = (deg * Math.PI) / 180
  const photo = { x: 300, y: 700 }
  const dx = photo.x - W / 2, dy = photo.y - H / 2
  // The canvas is drawn rotated by -deg, the same transform flattenPhoto uses.
  const flatX = dx * Math.cos(a) + dy * Math.sin(a) + W / 2
  const flatY = -dx * Math.sin(a) + dy * Math.cos(a) + H / 2
  const back = unflatten(flatX, flatY, W, H, deg, noWarp)
  near(back.x, photo.x, 0.01, `x at ${deg}°`)
  near(back.y, photo.y, 0.01, `y at ${deg}°`)
}

// A word's shift is undone: text found lower on the flat canvas maps by its shift
const shifted: Warp = { ...noWarp, field: noWarp.field.map(() => new Float32Array(28).fill(10)) }
near(unflatten(600, 300, W, H, 0, shifted).y, 310, 0.01, 'vertical shift')

const word = (text: string, conf: number, x = 0): OcrWord => ({ text, conf, x0: x, y0: 0, x1: x + 40, y1: 20, line: 0, para: 0 })

// Boxes keep their size and move with their centre
assert.deepEqual(
  mapWords([word('a', 90, 100)], (x, y) => ({ x: x + 5, y: y - 3 })).map((w) => [w.x0, w.y0, w.x1, w.y1]),
  [[105, -3, 145, 17]],
)

// A flattened read only wins when it's clearly better and didn't lose words
const plain = [word('a', 80), word('b', 80), word('c', 80), word('d', 80)]
assert.equal(preferFlat(plain, plain.map((w) => ({ ...w, conf: 85 }))), true)
assert.equal(preferFlat(plain, plain.map((w) => ({ ...w, conf: 81 }))), false, 'too close to call')
assert.equal(preferFlat(plain, plain.map((w) => ({ ...w, conf: 60 }))), false, 'scrambled')
assert.equal(preferFlat(plain, [word('a', 99), word('b', 99)]), false, 'lost words')

// Unsure Gujarati words are kept and flagged, garbled Latin is still thrown away
const low = [word('અમેરિકામાં', 4, 0), word('xq', 4, 50), word('છે', 95, 100)]
const kept = formatSelection(low, [0, 2])
assert.equal(kept.text, 'અમેરિકામાં છે')
assert.deepEqual(kept.uncertain, ['અમેરિકામાં'])

// An English page read by the Gujarati model is caught by its script, even at high confidence
assert.equal(readsAsEnglish([word('It', 96), word('was', 96), word('the', 96)]), true)
assert.equal(readsAsEnglish([word('આપણે', 60), word('Wonderful', 90), word('ભગવાનને', 60), word('તો', 80)]), false, 'an English word on a Gujarati page')
assert.equal(readsAsEnglish([]), false)

console.log('flatten tests passed')
