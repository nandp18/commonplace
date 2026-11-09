import { useEffect, useRef, useState } from 'react'
import { CaptureButton, EditableQuote, GlassButton, go, Group, LANGS, QuoteDetails, Segmented, Sheet } from './components'
import { formatSelection } from './format'
import { Icon } from './icons'
import { readPage, readQuality, readRegion, warmUp, WRONG_LANGUAGE } from './ocr'
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
      if (!forced && readQuality(best.words) < WRONG_LANGUAGE && live()) {
        const other: Lang = first === 'eng' ? 'guj' : 'eng'
        setDetecting(other)
        setProgress(0)
        const ws = await readLang(other)
        if (readQuality(ws) > readQuality(best.words)) best = { lang: other, words: ws }
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
      if (words && range) ({ text, uncertain } = formatSelection(words, range))
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
      ? 'Drag the handles to adjust'
      : reading
        ? 'Highlight or circle the passage'
        : words?.length === 0
          ? 'No text found — circle the passage to try that area'
          : 'Highlight or circle the passage'

  return (
    <div className="capture">
      <header className="capture-top">
        <GlassButton icon="close" ariaLabel="Cancel" onClick={() => go('/')} />
        <Segmented value={lang} options={LANGS} onChange={switchLang} className="compact glass" />
        <CaptureButton className="glass-button glass circle">
          <Icon name="retake" size={21} />
          <span className="sr-only">Retake</span>
        </CaptureButton>
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
        <p className={`capture-hint ${failed ? 'error' : ''}`}>{hint}</p>
        <button className="prominent wide" disabled={!canSave} onClick={save}>
          {saving ? 'Saving…' : 'Save Quote'}
        </button>
      </footer>

      <Sheet
        open={!!savedQuote}
        onClose={() => go('/')}
        title="Saved"
        leading={
          <GlassButton
            icon="trash"
            destructive
            ariaLabel="Discard"
            onClick={async () => {
              if (savedQuote) await store.deleteQuote(savedQuote)
              reset()
            }}
          />
        }
        trailing={<GlassButton icon="check" prominent ariaLabel="Done" onClick={() => go(`/?new=${saved?.id}`)} />}
      >
        {savedQuote && (
          <>
            <div className="saved-badge">
              <span className="saved-check">
                <Icon name="check" size={16} />
              </span>
              In your library
            </div>
            <div className="saved-quote">
              <EditableQuote store={store} quote={savedQuote} uncertain={saved?.uncertain} />
              {saved && saved.uncertain.length > 0 && (
                <p className="footnote">Underlined words may be misread. Tap the text to fix.</p>
              )}
            </div>
            <QuoteDetails store={store} quote={savedQuote} />
            <Group>
              <CaptureButton className="row tappable tint center">
                <Icon name="camera" size={19} /> Capture Another
              </CaptureButton>
            </Group>
          </>
        )}
      </Sheet>
    </div>
  )
}

function PickPhoto() {
  return (
    <div className="pick">
      <div className="pick-art" aria-hidden>
        <span className="pick-line" />
        <span className="pick-line hl" />
        <span className="pick-line hl short" />
        <span className="pick-line" />
        <span className="pick-line short" />
      </div>
      <h2>Capture a Quote</h2>
      <p className="secondary">Photograph the page, then run your finger over the lines you love.</p>
      <div className="pick-actions">
        <CaptureButton className="prominent wide">
          <Icon name="camera" size={20} /> Take Photo
        </CaptureButton>
        <CaptureButton className="tinted wide" library>
          <Icon name="photos" size={20} /> Choose from Photos
        </CaptureButton>
        <a className="nav-button" href="#/new">
          Type it instead
        </a>
      </div>
    </div>
  )
}
