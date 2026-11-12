import { useEffect, useRef, useState } from 'react'
import { CaptureButton, EditableQuote, go, QuoteFields, Segmented, Sheet } from './components'
import { fileIntoSea } from './drop'
import { haptic } from './motion'
import { PageArt } from './screens'
import { formatSelection, readsAsEnglish } from './format'
import { Icon } from './icons'
import { readPage, readQuality, readRegion, rereadSelection, warmUp, WRONG_LANGUAGE } from './ocr'
import { PageSelect } from './PageSelect'
import { takePendingPhoto } from './pending'
import { detectPageNumber, selectRange, type OcrWord, type Pt, type Range } from './selection'
import { currentBookId, type Store } from './store'
import type { Lang } from './types'

const LANG_KEY = 'commonplace.lang'

export function Capture({ store }: { store: Store }) {
  const [src, setSrc] = useState<string | null>(null)
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem(LANG_KEY) as Lang) || 'eng')
  const langRef = useRef(lang)
  const imgEl = useRef<HTMLImageElement | null>(null)
  const pages = useRef(new Map<Lang, Promise<OcrWord[]>>())
  const [words, setWords] = useState<OcrWord[] | null>(null)
  const [reading, setReading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [failed, setFailed] = useState<string | null>(null)
  const [range, setRange] = useState<Range | null>(null)
  const [stroke, setStrokeState] = useState<Pt[] | null>(null)
  const strokeRef = useRef<Pt[] | null>(null)
  const setStroke = (p: Pt[] | null) => {
    strokeRef.current = p
    setStrokeState(p)
  }
  const readRun = useRef(0)
  const [detecting, setDetecting] = useState<Lang | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<{ id: string; uncertain: string[] } | null>(null)
  const filingCard = useRef<HTMLDivElement>(null)
  const [filingAway, setFilingAway] = useState(false)

  useEffect(() => {
    warmUp(lang)
    const f = takePendingPhoto()
    if (f) setSrc(URL.createObjectURL(f))
  }, [])
  useEffect(() => () => void (src && URL.revokeObjectURL(src)), [src])

  const readLang = (l: Lang) => {
    let job = pages.current.get(l)
    if (!job) {
      job = readPage(imgEl.current!, l, setProgress)
      pages.current.set(l, job)
      job.catch(() => pages.current.delete(l))
    }
    return job
  }

  const chooseLang = (l: Lang) => {
    setLang(l)
    langRef.current = l
    localStorage.setItem(LANG_KEY, l)
  }

  /**
   * Read with the last-used language; if the result looks like the wrong script
   * (low confidence), read again with the other one and keep the better read.
   * `forced` skips detection when you tap the language toggle yourself.
   */
  const read = async (forced?: Lang) => {
    if (!imgEl.current) return
    const run = ++readRun.current
    const live = () => run === readRun.current
    setReading(true)
    setFailed(null)
    setWords(null)
    setRange(null)
    setProgress(0)
    try {
      const first = forced ?? langRef.current
      let best = { lang: first, words: await readLang(first) }
      const english = first === 'guj' && readsAsEnglish(best.words)
      if (!forced && (english || readQuality(best.words) < WRONG_LANGUAGE) && live()) {
        const other: Lang = first === 'eng' ? 'guj' : 'eng'
        setDetecting(other)
        setProgress(0)
        const ws = await readLang(other)
        if (english || readQuality(ws) > readQuality(best.words)) best = { lang: other, words: ws }
      }
      if (!live()) return
      chooseLang(best.lang)
      setWords(best.words)
      // You may have highlighted while the page was still being read.
      const pending = strokeRef.current
      if (pending) setRange(selectRange(best.words, pending))
    } catch (e) {
      if (live()) setFailed((e as Error).message || 'Could not read the page')
    } finally {
      if (live()) {
        setReading(false)
        setDetecting(null)
      }
    }
  }

  const switchLang = (l: Lang) => {
    if (l === lang && words) return
    chooseLang(l)
    read(l)
  }

  const save = async () => {
    const img = imgEl.current
    if (!img || saving) return
    setSaving(true)
    try {
      let text = '', uncertain: string[] = []
      if (words && range) {
        // On Gujarati the closer read scored higher confidence while adding mistakes.
        const sharper = lang === 'guj' ? undefined : await rereadSelection(img, words, range, lang).catch(() => undefined)
        ;({ text, uncertain } = formatSelection(words, range, sharper))
      }
      if (!text && stroke) {
        // Nothing to snap to: read just the region that was marked.
        const xs = stroke.map((p) => p.x), ys = stroke.map((p) => p.y)
        const pad = 0.02 * Math.max(img.naturalWidth, img.naturalHeight)
        const x = Math.max(0, Math.min(...xs) - pad), y = Math.max(0, Math.min(...ys) - pad)
        const w = Math.min(img.naturalWidth, Math.max(...xs) + pad) - x
        const h = Math.min(img.naturalHeight, Math.max(...ys) + pad) - y
        text = await readRegion(img, { x, y, w, h }, lang)
      }
      if (!text) {
        setFailed('No text found there. Try a closer, flatter photo.')
        return
      }
      const bookId = currentBookId()
      const q = await store.saveQuote({
        text,
        bookId: bookId && store.bookMap.has(bookId) ? bookId : undefined,
        page: words ? detectPageNumber(words) : undefined,
        tags: [],
        lang,
      })
      haptic('success')
      setSaved({ id: q.id, uncertain })
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setRange(null)
    setStroke(null)
    setSaved(null)
  }

  if (!src) return <PickPhoto />

  const savedQuote = saved ? store.quotes.find((q) => q.id === saved.id) : undefined
  const canSave = !saving && (!!range || (!!stroke && !reading))
  const hint = failed
    ? failed
    : range
      ? 'Selected'
      : stroke && reading
        ? 'Got it — finishing the page'
        : words?.length === 0
          ? 'No text found — circle the passage to read that area'
          : 'Highlight or circle the passage'

  return (
    <div className="capture">
      <header className="capture-top">
        <div className="navbar-side">
          <button className="capture-text-button" onClick={() => go('/')}>
            Cancel
          </button>
        </div>
        <div className="capture-title">Quote</div>
        <div className="navbar-side end">
          <Segmented value={lang} options={LANGS_SHORT} onChange={switchLang} className="dark" />
        </div>
      </header>

      <PageSelect
        src={src}
        words={words}
        reading={reading}
        status={detecting ? `Trying ${detecting === 'guj' ? 'ગુજરાતી' : 'English'}` : 'Reading page'}
        progress={progress}
        pendingStroke={!range ? stroke : null}
        range={range}
        onImage={(el) => {
          imgEl.current = el
          read()
        }}
        onRange={setRange}
        onStroke={setStroke}
      />

      <footer className="capture-bottom">
        <p className={`capture-hint ${failed ? 'error' : ''} ${range ? 'selected' : ''}`}>{hint}</p>
        <button className="light-button wide" disabled={!canSave} onClick={save}>
          {saving ? 'Filing…' : 'Use this passage'}
        </button>
        <CaptureButton className="capture-text-button small">
          <Icon name="retake" size={16} /> Retake
        </CaptureButton>
      </footer>

      <Sheet open={!!savedQuote} onClose={() => go(`/?new=${saved?.id}`)}>
        {savedQuote && (
          <div className="filing" ref={filingCard}>
            <div className="filing-head">
              <span className="filing-label">Quote</span>
              <span className="saved-tag">
                <Icon name="check" size={12} animate /> Saved
              </span>
            </div>
            <div className="saved-quote">
              <EditableQuote store={store} quote={savedQuote} uncertain={saved?.uncertain} reveal />
            </div>
            {saved && saved.uncertain.length > 0 && (
              <p className="footnote">Wavy words may be misread — tap the quote to fix.</p>
            )}
            <QuoteFields store={store} quote={savedQuote} />
            <button
              className="ink-button wide"
              onClick={async () => {
                if (filingAway) return
                setFilingAway(true)
                haptic('success')
                // The words gather into a gold drop and fall into the sea, full screen.
                const id = saved!.id
                if (filingCard.current) await fileIntoSea(filingCard.current, id, () => go(`/?new=${id}`))
                else go(`/?new=${id}`)
              }}
            >
              <Icon name="sparkle" size={18} animate /> File quote
            </button>
            <div className="filing-secondary">
              <button
                className="text-button destructive"
                onClick={async () => {
                  await store.deleteQuote(savedQuote)
                  reset()
                }}
              >
                Discard
              </button>
              <CaptureButton className="text-button">Capture another</CaptureButton>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  )
}

const LANGS_SHORT: { value: Lang; label: string }[] = [
  { value: 'eng', label: 'EN' },
  { value: 'guj', label: 'ગુ' },
]

function PickPhoto() {
  return (
    <div className="pick">
      <PageArt />
      <h2>Capture a quote</h2>
      <p>Photograph the page, then run your finger over the lines you love.</p>
      <div className="pick-actions">
        <CaptureButton className="light-button wide" camera>
          <Icon name="camera" size={20} /> Take photo
        </CaptureButton>
        <CaptureButton className="dark-button wide">
          <Icon name="photos" size={20} /> Choose from photos
        </CaptureButton>
        <a className="capture-text-button" href="#/new">
          Type it instead
        </a>
        <a className="capture-text-button" href="#/">
          Cancel
        </a>
      </div>
    </div>
  )
}
