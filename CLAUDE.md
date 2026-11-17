# Commonplace: maintainer handbook

A one-person commonplace book. Photograph a book page, run a finger over a passage, save it as clean text. English and Gujarati. Static PWA (Vite + React + TypeScript) on GitHub Pages; no server of our own. `README.md` covers setup, `PRD.md` the product spec. This file is the judgment that isn't in either.

## What decides trade-offs

1. **Document, don't interrupt.** Capture must stay under ~10 seconds: camera, finger, Save. Never add a required step, a confirmation, or a screen before the camera. Book, page, tags and note are optional and autosave.
2. **Forgiving input.** A gesture is a hint, not a selection. Fix sloppy input in `src/selection.ts`; never ask the user to be more precise.
3. **Text worth keeping.** Saved text should read as if copied by hand. A flagged doubtful word (wavy underline) beats a word that silently vanishes or is silently "corrected". No AI model rewrites the text (PRD non-goal).
4. **Always fall back, never block.** Every capture step has a cheaper path behind it (see Capture below). A failure in an optional step must not surface as an error.
5. **Private by default.** Only text is kept; photos are never stored or synced. The one place a photo leaves the phone is Chandra (Gujarati pages only).
6. **Feel is a feature.** The owner spends as many commits on motion as on function. A change that makes a screen stutter on an iPhone is a regression even if it is correct.
7. **One user, one phone.** No accounts, no settings for hypothetical users, no abstraction for a second backend.

## Architecture map

Hash routes in `src/App.tsx` (`#/`, `#/capture`, `#/quote/<id>`, `#/book/<id>`, `#/books`, `#/new`, `#/ocean`, `#/settings`, `#/lab`). Capture, Ocean and the sea lab are split out of the startup bundle with `preloadable()` in `src/lazy.ts`.

**Capture** (`src/Capture.tsx` orchestrates; `src/PageSelect.tsx` is the photo, gestures, zoom, highlighter; `src/ScanVeil.tsx` and `src/liftOff.ts` are the gold animations)

- Photo arrives through `CaptureButton` (`src/components.tsx`) → `src/pending.ts` → `#/capture?t=…`.
- `readPage()` in `src/ocr.ts` returns `OcrWord[]`: text, confidence, box in **original photo pixels**, `line` and `para` indexes, in reading order.
  - English: Tesseract on a preprocessed (lighting-flattened, contrast-stretched, ≤2000px wide) copy.
  - Gujarati: Chandra first (`src/chandra.ts` → `worker/chandra-proxy.js` → Datalab). On any failure, Tesseract reads the page as photographed and again flattened (`src/flatten.ts`: skew, then line curvature); `preferFlat()` keeps the flattened read only if clearly more confident.
- Language detection in `Capture.read()`: read with the last-used language; re-read with the other if mean confidence < `WRONG_LANGUAGE` (70) or a Gujarati read `readsAsEnglish()`.
- Gesture → range: `selectRange()` in `src/selection.ts` (loop vs swipe, then `trimStrayParagraphs` → `snapToSentences` → `trimHeading`). Taps use `wordAt` / `sentenceAt` / `extendTo`.
- Save: English selections are re-read at full sharpness (`rereadSelection`), used only if `sharperRead()` agrees. `formatSelection()` in `src/format.ts` joins lines, re-joins hyphenated words, drops junk, adds `…` for mid-sentence starts and ends, runs `tidy()`, and lists uncertain words. If no words were found, `readRegion()` OCRs the marked box.
- `store.saveQuote()` writes at once; the filing sheet edits the saved quote afterwards. "File quote" plays the ceremony (`src/drop.ts`, WebGL sea in `src/glsea.ts`).

**Data** (`src/types.ts`)

- `src/db.ts`: IndexedDB `commonplace` v2 with stores `books`, `quotes`, `covers`. Covers are device-local blobs and never sync.
- `src/store.ts`: the `useStore()` hook is the only writer. Every mutation writes IndexedDB, updates state, then `scheduleSync()` (1.5s debounce).
- `src/sync.ts`: pull `quotes.json` from the private repo, `merge()` (union by id, newest `updatedAt` wins), push with the file's `sha`, retry on 409/422. `explainSyncError()` turns failures into advice.
- Import and backup: `src/importFile.ts` (`parseImportFile`, `planImport`), `src/goodreads.ts`, `toBackup()` in `src/util.ts`. Offline prep scripts in `scripts/`.

**Offline** (production builds only)

- `sw/sw.js` is a template. `offline()` in `vite.config.ts` fills in the precache list and a version hash and emits `dist/sw.js`.
- `src/offline.ts` registers it, then loads both Tesseract readers once so the worker caches engine and models from jsDelivr.

**Browsing and feel**: `src/library.tsx`, `src/screens.tsx`, `src/books.tsx`, `src/sea.tsx` (dot sea on the timeline), `src/ocean.tsx` (the dive), `src/sealife.ts`, `src/skytime.ts`, `src/icons.tsx` (dot-matrix glyphs), `src/motion.ts` (haptics, reveal, shared-element names), `src/progressive.ts` (scroll memory, batched lists).

**Dev only**: `bench.html` + `src/bench/` (OCR benchmark; its endpoints exist only under `npm run dev`).

## Invariants

| Must stay true | Where enforced | Where checked |
|---|---|---|
| A change made while a sync is running is kept and synced right after it | `settle()` in `src/sync.ts` (never writes a merged record over a newer local one) and the `again` ref in `runSync`, `src/store.ts` | `tests/sync.test.ts` covers `settle`; the hook wiring is by review |
| Merge is union by id, newest `updatedAt` wins; a no-op sync makes no commit; output order is stable | `merge`, `sync` in `src/sync.ts` | `tests/sync.test.ts` |
| Every mutation bumps `updatedAt` and calls `scheduleSync()` | each callback in `src/store.ts` | by review |
| Deletes are tombstones (`deleted: true`). Only sample records are ever hard-deleted | `deleteQuote`, `removeSamples` in `src/store.ts` | `tests/sync.test.ts` (tombstone wins) |
| Sample data (`sample-` ids) never syncs, never counts as a duplicate or as unsynced | `isSample` filters in `src/store.ts` | by review |
| Import is idempotent: ids are `import-<hash of quoteKey(text)>`, so re-importing adds nothing and deleted quotes stay deleted | `planImport` in `src/importFile.ts` | `tests/import.test.ts`, `tests/backup.test.ts` |
| A backup restores to the same library | `toBackup` + `planImport` | `tests/backup.test.ts` |
| `OcrWord` boxes are in original photo pixels, whatever scaling, flattening or engine produced them | `readWords`, `flattenPhoto` in `src/ocr.ts`; `mapWords`; `wordsFromChandra` | `tests/flatten.test.ts`, `tests/chandra.test.ts` |
| Any Chandra failure lands on Tesseract; any flattening failure lands on the plain read | `readPage` in `src/ocr.ts` | by review; `chandra` tests cover "untrustworthy page → empty" |
| Everything the build emits is precached, and the Tesseract worker script is same-origin | `offline()` in `vite.config.ts`; `workerPath` import in `src/ocr.ts` | manual, see the `keep-asset-offline` skill |
| Reduce Motion is honoured by every animation | CSS block near the end of `src/styles.css`; `reducedMotion()` guard in each canvas animation | manual |
| Logic modules run in plain Node | see Tests | `npm test` |

## Commands

```sh
npm run dev        # Vite on the LAN; open the Network URL on the phone. No service worker in dev.
npm test           # every tests/*.test.ts, in sequence
npm run build      # tsc -b, then vite build into dist/ (also emits dist/sw.js)
npm run preview    # serve dist/ on the LAN. The only way to exercise the service worker locally.
npm run bench:add -- --lang guj photo.jpg
npm run bench:compare [-- tesseract | A.json B.json]
```

- `.claude/launch.json` has `commonplace` (dev, 5173) and `commonplace-build` (preview, 4173).
- Pushing `main` deploys (`.github/workflows/deploy.yml`). CI runs `npm ci && npm run build` only. **Tests do not run in CI**: run `npm test` and `npm run build` before every commit.
- `tsc -b` checks `src/` and `vite.config.ts` only. `tests/` and `scripts/` are never type-checked; they are only executed.

### OCR benchmark (`bench/README.md`)

- Run it before and after any change to what `readPage()` returns: `src/ocr.ts` (preprocessing, Tesseract parameters, model, page width), `src/flatten.ts`, `src/chandra.ts`, a Tesseract upgrade, and `detectPageNumber`.
- It scores `readPage()` output and page-number detection. It does **not** exercise gestures, `rereadSelection`, or `formatSelection`. Those are covered by `tests/selection.test.ts`, `tests/capture.test.ts` and `tests/tapSelect.test.ts`.
- `npm run dev`, open `/bench.html`, pick an engine, run. Then `npm run bench:compare`. Engines: `tesseract` (free), `chandra` (saved reads, free after the first), `app` (live Chandra for Gujarati, spends Datalab credit).
- Never open, print, or commit `bench/pages/`, `bench/results/` or `import-work/`: photos and text of copyrighted books and personal data. All three are git-ignored.

## Conventions

**Tests**

- One file per module: `tests/<name>.test.ts`, plain `node:assert`, top-level statements, a final `console.log('<name> tests passed')`. Run directly: `node tests/sync.test.ts` (Node strips the types; CI uses Node 24).
- A new test file must be appended to the `test` script chain in `package.json` or it never runs.
- Tests import with the extension: `'../src/format.ts'`.
- For a module to be testable it must run in Node: no DOM at module top level, no JSX, no `?url` imports, no enums or constructor parameter properties (type-stripping only). Its imports from sibling modules must be `import type` (extensionless is fine) or a value import **with `.ts`** (see `src/goodreads.ts` importing `./isbn.ts`). JSON needs `with { type: 'json' }` (`src/baps.ts`).
- Keep math and parsing in DOM-free modules (`flatten.ts`, `selection.ts`, `format.ts`, `shareCard.ts`) and the canvas/DOM glue elsewhere (`ocr.ts`). That split is why they are testable.
- Fix a capture bug by first adding the failing case. `tests/fixtures/*-words.json` are real OCR output; `tests/selection.test.ts` draws wobbly strokes over them.

**Commits**

- Title: the outcome for the user as a plain sentence, no prefix, no full stop. "Sync failures say what to do, retry by themselves, and never drop a save". Not "fix: sync retry".
- Body: a short paragraph or `-` bullets, each a thing the user will notice or the reason for a choice. Include measured numbers when the point is speed or accuracy ("411 KB to 336 KB", "93% of words vs 90%").
- One commit per finished feature, straight to `main`. Update `README.md` / `PRD.md` in the same commit when behaviour they describe changes.
- `tsconfig.tsbuildinfo` is tracked and changes on every build; it rides along in commits.

**Code**

- No linter or formatter is configured. Match the file: 2 spaces, single quotes, no semicolons, long lines are fine, small helpers over classes.
- Comments explain why, in plain words, as `/** … */` above the thing. Record the evidence when a constant came from measurement ("the right model scores about 90, the wrong one about 35"). Section banners are `/* ───── Name ───── */`.
- Names are everyday words for the user's idea: `readPage`, `sharperRead`, `preferFlat`, `fileIntoSea`, `tidy`. Not `processOcrResult`.
- localStorage keys are `commonplace.<thing>` (`commonplace-offline-ready` is the one exception; leave it).
- Dependencies: four runtime packages. Adding one needs a reason that hand-written code can't meet; anything loaded at runtime must be bundled or served same-origin so it works offline (`src/scan.ts` does this for the ZXing wasm). Python scripts use the standard library (`make-icon.py` alone needs Pillow).

**Copy**

- Sentence case, second person, no jargon, no blame. Say what to do next: "The token can't write to me/repo. Give it Contents: Read and write."
- Being offline is a state, not an error ("Offline — syncs when you're back online").
- Use `…` (one character), and name things by what the user sees: "readers" not "models", "Filing…" not "Saving…".
- Status phrases during a read are gentle and short ("Finding the lines…", "Gathering the ink…").

**Gujarati**

- Normalise to NFC wherever text is compared, stored or searched: `tidy()`, `search()`'s `norm`, `quoteKey`, `transliterate`, bench `normalize`. Zero-width joiners are stripped for comparison.
- Sentence ends include the danda `।`. Page numbers in Gujarati digits are converted to Western ones (`detectPageNumber`).
- Gujarati text gets the `.gu` class from `isGujarati()` (larger line height, no letter-spacing). Words are never hyphenated at line breaks, in either script.
- Tesseract is unsure of real Gujarati words, so low-confidence Gujarati is kept and flagged, not dropped (`isJunk` in `src/format.ts`).
- The sharper second read is skipped for Gujarati: it scored higher confidence while adding mistakes (`Capture.save`).
- Chandra's confidence scores don't track its mistakes, so they are replaced with 100 and drive nothing.
- The Gujarati model reads English confidently, so confidence alone can't detect an English page; `readsAsEnglish()` checks the script.
- Transliteration is the BAPS scheme (`src/transliterate.ts`, cases in `tests/transliterate.test.ts`). It is display only, never stored. Add a failing word to the test before touching the rules.
- CSV export starts with a BOM so Excel reads Gujarati.

## Feel and design rules

- **Palette** (`:root` in `src/styles.css`): white pages `--bg`, cream surfaces `--cream`, near-black `--ink` buttons, `--gold` `#b58a35` accents. Capture and the ceremony are the only dark screens.
- **Two golds.** On light backgrounds use `--gold` (181, 138, 53). On dark (capture, scanning) use the luminous gold `240, 200, 105`; the ceremony uses `232, 194, 122`. Deep gold on dark looks muddy, bright gold on white disappears.
- **Glass is for controls only** (`.glass`): tab bar, floating buttons, sheets' chrome. Never put content on glass.
- **Type**: `--sans` for quotes and UI, `--serif` for book titles, `--mono` uppercase with wide tracking for labels (`.label`).
- **Dot matrix**: icons are text grids in `src/icons.tsx` (`#` is a dot); add an icon by adding a glyph, never an SVG file or icon package. Canvas scenes draw round dots on a regular lattice (13–14 CSS px in the seas) and vary size and opacity, not shape.
- **One easing**: `--spring` `cubic-bezier(0.32, 0.72, 0, 1)`. Durations in use: press feedback 0.3–0.35s, page push/pop 0.42s, shared-element morph 0.55s, entrances 0.45–0.7s, quick fades 0.2–0.25s. Staggers are small: 16ms per icon dot, 24ms per word.
- **Animate transform and opacity only.** Shadows are painted once and moved; per-frame `filter: blur` on text is desktop only (`softFocus` in `src/ocean.tsx`). Both rules came from measured stutter on iPhone.
- **Canvas animations**: cap `devicePixelRatio` (2 for full-screen scenes, 3 for overlays), clamp frame `dt`, cancel the frame loop on cleanup, pause when off screen (`src/sea.tsx`), and return early under `reducedMotion()`.
- **Long animations never trap the user**: a tap skips the ceremony; scanning accepts a highlight before the read finishes.
- **Haptics** through `haptic('tick' | 'tap' | 'success')` in `src/motion.ts`, at moments of snapping or completion only.
- **Lists must open instantly**: off-screen cards skip their entrance (`useReveal`), long lists draw in idle batches (`useProgressive`), and going back restores the card you were on.
- Recordings of the big animations live in `docs/animations/`.

## Pitfalls

- **Service worker version covers bundled files only.** `offline()` hashes Rollup output, not `public/`. A change to an icon or the manifest alone ships a byte-identical `sw.js`, so installed phones keep the old file until some bundled file also changes.
- **New files in `public/` are not precached** unless added to `publicFiles` in `vite.config.ts`.
- **A new third-party runtime host is not cached** unless its prefix is added to `CACHE_FIRST` or `REFRESH` in `sw/sw.js`. Today: jsDelivr (Tesseract engine and models) and Google Fonts.
- **Upgrading `tesseract.js` or changing a model URL**: the engine cache (`commonplace-runtime`) is unversioned on purpose, and `readersSaved()` in `src/offline.ts` only looks for any URL containing `tesseract-core`. An old engine in the cache makes Settings say "ready" while the new one has never been downloaded. Change `READY_KEY` (or the check) in the same commit, and re-run the benchmark.
- **Do not remove `workerPath` / `workerBlobURL: false`** in `src/ocr.ts`. A blob worker's fetches bypass the service worker and offline capture breaks.
- **Chandra only answers known origins.** `ALLOWED_ORIGIN` in `worker/chandra-proxy.js` is the live site and dev on port 5173. Under `npm run preview` (4173) Gujarati silently falls back to Tesseract, so it looks like "Chandra got worse". The Worker is deployed by hand (paste into Cloudflare); editing the file changes nothing until then.
- **Thresholds are tuned against real pages**: `WRONG_LANGUAGE` 70, uncertain < 70, `preferFlat` (+2 confidence, ≥90% of the words), `sharperRead` (0.75–1.3 word ratio), `PAGE_WIDTH` 2000, the `isJunk` cut-offs, `classify`'s `lh * 1.1`. Don't "tidy" them without the benchmark or the fixture tests.
- **`SENTENCE_END` exists twice** (`src/selection.ts`, `src/format.ts`) and they differ slightly (`॥`). Change both deliberately.
- **`quoteKey` and `hash` in `src/importFile.ts` are a storage format.** Changing either gives every imported quote a new id: duplicates appear and deleted quotes come back.
- **`quotes.json` is shared with older builds on other devices.** New fields must be optional and old files must still load (`version: 1`). `serialize()` output order and spacing keep the data repo's diffs small; don't reorder.
- **View-transition names must be unique on the page** or the browser skips the whole transition. Names are set on the tapped element only and cleared after (`src/motion.ts`, `src/ocean.tsx`).
- **`React.lazy` is deliberately not used.** `preloadable()` renders at once when the code has arrived; `lazy` would flash a blank frame mid-transition.
- **Keep scroll state out of the app root.** `TabBar` owns it so scrolling never re-renders the list behind (`src/App.tsx`).
- **Never measure layout while a list mounts** (`getBoundingClientRect` per card forced a full layout each). Use the shared `IntersectionObserver` in `src/motion.ts`.
- **`crypto.randomUUID` is missing on the LAN dev server** (plain http). Use `newId()` from `src/db.ts`.
- **`Lang` includes `'eng+guj'`** for old data; the UI offers only `eng` and `guj`, and `prepareOffline` caches only those two.
- **Capture reads are keyed by run** (`readRun` in `Capture.tsx`): any new async step must check `live()` before setting state, or a retake shows the previous photo's words.

## Skills

Step-by-step procedures live in `.claude/skills/`: `change-capture-ocr`, `add-animation`, `add-import-source`, `keep-asset-offline`, `ship-release`.
