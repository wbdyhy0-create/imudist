import { DEFAULT_TEXT_STYLE, FOOTNOTE_MARKER, MAX_PAGES, type DocSettings, type FootnoteLayoutConfig, type FootnoteItem, type ParagraphStyleRecord, type TextFrame } from './document'
import { headFrames } from './frames'
import { computeLayout, pageMargins } from './layout'
import { ownerPage, pageRects } from './pages'
import { flowFramesWithFootnoteContinuation, type FrameFlow } from './textLayout'

export interface EndnotePages {
  doc: DocSettings
  frames: TextFrame[]
  flows: Map<string, FrameFlow>
}

export function layoutEndnotes(
  doc: DocSettings,
  frames: TextFrame[],
  config: FootnoteLayoutConfig,
  numbers: ReadonlyMap<string, number>,
  paragraphStyles: ParagraphStyleRecord[],
): EndnotePages {
  if (config.placement !== 'endnotes') return { doc, frames: [], flows: new Map() }
  const documentRects = pageRects(doc)
  const orderedHeads = headFrames(frames).map((head, index) => ({
    head,
    index,
    page: ownerPage(documentRects, head.x + head.w / 2, head.y + head.h / 2),
  })).sort((a, b) => a.page - b.page || a.head.y - b.head.y || (doc.binding === 'rtl' ? b.head.x - a.head.x : a.head.x - b.head.x) || a.index - b.index)
  const notes = orderedHeads.flatMap(({ head }) => [...(head.footnotes ?? [])].sort((a, b) => a.anchor - b.anchor))
  if (!notes.length) return { doc, frames: [], flows: new Map() }

  const flowConfig = { ...config, placement: 'footnotes' as const }
  const maxPageCount = Math.min(MAX_PAGES - doc.pages, Math.max(1, notes.length * 4 + 10))
  if (maxPageCount < 1) return { doc, frames: [], flows: new Map() }
  for (let pageCount = 1; pageCount <= maxPageCount; pageCount++) {
    const pageDoc = { ...doc, pages: doc.pages + pageCount }
    const rects = pageRects(pageDoc)
    const pageLayouts = computeLayout(pageDoc).spreads.flatMap((spread) => spread.pages)
    const generatedFrames: TextFrame[] = []
    for (let index = 0; index < pageCount; index++) {
      const page = doc.pages + index
      const rect = rects[page]
      const pageLayout = pageLayouts.find((candidate) => candidate.index === page)
      if (!rect || !pageLayout) continue
      const margins = pageMargins(pageDoc, pageLayout.side, page)
      const id = `__imudist_endnote_page_${page}`
      const previous = generatedFrames[index - 1]
      generatedFrames.push({
        ...DEFAULT_TEXT_STYLE,
        id,
        x: rect.x + margins.left,
        y: rect.y + margins.top,
        w: Math.max(1, rect.w - margins.left - margins.right),
        h: Math.max(1, rect.h - margins.top - margins.bottom),
        text: index === 0 ? FOOTNOTE_MARKER : '',
        runs: index === 0 ? [{ len: 1, style: DEFAULT_TEXT_STYLE }] : [],
        footnotes: index === 0 ? notes.map((note: FootnoteItem) => ({ ...note, anchor: 0 })) : undefined,
        next: null,
      })
      if (previous) generatedFrames[index - 1] = { ...previous, next: id }
    }
    const ids = generatedFrames.map((frame) => frame.id)
    const noteNumbers = new Map(notes.map((note, index) => [note.id, numbers.get(note.id) ?? config.startAt + index]))
    const rawFlows = flowFramesWithFootnoteContinuation(generatedFrames, [], flowConfig, noteNumbers, ids, paragraphStyles)
    const usedPages = generatedFrames.reduce((last, frame, index) => rawFlows.get(frame.id)?.footnotes.length ? index + 1 : last, 0)
    const lastFlow = usedPages ? rawFlows.get(generatedFrames[usedPages - 1].id) : undefined
    if (lastFlow?.footnoteOverflowItems.length && pageCount < maxPageCount) continue
    const endnoteFrames = generatedFrames.slice(0, Math.max(1, usedPages))
    const endnoteFlows = new Map<string, FrameFlow>()
    for (const frame of endnoteFrames) {
      const flow = rawFlows.get(frame.id)
      if (!flow) continue
      endnoteFlows.set(frame.id, { ...flow, slice: '', runs: [], start: 0, end: 0, overflow: false, footnoteReferences: [], footnoteHeight: frame.h })
    }
    return { doc: pageDoc, frames: endnoteFrames, flows: endnoteFlows }
  }

  return { doc, frames: [], flows: new Map() }
}
