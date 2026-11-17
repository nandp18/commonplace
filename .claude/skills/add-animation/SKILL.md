---
name: add-animation
description: Use when adding or changing motion, a transition, a canvas or WebGL effect, a dot-matrix icon, haptics, or any visual flourish (scanning gold, highlighter, lift-off, filing ceremony, the sea, the ocean, list entrances, page transitions). Also use when asked to make something "feel" better or when an animation stutters.
---

# Add or change an animation in the house style

The look is warm editorial paper with dot-matrix drawing and gold light. Motion should feel like iOS: springy, short, interruptible. Smoothness on an iPhone outranks richness.

## 1. Pick the mechanism

| Need | Use | Example to copy |
|---|---|---|
| Entrance, press, state change of a DOM element | CSS transition or keyframes in `src/styles.css` | `rise`, `.reveal`, `word-in` |
| One screen turning into another | View Transitions, driven by `data-nav` in `useRoute` (`src/App.tsx`) | `vt-*` keyframes; `markTransition` / `morphName` in `src/motion.ts` |
| An icon appearing or changing | `<Icon name="…" animate />` | `src/icons.tsx` |
| Particles, light, dots over a photo or the whole screen | 2D canvas with a `requestAnimationFrame` loop | `src/ScanVeil.tsx` (React-owned), `src/liftOff.ts` (imperative, returns `{ burst, cancel }`) |
| A 3D-looking sea | the shared shader | `createSea` in `src/glsea.ts`; try ideas at `#/lab` (`src/sealab.tsx`) |
| A scripted multi-beat sequence | async function with a skippable `wait()` | `fileIntoSea` in `src/drop.ts` |

Prefer the first row that works. Do not add an animation library.

## 2. Style rules

- **Easing**: `var(--spring)` (`cubic-bezier(0.32, 0.72, 0, 1)`) for movement; plain `ease` only for opacity fades. In canvas code write small `easeOut` / `easeInOut` helpers like the existing files.
- **Durations**: press 0.3–0.35s; push/pop 0.42s; morph 0.55s; entrances 0.45–0.7s; fades 0.2–0.25s. Staggers 16ms per dot, 24ms per word. A sequence the user must wait through needs a reason and a skip.
- **Colour**: on light backgrounds `--gold` / `181, 138, 53` and `--ink` / `30, 35, 29`. On dark (capture, scan) luminous gold `240, 200, 105`; ceremony gold `232, 194, 122` with cream `245, 228, 190`. Never deep gold on dark.
- **Dots**: round dots on a regular lattice; change size and opacity, not shape. New icons are text grids in `glyphs` in `src/icons.tsx` (`#` = dot, about 7×7 to 9×7), never image files.
- **Glass** is for controls only.
- **Light on dark photos**: the scan layer uses `mix-blend-mode: screen` and a small blurred copy for bloom (`ScanVeil`), not per-dot shadows.
- **Haptics**: `haptic('tick')` for snaps, `'tap'` for a moment landing, `'success'` for completion. Not on every frame; `tick` is already rate-limited.

## 3. Performance rules (each came from a measured stutter)

- Animate `transform` and `opacity` only. Never animate `box-shadow`, layout properties, or `filter: blur` on text on phones. Paint a shadow once and move it.
- Canvas: cap `devicePixelRatio` (2 for full-screen scenes, 3 for overlays), clamp `dt` (`Math.min(0.05, …)`), allocate typed arrays once outside the frame, and `cancelAnimationFrame` in cleanup.
- Pause loops that are off screen (`IntersectionObserver` in `src/sea.tsx`).
- Never read layout (`getBoundingClientRect`, `offsetHeight`) per item while a list mounts. Use `useReveal` from `src/motion.ts`.
- Keep per-frame state in refs or closures, not React state. A scroll or frame handler must not re-render a list.
- View-transition names must be unique on the page: set the name on the one tapped element and clear it afterwards.
- Heavy screens stay out of the startup bundle: load through `preloadable()` in `src/lazy.ts`, not `React.lazy`.

## 4. Required behaviour

- **Reduce Motion**: CSS animations are neutralised globally at the end of `src/styles.css`. Every JS-driven animation must check `reducedMotion()` and either return early or jump to the end state. The feature must still work with it on.
- **Interruptible**: unmount, retake, navigation, and a failed save must leave nothing on screen. Return a `cancel` or clean up in the effect.
- **Never blocks the task**: the save, the read, and navigation proceed whether or not the animation finishes. In `Capture.save` the lift-off is cancelled in `finally` when it did not hand over to the burst.
- **Timing follows the real work**, not a fixed timer, when it represents progress (the scan loops until words arrive; the lift hovers until the save resolves).

## 5. Verify

1. `npm run build` (type check) and `npm test`.
2. Run `npm run dev` and watch it at phone width. Check: first run, a second run right after, interrupting halfway, and going back.
3. Turn on Reduce Motion (browser devtools rendering emulation, or the phone setting) and confirm the flow still completes.
4. For anything on a list or page transition, record a performance profile in the built app (`npm run build && npm run preview`), not dev. Report main-thread time before and after if speed was the point.
5. The owner judges feel on a real iPhone. Say plainly what you could not check there.

## 6. Commit message

Describe what the user sees, sensorially, one bullet per beat:

```
Scanning feels like magic: twinkling gold ink, rising gold dust, words that gather

- Found ink flashes white as the beam finds it, then twinkles gold ...
```

For a large new sequence, the owner keeps a recording in `docs/animations/`; offer, don't generate one unasked. Update the "Motion & feedback" section of `PRD.md` if a described behaviour changed.
