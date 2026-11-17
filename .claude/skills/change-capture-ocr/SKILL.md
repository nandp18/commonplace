---
name: change-capture-ocr
description: Use for any change to how a page photo becomes saved text - OCR engine or model, Tesseract upgrade or parameters, image preprocessing, page flattening, Chandra parsing, language detection, gesture selection, sentence snapping, or text cleanup (src/ocr.ts, flatten.ts, chandra.ts, selection.ts, format.ts, Capture.tsx). Also use when a capture misread is reported.
---

# Change capture or OCR safely

Capture quality is judged by numbers and fixtures, never by trying one photo. Thresholds in this pipeline were tuned on real pages.

## 1. Find which stage you are in

| Symptom or change | File | Checked by |
|---|---|---|
| Wrong or missing words on the whole page; preprocessing; model; Tesseract version | `src/ocr.ts` (`preprocess`, `readWords`, `readPage`) | benchmark |
| Tilted or curved Gujarati pages | `src/flatten.ts`, `flattenPhoto` in `src/ocr.ts` | `tests/flatten.test.ts` + benchmark |
| Chandra words in the wrong place, split, or missing | `src/chandra.ts` (`wordsFromChandra`) | `tests/chandra.test.ts` + benchmark (`chandra` engine) |
| Wrong language picked | `read()` in `src/Capture.tsx`, `readQuality` / `WRONG_LANGUAGE` in `src/ocr.ts`, `readsAsEnglish` in `src/format.ts` | `tests/flatten.test.ts` (has the `readsAsEnglish` cases), then by hand |
| Gesture selects the wrong words | `src/selection.ts` | `tests/selection.test.ts`, `tests/tapSelect.test.ts` |
| Heading, stray paragraph, or sentence edge wrong | `trimHeading`, `trimStrayParagraphs`, `snapToSentences` | `tests/capture.test.ts`, `tests/selection.test.ts` |
| Saved text has bad joins, hyphens, punctuation, ellipses, junk | `formatSelection`, `tidy`, `isJunk` in `src/format.ts` | `tests/capture.test.ts`, `tests/selection.test.ts` |
| Page number wrong | `detectPageNumber` in `src/selection.ts` | `tests/selection.test.ts` + benchmark |
| Sharper second read | `rereadSelection` in `src/ocr.ts`, `sharperRead` in `src/format.ts` | `tests/capture.test.ts` covers `sharperRead` only; `rereadSelection` has no automated check |

The benchmark scores `readPage()` output and page numbers. It does not run gestures or `formatSelection`.

## 2. Baseline first (page-read changes)

Skip to step 3 for pure selection or formatting changes.

1. `git status` must be clean for `src/`, so the run is stamped with a real commit.
2. `npm run dev`, open `http://localhost:5173/bench.html`. Port 5173 matters: the Chandra Worker rejects other origins.
3. Run the engine your change affects: `tesseract` for anything on-device, `chandra` for `wordsFromChandra` (uses saved reads, free). Use `app` only when the Chandra/Tesseract hand-off itself changed; it spends Datalab credit on every Gujarati page.
4. If `bench/pages` is empty or missing on this machine, say so and ask the owner; the photos and keys are not in git. Do not open files in `bench/pages`, `bench/results` or `import-work`.

## 3. Add the failing case before the fix

- Selection and formatting: add a case to the matching test. Build words with the `page()` helper in `tests/capture.test.ts`, or draw a stroke over the real fixtures in `tests/selection.test.ts`.
- Chandra parsing: add spans with the `span()` / `pageOf()` helpers in `tests/chandra.test.ts`.
- A page that reads badly: `npm run bench:add -- --lang guj|eng photo.jpg`, then the owner checks the answer key on the Review tab. Only verified pages count.

Run the single file while working: `node tests/capture.test.ts`.

## 4. Make the change

Rules that keep the pipeline sound:

- `OcrWord` boxes stay in original photo pixels. Anything that reads a scaled, cropped or warped canvas must map back (`/ scale`, `mapWords`, `box.x +`).
- Words stay in reading order with correct `line` and `para`; selection, sentence snapping and formatting all depend on them.
- Every optional step keeps its fallback: Chandra → Tesseract; flattened → plain; re-read → page read; no words → `readRegion`. Wrap new optional work the same way.
- A new async step in `Capture.read()` must check `live()` before setting state.
- Keep math in DOM-free modules so it can be tested in Node; keep canvas work in `src/ocr.ts`.
- Do not drop low-confidence Gujarati words, do not re-enable the second read for Gujarati, and do not use Chandra's confidence for anything. Each was tried and measured; see the comments at `isJunk`, `Capture.save`, and `wordsFromChandra`.
- When a constant changes because of a measurement, put the numbers in its comment.
- `SENTENCE_END` is defined in both `src/selection.ts` and `src/format.ts`.

Tesseract upgrade or model URL change, additionally:

- Change `READY_KEY` in `src/offline.ts` so phones fetch the new engine before reporting "ready".
- Keep `workerPath` and `workerBlobURL: false` in `spawn()`.
- Confirm engine and model URLs still start with a prefix in `CACHE_FIRST` in `sw/sw.js`, then follow the `keep-asset-offline` skill.

Worker change (`worker/chandra-proxy.js`): `tests/chandra.test.ts` imports it. It is deployed by pasting into Cloudflare by the owner; say so in your report.

## 5. Verify

1. `npm test` passes.
2. `npm run build` passes (this is the type check).
3. Page-read changes: run the same benchmark engine again, then `npm run bench:compare` (or `-- tesseract`). Report CER and words-wrong before and after for English and Gujarati. A gain in one language that costs the other is not a win; report both and let the owner decide.
4. Try one real capture on the dev server in each language if you can drive a browser: photo → highlight → Save, and confirm the highlight lines up with the words.

## 6. Commit message

Say what reads better and by how much, as the user would notice it:

```
Read tilted and curved Gujarati pages more accurately

Read Gujarati pages both as photographed and flattened, keeping the
flattened read only when it is clearly more confident. ...
```

Update `README.md` and the OCR row of the table in `PRD.md` if the engine, model, or fallback order changed.
