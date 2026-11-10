import assert from 'node:assert'
import { pickTide, whenLabel, type Seen } from '../src/tide.ts'

const NOW = Date.parse('2026-11-09T12:00:00')
const YEAR = 365.25 * 24 * 60 * 60 * 1000
const q = (id: string, yearsAgo = 0) => ({ id, createdAt: NOW - yearsAgo * YEAR })
const random = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32)

assert.equal(pickTide([], {}, NOW, Math.random), undefined)
assert.equal(pickTide([q('only')], {}, NOW, Math.random, 'only')!.id, 'only', 'a lone quote can repeat')

// Never shown beats already shown, and the quote you're on is never picked
const seen: Seen = { a: NOW - 1, b: NOW - 2 }
for (let i = 0; i < 200; i++) assert.equal(pickTide([q('a'), q('b'), q('new')], seen, NOW, random(i + 1))!.id, 'new')
for (let i = 0; i < 200; i++) assert.notEqual(pickTide([q('a'), q('b'), q('c')], {}, NOW, random(i + 1), 'a')!.id, 'a')

// Riding repeatedly goes through every quote exactly once before any repeat
const library = Array.from({ length: 50 }, (_, i) => q(`q${i}`, i % 7))
const history: Seen = {}
const rand = random(42)
const order: string[] = []
let last: string | undefined
for (let t = 0; t < 50; t++) {
  last = pickTide(library, history, NOW + t, rand, last)!.id
  history[last] = NOW + t
  order.push(last)
}
assert.equal(new Set(order).size, 50)

// After that, it returns to the ones seen longest ago
const next = pickTide(library, history, NOW + 50, rand, last)!.id
assert.ok(order.indexOf(next) < Math.ceil(library.length / 4))

// Older quotes come up more often, without crowding out new ones
const counts = { old: 0, recent: 0 }
const r2 = random(7)
for (let i = 0; i < 20000; i++) counts[pickTide([q('old', 6), q('recent', 0)], {}, NOW, r2)!.id as 'old' | 'recent']++
assert.ok(counts.old / counts.recent > 3 && counts.old / counts.recent < 5, `old:recent was ${counts.old}:${counts.recent}`)

assert.equal(whenLabel(Date.parse('2019-01-21T21:24:42'), NOW), 'Highlighted January 2019 · 7 years ago')
assert.equal(whenLabel(NOW - YEAR * 1.5, NOW).endsWith('· 1 year ago'), true)
assert.equal(whenLabel(Date.parse('2026-03-02T12:00:00'), NOW), 'Highlighted March 2026')

console.log('tide tests passed')
