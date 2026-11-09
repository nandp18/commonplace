# Commonplace — PRD (v0)

## 1. Problem

I read books in English and Gujarati. When a line or paragraph stays with me, my options today are bad:

- **Highlighting in the book.** The quote stays trapped on the page. I can't search for it or find it again without flipping through.
- **Taking a photo with my phone.** The quote gets lost in my camera roll among thousands of other photos. It's not searchable, has no book or page attached, and contains the whole page instead of the line I cared about.

What I want is a **commonplace book**: one personal collection of quotes, searchable, organized by book, and easy to resurface.

## 2. Goal

Capturing a quote from a physical book should take **under 15 seconds**, in English or Gujarati:

> Open app → snap photo → circle the passage with my finger → check the text → save.

## 3. Users

One user: me. I use it mainly on my phone while reading, and sometimes on my laptop to browse or export.

## 4. Core workflow (capture)

1. Tap **Capture**. The phone camera opens. I can also pick an existing photo from my camera roll, which covers older photos of highlighted pages.
2. The photo appears full-screen. I **draw a loop around the passage** with my finger. Pinching or redrawing replaces the loop.
3. I choose the language: **English / ગુજરાતી / Both**. The app remembers my last choice.
4. The app crops the photo to the circled region and runs OCR **on the device**. It shows progress while this runs.
5. The extracted text appears in an **editable text box**, since OCR will make mistakes, especially in Gujarati. The cropped image is shown above it so I can compare.
6. I attach:
   - **Book** (required): pick a recent or existing book, or add a new one (title + author).
   - **Page** (optional).
   - **Tags** (optional, comma-separated).
   - **Note** (optional): my own thoughts.
7. **Save.** The quote is stored on the device immediately and synced in the background.

Fallback: **Add manually**. I can type or paste a quote without a photo.

## 5. Retrieval

- **Home / Library.** Quote of the day at the top, then recent quotes.
- **Full-text search** across quote text, notes, tags, book titles, and authors, in both English and Gujarati, filtered live as I type.
- **Browse by book.** A list of books with quote counts. Tapping a book shows its quotes ordered by page.
- **Quote of the day.** Picked deterministically per date, so it stays the same all day, plus a **Shuffle** button.
- **Edit / delete** any quote.
- **Export** to Markdown (grouped by book) and CSV (UTF-8 with BOM so Gujarati opens correctly in Excel and Sheets).

## 6. Technical approach

| Concern | Decision | Why |
|---|---|---|
| Hosting | **GitHub Pages** (static) | Free, personal, no server to maintain |
| App type | Mobile-first web app, installable to the home screen (web manifest) | No app store needed, and the camera works via `<input capture>` |
| Framework | Vite + React + TypeScript | Small and fast to build with |
| OCR | **Tesseract.js** in the browser, `eng` + `guj` models | Free, private, and needs no server. Models (~2–10 MB) download once and are cached by the browser |
| Selection | Freehand lasso on a canvas. The app crops to the loop's bounding box plus padding, then grayscales and upscales the crop before OCR | Circling is the natural gesture. A bounding-box crop avoids cutting through words at the loop's edges |
| Local storage | **IndexedDB** | Works offline and saves instantly |
| Sync / backup | `quotes.json` in a **separate private GitHub repo**, read and written through the GitHub Contents API with a fine-grained personal access token (one repo, Contents: read/write) | Keeps quotes private while the app itself is public. Every sync is a commit, so I get version history for free, and the same data is available on my laptop |

### Data model

```ts
Book  { id, title, author, createdAt, updatedAt, deleted? }
Quote { id, bookId, text, page?, tags: string[], note?, lang: 'eng'|'guj'|'eng+guj',
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

- Automatically detecting highlighter marks on the page.
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
