import { getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask, type PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { Asset } from './document'
import { hashId } from './assetHash'
import { ImportError } from './importText'
import type { PlacedImage } from './importImage'
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

function dataUrlBytes(dataUrl: string): ArrayBuffer {
  const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes.buffer
}

/** Render selected 1-based PDF pages to 300-DPI PNG assets, ready for the existing image placement pipeline. */
export async function readPdfFile(source: PdfImportSource, pageNumbers: number[]): Promise<PlacedImage[]> {
  if (pageNumbers.some((page) => !Number.isInteger(page) || page < 1 || page > source.pageCount)) {
    throw new ImportError('טווח העמודים כולל עמוד שאינו קיים בקובץ ה-PDF.')
  }
  const placed: PlacedImage[] = []
  for (const pageNumber of pageNumbers) {
    let page: Awaited<ReturnType<PDFDocumentProxy['getPage']>> | null = null
    let canvas: HTMLCanvasElement | null = null
    try {
      page = await source.document.getPage(pageNumber)
      const viewport = page.getViewport({ scale: PDF_DPI / 72 })
      canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      await page.render({ canvas, viewport }).promise
      const dataUrl = canvas.toDataURL('image/png')
      const asset: Asset = {
        name: `${source.file.name} - ${pageNumber}.png`,
        mime: 'image/png',
        dataUrl,
        width: canvas.width,
        height: canvas.height,
      }
      placed.push({ assetId: await hashId(dataUrlBytes(dataUrl)), asset })
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
  return placed
}