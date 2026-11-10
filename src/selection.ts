/**
 * Turns a rough finger gesture into a clean range of words.
 *
 * Phones make precise circles hard, so the gesture is only a hint:
 * - A loop (even an open, lopsided, or overshooting one) selects words whose centers fall inside it.
 * - A swipe or underline selects the words it passes over or near.
 * Either way the result is a contiguous run in reading order, nudged to sentence
 * boundaries when the gesture lands a word or two off.
 */

export interface OcrWord {
  text: string
  conf: number
  x0: number
  y0: number
  x1: number
  y1: number
  line: number
  para: number
}

export type Pt = { x: number; y: number }
export type Range = [start: number, end: number]

const SENTENCE_END = /[.!?।…][”’"')\]]*$/

export function lineHeight(words: OcrWord[]): number {
  if (words.length === 0) return 40
  const hs = words.map((w) => w.y1 - w.y0).sort((a, b) => a - b)
  return hs[Math.floor(hs.length / 2)]
}

function cross(o: Pt, a: Pt, b: Pt) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

/** Andrew's monotone chain; used to tell loops from swipes. */
export function convexHull(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (pts.length < 3) return pts
  const lower: Pt[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Pt[] = []
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

function polygonArea(poly: Pt[]) {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length]
    a += p.x * q.y - q.x * p.y
  }
  return Math.abs(a) / 2
}

/**
 * Nonzero winding: the stroke is closed with a straight chord, so open "C" loops work,
 * and overshoot (going round 1¼ times) still counts as inside.
 */
function inLoop(pt: Pt, poly: Pt[]) {
  let wn = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const side = (b.x - a.x) * (pt.y - a.y) - (pt.x - a.x) * (b.y - a.y)
    if (a.y <= pt.y) {
      if (b.y > pt.y && side > 0) wn++
    } else if (b.y <= pt.y && side < 0) wn--
  }
  return wn !== 0
}

function distToBox(p: Pt, w: OcrWord) {
  const dx = Math.max(w.x0 - p.x, 0, p.x - w.x1)
  const dy = Math.max(w.y0 - p.y, 0, p.y - w.y1)
  return Math.hypot(dx, dy)
}

export type GestureKind = 'loop' | 'swipe'

export function classify(stroke: Pt[], lh: number): GestureKind {
  const hull = convexHull(stroke)
  if (hull.length < 3) return 'swipe'
  let diameter = 0
  for (const a of hull) for (const b of hull) diameter = Math.max(diameter, Math.hypot(a.x - b.x, a.y - b.y))
  // Average width perpendicular to the longest axis.
  const width = polygonArea(hull) / Math.max(diameter, 1)
  return width > lh * 1.1 ? 'loop' : 'swipe'
}

export function hitTest(words: OcrWord[], stroke: Pt[]): number[] {
  if (stroke.length < 2 || words.length === 0) return []
  const lh = lineHeight(words)
  if (classify(stroke, lh) === 'loop') {
    return words.flatMap((w, i) => (inLoop({ x: (w.x0 + w.x1) / 2, y: (w.y0 + w.y1) / 2 }, stroke) ? [i] : []))
  }
  // A swipe means "from here to there", like dragging a text selection: only where it
  // starts and ends matters. The path in between often wanders across other lines.
  const first = stroke[0], last = stroke[stroke.length - 1]
  if (Math.abs(last.y - first.y) < lh * 0.8) {
    // Roughly horizontal: one line. Let every point vote for its line, which survives
    // a tilted page and an underline drawn a little low, then use the endpoints on it.
    const votes = new Map<number, number>()
    for (const p of stroke) {
      const line = words[nearestWord(words, p)].line
      votes.set(line, (votes.get(line) ?? 0) + 1)
    }
    const line = [...votes].sort((a, b) => b[1] - a[1])[0][0]
    const onLine = words.flatMap((w, i) => (w.line === line ? [i] : []))
    const nearestOnLine = (p: Pt) => onLine.reduce((a, b) => (distToBox(p, words[a]) <= distToBox(p, words[b]) ? a : b))
    return [nearestOnLine(first), nearestOnLine(last)]
  }
  return [nearestWord(words, first), nearestWord(words, last)]
}

const endsSentence = (w?: OcrWord) => !!w && SENTENCE_END.test(w.text)
const startsSentence = (words: OcrWord[], i: number) =>
  i === 0 || words[i - 1].para !== words[i].para || endsSentence(words[i - 1])

/** Nudge a range to sentence boundaries when it is only a word or two off. */
export function snapToSentences(words: OcrWord[], [s, e]: Range, slack = 2): Range {
  // Start: reach back to the sentence start if it's close…
  for (let k = 0; k <= slack && s - k >= 0; k++) {
    if (words[s - k].para !== words[s].para) break
    if (startsSentence(words, s - k)) {
      s -= k
      break
    }
  }
  // …or skip a stray tail of the previous sentence.
  for (let k = 1; k <= slack && s + k <= e - 3; k++) {
    if (endsSentence(words[s + k - 1]) && !startsSentence(words, s)) {
      s += k
      break
    }
  }
  // End: reach forward to the sentence end if it's close…
  if (!endsSentence(words[e])) {
    for (let k = 1; k <= slack && e + k < words.length; k++) {
      if (words[e + k].para !== words[e].para) break
      if (endsSentence(words[e + k])) {
        e += k
        break
      }
    }
  }
  // …or drop a stray head of the next sentence.
  for (let k = 1; k <= slack && e - k >= s + 3; k++) {
    if (endsSentence(words[e - k]) && !endsSentence(words[e])) {
      e -= k
      break
    }
  }
  return [s, e]
}

/**
 * A loose loop often grazes part of the paragraph above or below. Drop such an edge
 * fragment when it's small, or when it's a minority that stops mid-sentence.
 */
export function trimStrayParagraphs(words: OcrWord[], [s, e]: Range): Range {
  const runLength = (from: number, dir: 1 | -1) => {
    let n = 0
    for (let i = from; i >= s && i <= e && words[i].para === words[from].para; i += dir) n++
    return n
  }
  const total = e - s + 1
  const head = runLength(s, 1)
  if (head < total && (head <= 3 || (head < total * 0.3 && !startsSentence(words, s)))) s += head
  const tail = runLength(e, -1)
  if (tail < e - s + 1 && (tail <= 3 || (tail < (e - s + 1) * 0.3 && !endsSentence(words[e])))) e -= tail
  return [s, e]
}

/** A short all-caps line at the top of a selection is a chapter or page heading, not the passage. */
export function trimHeading(words: OcrWord[], [s, e]: Range): Range {
  for (;;) {
    let end = s
    while (end < e && words[end + 1].line === words[s].line) end++
    const wholeLine = s === 0 || words[s - 1].line !== words[s].line
    if (!wholeLine || end - s + 1 > 8 || e - end < 4 || endsSentence(words[end])) return [s, e]
    if (/^[a-z]/.test(words[end + 1].text)) return [s, e] // the sentence carries on, so not a heading
    const text = words.slice(s, end + 1).map((w) => w.text).join('')
    const upper = (text.match(/[A-Z]/g) ?? []).length
    const lower = (text.match(/[a-z]/g) ?? []).length
    if (upper < 4 || lower > upper * 0.2) return [s, e]
    s = end + 1
  }
}

export function selectRange(words: OcrWord[], stroke: Pt[]): Range | null {
  const hits = hitTest(words, stroke)
  if (hits.length === 0) return null
  const range = trimStrayParagraphs(words, [Math.min(...hits), Math.max(...hits)])
  return trimHeading(words, snapToSentences(words, range))
}

/** Nearest word to a point; used by the drag handles. */
export function nearestWord(words: OcrWord[], p: Pt): number {
  let best = 0, bestD = Infinity
  words.forEach((w, i) => {
    const d = distToBox(p, w)
    if (d < bestD) (bestD = d), (best = i)
  })
  return best
}

const DIGITS: Record<string, string> = { '૦': '0', '૧': '1', '૨': '2', '૩': '3', '૪': '4', '૫': '5', '૬': '6', '૭': '7', '૮': '8', '૯': '9' }

/** A lone 1–4 digit number in the top or bottom margin is almost always the page number. */
export function detectPageNumber(words: OcrWord[]): string | undefined {
  if (words.length < 10) return undefined
  const top = Math.min(...words.map((w) => w.y0))
  const bottom = Math.max(...words.map((w) => w.y1))
  const band = (bottom - top) * 0.12
  const lineCounts = new Map<number, number>()
  for (const w of words) lineCounts.set(w.line, (lineCounts.get(w.line) ?? 0) + 1)
  for (const w of words) {
    const t = w.text.replace(/[^\d૦-૯]/g, '')
    if (!t || t.length > 4 || t.length < w.text.length - 1 || w.conf < 30) continue
    if ((lineCounts.get(w.line) ?? 0) > 2) continue
    if (w.y0 - top > band && bottom - w.y1 > band) continue
    return t.replace(/[૦-૯]/g, (d) => DIGITS[d])
  }
  return undefined
}
