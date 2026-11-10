import assert from 'node:assert'
import { wordsFromChandra } from '../src/chandra.ts'
import proxy from '../worker/chandra-proxy.js'

const span = (text: string, x0: number, y0: number, x1: number, y1: number, conf = 0.9) =>
  `<span data-bbox="${x0} ${y0} ${x1} ${y1}" data-confidence="${conf}">${text}</span>`
const pageOf = (blocks: string[], w = 1000, h = 800) => ({
  children: [{ bbox: [0, 0, w, h], children: blocks.map((html) => ({ html })) }],
})

// Boxes scale from Chandra's page to the photo, and blocks become paragraphs
const simple = wordsFromChandra(
  pageOf([`<p>${span('આપણે', 100, 100, 200, 130)} ${span('છીએ', 210, 100, 280, 130)}</p>`, `<h1>${span('તો', 100, 200, 150, 230)}</h1>`]),
  2000,
  1600,
)
assert.deepEqual(simple.map((w) => w.text), ['આપણે', 'છીએ', 'તો'])
assert.deepEqual([simple[0].x0, simple[0].y0, simple[0].x1, simple[0].y1], [200, 200, 400, 260])
assert.deepEqual(simple.map((w) => w.para), [0, 0, 1])
assert.ok(simple.every((w) => w.conf === 100), 'scores are not passed through')

// Text wrapping back to the left starts a new line, and lines tilt without splitting
const wrapped = wordsFromChandra(
  pageOf([`<p>${span('એક', 100, 100, 160, 130)} ${span('બે', 170, 104, 230, 134)} ${span('ત્રણ', 240, 108, 300, 138)} ${span('ચાર', 100, 150, 160, 180)}</p>`]),
  1000,
  800,
)
assert.deepEqual(wrapped.map((w) => w.line), [0, 0, 0, 1])

// A word split into touching spans is one word, using the longer piece's box
const split = wordsFromChandra(pageOf([`<p>${span('સ', 5, 5, 400, 90)}${span('્વામીશ્રીનો', 100, 100, 260, 130)} ${span('પ્રેમ', 270, 100, 340, 130)}</p>`]), 1000, 800)
assert.deepEqual(split.map((w) => w.text), ['સ્વામીશ્રીનો', 'પ્રેમ'])
assert.equal(split[0].x0, 100)

// A box as wide as the line is rebuilt between its neighbours
const bad = wordsFromChandra(
  pageOf([`<p>${span('એક', 100, 100, 160, 130)} ${span('ખોટું', 10, 100, 900, 130)} ${span('ત્રણ', 300, 100, 360, 130)} ${span('ચાર', 370, 100, 430, 130)}</p>`]),
  1000,
  800,
)
assert.equal(bad[1].text, 'ખોટું')
assert.ok(bad[1].x0 >= 160 && bad[1].x1 <= 300, `between neighbours: ${bad[1].x0}-${bad[1].x1}`)
assert.equal(bad[1].line, bad[0].line)

// Zero-confidence boxes from a line cut off at the page edge are dropped
const cutOff = wordsFromChandra(
  pageOf([`<p>${span('...કરા', 700, 400, 950, 450, 0)} ${span('દીધા.', 50, 300, 260, 350, 0)}<br/>${span('પર', 100, 100, 160, 130)} ${span('ધનુષના', 170, 100, 280, 130)}</p>`]),
  1000,
  800,
)
assert.deepEqual(cutOff.map((w) => w.text), ['પર', 'ધનુષના'])

// JSON may arrive as a string; entities decode; a sideways or empty page is refused
assert.equal(wordsFromChandra(JSON.stringify(pageOf([`<p>${span('A &amp; B', 100, 100, 200, 130)}</p>`])), 1000, 800)[0].text, 'A & B')
assert.deepEqual(wordsFromChandra(pageOf([`<p>${span('એક', 100, 100, 160, 130)}</p>`], 800, 1000), 1000, 800), [], 'sideways')
assert.deepEqual(wordsFromChandra({ children: [] }, 1000, 800), [])
assert.deepEqual(wordsFromChandra(null, 1000, 800), [])

// ---- The Worker ----
const SITE = 'https://nandp18.github.io'
const env = { DATALAB_API_KEY: 'test-key' }
type Call = { url: string; method: string; key: string | null; form?: FormData }
let calls: Call[] = []
let reply: (c: Call) => Response
globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
  const c: Call = { url, method: init.method ?? 'GET', key: new Headers(init.headers).get('X-API-Key'), form: init.body as FormData }
  calls.push(c)
  return reply(c)
}) as typeof fetch
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const upload = (origin = SITE, type = 'image/jpeg') => {
  const form = new FormData()
  form.set('file', new File(['x'], 'p.jpg', { type }))
  return new Request('https://w.test/', { method: 'POST', body: form, headers: { Origin: origin } })
}
const get = (path: string, origin = SITE) => new Request(`https://w.test${path}`, { headers: { Origin: origin } })
const waited: Promise<unknown>[] = []
const ctx = { waitUntil: (p: Promise<unknown>) => waited.push(p) }

// Only the app's own origins get through
reply = () => ok({ request_id: 'abc' })
assert.equal((await proxy.fetch(upload('https://evil.example'), env, ctx)).status, 403)
assert.equal((await proxy.fetch(new Request('https://w.test/', { method: 'POST' }), env, ctx)).status, 403, 'no origin')
assert.equal(calls.length, 0, 'blocked requests never reach Datalab')

// The browser's preflight passes, and the upload carries the settings and the key
const pre = await proxy.fetch(new Request('https://w.test/', { method: 'OPTIONS', headers: { Origin: SITE } }), env, ctx)
assert.equal(pre.status, 204)
assert.equal(pre.headers.get('Access-Control-Allow-Origin'), SITE)
const sent = await proxy.fetch(upload(), env, ctx)
assert.deepEqual(await sent.json(), { id: 'abc' })
assert.equal(sent.headers.get('Access-Control-Allow-Origin'), SITE)
assert.equal(calls[0].url, 'https://www.datalab.to/api/v1/convert')
assert.equal(calls[0].key, 'test-key')
assert.equal(calls[0].form?.get('word_bboxes'), 'true')
assert.equal(calls[0].form?.get('mode'), 'accurate')
assert.equal(calls[0].form?.get('output_format'), 'json')

// Non-JPEGs and a missing key are refused; Datalab errors surface without leaking details
assert.equal((await proxy.fetch(upload(SITE, 'text/plain'), env, ctx)).status, 415)
assert.equal((await proxy.fetch(upload(), {}, ctx)).status, 500)
reply = () => ok({ detail: 'out of credit' }, 402)
assert.equal((await proxy.fetch(upload(), env, ctx)).status, 502)

// Checking: still working, rate limited, finished (then deleted), and failed
calls = []
reply = () => ok({ status: 'processing' })
assert.deepEqual(await (await proxy.fetch(get('/result/abc'), env, ctx)).json(), { status: 'processing' })
reply = () => new Response('slow down', { status: 429 })
assert.deepEqual(await (await proxy.fetch(get('/result/abc'), env, ctx)).json(), { status: 'processing' }, 'a rate limit just means wait')
calls = []
reply = (c) => (c.method === 'DELETE' ? ok({ success: true }) : ok({ status: 'complete', success: true, json: { children: [] } }))
assert.deepEqual(await (await proxy.fetch(get('/result/abc'), env, ctx)).json(), { status: 'complete', json: { children: [] } })
await Promise.all(waited)
assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), ['GET https://www.datalab.to/api/v1/convert/abc', 'DELETE https://www.datalab.to/api/v1/results/abc'])
reply = (c) => (c.method === 'DELETE' ? ok({}) : ok({ status: 'complete', success: false, error: 'bad page' }))
assert.deepEqual(await (await proxy.fetch(get('/result/abc'), env, ctx)).json(), { status: 'failed', error: 'bad page' })

// The id can't be used to reach anything else
calls = []
assert.equal((await proxy.fetch(get('/result/..%2Fsecrets'), env, ctx)).status, 404)
assert.equal((await proxy.fetch(get('/result/a/b'), env, ctx)).status, 404)
assert.equal(calls.length, 0)

console.log('chandra tests passed')
