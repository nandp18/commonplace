import { useEffect, useRef, useState } from 'react'
import { go, LangPicker, QuoteForm } from './components'
import { Lasso } from './Lasso'
import { preprocess, recognize, warmUp, type Box } from './ocr'
import type { Store } from './store'
import type { Lang } from './types'

type Step =
  | { kind: 'pick' }
  | { kind: 'select' }
  | { kind: 'reading'; crop: string; status: string; pct: number }
  | { kind: 'review'; crop: string; text: string }
  | { kind: 'error'; message: string }

const STATUS_LABELS: Record<string, string> = {
  'loading tesseract core': 'Starting OCR…',
  'loading language traineddata': 'Downloading language model (first time only)…',
  'initializing api': 'Starting OCR…',
  'recognizing text': 'Reading text…',
}

export function Capture({ store }: { store: Store }) {
  const [step, setStep] = useState<Step>({ kind: 'pick' })
  const [src, setSrc] = useState<string | null>(null)
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem('commonplace.lang') as Lang) || 'eng')
  const img = useRef<HTMLImageElement | null>(null)
  const [box, setBox] = useState<Box | null>(null)

  const setLang = (l: Lang) => {
    setLangState(l)
    localStorage.setItem('commonplace.lang', l)
    warmUp(l)
  }

  useEffect(() => warmUp(lang), [])
  useEffect(() => () => void (src && URL.revokeObjectURL(src)), [src])

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setSrc(URL.createObjectURL(file))
    setBox(null)
    setStep({ kind: 'select' })
  }

  const read = async (useWhole: boolean) => {
    const el = img.current
    if (!el) return
    const region = useWhole || !box ? { x: 0, y: 0, w: el.naturalWidth, h: el.naturalHeight } : box
    const canvas = preprocess(el, region)
    const crop = canvas.toDataURL('image/jpeg', 0.7)
    setStep({ kind: 'reading', crop, status: 'Starting OCR…', pct: 0 })
    try {
      const text = await recognize(canvas, lang, (status, pct) =>
        setStep((s) => (s.kind === 'reading' ? { ...s, status: STATUS_LABELS[status] ?? s.status, pct } : s)),
      )
      setStep({ kind: 'review', crop, text })
    } catch (e) {
      setStep({ kind: 'error', message: (e as Error).message || String(e) })
    }
  }

  return (
    <div className="screen capture">
      {step.kind === 'pick' && (
        <div className="pick">
          <h1>Capture a quote</h1>
          <p className="muted">Take a photo of the page, then circle the passage.</p>
          <label className="big-button primary">
            📷 Take photo
            <input type="file" accept="image/*" capture="environment" onChange={onFile} hidden />
          </label>
          <label className="big-button">
            🖼️ Choose from photos
            <input type="file" accept="image/*" onChange={onFile} hidden />
          </label>
          <a className="link" href="#/new">
            or type it in
          </a>
        </div>
      )}

      {step.kind === 'select' && src && (
        <>
          <Lasso src={src} onImage={(el) => (img.current = el)} onBox={setBox} />
          <div className="capture-bar">
            <LangPicker value={lang} onChange={setLang} />
            <div className="row">
              <button onClick={() => setStep({ kind: 'pick' })}>Retake</button>
              {box ? (
                <button className="primary" onClick={() => read(false)}>
                  Read text →
                </button>
              ) : (
                <button onClick={() => read(true)}>Use whole photo</button>
              )}
            </div>
          </div>
        </>
      )}

      {step.kind === 'reading' && (
        <div className="reading">
          <img className="crop" src={step.crop} alt="Selected passage" />
          <p>{step.status}</p>
          <progress value={step.pct} max={1} />
        </div>
      )}

      {step.kind === 'review' && (
        <QuoteForm
          store={store}
          initialText={step.text}
          lang={lang}
          onSaved={(q) => go(`/quote/${q.id}?saved=1`)}
        >
          <img className="crop" src={step.crop} alt="Selected passage" />
          <div className="row between">
            <span className="muted small">Check the text against the photo and fix any mistakes.</span>
            <button type="button" className="small" onClick={() => { setBox(null); setStep({ kind: 'select' }) }}>
              Re-select
            </button>
          </div>
        </QuoteForm>
      )}

      {step.kind === 'error' && (
        <div className="pick">
          <h2>Couldn't read the text</h2>
          <p className="muted">{step.message}</p>
          <button onClick={() => { setBox(null); setStep({ kind: 'select' }) }}>Try again</button>
        </div>
      )}
    </div>
  )
}
