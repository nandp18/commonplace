---
name: add-import-source
description: Use when bringing quotes or books in from a new place (another app's export, a new CSV/JSON/Markdown/text format, a new Kindle or Notion variant), or when changing the import file format, backups, or how duplicates are detected (src/importFile.ts, src/goodreads.ts, scripts/highlights.ts, Settings → Import).
---

# Add an import source

Every source is converted to one shape, `ImportFile` (`src/importFile.ts`), and goes through one door, `planImport()`. A new source is a parser that produces an `ImportFile`. Do not write to the store or IndexedDB from a parser.

## 1. Choose where the parser lives

- **In the app** when the export is clean and the user would pick the file on the phone. Model: `src/goodreads.ts` (detect with a cheap header check, parse, return `ImportBook[]`).
- **A local script** when the source is messy and needs a human pass before import. Model: `scripts/prepare-import.ts` + `scripts/highlights.ts` write a review file; the owner edits it; Settings → Import reads it. Scripts run with `node scripts/x.ts`, or Python with the standard library only, and nothing leaves the machine.

Work files and real exports live in `import-work/`, which is git-ignored personal data. Do not open or commit anything there. Build fixtures by hand in the test.

## 2. Write the parser

- Pure function, text in, `ImportFile` (or `ImportBook[]`) out. No DOM, no fetch.
- For Node to run it in tests: import sibling modules with `import type`, or as values with the `.ts` extension (`import { toIsbn13 } from './isbn.ts'`).
- Quote text: run pasted or wrapped text through `tidy(reflow(text))` from `src/format.ts`, as `scripts/highlights.ts` does. Leave the user's words otherwise untouched.
- Dates: `2019`, `2019-03`, `2019-03-14`, or a full local timestamp. Put a book-level `date` when quotes have none.
- `lang`: set `'guj'` when `isGujarati(text)`; the default is `'eng'`.
- Books without quotes need `keepEmpty: true` to be created. A file meant only to add covers must not set it.
- `cover` must be an `https://` link. ISBNs go through `toIsbn13()`.
- Nothing vanishes silently: count or collect what you could not parse (see `unparsed` in `parseClippings`) and show it.
- Error messages are for the owner: "That isn’t a Goodreads library export."

## 3. Wire it in (in-app sources)

In `Settings` (`src/screens.tsx`):

1. Detect the format in `chooseImport`, before the `parseImportFile` fallback.
2. Call `preview(file, ' from <Source>')`. It shows what would be added and what is skipped; the user confirms; `store.applyImport(plan)` writes and schedules a sync.
3. Extend the file input's `accept` list if the extension is new, and the Import group's footer text.

Keep the preview-then-confirm step. Imports are never applied on file pick.

## 4. Do not break these

- `quoteKey()` and `hash()` define quote and book ids (`import-<hash>`). Changing them duplicates every earlier import and resurrects deleted quotes.
- Duplicates are skipped by id **and** by normalised text, including tombstoned ids, so a deleted quote stays deleted.
- Books match by ISBN first, then by normalised title.
- Details from a file only fill blanks; what was typed in the app wins.
- `parseImportFile` validates the whole file before anything is planned, so a typo can't leave an import half done. Add validation there for any new field.
- New `ImportBook` / `ImportQuote` fields must be optional, and `toBackup()` in `src/util.ts` must write them if they should survive a backup and restore. New `Book` / `Quote` fields must be optional too: `quotes.json` is shared with older builds.

## 5. Test

- Add `tests/<source>.test.ts` (model: `tests/goodreads.test.ts`) with a small hand-written sample covering: the normal row, quoted or multi-line fields, a missing optional column, non-ASCII and Gujarati text, and garbage.
- Append it to the `test` script in `package.json`.
- Assert through `planImport` that importing twice adds nothing.
- If the backup format changed, extend `tests/backup.test.ts` (round trip, and an old backup still imports).
- `npm test`, then `npm run build`.

## 6. Try it

`npm run dev` → Settings → Import. Pick your hand-made file, read the summary line, confirm, and check the Books tab and a quote page. Pick the same file again: it must say there is nothing new to add.

Update the Import footer copy, and `PRD.md` §7 if the source was listed as a non-goal.
