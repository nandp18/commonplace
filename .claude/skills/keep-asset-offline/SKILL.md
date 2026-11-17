---
name: keep-asset-offline
description: Use when adding or changing anything the app loads at runtime - a file in public/, a font, a wasm or worker file, an OCR model or engine version, a CDN URL, a new lazily loaded screen - or when touching sw/sw.js, src/offline.ts, or the offline() plugin in vite.config.ts. Also use when "works online but not offline" is reported.
---

# Keep an asset available offline

Capture must work with no signal. The service worker only exists in production builds, so nothing here can be checked with `npm run dev`.

## How it works

- `offline()` in `vite.config.ts` runs at build time. It lists every file Rollup emits (minus `.map` and `index.html`), adds the hard-coded `publicFiles`, and writes that list and a version hash into `sw/sw.js` → `dist/sw.js`.
- `sw/sw.js` at runtime:
  - page navigations: network with a 4s timeout, else the saved `./`;
  - same-origin files: cache first (they are content-hashed);
  - `CACHE_FIRST` prefixes (jsDelivr, gstatic fonts): cache first, saved on first use into the unversioned `commonplace-runtime` cache;
  - `REFRESH` prefixes (Google Fonts CSS): saved copy now, refresh in the background;
  - everything else (GitHub sync, Chandra, book lookups, covers) goes to the network untouched.
- `src/offline.ts` registers the worker, then once it controls the page loads the English and Gujarati readers (`prepareOffline` in `src/ocr.ts`) so their engine and models pass through the worker and are saved. Settings → Offline shows the state.

## Which case are you in?

**A. A file imported from code** (JS, CSS, wasm, image, JSON, a `?url` import)
Nothing to do: it is in the bundle, so it is precached. Prefer this for anything new. For a package that fetches its own wasm or worker from a CDN, import the file with `?url` and point the package at it (see `src/scan.ts` and `workerPath` in `src/ocr.ts`).

**B. A new file in `public/`**
Add its name to `publicFiles` in `vite.config.ts`. Know that the version hash does not cover `public/`: if only that file changes later, `sw.js` is byte-identical and installed phones keep the old copy. Give a changed file a new name, or ship it with a bundled change.

**C. A new third-party host loaded at runtime**
Avoid it if the file can be bundled. Otherwise add the URL prefix to `CACHE_FIRST` (pinned, immutable URLs only) or `REFRESH` (may change) in `sw/sw.js`. If it must be present before first offline use, load it once from `prepare()` in `src/offline.ts`. API calls that need a connection anyway stay off both lists.

**D. A new OCR engine version, model, or language**
- URLs must be pinned (a version in the path) to sit under `CACHE_FIRST`.
- Add the language to the loop in `prepareOffline()` if it should work offline.
- Change `READY_KEY` in `src/offline.ts`. `readersSaved()` only checks that some `tesseract-core` URL is cached, so without a new key, phones that prepared the old engine report "ready" without the new one.
- Old engines stay in `commonplace-runtime` forever; if size matters, delete stale entries in the worker's `activate`.
- Then follow the `change-capture-ocr` skill for accuracy.

**E. A new lazily loaded screen**
Use `preloadable()` from `src/lazy.ts`. Its chunk is precached automatically. Offline, a chunk that was never fetched still loads from the precache.

## Do not

- Do not register the worker in dev or remove the `import.meta.env.PROD` guard.
- Do not switch Tesseract back to a blob worker or a CDN worker path.
- Do not cache GitHub API or Chandra responses.
- Do not rename the `commonplace-shell-` prefix or `commonplace-runtime`; `activate` and `readersSaved()` match on them.
- Do not drop `ignoreVary` / `ignoreSearch` on cache matches; module scripts and `?v=` icon links rely on them.

## Verify

1. `npm run build`.
2. Check the list: `grep -o '"\./[^"]*"' dist/sw.js` must include your file.
3. `npm run preview` and open the app (launch config `commonplace-build`, port 4173). In devtools → Application: the service worker is activated, cache `commonplace-shell-<version>` holds your file, and after a short wait `commonplace-runtime` holds the Tesseract core and both language models. Settings → Offline reads ready.
4. Set the network to offline, reload, and do a full English capture from a photo. Gujarati under preview uses Tesseract anyway, because the Chandra Worker only accepts the live site and port 5173.
5. Update check: change something bundled, rebuild, reload twice online; the old `commonplace-shell-*` cache is gone and the new file is served.

If you cannot drive a browser, do steps 1–2 and say that 3–5 were not run.
