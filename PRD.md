# Commonplace — PRD (v0)

## 1. Problem

I read books in English and Gujarati. When a line or paragraph stays with me, my options today are bad:

- **Highlighting in the book.** The quote stays trapped on the page. I can't search for it or find it again without flipping through.
- **Taking a photo with my phone.** The quote gets lost in my camera roll among thousands of other photos. It's not searchable, has no book or page attached, and contains the whole page instead of the line I cared about.

What I want is a **commonplace book**: one personal collection of quotes, searchable, organized by book, and easy to resurface.

## 2. Goal

Capturing a quote from a physical book should take **under 10 seconds**, in English or Gujarati, without pulling me out of the book:

> Tap camera → snap → run a finger over the passage → **Save**. Done; back to reading.

### Principles
1. **Document, don't interrupt.** Capture is the only required step. Book, page, tags, and notes are optional and can be added later, or never.
2. **Forgiving input.** Fingers on a phone are imprecise. A rough loop, a swipe, or an underline should all produce a clean selection of whole words.
3. **Text worth keeping.** What gets saved should read like it was carefully copied by hand, not like raw OCR output.
4. **Feels native to iOS 26.** It follows Liquid Glass: transparent navigation bars with floating glass buttons, a floating tab bar that minimizes on scroll, glass sheets with ✕ / ✓ actions, and concentric radii. Glass is used only for controls, never for content. Visual direction is warm editorial: white pages, cream sheets and cards, near-black ink buttons, a gold hanging quote mark, dot-matrix icons, serif book titles, and mono labels. The capture screen is dark, since it's a photo viewer, and the only exception to white pages.

## 3. Users

One user: me. I use it mainly on my phone (installed to the home screen) while reading, and sometimes on my laptop to browse or export.

## 4. Core workflow (capture)

1. Tap the **camera button** in the tab bar. The camera opens immediately, with no screen in between.
2. Take the photo. While the photo is displayed, the **whole page is OCR'd in the background** (a scanning shimmer shows progress). Every word gets a position.
3. **Highlight** with a finger:
   - **Loop:** any rough loop, even an open, lopsided, or overshooting one, selects the words whose centers fall inside it.
   - **Swipe:** a drag across a line, a diagonal from the first word to the last, or an underline selects from the start word to the end word.
   - The selection **snaps to whole words** and is drawn as Books-yellow highlighter bands, live as the finger moves.
   - It also **snaps to sentence boundaries** when the gesture is one or two words off, and drops stray words grazed from the paragraph above or below.
   - **Handles** let me drag the start and end. **Pinch** zooms in for small print.
4. Tap **Save Quote**. The quote is saved immediately.
5. A sheet confirms the save. Everything on it is optional and autosaves:
   - The typeset quote. Words the OCR was unsure of have a wavy underline. Tap to fix.
   - **Book** (defaults to the book I'm currently reading, i.e. the last one used; can be changed or removed), **page** (detected automatically from the page number in the margin), **tags**, and a **note**.
   - **Done**, **Capture Another**, or **Discard**.

Language is **detected automatically**. The page is read with the last-used language. If the mean OCR confidence is below 70 (the right model scores about 90, the wrong one about 35), the page is re-read with the other language and the better read wins. The **English / ગુજરાતી** toggle shows the result and can override it.

Fallbacks: if no words are found where I pointed, only the marked region is OCR'd. I can also **type or paste** a quote; pasted line breaks are reflowed.

### Text cleanup (applied automatically)
- Wrapped lines are joined back into paragraphs, and paragraph breaks are kept.
- Words hyphenated across a line break are rejoined ("al- / ready" → "already").
- Typographic punctuation: curly quotes and apostrophes, em dashes, ellipses, and correct spacing around punctuation. Split contractions are rejoined ("it 's" → "it’s").
- OCR noise is removed: stray bars, specks, and garbled symbols.
- A leading or trailing **…** is added when the selection starts or ends mid-sentence, as you would when copying by hand.

## 5. Retrieval

- **Home / Library.** Quote of the day at the top, then recent quotes.
- **Full-text search** across quote text, notes, tags, book titles, and authors, in both English and Gujarati, filtered live as I type.
- **Browse by book.** A grid of generated cloth-bound covers with quote counts. Tapping a book shows its quotes ordered by page, with page numbers in the margin. Quotes with no book are grouped under **Loose Pages**.
- **The sea.** At the top of the Library, the collection is drawn as a sea of dots in the same dot-matrix style as the icons. Every quote is one drop: newest just under the surface, oldest deepest. Today's drop glows gold. Tap a drop and it ripples, rises, and shows its quote beneath the sea; tap again to open it. A newly filed quote falls in through the surface with a splash.
- **Edit / delete** any quote.
- **Export** to Markdown (grouped by book) and CSV (UTF-8 with BOM so Gujarati opens correctly in Excel and Sheets).

- **The ocean.** An immersive, endless dive, opened from the Ocean tab or "Dive ↓". You start at the surface and scroll down through the water: quotes surface one by one, brightening as they pass the middle of the screen and fading as they drift away. The first lap runs newest to oldest; after that "the tide brings them round again" in a new shuffle each lap. A depth gauge in meters runs down the side, the water darkens as you descend, and marine snow drifts past. Momentum scrolling is custom, so the dive never ends, and it remembers your depth.
  - **Zones:** Sunlight (white) → Twilight (pale blue-grey) → Midnight / Abyss (near-black, with cream text and glowing drops). The plunge into darkness happens inside a single gap between quotes, so a settled quote is never on mid-grey. The worst contrast at a settled quote is 13:1. Zone and tide labels always sit in open water between quotes.
  - **Sky and moon:** a dot-matrix moon shows tonight's real phase, casts a glittering moon path on the surface, and sends moonbeams into the twilight. Tap the moon to make it full for a while.
  - **Life:** caustics in the shallows, bubbles (always rising, more when you dive fast, and a burst where you tap the water), schools of fish in lit water, an occasional whale gliding past, and pulsing jellyfish in the dark.

### Motion & feedback
- **Library:** list items rise in as they scroll into view. Tapping a quote or cover **grows it into its page** (View Transitions shared elements), and the tab selection pill slides between tabs.
- **Capture:** haptic ticks as the selection handles snap from word to word, the finger stroke melts into the snapped highlight, and the passage fades in word by word on the filing sheet.
- **Details:** dot-matrix icons assemble from the center out (active tab, copy → ✓, saved), sheets drag down to dismiss, and covers tilt under your finger.
- **Haptics:** Vibration API on Android. On iOS Safari 18+, toggling a hidden native switch plays the system tick.
- Everything respects Reduce Motion.

## 6. Technical approach

| Concern | Decision | Why |
|---|---|---|
| Hosting | **GitHub Pages** (static) | Free, personal, no server to maintain |
| App type | Mobile-first web app, installable to the home screen (web manifest) | No app store needed, and the camera works via `<input capture>` |
| Framework | Vite + React + TypeScript | Small and fast to build with |
| Design | iOS design language in CSS: SF Pro / New York system fonts, Liquid Glass tab bar, sheets, inset grouped lists, View Transitions for push/pop | A native feel without an app store |
| OCR | **Tesseract.js** in the browser, `eng` + Gujarati script models. When Chandra is set up, Gujarati pages go to it first through a Cloudflare Worker. Otherwise, Gujarati pages are also read flattened (tilt and curve removed) and the more confident read is kept | Free, private, and needs no server. Models (~2–10 MB) download once and are cached by the browser |
| Selection | Full-page OCR with word bounding boxes. The gesture is interpreted geometrically (loop vs. swipe) and snapped to words and sentences. The logic lives in `selection.ts` and is unit-tested against real OCR output | Finger input is imprecise, and snapping to real words makes it forgiving |
| Image prep | Background flattening (divide by a blurred copy), then contrast stretching | Handles shadows near the spine and uneven lamp light |
| Local storage | **IndexedDB** | Works offline and saves instantly |
| Sync / backup | `quotes.json` in a **separate private GitHub repo**, read and written through the GitHub Contents API with a fine-grained personal access token (one repo, Contents: read/write) | Keeps quotes private while the app itself is public. Every sync is a commit, so I get version history for free, and the same data is available on my laptop |

### Data model

```ts
Book  { id, title, author, createdAt, updatedAt, deleted? }
Quote { id, bookId?, text, page?, tags: string[], note?, lang: 'eng'|'guj'|'eng+guj',
        createdAt, updatedAt, deleted? }
```

`quotes.json` = `{ version: 1, books: Book[], quotes: Quote[] }`.

### Sync rules

- Sync runs on app open, after each save, and when I tap **Sync now**.
- Merge: take the union by `id`, and the record with the newest `updatedAt` wins.
- Deletes are soft (`deleted: true` tombstones), so a delete on one device carries over to the others.
- Writes include the file's `sha`. On a 409/422 conflict, the app re-fetches, merges, and retries.
- If no token is configured, the app works fully local-only and shows a nudge to set up backup.

## 7. Non-goals for v0

- Automatically detecting highlighter marks already on the page.
- Storing the original photo or crop. Only the text is kept.
- Accounts or multi-user support.
- Kindle or Goodreads import.
- Fully offline capture (OCR models and the app shell aren't cached by a service worker yet).
- Spaced-repetition review, email or push reminders.
- Cleaning up OCR text with an AI model.

## 8. Success criteria

- From my phone, I can capture an English quote and a Gujarati quote from a real book, and fixing the text takes ≤ 1 minute.
- Quotes I save on my phone show up on my laptop after sync.
- Search finds a quote by a Gujarati word and by an English word.
- Export produces a readable Markdown file of everything.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Tesseract accuracy on Gujarati phone photos is mediocre | Editable text with the crop shown beside it. Preprocessing (grayscale, upscale, contrast). If it isn't good enough, v1 can add a cloud OCR option |
| The PAT is stored in the browser's localStorage | Scope it to the single private data repo with Contents permission only, and let me revoke and reset it in Settings |
| Browser storage gets cleared | GitHub sync, plus manual export |
| Curved pages near the spine | Encourage a flat shot. Out of scope otherwise |

## 10. Future (v1+)

Service worker for full offline use · keep the image crop · highlight auto-detection · AI-assisted OCR correction · daily quote email or widget · share a quote as an image card · Kindle import.
