export type Lang = 'eng' | 'guj' | 'eng+guj'

export interface Book {
  id: string
  title: string
  author: string
  createdAt: number
  updatedAt: number
  deleted?: boolean
}

export interface Quote {
  id: string
  /** Optional: capture first, file it later (or never). */
  bookId?: string
  text: string
  page?: string
  tags: string[]
  note?: string
  lang: Lang
  createdAt: number
  updatedAt: number
  deleted?: boolean
}

export interface Collection {
  version: 1
  books: Book[]
  quotes: Quote[]
}
