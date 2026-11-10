/** Draws a quote as a 4:5 image, sized to post or send. Nothing leaves the device until you share it. */

export type CardTheme = 'paper' | 'ink' | 'ocean'

export interface CardContent {
  text: string
  /** Pronunciation shown under Gujarati, when it fits. */
  translit?: string
  title?: string
  byline?: string
  gu: boolean
}

/** Width of `text` at font size `size`. */
export type Measure = (text: string, size: number) => number

const W = 1080
const H = 1350
const MARGIN = 100
const TEXT_TOP = 250
const TEXT_BOTTOM = H - 270
const MAX_SIZE = 76
const MIN_SIZE = 30
const TRANSLIT_RATIO = 0.62
const TRANSLIT_LEADING = 1.4

const THEMES: Record<CardTheme, { top: string; bottom: string; text: string; muted: string; accent: string }> = {
  paper: { top: '#f7f3ea', bottom: '#ece7da', text: '#1d1d1b', muted: '#77736a', accent: '#b58a35' },
  ink: { top: '#242a23', bottom: '#171b16', text: '#f4f1e8', muted: '#a5a596', accent: '#d3a955' },
  ocean: { top: '#123a63', bottom: '#040c1a', text: '#eef4fb', muted: '#93aac4', accent: '#8fc1ee' },
}

export function wrap(text: string, width: number, measure: (s: string) => number): string[] {
  const lines: string[] = []
  for (const para of text.replace(/\n{3,}/g, '\n\n').split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const longer = line ? `${line} ${word}` : word
      if (line && measure(longer) > width) {
        lines.push(line)
        line = word
      } else {
        line = longer
      }
    }
    lines.push(line)
  }
  return lines
}

export interface CardFit {
  size: number
  lines: string[]
  sub: string[]
  height: number
}

/** The largest type that fits. Drops the pronunciation before cutting any of the quote. */
export function fitCard(c: CardContent, width: number, room: number, measure: Measure): CardFit {
  const leading = c.gu ? 1.6 : 1.3
  const layout = (size: number, translit?: string): CardFit => {
    const lines = wrap(c.text, width, (s) => measure(s, size))
    const subSize = size * TRANSLIT_RATIO
    const sub = translit ? wrap(translit, width, (s) => measure(s, subSize)) : []
    const height = lines.length * size * leading + (sub.length ? size * 0.7 + sub.length * subSize * TRANSLIT_LEADING : 0)
    return { size, lines, sub, height }
  }
  for (const translit of c.translit ? [c.translit, undefined] : [undefined]) {
    for (let size = MAX_SIZE; size >= MIN_SIZE; size -= 2) {
      const fit = layout(size, translit)
      if (fit.height <= room) return fit
    }
  }
  const fit = layout(MIN_SIZE)
  const lines = fit.lines.slice(0, Math.floor(room / (MIN_SIZE * leading)))
  while (lines.length && !lines[lines.length - 1]) lines.pop()
  lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[\s.,;:]+$/, '')}…`
  return { ...fit, lines, height: lines.length * MIN_SIZE * leading }
}

function ellipsize(text: string, width: number, measure: (s: string) => number): string {
  if (measure(text) <= width) return text
  let t = text
  while (t && measure(`${t}…`) > width) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}

export async function drawCard(canvas: HTMLCanvasElement, c: CardContent, theme: CardTheme): Promise<Blob> {
  const css = getComputedStyle(document.documentElement)
  const serif = css.getPropertyValue('--serif')
  const mono = css.getPropertyValue('--mono')
  const sample = `${c.text.slice(0, 40)}${c.title ?? ''}`
  // Web fonts must be loaded before canvas can use them. Offline, fall back after a moment.
  await Promise.race([
    Promise.all([`400 40px ${serif}`, `600 40px ${serif}`].map((f) => document.fonts.load(f, sample))).catch(() => {}),
    new Promise((r) => setTimeout(r, 2000)),
  ])

  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const t = THEMES[theme]
  const gradient = ctx.createLinearGradient(0, 0, 0, H)
  gradient.addColorStop(0, t.top)
  gradient.addColorStop(1, t.bottom)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, W, H)

  if (theme === 'ocean') {
    let seed = 2026
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let i = 0; i < 120; i++) {
      ctx.fillStyle = `rgba(190, 220, 255, ${0.08 + rnd() * 0.3})`
      ctx.beginPath()
      ctx.arc(rnd() * W, rnd() * H, 0.8 + rnd() * 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const width = W - MARGIN * 2
  const measure: Measure = (s, size) => {
    ctx.font = `400 ${size}px ${serif}`
    return ctx.measureText(s).width
  }
  const fit = fitCard(c, width, TEXT_BOTTOM - TEXT_TOP, measure)
  const leading = c.gu ? 1.6 : 1.3
  const top = TEXT_TOP + (TEXT_BOTTOM - TEXT_TOP - fit.height) / 2

  if (!/^[“‘"'…]/.test(c.text)) {
    ctx.fillStyle = t.accent
    ctx.font = `400 190px ${serif}`
    ctx.fillText('“', MARGIN - 8, top + 40)
  }

  ctx.fillStyle = t.text
  ctx.font = `400 ${fit.size}px ${serif}`
  let y = top
  for (const line of fit.lines) {
    ctx.fillText(line, MARGIN, y + fit.size * leading * 0.76)
    y += fit.size * leading
  }

  if (fit.sub.length) {
    const size = fit.size * TRANSLIT_RATIO
    y += fit.size * 0.7
    ctx.fillStyle = t.muted
    ctx.font = `400 ${size}px ${serif}`
    for (const line of fit.sub) {
      ctx.fillText(line, MARGIN, y + size * TRANSLIT_LEADING * 0.76)
      y += size * TRANSLIT_LEADING
    }
  }

  if (c.title || c.byline) {
    ctx.fillStyle = t.accent
    ctx.fillRect(MARGIN, H - 226, 56, 3)
  }
  if (c.title) {
    ctx.fillStyle = t.text
    ctx.font = `600 40px ${serif}`
    ctx.fillText(ellipsize(c.title, width, (s) => ctx.measureText(s).width), MARGIN, H - 164)
  }
  ctx.fillStyle = t.muted
  if (c.byline) {
    ctx.font = `400 26px ${mono}`
    ctx.fillText(ellipsize(c.byline, width, (s) => ctx.measureText(s).width), MARGIN, c.title ? H - 118 : H - 170)
  }
  ctx.font = `400 22px ${mono}`
  ctx.fillText('Commonplace', MARGIN, H - 58)

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the card'))), 'image/png'))
}
