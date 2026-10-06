import { getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask, type PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { Asset } from './document'
import { hashId } from './assetHash'
import { ImportError } from './importText'
import type { PlacedImage } from './importImage'
import type { EncodeReply, EncodeRequest } from './pdfEncodeWorker'
export { parsePageRange } from './pdfPageRange'

const PDF_DPI = 300
GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export interface PdfImportSource {
  file: File
  document: PDFDocumentProxy
  destroy: () => Promise<void>
  pageCount: number
}

export async function openPdfFile(file: File): Promise<PdfImportSource> {
  let loading: PDFDocumentLoadingTask | null = null
  try {
    loading = getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
    const document = await loading.promise
    return { file, document, destroy: () => loading!.destroy(), pageCount: document.numPages }
  } catch (error) {
    await loading?.destroy().catch(() => {})
    const detail = error instanceof Error && error.message ? ` ${error.message}` : ''
    throw new ImportError(`לא ניתן לקרוא את קובץ ה-PDF "${file.name}". ייתכן שהוא פגום או מוגן בסיסמה.${detail}`)
  }
}

interface Encoded {
  dataUrl: string
  assetId: string
  width: number
  height: number
}

/**
 * A few workers that turn drawn pages into PNG assets (pdfEncodeWorker.ts). On the main thread the PNG encoder was
 * the slowest part of an import and did not speed up with several pages at once; in workers it does.
 */
class EncoderPool {
  private readonly idle: Worker[]
  private readonly waiting: ((worker: Worker) => void)[] = []
  private readonly jobs = new Map<Worker, { resolve: (encoded: Encoded) => void; reject: (error: Error) => void }>()
  private nextId = 1

  readonly workers: Worker[]

  private constructor(workers: Worker[]) {
    this.workers = workers
    this.idle = [...workers]
    for (const worker of workers) {
      worker.onmessage = (event: MessageEvent<EncodeReply>) => {
        const job = this.jobs.get(worker)
        if (!job) return
        this.jobs.delete(worker)
        const reply = event.data
        if ('error' in reply) job.reject(new Error(reply.error))
        else if ('dataUrl' in reply) job.resolve(reply)
        this.release(worker)
      }
      worker.onerror = (event) => {
        const job = this.jobs.get(worker)
        this.jobs.delete(worker)
        job?.reject(new Error(event.message || 'worker failed'))
      }
    }
  }

  /** The pool, or null where there are no workers or no OffscreenCanvas (then pages are encoded on the main thread). */
  static async start(): Promise<EncoderPool | null> {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return null
    const count = Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 1))
    let workers: Worker[] = []
    try {
      workers = Array.from({ length: count }, () => new Worker(new URL('./pdfEncodeWorker.ts', import.meta.url), { type: 'module' }))
      // does the first one start at all? (a packaged app that cannot load a worker must still import)
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('worker did not start')), 3000)
        workers[0].addEventListener('message', () => (clearTimeout(timer), resolve()), { once: true })
        workers[0].addEventListener('error', () => (clearTimeout(timer), reject(new Error('worker failed'))), { once: true })
        workers[0].postMessage({ id: 0 } satisfies EncodeRequest)
      })
      return new EncoderPool(workers)
    } catch (error) {
      console.warn('PDF import goes without workers.', error)
      for (const worker of workers) worker.terminate()
      return null
    }
  }

  private take(): Promise<Worker> {
    const worker = this.idle.pop()
    return worker ? Promise.resolve(worker) : new Promise((resolve) => this.waiting.push(resolve))
  }

  private release(worker: Worker) {
    const next = this.waiting.shift()
    if (next) next(worker)
    else this.idle.push(worker)
  }

  /** Encode a drawn page; the bitmap is handed over (it is not usable afterwards). */
  async encode(bitmap: ImageBitmap): Promise<Encoded> {
    const worker = await this.take()
    try {
      return await new Promise<Encoded>((resolve, reject) => {
        this.jobs.set(worker, { resolve, reject })
        worker.postMessage({ id: this.nextId++, bitmap } satisfies EncodeRequest, [bitmap])
      })
    } catch (error) {
      // a worker that failed a job does not give itself back: it does now
      this.release(worker)
      throw error
    }
  }

  close() {
    for (const worker of this.workers) worker.terminate()
  }
}

function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(blob)
  })
}

/** One page, encoded on this thread: how it is done where the workers cannot be. `toBlob` still encodes off the main thread. */
async function encodeHere(canvas: HTMLCanvasElement): Promise<Encoded> {
  const { width, height } = canvas
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('הקידוד נכשל'))), 'image/png'))
  // the 35 MB canvas is not needed any more: let it go before the next pages are drawn
  canvas.width = 0
  canvas.height = 0
  const [dataUrl, assetId] = await Promise.all([blobDataUrl(blob), blob.arrayBuffer().then(hashId)])
  return { dataUrl, assetId, width, height }
}

/** One page as a 300-DPI PNG asset. */
async function pageAsset(source: PdfImportSource, pageNumber: number, pool: EncoderPool | null): Promise<PlacedImage> {
  let page: Awaited<ReturnType<PDFDocumentProxy['getPage']>> | null = null
  let canvas: HTMLCanvasElement | null = null
  try {
    page = await source.document.getPage(pageNumber)
    const viewport = page.getViewport({ scale: PDF_DPI / 72 })
    const width = Math.ceil(viewport.width)
    const height = Math.ceil(viewport.height)
    let encoded: Encoded
    if (pool) {
      // drawn on an OffscreenCanvas, whose picture goes to a worker without being copied
      const offscreen = new OffscreenCanvas(width, height)
      await page.render({ canvas: offscreen as unknown as HTMLCanvasElement, viewport }).promise
      encoded = await pool.encode(offscreen.transferToImageBitmap())
    } else {
      canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      await page.render({ canvas, viewport }).promise
      encoded = await encodeHere(canvas)
    }
    const asset: Asset = { name: `${source.file.name} - ${pageNumber}.png`, mime: 'image/png', dataUrl: encoded.dataUrl, width: encoded.width, height: encoded.height }
    return { assetId: encoded.assetId, asset }
  } catch (error) {
    const detail = error instanceof Error && error.message ? ` ${error.message}` : ''
    throw new ImportError(`לא ניתן לרנדר את עמוד ${pageNumber} בקובץ ה-PDF "${source.file.name}".${detail}`)
  } finally {
    page?.cleanup()
    if (canvas) {
      canvas.width = 0
      canvas.height = 0
    }
  }
}

/**
 * Render selected 1-based PDF pages to 300-DPI PNG assets, ready for the existing image placement pipeline.
 * Pages are drawn here, one after another, while workers encode the ones already drawn; the result keeps the order of
 * `pageNumbers`. `onProgress` hears how many pages are done.
 */
export async function readPdfFile(source: PdfImportSource, pageNumbers: number[], onProgress?: (done: number, total: number) => void): Promise<PlacedImage[]> {
  if (pageNumbers.some((page) => !Number.isInteger(page) || page < 1 || page > source.pageCount)) {
    throw new ImportError('טווח העמודים כולל עמוד שאינו קיים בקובץ ה-PDF.')
  }
  const pool = pageNumbers.length > 1 ? await EncoderPool.start() : null
  // a page waiting for a worker holds its picture (35 MB): at most one is waiting for each worker
  const inFlight = pool ? pool.workers.length + 1 : 3
  const placed: PlacedImage[] = new Array(pageNumbers.length)
  let next = 0
  let done = 0
  let failed = false
  const work = async () => {
    // a page that failed stops the others from starting new ones: the import is lost anyway
    while (!failed && next < pageNumbers.length) {
      const index = next++
      try {
        placed[index] = await pageAsset(source, pageNumbers[index], pool)
      } catch (error) {
        failed = true
        throw error
      }
      onProgress?.(++done, pageNumbers.length)
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(inFlight, pageNumbers.length) }, work))
  } finally {
    pool?.close()
  }
  return placed
}
