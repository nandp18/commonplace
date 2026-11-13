export type Lang = 'eng' | 'guj' | 'eng+guj'

export interface Book {
  id: string
  title: string
  /** One or more authors, comma-separated: "Ursula K. Le Guin, Jane Doe". */
  author: string
  /** Link to a cover image. Without one the book gets a generated cloth cover. */
  cover?: string
  /** ISBN-13, digits only. */
  isbn?: string
  publisher?: string
  /** Year of publication, as printed: "1974". */
  year?: string
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
