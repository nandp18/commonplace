import { useMemo, useRef, useState } from 'react'
import { QuoteText } from './components'
import { haptic, markTransition, morphName, reducedMotion } from './motion'
import type { Book, Quote } from './types'

const DECK_SIZE = 30
const FLING = 90 // px of drag that commits a swipe
const todayLabel = () =>
  new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()

/** Same order all day: today's quote first, then a day-seeded shuffle of the rest. */
function dailyOrder(quotes: Quote[], firstId?: string): Quote[] {
  const key = new Date().toDateString()
  let seed = 0
  for (const c of key) seed = (seed * 31 + c.charCodeAt(0)) >>> 0
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32)
  const rest = quotes.filter((q) => q.id !== firstId)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  const first = quotes.find((q) => q.id === firstId)
  return (first ? [first, ...rest] : rest).slice(0, DECK_SIZE)
}

/**
 * Rediscovery as a deck of cards: flick the top card away and the next rises.
 * Tap a card to open it. Vertical scrolling still works through it.
 */
export function QuoteDeck({ quotes, dailyId, bookOf }: { quotes: Quote[]; dailyId?: string; bookOf: (id?: string) => Book | undefined }) {
  const order = useMemo(() => dailyOrder(quotes, dailyId), [quotes, dailyId])
  const [top, setTop] = useState(0)
  const cards = useRef<(HTMLAnchorElement | null)[]>([])
  const drag = useRef({ x: 0, y: 0, t: 0, dx: 0, active: false, moved: false, flinging: false })

  if (order.length === 0) return null
  const visible = Array.from({ length: Math.min(3, order.length) }, (_, k) => order[(top + k) % order.length])

  const layout = (dx: number, animate: boolean) => {
    const p = Math.min(1, Math.abs(dx) / FLING)
    cards.current.forEach((el, k) => {
      if (!el) return
      el.style.transition = animate ? 'transform 0.5s var(--spring)' : 'none'
      if (k === 0) el.style.transform = `translateX(${dx}px) rotate(${dx * 0.045}deg)`
      // Cards behind rise toward the front as you drag.
      else el.style.transform = `translateY(${(k - p) * 12}px) scale(${1 - (k - p) * 0.045})`
    })
  }

  const onDown = (e: React.PointerEvent) => {
    if (drag.current.flinging) return
    drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, active: true, moved: false, flinging: false }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d.active) return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (!d.moved) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) return void (d.active = false) // it's a scroll
      if (Math.abs(dx) < 6) return
      d.moved = true
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    d.dx = dx
    layout(dx, false)
  }
  const onUp = () => {
    const d = drag.current
    if (!d.active || !d.moved) return void (d.active = false)
    d.active = false
    const v = Math.abs(d.dx) / Math.max(1, performance.now() - d.t)
    if (order.length > 1 && (Math.abs(d.dx) > FLING || v > 0.6)) {
      d.flinging = true
      const dir = Math.sign(d.dx)
      layout(dir * FLING, true) // the cards behind finish rising
      const el = cards.current[0]
      if (el) {
        el.style.transition = 'transform 0.38s cubic-bezier(0.2, 0.7, 0.3, 1), opacity 0.38s'
        el.style.transform = `translateX(${dir * window.innerWidth * 1.15}px) rotate(${dir * 16}deg)`
        el.style.opacity = '0'
      }
      haptic('tick')
      setTimeout(() => {
        cards.current.forEach((c) => c && ((c.style.transition = 'none'), (c.style.opacity = '')))
        setTop((t) => (t + 1) % order.length)
        requestAnimationFrame(() => layout(0, false))
        d.flinging = false
      }, reducedMotion() ? 0 : 300)
    } else layout(0, true)
  }

  return (
    <div className="deck" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      {visible
        .map((q, k) => {
          const book = bookOf(q.bookId)
          const isToday = q.id === dailyId
          return (
            <a
              key={q.id}
              ref={(el) => void (cards.current[k] = el)}
              href={`#/quote/${q.id}`}
              className={`deck-card depth-${k}`}
              style={{ transform: k ? `translateY(${k * 12}px) scale(${1 - k * 0.045})` : undefined }}
              aria-hidden={k > 0}
              tabIndex={k ? -1 : 0}
              draggable={false}
              onClick={(e) => {
                if (drag.current.moved || k > 0) return e.preventDefault()
                markTransition('quote', q.id, 'deck')
                e.currentTarget.querySelector<HTMLElement>('.quote-text')?.style.setProperty('view-transition-name', 'morph-quote')
              }}
            >
              <div className="deck-head">
                <span className="label">{isToday ? `Today · ${todayLabel()}` : 'Rediscovered'}</span>
                <span className="meta-mono">
                  {((top + k) % order.length) + 1}/{order.length}
                </span>
              </div>
              <QuoteText text={q.text} className="large clamp-deck" morph={morphName('quote', q.id, 'deck')} />
              {(book || q.page) && (
                <div className="attribution">
                  {book && <span className="attr-title">{book.title}</span>}
                  <span className="attr-mono">{[book?.author, q.page && `p.${q.page}`].filter(Boolean).join(' · ')}</span>
                </div>
              )}
            </a>
          )
        })
        .reverse()}
    </div>
  )
}
