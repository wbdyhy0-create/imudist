import { ANCHOR_MARKER, FOOTNOTE_MARKER, TOC_LEADER_MARKER, type DocSettings, type PageSection, type TextFrame, type TocFootnoteReference, type TocPageReference } from './document'
import { chainOf } from './frames'
import { ownerPage, type PageRect } from './pages'
import { pageNumberLabel } from './numbering'

interface FlowRange {
  start: number
  end: number
  footnoteReferences?: { id: string; referenceNumber: number | string }[]
}

export interface TocDisplayMarkers {
  pageNumbers: Record<number, string>
  leaders: Record<number, string>
  footnotes: Record<number, string>
}

export function sliceTocDisplayMarkers(markers: TocDisplayMarkers | undefined, start: number, end: number): TocDisplayMarkers | null {
  if (!markers) return null
  const slice = (values: Record<number, string>) => Object.fromEntries(Object.entries(values)
    .flatMap(([offset, value]) => {
      const absolute = Number(offset)
      return absolute >= start && absolute < end ? [[absolute - start, value]] : []
    }))
  return { pageNumbers: slice(markers.pageNumbers), leaders: slice(markers.leaders), footnotes: slice(markers.footnotes) }
}

/** Resolve only the TOC's stored references; page labels follow current flow without remeasuring text. */
export function tocDisplayMarkers(
  references: TocPageReference[] | undefined,
  text: string,
  localStart: number,
  localEnd: number,
  frames: TextFrame[],
  flows: ReadonlyMap<string, FlowRange>,
  rects: PageRect[],
  sections: PageSection[],
  doc: DocSettings,
  leader: string,
  footnoteReferences?: TocFootnoteReference[],
): TocDisplayMarkers {
  const pageNumbers: Record<number, string> = {}
  const leaders: Record<number, string> = {}
  const footnotes: Record<number, string> = {}
  if (!references?.length) return { pageNumbers, leaders, footnotes }

  const frameById = new Map(frames.map((frame) => [frame.id, frame]))
  const noteLabels = new Map([...flows.values()].flatMap((flow) => flow.footnoteReferences?.map((note) => [note.id, String(note.referenceNumber)] as const) ?? []))
  for (const reference of footnoteReferences ?? []) {
    if (reference.offset < localStart || reference.offset >= localEnd || text[reference.offset] !== FOOTNOTE_MARKER) continue
    const label = noteLabels.get(reference.sourceNoteId)
    if (label !== undefined) footnotes[reference.offset - localStart] = label
  }
  const sourceCache = new Map<string, { paragraphs: string[]; starts: number[]; styleIds: (string | undefined)[]; chain: TextFrame[] }>()
  for (const reference of references) {
    if (reference.offset < localStart || reference.offset >= localEnd || text[reference.offset] !== '\uE010') continue
    const localOffset = reference.offset - localStart
    pageNumbers[localOffset] = ''
    const leaderOffset = reference.offset - 1
    if (text[leaderOffset] === TOC_LEADER_MARKER && leaderOffset >= localStart) leaders[leaderOffset - localStart] = leader.repeat(128)
    const sourceHead = frameById.get(reference.sourceFrameId)
    if (!sourceHead) continue
    let source = sourceCache.get(sourceHead.id)
    if (!source) {
      const paragraphs = sourceHead.text.split('\n')
      const starts: number[] = []
      let offset = 0
      for (const paragraph of paragraphs) {
        starts.push(offset)
        offset += paragraph.length + 1
      }
      source = {
        paragraphs,
        starts,
        styleIds: paragraphs.map((_, index) => sourceHead.paragraphStyleIds?.[index] ?? (index === 0 ? sourceHead.paragraphStyleId : undefined)),
        chain: chainOf(frames, sourceHead.id),
      }
      sourceCache.set(sourceHead.id, source)
    }
    let paragraphIndex = reference.sourceParagraphIndex
    const indexedTextMatches = source.paragraphs[paragraphIndex]?.trim() === reference.sourceText
    if (!indexedTextMatches || (source.styleIds[paragraphIndex] && source.styleIds[paragraphIndex] !== reference.sourceStyleId)) {
      const matches = source.paragraphs.flatMap((paragraph, index) => source!.styleIds[index] === reference.sourceStyleId && paragraph.trim() === reference.sourceText ? [index] : [])
      paragraphIndex = matches[reference.occurrence] ?? -1
    }
    if (paragraphIndex < 0) continue
    const paragraphStart = source.starts[paragraphIndex]
    const targetFrame = source.chain.find((frame) => {
      const range = flows.get(frame.id)
      return range && paragraphStart >= range.start && paragraphStart < range.end
    })
    if (!targetFrame) continue
    const pageIndex = ownerPage(rects, targetFrame.x + targetFrame.w / 2, targetFrame.y + targetFrame.h / 2)
    pageNumbers[localOffset] = pageNumberLabel(sections, pageIndex, doc.startPage)
  }
  return { pageNumbers, leaders, footnotes }
}

export function plainTocHeading(text: string): string {
  return text.replaceAll(FOOTNOTE_MARKER, '').replaceAll(ANCHOR_MARKER, '').trim()
}