import type { jsPDF } from 'jspdf'
import { addPagesToPdf, deliverPdf, prepareExport, sheetSizeOf, type ExportContent, type PageDrawOptions } from './pdfExport'

/** One chapter of a book to be exported: how to get its content, and where the book puts it. */
export interface BookExportChapter {
  /** the name its bookmark has */
  title: string
  /** reads the chapter's content when its turn comes (and lets it go after): a book is many pages */
  load: () => Promise<ExportContent>
  /** the number the chapter's first page has in the book (written over the chapter's own) */
  startPage: number
  /** blank pages the book leaves in front of the chapter so that it begins on an odd or an even page */
  skipped: number
}

export interface BookExportProgress {
  chapter: number
  chapters: number
  /** pages drawn so far of this chapter, and how many it has */
  page: number
  pages: number
}

/** a PDF text string (the bookmark names are Hebrew): UTF-16 with a byte-order mark, in hex */
const pdfText = (text: string) => {
  let hex = '<FEFF'
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase()
  return `${hex}>`
}

/**
 * The whole book as one PDF: the chapters in order, each page numbered as the book numbers it (the chapter's own first page
 * number is replaced by the one the book gives it), a blank page where a chapter has to start on an odd or even page, and a
 * bookmark for each chapter. Nothing is kept of a chapter once its pages are drawn - a book is many pages.
 */
export async function exportBookPdf(
  chapters: BookExportChapter[],
  options: PageDrawOptions,
  fileBaseName: string,
  onProgress?: (progress: BookExportProgress) => void,
  /** a window opened from the click that started the export, so the result can be shown in it */
  viewWindow?: Window | null,
): Promise<boolean> {
  let pdf: jsPDF | null = null
  const bookmarks: { title: string; page: number }[] = []
  for (const [index, chapter] of chapters.entries()) {
    const content = await chapter.load()
    const prepared = prepareExport({ ...content, doc: { ...content.doc, startPage: chapter.startPage } })
    if (prepared.rects.length === 0) continue
    if (pdf) {
      const sheet = sheetSizeOf(prepared.rects[0], options)
      for (let blank = 0; blank < chapter.skipped; blank++) pdf.addPage([sheet.w, sheet.h])
    }
    const before: number = pdf ? pdf.getNumberOfPages() : 0
    pdf = await addPagesToPdf(pdf, prepared, { ...options, infoName: options.infoName ?? fileBaseName }, 1, prepared.rects.length, (page, pages) => onProgress?.({ chapter: index + 1, chapters: chapters.length, page, pages }))
    bookmarks.push({ title: chapter.title, page: before + 1 })
  }
  if (!pdf) {
    viewWindow?.close()
    return false
  }
  const outline = pdf.outline as unknown as { add: (parent: unknown, title: string, options: { pageNumber: number }) => void; makeString: (value: string) => string }
  outline.makeString = pdfText
  for (const bookmark of bookmarks) outline.add(null, bookmark.title, { pageNumber: bookmark.page })
  // open with the list of bookmarks at the side
  pdf.setDisplayMode(undefined, undefined, 'UseOutlines')
  return deliverPdf(pdf, fileBaseName, viewWindow)
}
