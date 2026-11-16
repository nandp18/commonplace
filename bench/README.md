# OCR benchmark

Real page photos with the text that's actually printed on them, plus a page that scores any OCR engine against that text. Use it before and after every change to capture: a Tesseract upgrade, new preprocessing, a different flattening step, or replacing Chandra. It gives you a number instead of an impression.

Nothing here calls an AI model. It keeps working with whatever engine the app uses.

## What's where

| Path | What | In git? |
|---|---|---|
| `bench/pages/<id>.jpg` | A page photo | No (photos of copyrighted books) |
| `bench/pages/<id>.json` | Its answer key (see `Truth` in `src/bench/score.ts`) | No |
| `bench/pages/<id>.chandra.json` | Chandra's read of the page, made the first time it's needed and kept, so Chandra credit is spent once per page | No |
| `bench/results/*.json` | One file per run: every page's score and read, the commit, and whether `src/` had uncommitted changes | No |
| `src/bench/` | Scoring, the bench page, and its dev-server endpoints | Yes |

`bench/pages` is the only copy of the answer keys. Back it up, for example to the private `commonplace-data` repo.

## Use it

```sh
npm run dev
```

Open `/bench.html`.

- **Review answer keys.** A page without a key starts from Chandra's read (or Tesseract's if Chandra has none). Correct it against the photo, tick "Every line checked", and press Save & next. The panel underneath shows where your key and the *other* engine disagree, which is where leftover mistakes tend to be. Only verified pages count toward the headline numbers.
- **Run.** Pick an engine and run. Each run is saved to `bench/results`.

Compare the last two runs of an engine:

```sh
npm run bench:compare
npm run bench:compare -- tesseract
npm run bench:compare -- <run A>.json <run B>.json
```

## Add pages

The pages that teach you the most are the ones capture got wrong. When a capture misreads badly, keep the photo and add it:

```sh
npm run bench:add -- --lang guj ~/Desktop/bad-page.jpg
```

## What the numbers mean

- **CER** (character error rate): the edits needed to turn the read into the printed text, per printed character. 0% is perfect. Above 100% means the read added text that isn't on the page.
- **Words wrong**: the same measure on words, ignoring case and punctuation at word ends.
- **Page numbers**: the share of pages where `detectPageNumber` found the printed number, or correctly found none.
- Before scoring, curly and straight quotes, dash styles, zero-width joiners, Unicode forms and spacing are all treated as the same. Line breaks don't count. Reading order does: a read that jumbles two columns scores badly, just as it would in the app.

Rates are pooled by size, so a long page counts more than a caption.

## Rules for answer keys

- Type every line printed on the page, top to bottom, exactly as printed. Include running heads, page numbers and footnotes. Keep end-of-line hyphens as printed.
- Leave out lines the photo cuts off or that a finger or shadow hides, and say so in Notes.
- For a two-page spread, type the left page, then the right.
- A key is drafted from one engine's read (`draftFrom`). Any mistake that survives review makes that engine look better than it is, so check the comparison panel before you verify.
