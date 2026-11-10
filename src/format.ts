import type { OcrWord, Range } from './selection'

/**
 * Text cleanup: OCR output → something you'd want in a commonplace book.
 * Pure functions, so they also run on typed or pasted quotes.
 */

const SENTENCE_END = /[.!?।॥…][”’"')\]]*$/
const GUJARATI = /[\u0A80-\u0AFF]/
const LATIN = /[A-Za-z]/

/** Smart punctuation and spacing. Safe to run repeatedly. */
export function tidy(input: string): string {
  return (
    input
      .normalize('NFC')
      .replace(/[\u200B\uFEFF\u00AD]/g, '')
      .replace(/[ \t\u00A0]+/g, ' ')
      .replace(/ *\n */g, '\n')
      // Dashes and ellipses
      .replace(/--/g, '—')
      .replace(/ - /g, ' — ')
      .replace(/\. ?\. ?\./g, '…')
      // Straight quotes → curly. Opening after start/space/bracket/dash, closing otherwise.
      .replace(/(^|[\s(\[{—–])"/g, '$1“')
      .replace(/"/g, '”')
      .replace(/(^|[\s(\[{—–])'/g, '$1‘')
      .replace(/'/g, '’')
      .replace(/``/g, '“')
      // OCR often splits contractions: "it 's" → "it’s"
      .replace(/ ‘(s|t|d|ll|re|ve|m)\b/gi, '’$1')
      // No space before closing punctuation, none after opening.
      .replace(/ +([,.;:!?)\]}”’…।])/g, '$1')
      .replace(/([(\[{“‘]) +/g, '$1')
      // A space after commas/semicolons glued to the next word.
      .replace(/([,;:!?])(?=[A-Za-z\u0A80-\u0AFF])/g, '$1 ')
      .replace(/ {2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

/** Join wrapped lines back into paragraphs. For pasted text. */
export function reflow(raw: string): string {
  return raw
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((para) => para.replace(/([A-Za-z])[-‐]\n([a-z])/g, '$1$2').replace(/\s*\n\s*/g, ' '))
    .join('\n\n')
}

/** OCR fragments that are noise rather than text: stray bars, specks, mangled headers. */
function isJunk(w: OcrWord): boolean {
  const t = w.text.trim()
  if (!t) return true
  if (/^[|¦_~^`*•·«»\\/=+<>#@$%&€§©®°¬]+$/.test(t)) return true
  const hasLetters = LATIN.test(t) || GUJARATI.test(t) || /\d/.test(t)
  if (!hasLetters && w.conf < 60) return true
  // Garbled Latin/symbol soup misread on a Gujarati page (or vice versa).
  if (w.conf < 25 && /[€§&@#]/.test(t)) return true
  // Tesseract is often unsure of real Gujarati words. A flagged word beats one that vanishes.
  return w.conf < 10 && !GUJARATI.test(t)
}

export interface Formatted {
  text: string
  /** Words OCR wasn't sure about, so the review screen can flag them. */
  uncertain: string[]
}

const meanConf = (ws: OcrWord[]) => ws.reduce((a, w) => a + w.conf, 0) / Math.max(1, ws.length)

/** Use the closer second read only if it's more confident and clearly saw the same words. */
export function sharperRead(first: OcrWord[], second: OcrWord[]): OcrWord[] | undefined {
  const ratio = second.length / Math.max(1, first.length)
  if (ratio < 0.75 || ratio > 1.3) return undefined
  return meanConf(second) > meanConf(first) ? second : undefined
}

export function formatSelection(words: OcrWord[], [s, e]: Range, reread?: OcrWord[]): Formatted {
  const first = words.slice(s, e + 1)
  const picked = ((reread && sharperRead(first, reread)) ?? first).filter((w) => !isJunk(w))
  if (picked.length === 0) return { text: '', uncertain: [] }

  const paras: string[] = []
  let cur = ''
  for (let i = 0; i < picked.length; i++) {
    const w = picked[i], prev = picked[i - 1]
    const word = w.text.trim()
    if (!prev) cur = word
    else if (w.para !== prev.para && SENTENCE_END.test(cur)) {
      // Phone photos often get false paragraph breaks mid-sentence; only trust one after a full stop.
      paras.push(cur)
      cur = word
    } else if (w.line !== prev.line && /[A-Za-z][-‐]$/.test(cur) && /^[a-z]/.test(word)) {
      cur = cur.slice(0, -1) + word // re-join a word hyphenated across lines
    } else cur += ' ' + word
  }
  paras.push(cur)
  let text = tidy(paras.join('\n\n'))

  // Mark a quote that starts or stops mid-sentence, as you would when copying by hand.
  const before = words[s - 1]
  const afterHeading = !!before && /[A-Z]{2}/.test(before.text) && !/[a-z]/.test(before.text)
  if (before && before.para === words[s].para && !SENTENCE_END.test(before.text) && !afterHeading) {
    text = '…' + text
  }
  const after = words[e + 1]
  if (after && after.para === words[e].para && !SENTENCE_END.test(words[e].text)) {
    text = text.replace(/[,;:—–]+$/, '') + '…'
  }

  const uncertain = [...new Set(picked.filter((w) => w.conf < 70).map((w) => bare(w.text)).filter(Boolean))]
  return { text, uncertain }
}

/** The Gujarati model reads English fluently and confidently, so confidence can't catch an English page. */
export function readsAsEnglish(words: OcrWord[]): boolean {
  const text = words.map((w) => w.text).join(' ')
  return LATIN.test(text) && !isGujarati(text)
}

/** A word without surrounding punctuation, for matching. */
export const bare = (s: string) => s.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, '')

/** "Mostly Gujarati?" — for picking fonts and line height. */
export function isGujarati(s: string): boolean {
  const g = (s.match(/[\u0A80-\u0AFF]/g) ?? []).length
  const l = (s.match(/[A-Za-z]/g) ?? []).length
  return g > l
}
