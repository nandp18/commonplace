import { selectRange, detectPageNumber, classify, lineHeight } from '../src/selection.ts'
import { formatSelection, tidy } from '../src/format.ts'
import fs from 'node:fs'
import assert from 'node:assert'
const eng = JSON.parse(fs.readFileSync(new URL('./fixtures/eng-words.json', import.meta.url), 'utf8'))
const guj = JSON.parse(fs.readFileSync(new URL('./fixtures/guj-words.json', import.meta.url), 'utf8'))

// Wobbly human stroke helpers (deterministic jitter)
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5)
const wobble = (pts: {x:number,y:number}[], amt: number) => pts.map(p => ({ x: p.x + rnd() * amt, y: p.y + rnd() * amt }))
const line = (a: [number, number], b: [number, number], n = 12) =>
  Array.from({ length: n + 1 }, (_, i) => ({ x: a[0] + ((b[0] - a[0]) * i) / n, y: a[1] + ((b[1] - a[1]) * i) / n }))
const ellipse = (cx: number, cy: number, rx: number, ry: number, from = 0, sweep = 360, tilt = 0) =>
  Array.from({ length: 40 }, (_, i) => { const t = ((from + (sweep * i) / 39) * Math.PI) / 180
    const x = rx * Math.cos(t), y = ry * Math.sin(t)
    return { x: cx + x * Math.cos(tilt) - y * Math.sin(tilt), y: cy + x * Math.sin(tilt) + y * Math.cos(tilt) } })

const run = (name: string, words: any[], stroke: any[], expected: string) => {
  const r = selectRange(words, stroke)
  const out = r ? formatSelection(words, r).text : '(nothing)'
  const kind = classify(stroke, lineHeight(words))
  const ok = out === expected
  console.log(`${ok ? '✓' : '✗'} ${name} [${kind}]\n    ${out}${ok ? '' : `\n  expected: ${expected}`}`)
  return ok
}

let pass = true
pass = run('swipe along part of a line', eng, wobble(line([1680, 585], [2950, 560]), 30),
  '…made one believe in second chances.') && pass
pass = run('diagonal swipe from start word to end word', eng, wobble(line([1300, 1090], [1450, 1350], 20), 25),
  'She kept a notebook of lines she loved, copied out in a careful hand, and when I asked her why, she said that a book you only read is a book you only borrow.') && pass
pass = run('lopsided open loop missing first word', eng, wobble(ellipse(1120, 1463, 640, 95, 200, 320, 0.05), 30),
  'I did not understand her then.') && pass
pass = run('big sloppy loop around a paragraph, clipping the line above', eng,
  wobble(ellipse(1800, 1585, 1650, 260, 0, 380, -0.03), 50),
  'I did not understand her then. I understand her now. What we keep, keeps us; the rest is weather, passing over the long country of a life without leaving a mark.') && pass
pass = run('concave loop around a mid-line start (staircase shape)', eng, wobble([
  ...line([2620, 1400], [3360, 1400], 6), ...line([3360, 1400], [3360, 1680], 3), ...line([3360, 1680], [800, 1700], 8),
  ...line([800, 1800], [250, 1800], 3), ...line([250, 1800], [250, 1530], 3), ...line([250, 1530], [2600, 1530], 8)], 20),
  'What we keep, keeps us; the rest is weather, passing over the long country of a life without leaving a mark.') && pass
pass = run('underline beneath a line', eng, wobble(line([300, 888], [2560, 882], 16), 20),
  '…last arcs over the water before the dark came in from the hills.') && pass
pass = run('gujarati diagonal swipe', guj, wobble(line([1900, 1175], [560, 1340], 16), 25), 'આપણે જે સાચવીએ છીએ, તે જ આપણને સાચવે છે…') && pass
pass = run('gujarati loop around a sentence', guj, wobble(ellipse(780, 1176, 420, 90, 90, 330), 30), 'ત્યારે મને સમજાયું નહીં.') && pass

console.log('page:', detectPageNumber(eng), detectPageNumber(guj))
assert.equal(detectPageNumber(eng), '42'); assert.equal(detectPageNumber(guj), '57')
for (const [a, b] of [
  ['"You read too much ," she said -- softly ...', '“You read too much,” she said — softly…'],
  ["it 's the reader's", 'it’s the reader’s'],
  ['( hello )', '(hello)'],
]) { const t = tidy(a); console.log(t === b ? '✓' : '✗', JSON.stringify(t)); pass &&= t === b }
process.exit(pass ? 0 : 1)
