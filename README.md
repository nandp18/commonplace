# Commonplace

A personal commonplace book: snap a photo of a page, circle the passage, and save it. Works in English and ગુજરાતી.

See [PRD.md](PRD.md) for the product spec.

- **Static site** for GitHub Pages (Vite + React + TypeScript)
- **OCR in the browser** with Tesseract.js (English and the Gujarati script model; Gujarati pages are also read flattened and the better read is kept). Models download once from jsDelivr and are cached
- **Storage** in IndexedDB, with optional sync to `quotes.json` in a private GitHub repo

## Develop

```sh
npm install
npm run dev        # serves on your LAN too; open the "Network" URL on your phone
npm run build
```

## Deploy (one-time setup)

1. Create a public repo on github.com (e.g. `commonplace`) and push this folder to `main`.
2. In the repo, go to **Settings → Pages → Source** and pick **GitHub Actions**.
3. The site goes live at `https://<you>.github.io/commonplace/`. On your phone, open it and use Share → **Add to Home Screen**.

## Sync (one-time setup)

1. Create a **private** repo, e.g. `commonplace-data`.
2. Create a fine-grained token limited to that repo, with **Contents: Read and write**.
3. In the app, open **Settings** and enter your username, the repo, and the token.

## Layout

| File | What |
|---|---|
| `src/Capture.tsx` | Capture flow: photo → lasso → OCR → review |
| `src/Lasso.tsx` | Freehand selection canvas |
| `src/ocr.ts` | Tesseract workers, image preprocessing, line reflow |
| `src/flatten.ts` | Measures page tilt and curve, and maps word positions back to the photo |
| `src/store.ts` | App state, IndexedDB, background sync |
| `src/sync.ts` | GitHub Contents API sync with last-write-wins merge |
| `src/util.ts` | Search, quote of the day, Markdown/CSV export |
