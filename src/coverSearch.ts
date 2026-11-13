import { useSyncExternalStore } from 'react'
import { isMissingCover } from './covers'
import { searchCover } from './isbn'
import { isSample } from './samples'
import type { Store } from './store'
import type { Book } from './types'

/**
 * Finding covers by title for books that have none: ones without an ISBN, or whose
 * ISBN Open Library has no picture for. One book at a time, gently, with progress
 * anyone can watch. A book is searched once per device, found or not.
 */

// v2: the BAPS catalog arrived, so books searched before get one more look.
const TRIED_KEY = 'commonplace.coverSearched.v2'
const tried = new Set<string>(
  (() => {
    try {
      return JSON.parse(localStorage.getItem(TRIED_KEY) ?? '[]') as string[]
    } catch {
      return []
    }
  })(),
)
const saveTried = () => {
  try {
    localStorage.setItem(TRIED_KEY, JSON.stringify([...tried]))
  } catch {}
}

export interface CoverSearch {
  running: boolean
  done: number
  total: number
  found: number
  error?: string
}

let state: CoverSearch = { running: false, done: 0, total: 0, found: 0 }
const listeners = new Set<() => void>()
const set = (next: Partial<CoverSearch>) => {
  state = { ...state, ...next }
  for (const l of listeners) l()
}

export const needsCover = (b: Book) => !b.deleted && !isSample(b.id) && !tried.has(b.id) && (!b.cover || isMissingCover(b.cover))

export async function findCovers(patchBooks: Store['patchBooks'], books: Book[]) {
  if (state.running) return
  const todo = books.filter(needsCover)
  if (!todo.length) return
  set({ running: true, done: 0, total: todo.length, found: 0, error: undefined })
  try {
    for (const book of todo) {
      // BAPS publications from the bundled catalog; everything else from Open Library.
      const baps = (await import('./baps')).bapsCover(book.title, book.author, book.publisher)
      const cover = baps ?? (await searchCover(book.title, book.author))
      tried.add(book.id)
      saveTried()
      // Each cover shows up on the shelf as soon as it's found.
      if (cover) await patchBooks([{ book, patch: { cover } }])
      set({ done: state.done + 1, found: state.found + (cover ? 1 : 0) })
      await new Promise((r) => setTimeout(r, 300))
    }
    set({ running: false })
  } catch {
    set({ running: false, error: 'Couldn’t reach Open Library. Try again when you’re online.' })
  }
}

export const useCoverSearch = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  )
