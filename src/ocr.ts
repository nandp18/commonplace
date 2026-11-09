import { createWorker, PSM, type Worker } from 'tesseract.js'
import type { Lang } from './types'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

type Progress = (status: string, pct: number) => void

const workers = new Map<Lang, Promise<Worker>>()
let onProgress: Progress | null = null

function getWorker(lang: Lang): Promise<Worker> {
  let w = workers.get(lang)
  if (!w) {
    w = (async () => {
      const worker = await createWorker(lang.split('+'), 1, {
        logger: (m) => onProgress?.(m.status, m.progress),
      })
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: '1',
      })
      return worker
    })()
    w.catch(() => workers.delete(lang))
    workers.set(lang, w)
  }
  return w
}

/** Start downloading the model early so recognition feels faster. */
export function warmUp(lang: Lang) {
  getWorker(lang).catch(() => {})
}

/** Crop to the box, grayscale, and scale so text is a size Tesseract likes. */
export function preprocess(img: HTMLImageElement, box: Box): HTMLCanvasElement {
  const scale = Math.min(3, Math.max(0.5, 1800 / box.w))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(box.w * scale)
  canvas.height = Math.round(box.h * scale)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, canvas.width, canvas.height)

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const px = data.data
  // Grayscale, then stretch contrast between the 2nd and 98th percentile.
  const hist = new Uint32Array(256)
  for (let i = 0; i < px.length; i += 4) {
    const g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0
    px[i] = g
    hist[g]++
  }
  const total = px.length / 4
  let lo = 0, hi = 255, acc = 0
  for (; lo < 255 && (acc += hist[lo]) < total * 0.02; lo++);
  acc = 0
  for (; hi > 0 && (acc += hist[hi]) < total * 0.02; hi--);
  const range = Math.max(1, hi - lo)
  for (let i = 0; i < px.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((px[i] - lo) * 255) / range))
    px[i] = px[i + 1] = px[i + 2] = v
  }
  ctx.putImageData(data, 0, 0)
  return canvas
}

/** Book lines wrap mid-sentence; join them back into paragraphs. */
export function reflow(raw: string): string {
  return raw
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((para) =>
      para
        .replace(/([A-Za-z])-\n([a-z])/g, '$1$2')
        .replace(/\s*\n\s*/g, ' ')
        .replace(/ {2,}/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    .join('\n\n')
}

export async function recognize(canvas: HTMLCanvasElement, lang: Lang, progress: Progress): Promise<string> {
  onProgress = progress
  try {
    const worker = await getWorker(lang)
    const { data } = await worker.recognize(canvas)
    return reflow(data.text)
  } finally {
    onProgress = null
  }
}
