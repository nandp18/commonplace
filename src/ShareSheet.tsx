import { useEffect, useRef, useState } from 'react'
import { GlassButton, Sheet } from './components'
import { isGujarati } from './format'
import { haptic } from './motion'
import { drawCard, type CardTheme } from './shareCard'
import { transliterate } from './transliterate'
import type { Book, Quote } from './types'
import { download } from './util'

const THEMES: [CardTheme, string][] = [
  ['paper', 'Paper'],
  ['ink', 'Ink'],
  ['ocean', 'Ocean'],
]

function CardMaker({ quote, book, shareText }: { quote: Quote; book?: Book; shareText: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [theme, setTheme] = useState<CardTheme>('paper')
  const [pronounce, setPronounce] = useState(true)
  const [blob, setBlob] = useState<Blob | null>(null)
  const gu = isGujarati(quote.text)

  // Drawn ahead of the tap: phones only allow sharing straight from a tap, with no waiting in between.
  useEffect(() => {
    let live = true
    setBlob(null)
    drawCard(
      canvas.current!,
      {
        text: quote.text,
        translit: gu && pronounce ? transliterate(quote.text) : undefined,
        title: book?.title,
        byline: [book?.author, quote.page && `p. ${quote.page}`].filter(Boolean).join(' · ') || undefined,
        gu,
      },
      theme,
    ).then((b) => live && setBlob(b))
    return () => {
      live = false
    }
  }, [quote.text, quote.page, book?.title, book?.author, gu, pronounce, theme])

  const canShareFiles = !!blob && !!navigator.canShare?.({ files: [new File([blob], 'quote.png', { type: 'image/png' })] })

  return (
    <div className="card-maker">
      <canvas ref={canvas} className="card-preview" role="img" aria-label="Preview of the share card" />
      <div className="chips card-options">
        {THEMES.map(([id, name]) => (
          <button key={id} type="button" className={`chip ${theme === id ? 'on' : ''}`} onClick={() => setTheme(id)}>
            {name}
          </button>
        ))}
        {gu && (
          <button type="button" className={`chip ${pronounce ? 'on' : ''}`} onClick={() => setPronounce(!pronounce)}>
            Pronunciation
          </button>
        )}
      </div>
      <button
        type="button"
        className="pill card-send"
        disabled={!blob}
        onClick={() => {
          haptic('tap')
          download('quote.png', blob!, 'image/png')
        }}
      >
        {canShareFiles ? 'Share image' : 'Save image'}
      </button>
      {'share' in navigator && (
        <button type="button" className="text-button card-as-text" onClick={() => navigator.share({ text: shareText }).catch(() => {})}>
          Share as text
        </button>
      )}
    </div>
  )
}

export function ShareSheet({ open, onClose, quote, book, shareText }: { open: boolean; onClose: () => void; quote: Quote; book?: Book; shareText: string }) {
  return (
    <Sheet open={open} onClose={onClose} title="Share" trailing={<GlassButton label="Done" onClick={onClose} />}>
      <CardMaker quote={quote} book={book} shareText={shareText} />
    </Sheet>
  )
}
