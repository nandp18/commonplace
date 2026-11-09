import { sync, merge } from '../src/sync.ts'
import assert from 'node:assert'

// Fake GitHub contents API
let file: { content: string; sha: string } | null = null
let shaN = 0, puts = 0, forceConflict = 1
globalThis.fetch = (async (url: string, init: any = {}) => {
  const json = (status: number, body: any) => ({ ok: status < 300, status, statusText: '', json: async () => body })
  if (init.method === 'PUT') {
    const body = JSON.parse(init.body)
    if (forceConflict-- > 0) { file = { content: file?.content ?? body.content, sha: 'other' + shaN++ }; return json(409, { message: 'conflict' }) }
    if ((file?.sha ?? undefined) !== body.sha) return json(409, { message: 'sha mismatch' })
    puts++
    file = { content: body.content, sha: 's' + shaN++ }
    return json(200, {})
  }
  if (!file) return json(404, { message: 'Not Found' })
  return json(200, { content: file.content.replace(/(.{60})/g, '$1\n'), sha: file.sha })
}) as any

const cfg = { owner: 'o', repo: 'r', path: 'quotes.json', token: 't' }
const q = (id: string, t: number, text: string, deleted = false) =>
  ({ id, bookId: 'b', text, tags: [], lang: 'guj' as const, createdAt: 1, updatedAt: t, ...(deleted ? { deleted } : {}) })
const book = { id: 'b', title: 'ગીતા', author: 'વ્યાસ', createdAt: 1, updatedAt: 1 }

// Device A creates the file (with a forced conflict on first PUT)
const a = await sync(cfg, { version: 1, books: [book], quotes: [q('1', 1, 'કર્મણ્યેવાધિકારસ્તે')] })
assert.equal(a.quotes.length, 1)
// Device B has its own quote + a stale edit of #1
const b = await sync(cfg, { version: 1, books: [book], quotes: [q('2', 5, 'Second'), q('1', 0, 'stale')] })
assert.deepEqual(b.quotes.map((x) => x.text), ['કર્મણ્યેવાધિકારસ્તે', 'Second'])
// Device A deletes #2 — tombstone wins because newer
const a2 = await sync(cfg, { version: 1, books: [book], quotes: [...a.quotes, q('2', 9, 'Second', true)] })
assert.equal(a2.quotes.find((x) => x.id === '2')!.deleted, true)
// No-op sync makes no commit
const before = puts
await sync(cfg, a2)
assert.equal(puts, before)
// Remote decodes as UTF-8 Gujarati
const raw = new TextDecoder().decode(Uint8Array.from(atob(file!.content), (c) => c.charCodeAt(0)))
assert.ok(raw.includes('કર્મણ્યેવાધિકારસ્તે'))
console.log('sync tests passed; commits:', puts)
