import type { OcrWord } from './selection'

/**
 * Straighten a photographed page before OCR: measure the tilt, then how far each stretch of
 * each text line bows away from straight. Tesseract finds lines first and reads them second,
 * so a tilted or curved page loses whole lines before any letter is read.
 * The math lives here, free of the DOM, so it can be unit-tested.
 */

export interface Ink {
  w: number
  h: number
  /** 1 where there's dark text, row by row. */
  data: Uint8Array
}

export interface Warp {
  /** Vertical shift in ink pixels: field[zone][strip]. */
  field: Float32Array[]
  /** Ink pixels per pixel of the canvas being flattened. */
  scale: number
  stripW: number
  zoneH: number
}

const STRIPS = 28
const ZONES = 7
/** Furthest a line can drift between neighbouring strips, in ink pixels (about a quarter of a line). */
const MAX_STEP = 9

export function inkFrom(rgba: Uint8ClampedArray, w: number, h: number): Ink {
  const data = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) data[i] = rgba[i * 4] < 130 ? 1 : 0
  return { w, h, data }
}

/** Tilt in degrees: the angle at which the rows of ink stack up most sharply into lines. */
export function findSkew({ w, h, data }: Ink): number {
  const pts: number[] = []
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (data[y * w + x]) pts.push(x - w / 2, y - h / 2)
  const sharpness = (deg: number) => {
    const a = (deg * Math.PI) / 180, sin = Math.sin(a), cos = Math.cos(a)
    const bins = new Float32Array(h * 2)
    // Rows are sampled two apart, so bin two apart too: finer bins would always favour 0°.
    for (let i = 0; i < pts.length; i += 2) {
      const b = Math.round((pts[i + 1] * cos - pts[i] * sin) / 2 + h)
      if (b >= 0 && b < bins.length) bins[b]++
    }
    return bins.reduce((sum, v) => sum + v * v, 0)
  }
  let best = 0, top = -1
  const consider = (d: number) => {
    const v = sharpness(d)
    if (v > top) {
      top = v
      best = d
    }
  }
  for (let d = -12; d <= 12; d += 0.5) consider(d)
  const coarse = best
  for (let d = coarse - 0.5; d <= coarse + 0.5; d += 0.1) consider(d)
  return best
}

/** How far the text in `b` sits below the same text in `a`. */
function offset(a: Float32Array, b: Float32Array): number {
  let bestK = 0, top = -1
  for (let k = -MAX_STEP; k <= MAX_STEP; k++) {
    let v = 0
    for (let y = MAX_STEP; y < a.length - MAX_STEP; y++) v += a[y] * b[y + k]
    v *= 1 - Math.abs(k) * 0.01 // on a tie, prefer not moving
    if (v > top) {
      top = v
      bestK = k
    }
  }
  return bestK
}

/** Walk outward from the middle of each zone, measuring how far the lines drift strip by strip. */
export function measureWarp({ w, h, data }: Ink, canvasWidth: number): Warp {
  const stripW = w / STRIPS, zoneH = h / ZONES
  const field: Float32Array[] = []
  for (let z = 0; z < ZONES; z++) {
    const y0 = Math.max(0, Math.floor((z - 0.5) * zoneH))
    const n = Math.min(h, Math.ceil((z + 1.5) * zoneH)) - y0
    const profiles: Float32Array[] = [], mass: number[] = []
    for (let s = 0; s < STRIPS; s++) {
      const x0 = Math.floor(s * stripW), x1 = Math.floor((s + 1) * stripW)
      const raw = new Float32Array(n)
      let total = 0
      for (let y = 0; y < n; y++) {
        let t = 0
        for (let x = x0; x < x1; x++) t += data[(y + y0) * w + x]
        raw[y] = t
        total += t
      }
      const soft = new Float32Array(n)
      for (let y = 1; y < n - 1; y++) soft[y] = raw[y - 1] + 2 * raw[y] + raw[y + 1]
      profiles.push(soft)
      mass.push(total)
    }
    const minMass = 0.25 * [...mass].sort((a, b) => a - b)[STRIPS >> 1]
    const mid = STRIPS >> 1
    const d = new Float32Array(STRIPS)
    const walk = (dir: 1 | -1) => {
      let ref = mid
      for (let s = mid + dir; s >= 0 && s < STRIPS; s += dir) {
        if (mass[s] < minMass) d[s] = d[s - dir] // margin or gutter: nothing to measure
        else {
          d[s] = d[ref] + offset(profiles[ref], profiles[s])
          ref = s
        }
      }
    }
    walk(1)
    walk(-1)
    const smooth = new Float32Array(STRIPS)
    for (let s = 0; s < STRIPS; s++) {
      let t = 0, c = 0
      for (let k = Math.max(0, s - 2); k <= Math.min(STRIPS - 1, s + 2); k++) {
        t += d[k]
        c++
      }
      smooth[s] = t / c
    }
    field.push(smooth)
  }
  return { field, scale: w / canvasWidth, stripW, zoneH }
}

const blend = (i: number, count: number) => {
  const t = Math.max(0, Math.min(count - 1.001, i - 0.5))
  const at = Math.floor(t)
  return { at, u: t - at }
}

/** How far down the source image a flattened pixel comes from, in canvas pixels. */
export function shiftAt(warp: Warp, x: number, y: number): number {
  const col = blend((x * warp.scale) / warp.stripW, STRIPS)
  const row = blend((y * warp.scale) / warp.zoneH, ZONES)
  const inZone = (z: number) => warp.field[z][col.at] * (1 - col.u) + warp.field[z][col.at + 1] * col.u
  return (inZone(row.at) * (1 - row.u) + inZone(row.at + 1) * row.u) / warp.scale
}

/** Copy `from` into `to` with every column shifted so the text lines come out straight. */
export function applyWarp(from: Uint8ClampedArray, to: Uint8ClampedArray, w: number, h: number, warp: Warp) {
  // Per-column shifts are worked out once for each zone: this loop runs millions of times.
  const columns = warp.field.map((_, z) => {
    const a = new Float32Array(w)
    for (let x = 0; x < w; x++) {
      const col = blend((x * warp.scale) / warp.stripW, STRIPS)
      a[x] = (warp.field[z][col.at] * (1 - col.u) + warp.field[z][col.at + 1] * col.u) / warp.scale
    }
    return a
  })
  for (let y = 0; y < h; y++) {
    const row = blend((y * warp.scale) / warp.zoneH, ZONES)
    const A = columns[row.at], B = columns[row.at + 1]
    for (let x = 0; x < w; x++) {
      const sy = Math.max(0, Math.min(h - 1, Math.round(y + A[x] * (1 - row.u) + B[x] * row.u)))
      const p = (sy * w + x) * 4, q = (y * w + x) * 4
      to[q] = from[p]
      to[q + 1] = from[p + 1]
      to[q + 2] = from[p + 2]
      to[q + 3] = 255
    }
  }
}

/** Where a point on the flattened canvas came from on the canvas before rotation and warping. */
export function unflatten(x: number, y: number, w: number, h: number, skewDeg: number, warp: Warp) {
  const a = (skewDeg * Math.PI) / 180, sin = Math.sin(a), cos = Math.cos(a)
  const qx = x - w / 2, qy = y + shiftAt(warp, x, y) - h / 2
  return { x: qx * cos - qy * sin + w / 2, y: qx * sin + qy * cos + h / 2 }
}

/** Move each word's box back onto the photo, keeping its size. `convert` maps one point. */
export function mapWords(words: OcrWord[], convert: (x: number, y: number) => { x: number; y: number }): OcrWord[] {
  return words.map((w) => {
    const c = convert((w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2)
    const halfW = (w.x1 - w.x0) / 2, halfH = (w.y1 - w.y0) / 2
    return { ...w, x0: c.x - halfW, y0: c.y - halfH, x1: c.x + halfW, y1: c.y + halfH }
  })
}

const meanConf = (ws: OcrWord[]) => ws.reduce((a, w) => a + w.conf, 0) / Math.max(1, ws.length)

/**
 * Flattening rescues bent pages but can scramble short, already-flat ones (a few lines give it
 * too little to measure), so it's only kept when the read is clearly more confident.
 */
export function preferFlat(plain: OcrWord[], flat: OcrWord[]): boolean {
  return meanConf(flat) > meanConf(plain) + 2 && flat.length >= plain.length * 0.9
}
