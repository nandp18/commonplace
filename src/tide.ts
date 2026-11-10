/**
 * The tide picks which quote to carry you to. Not a pure shuffle: it works through
 * everything you haven't been shown before repeating, and leans toward older quotes.
 */

const KEY = 'commonplace.tide'
const YEAR = 365.25 * 24 * 60 * 60 * 1000

/** Quote id → when the tide last landed on it. Kept per device. */
export type Seen = Record<string, number>

export function loadSeen(): Seen {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Seen
  } catch {
    return {}
  }
}

export function markSeen(id: string, now = Date.now()) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadSeen(), [id]: now }))
  } catch {
    // Private browsing or full storage: the tide just forgets.
  }
}

export function pickTide<T extends { id: string; createdAt: number }>(
  quotes: T[],
  seen: Seen,
  now: number,
  rand: () => number,
  last?: string,
): T | undefined {
  const others = quotes.filter((q) => q.id !== last)
  const from = others.length ? others : quotes
  if (!from.length) return undefined

  let pool = from.filter((q) => seen[q.id] === undefined)
  if (!pool.length) {
    // Been through them all: start again from the quarter seen longest ago.
    const stalest = [...from].sort((a, b) => seen[a.id] - seen[b.id])
    pool = stalest.slice(0, Math.ceil(stalest.length / 4))
  }

  const weight = (q: T) => 1 + 0.5 * Math.min(6, Math.max(0, (now - q.createdAt) / YEAR))
  let r = rand() * pool.reduce((sum, q) => sum + weight(q), 0)
  for (const q of pool) {
    r -= weight(q)
    if (r < 0) return q
  }
  return pool[pool.length - 1]
}

/** "Highlighted January 2019 · 7 years ago" */
export function whenLabel(createdAt: number, now = Date.now()): string {
  const month = new Date(createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const years = Math.floor((now - createdAt) / YEAR)
  return `Highlighted ${month}${years >= 1 ? ` · ${years} ${years === 1 ? 'year' : 'years'} ago` : ''}`
}
