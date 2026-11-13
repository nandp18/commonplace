import { toIsbn13 } from './isbn'

/** The part of the BarcodeDetector API used here: native, or the ZXing ponyfill. */
interface Detector {
  detect(source: ImageBitmapSource): Promise<{ rawValue: string; format: string }[]>
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e']
let detector: Promise<Detector> | null = null

/**
 * The browser's own barcode reader where it has one (Chrome, Android); otherwise ZXing
 * compiled to WebAssembly (Safari and iOS), bundled with the app and loaded on first scan.
 */
export function getDetector(): Promise<Detector> {
  detector ??= (async () => {
    type Native = { new (o: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> }
    const Native = (globalThis as { BarcodeDetector?: Native }).BarcodeDetector
    if (Native) {
      try {
        const supported = await Native.getSupportedFormats()
        if (supported.includes('ean_13')) return new Native({ formats: FORMATS.filter((f) => supported.includes(f)) })
      } catch {}
    }
    const [{ BarcodeDetector, setZXingModuleOverrides }, { default: wasmUrl }] = await Promise.all([
      import('barcode-detector/ponyfill'),
      import('zxing-wasm/reader/zxing_reader.wasm?url'),
    ])
    // Serve the decoder from the app itself rather than a CDN, so it's cached with the app.
    setZXingModuleOverrides({ locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) })
    return new BarcodeDetector({ formats: ['ean_13'] }) as Detector
  })()
  detector.catch(() => (detector = null))
  return detector
}

/** Reads every barcode in the frame and returns the first that is an ISBN. */
export async function readIsbn(source: ImageBitmapSource): Promise<{ isbn: string | null; other: boolean }> {
  const found = await (await getDetector()).detect(source)
  for (const code of found) {
    const isbn = toIsbn13(code.rawValue)
    if (isbn) return { isbn, other: false }
  }
  return { isbn: null, other: found.length > 0 }
}
