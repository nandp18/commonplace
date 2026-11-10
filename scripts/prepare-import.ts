/**
 * Turns Kindle clippings and a Notion Markdown export into one file to review.
 *
 *   node scripts/prepare-import.ts --kindle clippings.txt --notion path/to/unzipped-export
 *
 * Edit import-work/review.json, then bring it in with Settings → Import.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { buildReview, parseClippings, parseNotion, type Highlight } from './highlights.ts'

const { values } = parseArgs({
  options: {
    kindle: { type: 'string', multiple: true, default: [] },
    notion: { type: 'string', multiple: true, default: [] },
    out: { type: 'string', default: 'import-work/review.json' },
    force: { type: 'boolean', default: false },
  },
})

if (!values.kindle.length && !values.notion.length) {
  console.error('Usage: node scripts/prepare-import.ts --kindle clippings.txt --notion unzipped-export [--out file] [--force]')
  process.exit(1)
}
if (existsSync(values.out) && !values.force) {
  console.error(`${values.out} already exists and may hold your edits. Pass --force to replace it.`)
  process.exit(1)
}

const markdownFiles = (path: string): string[] =>
  statSync(path).isDirectory()
    ? readdirSync(path).flatMap((name) => (name.startsWith('.') ? [] : markdownFiles(join(path, name))))
    : path.endsWith('.md')
      ? [path]
      : []

const all: Highlight[] = []
const report: string[] = []

for (const path of values.kindle) {
  const c = parseClippings(readFileSync(path, 'utf8'))
  all.push(...c.highlights)
  report.push(`Kindle ${basename(path)}: ${c.highlights.length} kept, ${c.superseded} replaced by longer versions, ${c.bookmarks} bookmarks skipped`)
  if (c.unparsed.length) {
    report.push(`  ${c.unparsed.length} entries could not be read. First one:`, `  ${c.unparsed[0].slice(0, 200)}`)
  }
}

for (const root of values.notion) {
  const skipped: string[] = []
  let found = 0
  for (const file of markdownFiles(root)) {
    // Notion ends exported file names with a 32-character id.
    const title = basename(file, '.md').replace(/\s+[0-9a-f]{32}$/i, '')
    const page = parseNotion(readFileSync(file, 'utf8'), title)
    if (page.skipped) skipped.push(title)
    all.push(...page.highlights)
    found += page.highlights.length
  }
  report.push(`Notion ${basename(root)}: ${found} found`)
  if (skipped.length) report.push(`  Left out, no "Page N" headings: ${skipped.join(', ')}`)
}

const { file, duplicates } = buildReview(all)
mkdirSync(dirname(values.out), { recursive: true })
writeFileSync(values.out, JSON.stringify(file, null, 2) + '\n')

const quotes = file.books.flatMap((b) => b.quotes)
const flags = new Map<string, number>()
for (const q of quotes) for (const f of q.flags ?? []) flags.set(f, (flags.get(f) ?? 0) + 1)
const undated = file.books.filter((b) => b.quotes.some((q) => !q.date))

console.log(report.join('\n'))
console.log(`\n${quotes.length} quotes in ${file.books.length} books, ${duplicates} exact duplicates merged.`)
for (const [flag, n] of flags) console.log(`  ${n} flagged ${flag}`)
if (undated.length) console.log(`  ${undated.length} books need a "date" (a year is enough): ${undated.map((b) => b.title).join(', ')}`)
console.log(`\nWrote ${values.out}. Edit it, then use Settings → Import.`)
