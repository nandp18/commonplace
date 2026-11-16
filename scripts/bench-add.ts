/**
 * Add page photos to the OCR benchmark.
 *
 *   npm run bench:add -- --lang guj photo1.jpg photo2.jpg
 *
 * Copies each photo into bench/pages and writes an empty, unverified answer key beside it,
 * to fill in on the Review tab of /bench.html. Existing pages are left alone.
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { Truth } from '../src/bench/score.ts'

const PAGES = new URL('../bench/pages/', import.meta.url).pathname

const args = process.argv.slice(2)
const flag = (name: string) => {
  const i = args.indexOf(name)
  return i < 0 ? undefined : args.splice(i, 2)[1]
}
const lang = flag('--lang')
if ((lang !== 'eng' && lang !== 'guj') || args.length === 0) {
  console.error('Usage: node scripts/bench-add.ts --lang eng|guj photo.jpg ...')
  process.exit(1)
}

mkdirSync(PAGES, { recursive: true })
let added = 0
for (const photo of args) {
  const name = basename(photo, extname(photo))
  // Page ids end up in URLs and file names, so keep them plain.
  const id = name.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '')
  const truthPath = join(PAGES, `${id}.json`)
  if (existsSync(truthPath)) {
    console.log(`skip ${id} (already in the benchmark)`)
    continue
  }
  const file = `${id}${extname(photo).toLowerCase()}`
  copyFileSync(photo, join(PAGES, file))
  const truth: Truth = { id, lang, photo: file, lines: [], verified: false }
  writeFileSync(truthPath, JSON.stringify(truth, null, 2) + '\n')
  added++
  console.log(`added ${id}`)
}
console.log(`${added} page(s) added to bench/pages`)
