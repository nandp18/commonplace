import { createWorker, PSM, type Worker } from 'tesseract.js'
import { reflow, tidy } from './format'
import type { OcrWord } from './selection'
import type { Lang } from './types'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

type Progress = (pct: number) => void

const workers = new Map<Lang, Promise<Worker>>()
let onProgress: Progress | null = null

function getWorker(lang: Lang): Promise<Worker> {
  let w = workers.get(lang)
  if (!w) {
    w = createWorker(lang.split('+'), 1, {
      logger: (m) => m.status === 'recognizing text' && onProgress?.(m.progress),
    })
    w.catch(() => workers.delete(lang))
    workers.set(lang, w)
  }
  return w
}

/** Start downloading the model early so the first read feels fast. */
export function warmUp(lang: Lang) {
  getWorker(lang).catch(() => {})
}

/**
 * Crop, scale, and clean up a phone photo for OCR:
 * flatten uneven lighting (shadow near the spine, a lamp on one side), then stretch contrast.
 */
export function preprocess(img: HTMLImageElement, box: Box, targetWidth: number): { canvas: HTMLCanvasElement; scale: number } {
  const scale = Math.min(3, targetWidth / box.w)
  const W = Math.round(box.w * scale)
  const H = Math.round(box.h * scale)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, W, H)

  // Background estimate: shrink a lot (which averages away the text), then blow back up.
  const small = document.createElement('canvas')
  small.width = Math.max(1, Math.round(W / 24))
  small.height = Math.max(1, Math.round(H / 24))
  const sctx = small.getContext('2d')!
  sctx.filter = 'blur(2px)'
  sctx.drawImage(canvas, 0, 0, small.width, small.height)
  const bgCanvas = document.createElement('canvas')
  bgCanvas.width = W
  bgCanvas.height = H
  const bctx = bgCanvas.getContext('2d', { willReadFrequently: true })!
  bctx.imageSmoothingQuality = 'high'
  bctx.drawImage(small, 0, 0, W, H)

  const data = ctx.getImageData(0, 0, W, H)
  const bg = bctx.getImageData(0, 0, W, H).data
  const px = data.data
  const hist = new Uint32Array(256)
  for (let i = 0; i < px.length; i += 4) {
    const g = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114
    const b = Math.max(1, bg[i] * 0.299 + bg[i + 1] * 0.587 + bg[i + 2] * 0.114)
    const v = Math.min(255, (g / b) * 235) | 0
    px[i] = v
    hist[v]++
  }
  const total = px.length / 4
  let lo = 0, acc = 0
  for (; lo < 254 && (acc += hist[lo]) < total * 0.01; lo++);
  const hi = 235
  const range = Math.max(1, hi - lo)
  for (let i = 0; i < px.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((px[i] - lo) * 255) / range))
    px[i] = px[i + 1] = px[i + 2] = v
  }
  ctx.putImageData(data, 0, 0)
  return { canvas, scale }
}

/** Read every word on the page with its position (in original photo pixels). */
export async function readPage(img: HTMLImageElement, lang: Lang, progress: Progress): Promise<OcrWord[]> {
  const box = { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight }
  // ~2000px wide keeps book text legible to Tesseract without taking forever on a phone.
  const { canvas, scale } = preprocess(img, box, Math.min(2000, img.naturalWidth))
  onProgress = progress
  try {
    const worker = await getWorker(lang)
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '1' })
    const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false })
    const words: OcrWord[] = []
    let line = 0, para = 0
    for (const b of data.blocks ?? [])
      for (const p of b.paragraphs) {
        for (const l of p.lines) {
          for (const w of l.words) {
            if (!w.text.trim()) continue
            words.push({
              text: w.text,
              conf: w.confidence,
              x0: w.bbox.x0 / scale,
              y0: w.bbox.y0 / scale,
              x1: w.bbox.x1 / scale,
              y1: w.bbox.y1 / scale,
              line,
              para,
            })
          }
          line++
        }
        para++
      }
    return words
  } finally {
    onProgress = null
  }
}

/** Fallback when the page read found nothing where you pointed: OCR just that region. */
export async function readRegion(img: HTMLImageElement, box: Box, lang: Lang): Promise<string> {
  const { canvas } = preprocess(img, box, 1800)
  const worker = await getWorker(lang)
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: '1' })
  const { data } = await worker.recognize(canvas)
  return tidy(reflow(data.text))
}
