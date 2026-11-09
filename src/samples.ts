import type { Book, Quote } from './types'

/**
 * A sample library for trying out browsing and grouping. All public-domain texts.
 * Ids start with `sample-` so they can be removed, and they're kept out of sync.
 * Page numbers are illustrative.
 */

export const SAMPLE_PREFIX = 'sample-'
export const isSample = (id: string) => id.startsWith(SAMPLE_PREFIX)

const d = (s: string) => new Date(s).getTime()

const books: Omit<Book, 'createdAt' | 'updatedAt'>[] = [
  { id: 'sample-walden', title: 'Walden', author: 'Henry David Thoreau' },
  { id: 'sample-meditations', title: 'Meditations', author: 'Marcus Aurelius' },
  { id: 'sample-middlemarch', title: 'Middlemarch', author: 'George Eliot' },
  { id: 'sample-selfreliance', title: 'Self-Reliance', author: 'Ralph Waldo Emerson' },
  { id: 'sample-straybirds', title: 'Stray Birds', author: 'Rabindranath Tagore' },
  { id: 'sample-kekarav', title: 'કલાપીનો કેકારવ', author: 'કલાપી' },
  { id: 'sample-bhajan', title: 'ભજન', author: 'નરસિંહ મહેતા' },
  { id: 'sample-chhappa', title: 'અખાના છપ્પા', author: 'અખો' },
]

type Seed = Omit<Quote, 'id' | 'createdAt' | 'updatedAt' | 'tags' | 'lang'> & { at: string; tags?: string[]; lang?: Quote['lang'] }

const quotes: Seed[] = [
  {
    bookId: 'sample-walden', page: '90', at: '2026-11-08T21:10',
    text: 'I went to the woods because I wished to live deliberately, to front only the essential facts of life, and see if I could not learn what it had to teach, and not, when I came to die, discover that I had not lived.',
    tags: ['attention', 'living'], note: 'The reason I started keeping these.',
  },
  {
    bookId: 'sample-walden', page: '8', at: '2026-11-06T22:40',
    text: 'The mass of men lead lives of quiet desperation.',
    tags: ['work'],
  },
  {
    bookId: 'sample-walden', page: '91', at: '2026-11-07T07:15',
    text: 'Our life is frittered away by detail. An honest man has hardly need to count more than his ten fingers, or in extreme cases he may add his ten toes, and lump the rest. Simplicity, simplicity, simplicity!',
    tags: ['simplicity'],
  },
  {
    bookId: 'sample-meditations', page: '11', at: '2026-10-21T06:30',
    text: 'Begin the morning by saying to thyself, I shall meet with the busy-body, the ungrateful, arrogant, deceitful, envious, unsocial.',
    tags: ['mornings', 'stoic'], note: 'Read this before standup.',
  },
  {
    bookId: 'sample-meditations', page: '24', at: '2026-10-22T23:05',
    text: 'Every man lives only this present time, which is an indivisible point, and all the rest of his life is either past or it is uncertain.',
    tags: ['time', 'stoic'],
  },
  {
    bookId: 'sample-meditations', page: '31', at: '2026-10-25T21:50',
    text: 'Men seek retreats for themselves, houses in the country, sea-shores, and mountains. But this is altogether a mark of the most common sort of men, for it is in thy power whenever thou shalt choose to retire into thyself.',
    tags: ['stillness', 'stoic'],
  },
  {
    bookId: 'sample-middlemarch', page: '838', at: '2026-09-14T22:20',
    text: 'For the growing good of the world is partly dependent on unhistoric acts; and that things are not so ill with you and me as they might have been, is half owing to the number who lived faithfully a hidden life, and rest in unvisited tombs.',
    tags: ['kindness', 'living'], note: 'The last lines. I cried on the train.',
  },
  {
    bookId: 'sample-middlemarch', page: '783', at: '2026-09-10T20:00',
    text: 'What do we live for, if it is not to make life less difficult to each other?',
    tags: ['kindness'],
  },
  {
    bookId: 'sample-selfreliance', page: '4', at: '2026-08-19T08:45',
    text: 'Trust thyself: every heart vibrates to that iron string.',
    tags: ['courage'],
  },
  {
    bookId: 'sample-selfreliance', page: '12', at: '2026-08-20T09:30',
    text: 'A foolish consistency is the hobgoblin of little minds.',
  },
  {
    bookId: 'sample-straybirds', page: '82', at: '2026-10-02T21:00',
    text: 'Let life be beautiful like summer flowers and death like autumn leaves.',
    tags: ['living', 'death'],
  },
  {
    bookId: 'sample-straybirds', page: '292', at: '2026-10-03T19:40',
    text: 'Clouds come floating into my life, no longer to carry rain or usher storm, but to add color to my sunset sky.',
    tags: ['age'],
  },
  {
    bookId: 'sample-kekarav', page: '112', at: '2026-11-02T22:15', lang: 'guj',
    text: 'જ્યાં જ્યાં નજર મારી ઠરે, યાદી ભરી ત્યાં આપની; આંસુ મહીં એ આંખથી યાદી ઝરે છે આપની!',
    tags: ['યાદ'], note: 'Ba used to sing this.',
  },
  {
    bookId: 'sample-bhajan', at: '2026-10-30T07:00', lang: 'guj',
    text: 'વૈષ્ણવ જન તો તેને કહીએ, જે પીડ પરાઈ જાણે રે; પર દુઃખે ઉપકાર કરે તો યે, મન અભિમાન ન આણે રે.',
    tags: ['kindness'],
  },
  {
    bookId: 'sample-chhappa', page: '23', at: '2026-09-28T21:30', lang: 'guj',
    text: 'એક મૂરખને એવી ટેવ, પથ્થર એટલા પૂજે દેવ.',
    tags: ['વ્યંગ'],
  },
  {
    at: '2026-08-30T18:00', lang: 'guj',
    text: 'ટીપે ટીપે સરોવર ભરાય.',
    note: 'Proverb — written on the fridge at home.',
    tags: ['habits'],
  },
]

export function sampleLibrary(): { books: Book[]; quotes: Quote[] } {
  const created = d('2026-08-15T12:00')
  return {
    books: books.map((b) => ({ ...b, createdAt: created, updatedAt: created })),
    quotes: quotes.map(({ at, tags, lang, ...q }, i) => ({
      ...q,
      id: `${SAMPLE_PREFIX}q${i + 1}`,
      tags: tags ?? [],
      lang: lang ?? 'eng',
      createdAt: d(at),
      updatedAt: d(at),
    })),
  }
}
