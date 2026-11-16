/**
 * Scoring for the OCR benchmark: how far a read is from what's really printed on the page.
 * Self-contained (no app imports) so Node can run it directly from the tests and scripts.
 */

export interface Truth {
  id: string
  lang: 'eng' | 'guj'
  /** The photo's file name inside bench/pages. */
  photo: string
  /** Every line printed on the page, top to bottom, exactly as printed (running heads and page numbers included). */
  lines: string[]
  /** The page number as printed, if there is one. */
  pageNumber?: string
  /** True once a person has checked every line against the photo. Drafts don't count toward headline numbers. */
  verified: boolean
  /** Words the transcriber couldn't make out for certain, for whoever verifies the page. */
  unsure?: string[]
  notes?: string
  /** Which OCR engine wrote the first draft. A key drafted from one engine can lean its way if a mistake slips past review. */
  draftFrom?: string
}

/** The same characters written the same way: curly quotes, dashes, odd spaces and Unicode forms all folded. */
export function normalize(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[​‌‍﻿]/g, '') // zero-width joiners vary between readers, not between pages
    .replace(/\s+/g, ' ')
    .trim()
}

/** Words for word-level scoring: lower case, punctuation stripped from the ends. */
export function wordsOf(s: string): string[] {
  return normalize(s)
    .toLowerCase()
    .split(' ')
    .map((w) => w.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, ''))
    .filter(Boolean)
}

/** Edit distance between two sequences (characters or words). */
export function distance<T>(a: readonly T[], b: readonly T[]): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let prev = new Uint32Array(b.length + 1)
  let cur = new Uint32Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    for (let j = 1; j <= b.length; j++) {
      const sub = prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      cur[j] = Math.min(sub, prev[j] + 1, cur[j - 1] + 1)
    }
    ;[prev, cur] = [cur, prev]
  }
  return prev[b.length]
}

export interface PageScore {
  /** Character error rate: edits needed per printed character. 0 is perfect; can pass 1 when the read invents text. */
  cer: number
  /** Word error rate, ignoring case and surrounding punctuation. */
  wer: number
  chars: number
  words: number
  /** Edits, so rates can be pooled across pages by size rather than averaged. */
  charEdits: number
  wordEdits: number
}

export function scorePage(read: string, truth: string): PageScore {
  const r = [...normalize(read)], t = [...normalize(truth)]
  const rw = wordsOf(read), tw = wordsOf(truth)
  const charEdits = distance(r, t), wordEdits = distance(rw, tw)
  return {
    cer: charEdits / Math.max(1, t.length),
    wer: wordEdits / Math.max(1, tw.length),
    chars: t.length,
    words: tw.length,
    charEdits,
    wordEdits,
  }
}

/** Words grouped into lines in reading order, as the app's OCR hands them over. */
export function textOfWords(words: readonly { text: string; line: number }[]): string {
  const lines: string[][] = []
  let last = NaN
  for (const w of words) {
    if (w.line !== last) lines.push([])
    lines[lines.length - 1].push(w.text)
    last = w.line
  }
  return lines.map((l) => l.join(' ')).join('\n')
}

/** Gujarati digits read as the same page number as Western ones. */
const digits = (s: string) => s.replace(/[૦-૯]/g, (d) => String(d.charCodeAt(0) - 0x0ae6)).trim()

export function samePageNumber(got: string | undefined, truth: string | undefined): boolean {
  return digits(got ?? '') === digits(truth ?? '')
}

export interface Pooled {
  pages: number
  cer: number
  wer: number
  /** Share of pages whose page number came out right. */
  pageNumbers: number
}

/** Rates across many pages, weighted by size so a long page counts for more than a caption. */
export function pool(pages: readonly (PageScore & { pageNumberRight: boolean })[]): Pooled {
  const sum = (f: (p: PageScore) => number) => pages.reduce((a, p) => a + f(p), 0)
  return {
    pages: pages.length,
    cer: sum((p) => p.charEdits) / Math.max(1, sum((p) => p.chars)),
    wer: sum((p) => p.wordEdits) / Math.max(1, sum((p) => p.words)),
    pageNumbers: pages.filter((p) => p.pageNumberRight).length / Math.max(1, pages.length),
  }
}

export type DiffOp = { op: 'same' | 'missing' | 'extra'; text: string }

/** Word diff of a read against the truth, for spotting where they disagree. */
export function diffWords(read: string, truth: string): DiffOp[] {
  const a = normalize(read).split(' ').filter(Boolean), b = normalize(truth).split(' ').filter(Boolean)
  // Longest common subsequence table, then walk it back.
  const n = a.length, m = b.length
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  const out: DiffOp[] = []
  const push = (op: DiffOp['op'], text: string) => {
    const last = out[out.length - 1]
    if (last?.op === op) last.text += ' ' + text
    else out.push({ op, text })
  }
  let i = 0, j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) push('same', a[i++]), j++
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) push('extra', a[i++])
    else push('missing', b[j++])
  }
  while (i < n) push('extra', a[i++])
  while (j < m) push('missing', b[j++])
  return out
}
