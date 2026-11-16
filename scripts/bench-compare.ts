/**
 * Compare two OCR benchmark runs.
 *
 *   npm run bench:compare                      the two latest runs of the same engine
 *   npm run bench:compare -- tesseract         the two latest Tesseract runs
 *   npm run bench:compare -- A.json B.json     two particular runs (paths or names in bench/results)
 *
 * Scores are pooled over the pages both runs read, so adding pages between runs
 * doesn't look like a change in quality. Lower CER is better.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pool } from '../src/bench/score.ts'

const RESULTS = new URL('../bench/results/', import.meta.url).pathname

interface Row {
  id: string
  lang: 'eng' | 'guj'
  verified: boolean
  cer: number
  wer: number
  chars: number
  words: number
  charEdits: number
  wordEdits: number
  pageNumberRight: boolean
}
interface Run {
  engine: string
  at: string
  commit: string
  dirty: boolean
  pages: Row[]
}

const load = (f: string): Run => JSON.parse(readFileSync(existsSync(f) ? f : join(RESULTS, f), 'utf8'))
const runs = existsSync(RESULTS) ? readdirSync(RESULTS).filter((f) => f.endsWith('.json')).sort() : []

const args = process.argv.slice(2)
let files: string[]
if (args.length === 2) files = args
else {
  const engine = args[0] ?? runs.at(-1)?.replace(/^.*?-\d{3}Z-/, '').replace(/\.json$/, '')
  const same = runs.filter((f) => f.endsWith(`-${engine}.json`))
  if (same.length < 2) {
    console.error(`Need two runs to compare${engine ? ` (found ${same.length} for ${engine})` : ''}. Run the benchmark at /bench.html first.`)
    process.exit(1)
  }
  files = same.slice(-2)
}
const [a, b] = files.map(load)

const shared = (run: Run, other: Run) => run.pages.filter((p) => other.pages.some((q) => q.id === p.id && q.verified === p.verified))
const pa = shared(a, b), pb = shared(b, a)
const label = (r: Run) => `${r.engine} @ ${r.commit}${r.dirty ? '+changes' : ''} (${r.at.slice(0, 16).replace('T', ' ')})`
const pct = (x: number) => `${(x * 100).toFixed(1)}%`.padStart(6)
const delta = (x: number, y: number) => {
  const d = (y - x) * 100
  const s = `${d >= 0 ? '+' : ''}${d.toFixed(1)}`.padStart(6)
  return Math.abs(d) < 0.05 ? `${s}   ` : d < 0 ? `${s} ✓ ` : `${s} ✗ `
}

console.log(`A: ${label(a)}\nB: ${label(b)}\n`)
console.log('                       pages   CER A   CER B    Δ        WER A   WER B    Δ')
for (const verified of [true, false])
  for (const lang of ['eng', 'guj'] as const) {
    const pick = (rows: Row[]) => rows.filter((p) => p.lang === lang && (!verified || p.verified))
    const x = pool(pick(pa)), y = pool(pick(pb))
    if (x.pages === 0) continue
    const name = `${lang === 'eng' ? 'English' : 'Gujarati'} ${verified ? 'verified' : 'all keys'}`.padEnd(22)
    console.log(`${name} ${String(x.pages).padStart(5)}  ${pct(x.cer)}  ${pct(y.cer)} ${delta(x.cer, y.cer)}  ${pct(x.wer)}  ${pct(y.wer)} ${delta(x.wer, y.wer)}`)
  }

// Where it moved most, by characters gained or lost, so a regression points at the pages to look at.
const moves = pa
  .map((p) => ({ id: p.id, lang: p.lang, change: (pb.find((q) => q.id === p.id)?.charEdits ?? p.charEdits) - p.charEdits, chars: p.chars }))
  .filter((m) => m.change !== 0)
  .sort((m, n) => n.change - m.change)
const show = (title: string, list: typeof moves) => {
  if (list.length === 0) return
  console.log(`\n${title}`)
  for (const m of list) console.log(`  ${m.id.padEnd(22)} ${m.lang}  ${m.change > 0 ? '+' : ''}${m.change} character errors (of ${m.chars})`)
}
show('Worse in B:', moves.filter((m) => m.change > 0).slice(0, 5))
show('Better in B:', moves.filter((m) => m.change < 0).reverse().slice(0, 5))
