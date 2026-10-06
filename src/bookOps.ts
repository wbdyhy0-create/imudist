import { planStyleSync, reportCount, syncStyles, type StyleSet, type SyncReport } from './bookStyles'
import { parseDocument, serializeDocument } from './fileFormat'
import type { DocContent } from './pages'

/** What a document's styles and colours are, as a book syncs them. */
export const styleSetOf = (content: Pick<DocContent, 'paragraphStyles' | 'characterStyles' | 'colorSamples'>): StyleSet => ({
  paragraphStyles: content.paragraphStyles,
  characterStyles: content.characterStyles ?? [],
  colorSamples: content.colorSamples ?? [],
})

/** What syncing this document with the master would change (nothing: it is already in line). */
export const planContentSync = (content: DocContent, master: StyleSet): SyncReport => planStyleSync(master, styleSetOf(content))

/** The document with the master's styles brought in; the same object when there was nothing to change. */
export function syncContent(content: DocContent, master: StyleSet): { content: DocContent; report: SyncReport } {
  const result = syncStyles(master, { ...styleSetOf(content), frames: content.frames, footnoteConfig: content.doc.footnotes })
  if (reportCount(result.report) === 0) return { content, report: result.report }
  return {
    content: { ...content, frames: result.frames, paragraphStyles: result.paragraphStyles, characterStyles: result.characterStyles, colorSamples: result.colorSamples },
    report: result.report,
  }
}

/** A document file synced with the master: its new text, or null when nothing changed. */
export function syncText(text: string, master: StyleSet, name: string): { text: string | null; report: SyncReport } {
  const { content, report } = syncContent(parseDocument(text, name), master)
  return { text: reportCount(report) === 0 ? null : serializeDocument(content), report }
}

/**
 * A document file with another first page number: only that setting is touched, the rest of the file stays as it is.
 * Null when the file already has it.
 */
export function withStartPage(text: string, startPage: number): string | null {
  const data = JSON.parse(text) as { settings?: { startPage?: number } }
  if (!data.settings || data.settings.startPage === startPage) return null
  data.settings.startPage = startPage
  return JSON.stringify(data)
}
