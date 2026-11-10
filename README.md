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

## Better Gujarati OCR with Chandra (optional, one-time setup)

Gujarati pages can be read by [Datalab's Chandra](https://www.datalab.to/blog/chandra-2), going through a small Cloudflare Worker that keeps the API key off the phone. Both free tiers are enough for personal use, and no card is needed. If Chandra is unavailable or out of credit, capture falls back to Tesseract.

1. Create a Datalab API key, and turn data sharing off.
2. Create a Cloudflare Worker, paste in `worker/chandra-proxy.js`, and deploy it.
3. Add the Datalab key to the Worker as a secret named `DATALAB_API_KEY`.
4. Set `CHANDRA_PROXY` in `src/chandra.ts` to the Worker's address.

Page photos go to Datalab when this is on. The Worker asks Datalab to delete each result once it's been read.

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
| `src/chandra.ts` | Sends Gujarati pages to Chandra and turns the result into positioned words |
| `worker/chandra-proxy.js` | Cloudflare Worker between the app and Datalab |
| `src/flatten.ts` | Measures page tilt and curve, and maps word positions back to the photo |
| `src/store.ts` | App state, IndexedDB, background sync |
| `src/sync.ts` | GitHub Contents API sync with last-write-wins merge |
| `src/util.ts` | Search, quote of the day, Markdown/CSV export |
