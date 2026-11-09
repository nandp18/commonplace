import { useEffect, useRef, useState } from 'react'
import { CaptureButton, EditableQuote, go, Group, LANGS, QuoteDetails, Segmented, Sheet } from './components'
import { formatSelection } from './format'
import { Icon } from './icons'
import { readPage, readRegion, warmUp } from './ocr'
import { PageSelect } from './PageSelect'
import { takePendingPhoto } from './pending'
import { detectPageNumber, type OcrWord, type Pt, type Range } from './selection'
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
  const [stroke, setStroke] = useState<Pt[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<{ id: string; uncertain: string[] } | null>(null)

  useEffect(() => {
    warmUp(lang)
    const f = takePendingPhoto()
    if (f) setSrc(URL.createObjectURL(f))
  }, [])
  useEffect(() => () => void (src && URL.revokeObjectURL(src)), [src])

  const read = (l: Lang) => {
    const img = imgEl.current
    if (!img) return
    let job = pages.current.get(l)
    if (!job) {
      job = readPage(img, l, setProgress)
      pages.current.set(l, job)
      job.catch(() => pages.current.delete(l))
    }
    setReading(true)
    setFailed(null)
    setWords(null)
    setProgress(0)
    const current = () => langRef.current === l // ignore a read for a language you've switched away from
    job
      .then((ws) => current() && setWords(ws))
      .catch((e) => current() && setFailed((e as Error).message || 'Could not read the page'))
      .finally(() => current() && setReading(false))
  }

  const switchLang = (l: Lang) => {
    setLang(l)
    langRef.current = l
    localStorage.setItem(LANG_KEY, l)
    setRange(null)
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
        <button className="nav-button" onClick={() => go('/')}>
          Cancel
        </button>
        <Segmented value={lang} options={LANGS} onChange={switchLang} className="compact" />
        <CaptureButton className="nav-button">Retake</CaptureButton>
      </header>

      <PageSelect
        src={src}
        words={words}
        reading={reading}
        progress={progress}
        range={range}
        onImage={(el) => {
          imgEl.current = el
          read(lang)
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
          <button
            className="nav-button destructive"
            onClick={async () => {
              if (savedQuote) await store.deleteQuote(savedQuote)
              reset()
            }}
          >
            Discard
          </button>
        }
        trailing={
          <button className="nav-button bold" onClick={() => go(`/?new=${saved?.id}`)}>
            Done
          </button>
        }
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
