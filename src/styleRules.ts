/**
 * What the stylesheets really do, read back from their own text: the tokens, every
 * font size, duration, easing and animated property, and every colour written by hand.
 * The style guide shows these live, so it can't fall behind the CSS it describes.
 *
 * No DOM here: the screen hands over the text, and the tests hand over a string.
 */

export interface StyleFacts {
  /** Custom properties declared on `:root`, in order. */
  tokens: { name: string; value: string }[]
  sizes: { px: number; where: string[] }[]
  durations: { seconds: number; where: string[]; loop: boolean }[]
  easings: { value: string; where: string[] }[]
  /** Properties that change over time, through a transition or inside keyframes. */
  animated: { property: string; where: string[] }[]
  /** Colours written out as numbers instead of a token. */
  colors: { value: string; uses: number }[]
}

/** The durations the house style allows (CLAUDE.md, "One easing"). */
export const SCALE = [
  { name: 'Quick fade', from: 0.2, to: 0.25 },
  { name: 'Press feedback', from: 0.3, to: 0.35 },
  { name: 'Page push and pop', from: 0.42, to: 0.42 },
  { name: 'Shared-element morph', from: 0.55, to: 0.55 },
  { name: 'Entrance', from: 0.45, to: 0.7 },
]
export const bandFor = (seconds: number) => SCALE.find((b) => seconds >= b.from - 1e-6 && seconds <= b.to + 1e-6)

const SPRING = 'cubic-bezier(0.32,0.72,0,1)'
const squash = (s: string) => s.replace(/\s+/g, '').replace(/\b0\./g, '.').replace(/(^|[(,])\./g, '$10.')
/** Movement uses the spring; a plain `ease` is allowed for fades. Anything else is a second curve. */
export const houseEasing = (value: string) => value === 'ease' || value === 'var(--spring)' || squash(value) === SPRING
/** The two properties a phone can animate without repainting. */
export const cheapToAnimate = (property: string) => property === 'transform' || property === 'opacity'

const TIME = /^-?(\d*\.?\d+)(ms|s)$/
const EASE = /^(ease|linear|ease-in|ease-out|ease-in-out|step-start|step-end|cubic-bezier\(.*\)|steps\(.*\)|var\(--spring\))$/
const ANIMATION_WORDS = /^(none|both|forwards|backwards|infinite|alternate|alternate-reverse|normal|reverse|running|paused|\d+)$/
const COLOR = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi
/** A reduced-motion override (0.01ms) or a zero-length switch is not a duration anyone sees. */
const SHORTEST = 0.02

/** Splits on a separator, but never inside brackets: `a 1s cubic-bezier(0, 1, 0, 1), b` → two parts. */
export function splitOutside(value: string, by: ',' | ' ' | ';'): string[] {
  const out: string[] = []
  let depth = 0, part = ''
  for (const c of value) {
    if (c === '(') depth++
    if (c === ')') depth--
    if (c === by && depth === 0) {
      out.push(part)
      part = ''
    } else part += c
  }
  out.push(part)
  return out.map((p) => p.trim()).filter(Boolean)
}

const seconds = (token: string) => {
  const m = TIME.exec(token)!
  return +m[1] / (m[2] === 'ms' ? 1000 : 1)
}

export function readStyles(css: string): StyleFacts {
  const tokens: StyleFacts['tokens'] = []
  const sizes = new Map<number, string[]>()
  const durations = new Map<string, { seconds: number; where: string[]; loop: boolean }>()
  const easings = new Map<string, string[]>()
  const animated = new Map<string, string[]>()
  const colors = new Map<string, number>()
  const note = <K>(map: Map<K, string[]>, key: K, where: string) => {
    const list = map.get(key) ?? []
    if (!list.includes(where)) list.push(where)
    map.set(key, list)
  }
  const time = (s: number, where: string, loop = false) => {
    if (s < SHORTEST) return
    const key = `${s}${loop ? ' loop' : ''}`
    const d = durations.get(key) ?? { seconds: s, where: [], loop }
    if (!d.where.includes(where)) d.where.push(where)
    durations.set(key, d)
  }

  const paint = (value: string) => {
    for (const c of value.match(COLOR) ?? []) {
      const key = c.toLowerCase().replace(/\s+/g, '').replace(/,/g, ', ')
      colors.set(key, (colors.get(key) ?? 0) + 1)
    }
  }

  css = css.replace(/\/\*[\s\S]*?\*\//g, '')

  // Keyframes first: what they change is animated, whatever plays them.
  let rest = ''
  for (let at = 0; ; ) {
    const start = css.indexOf('@keyframes', at)
    if (start < 0) {
      rest += css.slice(at)
      break
    }
    rest += css.slice(at, start)
    const open = css.indexOf('{', start)
    let end = open + 1
    for (let depth = 1; depth > 0 && end < css.length; end++) depth += css[end] === '{' ? 1 : css[end] === '}' ? -1 : 0
    const name = css.slice(start + 10, open).trim()
    for (const step of css.slice(open + 1, end - 1).matchAll(/\{([^{}]*)\}/g)) {
      paint(step[1])
      for (const decl of splitOutside(step[1], ';')) note(animated, decl.slice(0, decl.indexOf(':')).trim(), `@keyframes ${name}`)
    }
    at = end
  }

  // Then every plain rule, wherever it's nested (a media query's rules are read like any other).
  for (const rule of rest.matchAll(/([^{};]+)\{([^{}]*)\}/g)) {
    const where = rule[1].trim().replace(/\s+/g, ' ')
    for (const decl of splitOutside(rule[2], ';')) {
      const colon = decl.indexOf(':')
      if (colon < 0) continue
      const prop = decl.slice(0, colon).trim()
      const value = decl.slice(colon + 1).trim().replace(/\s*!important$/, '')
      if (prop.startsWith('--')) {
        if (where === ':root') tokens.push({ name: prop, value })
        continue
      }
      paint(value)
      if (prop === 'font-size' || prop === 'font') {
        const px = /(\d*\.?\d+)px/.exec(value)
        if (px) note(sizes, +px[1], where)
      } else if (prop === 'transition') {
        for (const part of splitOutside(value, ',')) {
          const words = splitOutside(part, ' ')
          const times = words.filter((w) => TIME.test(w))
          const ease = words.find((w) => EASE.test(w))
          const what = words.find((w) => !TIME.test(w) && !EASE.test(w)) ?? 'all'
          if (what === 'none' || !times.length || seconds(times[0]) < SHORTEST) continue
          time(seconds(times[0]), where)
          if (ease) note(easings, ease, where)
          note(animated, what, where)
        }
      } else if (prop === 'animation') {
        for (const part of splitOutside(value, ',')) {
          const words = splitOutside(part, ' ')
          const times = words.filter((w) => TIME.test(w))
          const ease = words.find((w) => EASE.test(w))
          if (times.length) time(seconds(times[0]), where, words.includes('infinite'))
          if (ease) note(easings, ease, where)
        }
      } else if (prop === 'transition-duration' || prop === 'animation-duration') {
        for (const t of splitOutside(value, ',')) if (TIME.test(t)) time(seconds(t), where)
      } else if (prop === 'transition-timing-function' || prop === 'animation-timing-function') {
        for (const e of splitOutside(value, ',')) note(easings, e, where)
      } else if (prop === 'transition-property') {
        for (const p of splitOutside(value, ',')) if (p !== 'none') note(animated, p, where)
      }
    }
  }

  return {
    tokens,
    sizes: [...sizes].map(([px, where]) => ({ px, where })).sort((a, b) => a.px - b.px),
    durations: [...durations.values()].sort((a, b) => a.seconds - b.seconds),
    easings: [...easings].map(([value, where]) => ({ value, where })).sort((a, b) => b.where.length - a.where.length),
    animated: [...animated].map(([property, where]) => ({ property, where })).sort((a, b) => b.where.length - a.where.length),
    colors: [...colors].map(([value, uses]) => ({ value, uses })).sort((a, b) => b.uses - a.uses),
  }
}

/** The four numbers of a `cubic-bezier(…)`, for drawing the curve. */
export function bezierPoints(value: string): [number, number, number, number] | undefined {
  const m = /cubic-bezier\(([^)]*)\)/.exec(value)
  const n = m?.[1].split(',').map(Number)
  return n?.length === 4 && n.every(Number.isFinite) ? (n as [number, number, number, number]) : undefined
}
