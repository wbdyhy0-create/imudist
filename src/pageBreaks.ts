import type { ParagraphStyleRecord, TextFrame } from './document'
import { resolveParagraphStyle, styleIdOf } from './styleApply'

/**
 * The offsets in a story where a paragraph starts that its style wants to begin in a new frame ("start paragraph on a new page":
 * every chapter on a page of its own). The start of the story is not one: nothing comes before it to be left behind.
 */
export function pageBreakStarts(head: Pick<TextFrame, 'text' | 'paragraphStyleId' | 'paragraphStyleIds' | 'paragraphStyleNames'>, styles: ParagraphStyleRecord[]): number[] {
  if (!styles.some((style) => style.patch.pageBreakBefore)) return []
  const breaking = new Set(styles.filter((style) => resolveParagraphStyle(style.id, styles).pageBreakBefore).map((style) => style.id))
  if (breaking.size === 0) return []
  const starts: number[] = []
  let offset = 0
  head.text.split('\n').forEach((paragraph, index) => {
    const id = styleIdOf(styles, head as TextFrame, index)
    if (offset > 0 && id && breaking.has(id)) starts.push(offset)
    offset += paragraph.length + 1
  })
  return starts
}

/** Where a frame that starts at `start` and would run to `end` is cut so that the paragraph that must begin a frame does: before it. */
export function cutAtPageBreak(starts: number[], start: number, end: number): number {
  const cut = starts.find((offset) => offset > start && offset < end)
  return cut === undefined ? end : cut
}
