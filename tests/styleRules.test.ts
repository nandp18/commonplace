import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { bandFor, bezierPoints, cheapToAnimate, houseEasing, readStyles, splitOutside } from '../src/styleRules.ts'

assert.deepEqual(splitOutside('a 1s cubic-bezier(0, 1, 0, 1), b 2s', ','), ['a 1s cubic-bezier(0, 1, 0, 1)', 'b 2s'])
assert.deepEqual(splitOutside('transform 0.3s var(--spring)', ' '), ['transform', '0.3s', 'var(--spring)'])

const facts = readStyles(`
  /* a comment with { braces } and 9s */
  :root { --gold: #b58a35; --spring: cubic-bezier(0.32, 0.72, 0, 1); }
  .button { font-size: 17px; color: rgba(60, 50, 25, 0.1); transition: transform 0.3s var(--spring), opacity 0.2s, width 400ms ease-out; }
  .label { font: 500 11px/1.2 var(--mono); color: var(--gold); }
  .hint { font: 500 11px/1.2 var(--mono); animation: rise 0.45s var(--spring) 0.1s both, shimmer 2.4s linear infinite; }
  .menu { transition: opacity 0.2s, visibility 0s 0.35s; }
  .card:active { transition-duration: 0.12s; }
  @keyframes rise { from { opacity: 0; transform: translateY(10px); } }
  @keyframes fresh { 0% { background: rgba(181, 138, 53, 0.14); } 100% { background: transparent; } }
  @media (prefers-reduced-motion: reduce) { * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }
`)

assert.deepEqual(facts.tokens, [
  { name: '--gold', value: '#b58a35' },
  { name: '--spring', value: 'cubic-bezier(0.32, 0.72, 0, 1)' },
])
assert.deepEqual(facts.sizes, [
  { px: 11, where: ['.label', '.hint'] },
  { px: 17, where: ['.button'] },
])
// A delay is not a duration, a zero-length switch isn't one, and neither is the reduced-motion override
assert.deepEqual(facts.durations.map((d) => [d.seconds, d.loop]), [[0.12, false], [0.2, false], [0.3, false], [0.4, false], [0.45, false], [2.4, true]])
assert.deepEqual(facts.durations.find((d) => d.seconds === 0.2)!.where, ['.button', '.menu'])
assert.deepEqual(facts.easings.map((e) => e.value).sort(), ['ease-out', 'linear', 'var(--spring)'])
assert.deepEqual(facts.animated.map((a) => a.property).sort(), ['background', 'opacity', 'transform', 'width'])
assert.deepEqual(facts.animated.find((a) => a.property === 'background')!.where, ['@keyframes fresh'])
// Token values are the palette; only colours written out elsewhere are counted
assert.deepEqual(facts.colors.map((c) => c.value).sort(), ['rgba(181, 138, 53, 0.14)', 'rgba(60, 50, 25, 0.1)'])
assert.ok(facts.colors.every((c) => c.uses === 1))

// The scale and the two rules the guide checks everything against
assert.equal(bandFor(0.42)!.name, 'Page push and pop')
assert.equal(bandFor(0.55)!.name, 'Shared-element morph')
assert.equal(bandFor(0.6)!.name, 'Entrance')
assert.equal(bandFor(0.35)!.name, 'Press feedback')
assert.equal(bandFor(0.4), undefined)
assert.equal(bandFor(0.12), undefined)
assert.ok(houseEasing('var(--spring)') && houseEasing('ease') && houseEasing('cubic-bezier(.32,.72,0,1)') && houseEasing('cubic-bezier(0.32, 0.72, 0, 1)'))
assert.ok(!houseEasing('ease-out') && !houseEasing('cubic-bezier(0.2, 0.7, 0.2, 1)'))
assert.ok(cheapToAnimate('transform') && cheapToAnimate('opacity') && !cheapToAnimate('box-shadow'))
assert.deepEqual(bezierPoints('cubic-bezier(0.32, 0.72, 0, 1)'), [0.32, 0.72, 0, 1])
assert.equal(bezierPoints('ease'), undefined)

// The real stylesheet reads without tripping, and the things the guide leans on are found
const real = readStyles(readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8'))
const token = (name: string) => real.tokens.find((t) => t.name === name)?.value
assert.equal(token('--gold'), '#b58a35')
assert.ok(bezierPoints(token('--spring')!), 'the spring is a cubic-bezier the guide can draw')
assert.ok(real.sizes.some((s) => s.px === 17) && real.durations.some((d) => d.seconds === 0.42))
assert.ok(real.easings[0].value === 'var(--spring)', 'the spring is the most used easing')

console.log('styleRules tests passed')
