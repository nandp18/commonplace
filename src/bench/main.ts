/**
 * OCR benchmark page (bench.html, dev server only).
 *
 * Run:    read every page with one engine and score it against its answer key.
 * Review: build and check answer keys. An empty page starts from the best saved OCR read;
 *         you correct it against the photo and mark it verified.
 */
import { fetchChandra, wordsFromChandra } from '../chandra'
import { readPage } from '../ocr'
import { detectPageNumber, type OcrWord } from '../selection'
import { diffWords, pool, samePageNumber, scorePage, textOfWords, type PageScore, type Pooled, type Truth } from './score'

type Page = Truth & { hasChandra: boolean }

const ENGINES = {
  tesseract: 'Tesseract (on the phone, no Chandra)',
  chandra: 'Chandra (saved read; reads live once if missing)',
  app: 'The app as it ships (live Chandra for Gujarati, spends credit)',
} as const
type Engine = keyof typeof ENGINES

interface PageResult extends PageScore {
  id: string
  lang: Truth['lang']
  verified: boolean
  pageNumber?: string
  truthPageNumber?: string
  pageNumberRight: boolean
  ms: number
  text: string
}

const app = document.getElementById('app')!
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & Record<string, unknown> = {}, ...kids: (Node | string)[]) => {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('aria-') || k === 'role') el.setAttribute(k, String(v))
    else (el as unknown as Record<string, unknown>)[k] = v
  }
  el.append(...kids)
  return el
}
const pct = (x: number) => `${(x * 100).toFixed(1)}%`

let pages: Page[] = []
const reads = new Map<string, Promise<OcrWord[]>>()
const images = new Map<string, Promise<HTMLImageElement>>()

const photo = (p: Page) => {
  let img = images.get(p.id)
  if (!img) {
    img = new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error(`Could not load ${p.photo}`))
      el.src = `/bench-api/file/${p.photo}`
    })
    images.set(p.id, img)
  }
  return img
}

/** One engine's read of one page, kept for the session so switching tabs doesn't re-read. */
function read(p: Page, engine: Engine): Promise<OcrWord[]> {
  const key = `${engine}:${p.id}`
  let r = reads.get(key)
  if (!r) {
    r = (async () => {
      const img = await photo(p)
      if (engine === 'chandra') {
        // Chandra's free tier is small, so each page is read live once and the result kept in bench/pages.
        let json: unknown
        if (p.hasChandra) json = await fetch(`/bench-api/file/${p.id}.chandra.json`).then((res) => res.json())
        else {
          json = await fetchChandra(img, () => {})
          await fetch(`/bench-api/chandra/${p.id}`, { method: 'POST', body: JSON.stringify(json) })
          p.hasChandra = true
        }
        return wordsFromChandra(json, img.naturalWidth, img.naturalHeight)
      }
      return readPage(img, p.lang, () => {}, { chandra: engine === 'app' })
    })()
    r.catch(() => reads.delete(key))
    reads.set(key, r)
  }
  return r
}

async function loadPages() {
  pages = await fetch('/bench-api/pages').then((r) => r.json())
}

// ——— Run ———

function summarize(results: PageResult[]) {
  const by = (lang: string, verifiedOnly: boolean) => pool(results.filter((r) => r.lang === lang && (!verifiedOnly || r.verified)))
  return {
    verified: { eng: by('eng', true), guj: by('guj', true) },
    all: { eng: by('eng', false), guj: by('guj', false) },
  }
}

function card(title: string, p: Pooled, note: string) {
  return h(
    'div',
    { className: 'card' },
    h('div', { className: 'muted' }, title),
    p.pages ? h('div', { className: 'big' }, `${pct(p.cer)} CER`) : h('div', { className: 'big muted' }, '—'),
    h('div', { className: 'muted' }, p.pages ? `${pct(p.wer)} words wrong · page numbers ${pct(p.pageNumbers)} · ${p.pages} pages` : note),
  )
}

function renderRun(root: HTMLElement) {
  const engine = h('select', {}, ...Object.entries(ENGINES).map(([k, label]) => h('option', { value: k }, label)))
  const start = h('button', { className: 'primary' }, 'Run benchmark')
  const status = h('span', { className: 'muted' })
  const out = h('div')
  const keyed = pages.filter((p) => p.lines.length > 0)
  const verified = keyed.filter((p) => p.verified).length

  start.onclick = async () => {
    start.disabled = engine.disabled = true
    const which = engine.value as Engine
    const results: PageResult[] = []
    const rows = h('tbody')
    out.replaceChildren(
      h(
        'table',
        {},
        h('thead', {}, h('tr', {}, ...['Page', 'Lang', 'Key', 'CER', 'Words wrong', 'Page no.', 'Time'].map((t) => h('th', {}, t)))),
        rows,
      ),
    )
    for (const [i, p] of keyed.entries()) {
      status.textContent = `Reading ${i + 1} of ${keyed.length}: ${p.id}`
      const t0 = performance.now()
      let words: OcrWord[] = []
      try {
        words = await read(p, which)
      } catch (e) {
        console.warn(p.id, e)
      }
      const ms = performance.now() - t0
      const text = textOfWords(words)
      const got = detectPageNumber(words)
      const r: PageResult = {
        id: p.id,
        lang: p.lang,
        verified: p.verified,
        ...scorePage(text, p.lines.join('\n')),
        pageNumber: got,
        truthPageNumber: p.pageNumber,
        pageNumberRight: samePageNumber(got, p.pageNumber),
        ms: Math.round(ms),
        text,
      }
      results.push(r)
      rows.append(
        h(
          'tr',
          {},
          h('td', {}, p.id),
          h('td', {}, p.lang),
          h('td', { className: p.verified ? 'ok' : 'draft' }, p.verified ? 'verified' : 'draft'),
          h('td', { className: 'num' }, words.length ? pct(r.cer) : 'no read'),
          h('td', { className: 'num' }, words.length ? pct(r.wer) : ''),
          h('td', { className: r.pageNumberRight ? 'ok' : 'err' }, `${got ?? '—'} / ${p.pageNumber ?? '—'}`),
          h('td', { className: 'num muted' }, `${(ms / 1000).toFixed(1)}s`),
        ),
      )
    }
    const summary = summarize(results)
    const saved = await fetch('/bench-api/results', { method: 'POST', body: JSON.stringify({ engine: which, summary, pages: results }) }).then((r) => r.json())
    status.textContent = `Saved bench/results/${saved.file}`
    out.prepend(
      h(
        'div',
        { className: 'summary' },
        card('English, verified', summary.verified.eng, 'No verified English pages yet'),
        card('Gujarati, verified', summary.verified.guj, 'No verified Gujarati pages yet'),
        card('English, all keys', summary.all.eng, 'No English keys yet'),
        card('Gujarati, all keys', summary.all.guj, 'No Gujarati keys yet'),
      ),
    )
    start.disabled = engine.disabled = false
  }

  root.replaceChildren(
    h('div', { className: 'row' }, engine, start, status),
    h(
      'p',
      { className: 'muted' },
      `${keyed.length} of ${pages.length} pages have an answer key, ${verified} verified. Only verified pages count toward the headline; drafts are shown for a rough read. `,
      'Compare two runs with ',
      h('code', {}, 'npm run bench:compare'),
      '.',
    ),
    out,
  )
}

// ——— Review ———

function renderReview(root: HTMLElement, startAt?: string) {
  let current = pages.find((p) => p.id === startAt) ?? pages.find((p) => !p.verified) ?? pages[0]
  const list = h('div', { className: 'list' })
  const left = h('div', { className: 'photo' })
  const right = h('div')

  const drawList = () =>
    list.replaceChildren(
      ...pages.map((p) => {
        const mark = p.verified ? h('span', { className: 'ok' }, '✓') : p.lines.length ? h('span', { className: 'draft' }, 'draft') : h('span', { className: 'muted' }, 'empty')
        const b = h('button', { 'aria-current': String(p === current) }, h('span', {}, `${p.id} `, h('span', { className: 'muted' }, p.lang)), mark)
        b.onclick = () => {
          current = p
          draw()
        }
        return b
      }),
    )

  const draw = () => {
    drawList()
    const p = current
    if (!p) return void right.replaceChildren(h('p', {}, 'No pages yet. Add some with scripts/bench-add.ts.'))

    const img = h('img', { src: `/bench-api/file/${p.photo}`, alt: `Photo of ${p.id}` })
    left.className = 'photo'
    left.replaceChildren(img)
    img.onclick = () => left.classList.toggle('zoom')

    const text = h('textarea', { value: p.lines.join('\n'), spellcheck: false, lang: p.lang === 'guj' ? 'gu' : 'en' })
    const pageNumber = h('input', { type: 'text', value: p.pageNumber ?? '', placeholder: 'none', size: 6 })
    const notes = h('input', { type: 'text', value: p.notes ?? '', placeholder: 'Notes (cut-off lines, spread…)', size: 40 })
    const verified = h('input', { type: 'checkbox', checked: p.verified })
    const status = h('span', { className: 'muted' })
    const diff = h('div', { className: 'diff' })
    const against = h('select', {}, ...(['tesseract', 'chandra'] as Engine[]).map((k) => h('option', { value: k }, ENGINES[k])))
    // Compare against the engine that didn't write the draft: where they disagree is where mistakes hide.
    against.value = p.draftFrom === 'tesseract' ? 'chandra' : 'tesseract'

    const showDiff = async () => {
      const engine = against.value as Engine
      diff.replaceChildren(h('span', { className: 'muted' }, 'Reading…'))
      const words = await read(p, engine).catch(() => [])
      if (current !== p || against.value !== engine) return
      if (words.length === 0) return void diff.replaceChildren(h('span', { className: 'muted' }, 'This engine has no read for this page.'))
      diff.replaceChildren(
        ...diffWords(textOfWords(words), text.value).flatMap((d) =>
          d.op === 'same' ? [d.text, ' '] : [h('span', { className: d.op, title: d.op === 'missing' ? 'In your key, not in this read' : 'In this read, not in your key' }, d.text), ' '],
        ),
      )
    }
    against.onchange = showDiff

    const save = async () => {
      const lines = text.value.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim())
      const body = { lines, pageNumber: pageNumber.value, notes: notes.value, verified: verified.checked && lines.length > 0, draftFrom: p.draftFrom }
      const res = await fetch(`/bench-api/truth/${p.id}`, { method: 'POST', body: JSON.stringify(body) })
      if (!res.ok) return void (status.textContent = 'Could not save')
      Object.assign(p, await res.json())
      status.textContent = `Saved ${new Date().toLocaleTimeString()}`
      drawList()
    }
    const saveNext = h('button', { className: 'primary' }, 'Save & next')
    saveNext.onclick = async () => {
      await save()
      const i = pages.indexOf(p)
      current = [...pages.slice(i + 1), ...pages.slice(0, i)].find((q) => !q.verified) ?? p
      draw()
    }
    const saveOnly = h('button', {}, 'Save')
    saveOnly.onclick = save
    text.onkeydown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        void save()
      }
    }

    right.replaceChildren(
      h('div', { className: 'row' }, h('strong', {}, p.id), h('span', { className: 'muted' }, p.lang === 'guj' ? 'Gujarati' : 'English'), status),
      h(
        'p',
        { className: 'muted' },
        'Type every printed line exactly as printed, one per line: running heads, page numbers, end-of-line hyphens and all. Leave out lines the photo cuts off. Tap the photo to zoom.',
      ),
      text,
      p.unsure?.length ? h('p', { className: 'draft' }, `Check these: ${p.unsure.join(', ')}`) : '',
      h('div', { className: 'row' }, h('label', {}, 'Page number ', pageNumber), notes),
      h('div', { className: 'row' }, h('label', {}, verified, ' Every line checked against the photo'), saveOnly, saveNext),
      h('div', { className: 'row' }, h('span', { className: 'muted' }, 'Where your key and'), against, h('span', { className: 'muted' }, 'disagree (green: only in your key, red: only in the read)')),
      diff,
    )

    // An empty key starts from the best saved read, so it's correcting rather than typing.
    if (p.lines.length === 0) {
      status.textContent = 'Drafting from Chandra…'
      void (async () => {
        let used: Engine = 'chandra'
        let words = await read(p, used).catch(() => [])
        if (words.length === 0) {
          used = 'tesseract'
          if (current === p) status.textContent = 'Chandra had nothing; drafting from Tesseract…'
          words = await read(p, used).catch(() => [])
        }
        if (current !== p || text.value) return
        text.value = textOfWords(words)
        if (!pageNumber.value) pageNumber.value = detectPageNumber(words) ?? ''
        p.draftFrom = used
        against.value = used === 'tesseract' ? 'chandra' : 'tesseract'
        status.textContent = `Draft from ${ENGINES[used]}. Fix every mistake before marking it verified.`
        void showDiff()
      })()
    } else void showDiff()
  }

  root.replaceChildren(h('div', { className: 'review' }, list, left, right))
  draw()
}

// ——— Shell ———

async function main() {
  await loadPages()
  const body = h('main')
  const tabs = { run: h('button', {}, 'Run'), review: h('button', {}, 'Review answer keys') }
  const show = async (tab: keyof typeof tabs) => {
    await loadPages()
    for (const [k, b] of Object.entries(tabs)) b.setAttribute('aria-pressed', String(k === tab))
    location.hash = tab
    if (tab === 'run') renderRun(body)
    else renderReview(body)
  }
  tabs.run.onclick = () => show('run')
  tabs.review.onclick = () => show('review')
  app.replaceChildren(h('header', {}, h('h1', {}, 'OCR bench'), h('div', { className: 'tabs row' }, tabs.run, tabs.review)), body)
  await show(location.hash === '#review' ? 'review' : 'run')
}

main().catch((e) => {
  app.textContent = `Bench failed to start: ${e}`
})
