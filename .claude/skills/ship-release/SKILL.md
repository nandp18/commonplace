---
name: ship-release
description: Use when asked to commit, ship, release, deploy, or push finished work, or to check that a change is ready to go live. Covers the pre-flight checks, the commit message style, and what happens on push to main.
---

# Ship a change

Pushing `main` is the release: `.github/workflows/deploy.yml` builds and publishes to GitHub Pages. CI does not run the tests. There is no staging site. Commit or push only when the owner asks.

## 1. Pre-flight

```sh
npm test
npm run build
```

Both must pass. `npm run build` is the only type check, and it covers `src/` and `vite.config.ts` only.

Then, by what changed:

| Changed | Also do |
|---|---|
| `src/ocr.ts`, `src/flatten.ts`, `src/chandra.ts`, Tesseract version, `detectPageNumber` | Benchmark before and after (`change-capture-ocr` skill) |
| `sw/sw.js`, `src/offline.ts`, `vite.config.ts`, `public/`, a new runtime URL or dependency | Offline check in the preview build (`keep-asset-offline` skill) |
| Motion, lists, transitions | Reduce Motion pass and a look in the preview build (`add-animation` skill) |
| `src/sync.ts`, `src/store.ts`, `src/types.ts`, `src/importFile.ts` | Old `quotes.json` and old backups still load; new fields optional; `tests/sync.test.ts`, `tests/backup.test.ts`, `tests/import.test.ts` extended |
| `worker/chandra-proxy.js` | Not deployed by push. Tell the owner to paste it into the Cloudflare Worker |
| A new test file | It is in the `test` chain in `package.json` |
| Behaviour described in `README.md` or `PRD.md` | Update them in the same commit |

## 2. Look at the built app

```sh
npm run preview
```

Open it at phone width (launch config `commonplace-build`, port 4173). Walk the path you changed plus the core loop: open → capture a photo → highlight → Save → File quote → the quote is in the Library. The dev server hides service-worker and bundle-splitting problems; the preview does not.

Bundle size: the startup chunk is `dist/assets/index-*.js`. Capture, the ocean and OCR must stay in their own chunks (`Capture-*`, `ocean-*`, `ocr-*`). If `index-*` grew noticeably, something heavy was imported from a startup module.

## 3. Check what is being committed

```sh
git status --short
git diff --stat
```

- Never stage `bench/pages/`, `bench/results/`, `import-work/`, `dist/` or `node_modules/` (all git-ignored; do not force-add).
- `tsconfig.tsbuildinfo` is tracked and changes with each build; include it.
- No tokens, API keys, or personal data. `CHANDRA_PROXY` in `src/chandra.ts` is a public address, not a secret.
- One feature per commit. Split unrelated work.

## 4. Commit message

- **Title**: what is now true for the person using the app, as a plain sentence. No `feat:`/`fix:` prefix, no trailing full stop. Several outcomes can be joined with commas.
  - Good: `Capture works offline: a service worker keeps the app and both OCR readers`
  - Good: `Quotes never split a word with a hyphen at a line break`
  - Bad: `Add service worker`, `fix: hyphens css`
- **Body** (skip for one-liners): a short paragraph, or `-` bullets wrapped near 72 columns. Each says what the user will notice or why a choice was made. Give numbers when the point is speed, size or accuracy.
- Mention how something was verified only when it is the substance ("worst settled contrast 13:1").
- End with the co-author trailer the session specifies.

## 5. Push and confirm

1. `git push origin main` (only when asked).
2. Watch the "Deploy to GitHub Pages" run: `gh run watch` or `gh run list --limit 1`.
3. The live site picks the build up on the next open: navigations go to the network first, and a changed bundle means a new service-worker version. An installed phone may need to be opened twice.
4. If the deploy is bad, revert the commit and push; there is no other rollback.
