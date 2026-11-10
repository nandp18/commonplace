/**
 * Cloudflare Worker that lets Commonplace reach Datalab's Chandra OCR.
 * Datalab's API can't be called from a web page, and the API key must stay off the phone.
 *
 * Setup: paste this file into a new Worker, then add a secret named DATALAB_API_KEY.
 */

const DATALAB = 'https://www.datalab.to/api/v1'
const MAX_UPLOAD = 15 * 1024 * 1024

/** The live site, plus the dev server on this machine or home/office Wi-Fi. */
const ALLOWED_ORIGIN = /^(https:\/\/nandp18\.github\.io|http:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+):5173)$/

const headersFor = (origin) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  Vary: 'Origin',
})

function json(body, status, origin) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headersFor(origin) } })
}

async function submit(request, env, origin) {
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!file || typeof file === 'string') return json({ error: 'No photo attached' }, 400, origin)
  if (file.type !== 'image/jpeg') return json({ error: 'Photo must be a JPEG' }, 415, origin)
  if (file.size > MAX_UPLOAD) return json({ error: 'Photo is too large' }, 413, origin)

  const out = new FormData()
  out.set('file', file, 'page.jpg')
  out.set('mode', 'accurate')
  out.set('output_format', 'json')
  out.set('word_bboxes', 'true')
  out.set('max_pages', '1')
  out.set('disable_image_extraction', 'true')
  out.set('disable_image_captions', 'true')

  const res = await fetch(`${DATALAB}/convert`, { method: 'POST', headers: { 'X-API-Key': env.DATALAB_API_KEY }, body: out })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.request_id) return json({ error: `Datalab said ${res.status}` }, 502, origin)
  return json({ id: data.request_id }, 200, origin)
}

async function check(id, env, origin, ctx) {
  const key = { 'X-API-Key': env.DATALAB_API_KEY }
  const res = await fetch(`${DATALAB}/convert/${id}`, { headers: key })
  if (res.status === 429) return json({ status: 'processing' }, 200, origin) // over the rate limit: just wait
  if (!res.ok) return json({ error: `Datalab said ${res.status}` }, 502, origin)
  const data = await res.json()
  if (data.status !== 'complete') return json({ status: 'processing' }, 200, origin)
  // Don't leave the page on Datalab's servers once it's been read.
  ctx?.waitUntil(fetch(`${DATALAB}/results/${id}`, { method: 'DELETE', headers: key }).catch(() => {}))
  if (data.success === false) return json({ status: 'failed', error: data.error ?? 'Could not read the page' }, 200, origin)
  return json({ status: 'complete', json: data.json }, 200, origin)
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') ?? ''
    if (!ALLOWED_ORIGIN.test(origin)) return new Response('Forbidden', { status: 403 })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headersFor(origin) })
    if (!env.DATALAB_API_KEY) return json({ error: 'DATALAB_API_KEY is not set' }, 500, origin)

    const { pathname } = new URL(request.url)
    try {
      if (request.method === 'POST' && pathname === '/') return await submit(request, env, origin)
      // The id only ever goes into a Datalab path built here, so it must be a plain token.
      const result = pathname.match(/^\/result\/([\w-]{1,128})$/)
      if (request.method === 'GET' && result) return await check(result[1], env, origin, ctx)
      return json({ error: 'Not found' }, 404, origin)
    } catch {
      return json({ error: 'Could not reach Datalab' }, 502, origin)
    }
  },
}
