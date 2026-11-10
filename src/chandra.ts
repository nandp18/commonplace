import type { OcrWord } from './selection'

/** The Cloudflare Worker's address. Empty until it's deployed; capture then uses Tesseract only. */
export const CHANDRA_PROXY: string = 'https://commonplace-ocr.nandp108.workers.dev'

/** Past this, a capture stops waiting and falls back to reading on the phone. */
const GIVE_UP_MS = 40_000
/** Datalab's free tier allows 10 requests a minute, so check sparingly and back off. */
const CHECK_AT_MS = [3000, 6000, 9000, 12000, 16000, 20000, 25000, 30000, 35000, 40000]
/** Enough for small print; a phone's full 12MP adds upload time and little else. */
const MAX_SIDE = 2900

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

interface Token extends Box {
  text: string
  conf: number
  /** Which stretch of text this is in; a block or an explicit line break starts a new one. */
  stretch: number
  para: number
  fine?: boolean
  line?: number
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1] ?? 0

const decode = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')

const SPAN = /<span\b([^>]*)>([^<]*)<\/span>/g

/** Every word in reading order. Chandra sometimes splits one word into two touching spans. */
function tokensIn(blocks: { html?: string }[]): Token[] {
  const out: Token[] = []
  let stretch = 0
  blocks.forEach((block, para) => {
    const html = block.html ?? ''
    stretch++
    let end = -1
    for (const m of html.matchAll(SPAN)) {
      const box = m[1].match(/data-bbox="(\d+(?:\.\d+)?) (\d+(?:\.\d+)?) (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/)
      const conf = m[1].match(/data-confidence="([\d.]+)"/)
      const text = decode(m[2]).trim()
      if (!box || !text) continue
      const gap = end < 0 ? ' ' : html.slice(end, m.index)
      end = m.index + m[0].length
      if (/<br/i.test(gap)) stretch++
      const word: Token = { text, conf: conf ? Number(conf[1]) : 0, x0: +box[1], y0: +box[2], x1: +box[3], y1: +box[4], stretch, para }
      const prev = out[out.length - 1]
      if (gap === '' && prev && prev.para === para) {
        // Touching spans are one word. The longer piece has the trustworthy box.
        if (text.length > prev.text.length) Object.assign(prev, { x0: word.x0, y0: word.y0, x1: word.x1, y1: word.y1 })
        prev.text += text
        prev.conf = Math.max(prev.conf, word.conf)
      } else out.push(word)
    }
  })
  return out
}

/** A few boxes come back wrong (a whole line wide, or nowhere near the word). */
function markFine(tokens: Token[]): { lineH: number; charW: number } {
  const lineH = median(tokens.map((t) => t.y1 - t.y0))
  const charW = median(tokens.map((t) => (t.x1 - t.x0) / Math.max(1, t.text.length)))
  for (const t of tokens) {
    const w = t.x1 - t.x0, h = t.y1 - t.y0
    t.fine = t.conf > 0 && w > 0 && h >= lineH * 0.4 && h <= lineH * 2.2 && w <= Math.max(lineH * 3, t.text.length * charW * 2.5)
  }
  return { lineH, charW }
}

/** Number the lines: a new one starts when the text jumps back to the left or a stretch ends. */
function numberLines(tokens: Token[], lineH: number) {
  let line = 0
  let prev: Token | undefined
  for (const t of tokens) {
    if (!t.fine) continue
    if (prev && (t.stretch !== prev.stretch || (t.x0 + t.x1) / 2 < (prev.x0 + prev.x1) / 2 - 2 * lineH || Math.abs(t.y0 - prev.y0) > lineH * 1.5)) line++
    t.line = line
    prev = t
  }
}

/** Slot words with bad boxes between their neighbours on the same line; drop any with no neighbours. */
function repair(tokens: Token[], charW: number): Token[] {
  const out: Token[] = []
  for (let i = 0; i < tokens.length; ) {
    if (tokens[i].fine) {
      out.push(tokens[i++])
      continue
    }
    let j = i
    while (j < tokens.length && !tokens[j].fine) j++
    const run = tokens.slice(i, j)
    i = j
    const pieces = new Map<number, Token[]>()
    for (const t of run) pieces.set(t.stretch, [...(pieces.get(t.stretch) ?? []), t])
    for (const words of pieces.values()) {
      const stretch = words[0].stretch
      const at = tokens.indexOf(words[0])
      const before = tokens[at - 1]?.fine && tokens[at - 1].stretch === stretch ? tokens[at - 1] : undefined
      const after = tokens[at + words.length]?.fine && tokens[at + words.length].stretch === stretch ? tokens[at + words.length] : undefined
      if (!before && !after) continue
      const sameLine = before && after && before.line === after.line
      const chars = words.reduce((a, t) => a + t.text.length, 0)
      const gap = charW * 0.5
      let x = sameLine ? before.x1 + gap : before ? before.x1 + gap : after!.x0 - gap - chars * charW - gap * (words.length - 1)
      const unit = sameLine ? Math.max(0, after.x0 - before.x1 - gap * (words.length + 1)) / chars : charW
      if (x < 0) continue // nothing to its left to anchor it: a cut-off line at the page edge
      const ref = before ?? after!
      for (const t of words) {
        const w = t.text.length * unit
        Object.assign(t, { x0: x, x1: x + w, y0: ref.y0, y1: ref.y1, line: ref.line })
        x += w + gap
        out.push(t)
      }
    }
  }
  return out
}

/** Turn Chandra's page into positioned words, in photo pixels. Empty if the page can't be trusted. */
export function wordsFromChandra(result: unknown, photoW: number, photoH: number): OcrWord[] {
  const doc = typeof result === 'string' ? JSON.parse(result) : (result as { children?: unknown[] } | null)
  const page = doc?.children?.[0] as { bbox?: number[]; children?: { html?: string }[]; html?: string } | undefined
  if (!page?.bbox) return []
  const pageW = page.bbox[2] - page.bbox[0], pageH = page.bbox[3] - page.bbox[1]
  // A sideways page would put every box in the wrong place.
  if (pageW <= 0 || pageH <= 0 || Math.abs(pageW / pageH / (photoW / photoH) - 1) > 0.15) return []

  const tokens = tokensIn(page.children?.length ? page.children : [page])
  if (tokens.length === 0) return []
  const { lineH, charW } = markFine(tokens)
  numberLines(tokens, lineH)
  const sx = photoW / pageW, sy = photoH / pageH
  return repair(tokens, charW).map((t) => ({
    text: t.text,
    // Chandra's scores don't track its mistakes (correct words as low as 1.5%), so they can't drive the wavy underlines.
    conf: 100,
    x0: (t.x0 - page.bbox![0]) * sx,
    y0: (t.y0 - page.bbox![1]) * sy,
    x1: (t.x1 - page.bbox![0]) * sx,
    y1: (t.y1 - page.bbox![1]) * sy,
    line: t.line ?? 0,
    para: t.para,
  }))
}

function uprightJpeg(img: HTMLImageElement): Promise<Blob> {
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
  const c = document.createElement('canvas')
  c.width = Math.round(img.naturalWidth * scale)
  c.height = Math.round(img.naturalHeight * scale)
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, c.width, c.height)
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not prepare the photo'))), 'image/jpeg', 0.92))
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Read a page with Chandra through the Worker. Rejects on any failure so the caller can fall back. */
export async function readWithChandra(img: HTMLImageElement, progress: (p: number) => void): Promise<OcrWord[]> {
  if (!CHANDRA_PROXY) throw new Error('Chandra is not set up')
  const started = Date.now()
  const signal = AbortSignal.timeout(GIVE_UP_MS)
  // Chandra reports no progress, so ease toward full as the seconds pass.
  const ticker = setInterval(() => progress(Math.min(0.95, 1 - Math.exp(-(Date.now() - started) / 10000))), 250)
  try {
    const form = new FormData()
    form.set('file', await uprightJpeg(img), 'page.jpg')
    const sent = await fetch(CHANDRA_PROXY, { method: 'POST', body: form, signal })
    if (!sent.ok) throw new Error(`Chandra upload failed (${sent.status})`)
    const { id } = await sent.json()
    for (const at of CHECK_AT_MS) {
      await wait(Math.max(0, at - (Date.now() - started)))
      const res = await fetch(`${CHANDRA_PROXY.replace(/\/$/, '')}/result/${id}`, { signal })
      if (!res.ok) throw new Error(`Chandra check failed (${res.status})`)
      const data = await res.json()
      if (data.status === 'failed') throw new Error(data.error)
      if (data.status === 'complete') return wordsFromChandra(data.json, img.naturalWidth, img.naturalHeight)
    }
    throw new Error('Chandra took too long')
  } finally {
    clearInterval(ticker)
  }
}
