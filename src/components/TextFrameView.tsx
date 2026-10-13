import type { ClipObjects } from '../objectClipboard'
import { decorationClass, decorationVars } from '../decorations'
import type { CSSProperties, ReactNode, PointerEvent as ReactPointerEvent } from 'react'
import { useRef } from 'react'
import type { FootnoteHeadingDecoration, FootnoteReferenceLook, TextDirection } from '../document'
import { isOrnamentDecoration, ornamentSideMarkup, type DividerOrnamentImage } from '../footnoteOrnaments'
import { letterCenterShift } from '../headingMetrics'
import { cssTextAlign, cssTextDirection, effectiveLeading, startSideOf, EXTERNAL_PAGE_NUMBER_MARKER, FOOTNOTE_MARKER, FOOTNOTE_REFERENCE_SCALE, INTERNAL_LETTER_PAGE_NUMBER_MARKER, INTERNAL_PAGE_NUMBER_MARKER, LETTER_PAGE_NUMBER_MARKER, PAGE_NUMBER_MARKER, RUNNING_HEADER_MARKER, textFlowBoxOf, TOC_LEADER_MARKER, TOC_PAGE_MARKER, wordSpacingPt, type CharStyle, type Feather, type Run, type TextFrame, type TextStyle } from '../document'
import { HANDLES, ROTATE_CORNERS, type HandleId, type RotateCorner } from '../frames'
import { anchorRunCss, baselineShiftCss, isAnchorRun, caretOffsetAt, paragraphListMarker, paragraphListMarkerOffset, paragraphListMarkerWidth, paragraphBoxStyle, paragraphSidePadding, setSelectionIn, splitMarks, textShadow, windowBlockMinHeight, windowFloatStyle, type ParagraphPatch, type WindowFonts } from '../richtext'
import { substituteMarker } from '../numbering'
import { normalizeRuns, styleAtChar } from '../story'
import { shapeOf, type WrapFloat } from '../wrap'
import { RichEditor, type SelRequest } from './RichEditor'
import { footnoteBlockWidth, footnoteLabelParts, type FootnotePlacement } from '../footnoteLayout'
import { featherMaskStyles } from '../feather'
import type { RichTextClipboard } from '../richTextClipboard'
import { t } from '../i18n'

/**
 * Text split at spaces/paragraph breaks into plain strings plus `.mark-space`/`.mark-para` spans (see styles.css).
 * `paraGaps[startParaIndex]` is the gap (world points) to add right after the first "\n" this call encounters,
 * `paraGaps[startParaIndex + 1]` the next, and so on (`document.ts`'s `paraGaps()` builds this for a whole story).
 * `firstLineIndent`, when set, indents the first line of EVERY paragraph, not just the story's very first one — a
 * `.para-indent` spacer right before each paragraph's own first character (`richtext.ts`'s `buildRunNodes` is the
 * vanilla-DOM twin of this same idea, used by the live editor — see its doc comment for why this needs no
 * `text-indent`, which only ever indents a whole BLOCK's first line, not every paragraph's).
 */
function withMarks(
  text: string,
  showMarks: boolean,
  paraGaps: (number | undefined)[],
  startParaIndex: number,
  atStart: boolean,
  isLastPart: boolean,
  firstLineIndent: (paragraphIndex: number) => number,
  scale: number,
  footnoteMarkers?: Record<number, string>,
  tocPageMarkers?: Record<number, string>,
  tocLeaderMarkers?: Record<number, string>,
  referenceFontSize = 9,
  referenceGap = 0,
  referenceVerticalOffset = 0,
  textOffset = 0,
  referenceStyle?: CharStyle,
  referenceLook?: FootnoteReferenceLook,
): { nodes: ReactNode[]; trailing: ReactNode[] } {
  if (!showMarks && paraGaps.length === 0 && !firstLineIndent(startParaIndex) && !footnoteMarkers && !tocPageMarkers && !tocLeaderMarkers) return { nodes: [text], trailing: [] }
  let idx = startParaIndex
  const nodes: ReactNode[] = []
  // the `.para-gap` / `.para-indent` spacers that follow a paragraph's closing "\n" belong to the START of the next
  // paragraph's line. RichText wraps each paragraph in its own block, so leaving them at the end of this one would
  // put them alone on an extra empty line (a full strut + the gap) at the end of every paragraph — text the frame's
  // measurer (richtext.ts's flat buildRunNodes) never has, so the visible text ran taller than what was measured to fit
  const trailing: ReactNode[] = []
  if (firstLineIndent(startParaIndex) && atStart) nodes.push(<span key="i0" className="para-indent" contentEditable={false} style={{ width: firstLineIndent(startParaIndex) * scale }} />)
  const pieces = splitMarks(text)
  let offset = 0
  for (const [i, piece] of pieces.entries()) {
    if (piece.kind === 'text') {
      let plainStart = 0
      for (let index = 0; index < piece.text.length; index++) {
        const absolute = textOffset + offset + index
        const character = piece.text[index]
        if (character === '\t' && piece.text[index + 1] === TOC_LEADER_MARKER) {
          if (index > plainStart) nodes.push(piece.text.slice(plainStart, index))
          plainStart = index + 1
          continue
        }
        const reference = character === FOOTNOTE_MARKER ? footnoteMarkers?.[absolute] : undefined
        const tocPage = character === TOC_PAGE_MARKER ? tocPageMarkers?.[absolute] ?? '8888' : undefined
        const tocLeader = character === TOC_LEADER_MARKER ? tocLeaderMarkers?.[absolute] ?? '.'.repeat(128) : undefined
        if (!(character === FOOTNOTE_MARKER && reference !== undefined) && tocPage === undefined && tocLeader === undefined) continue
        if (index > plainStart) nodes.push(piece.text.slice(plainStart, index))
        const key = `marker-${absolute}`
        if (reference !== undefined) nodes.push(<span key={key} className="footnote-reference" data-reference={reference} dir={/[\u0590-\u05ff]/.test(reference) ? 'rtl' : 'ltr'} style={{ '--footnote-marker-size': `${referenceLook?.fontSize !== undefined ? referenceLook.fontSize * scale : referenceFontSize}px`, '--footnote-marker-direction': /[\u0590-\u05ff]/.test(reference) ? 'rtl' : 'ltr', '--footnote-reference-gap': `${referenceGap * scale}px`, '--footnote-reference-offset': `${referenceVerticalOffset * scale}px`, ...(referenceStyle ? { fontFamily: `"${referenceLook?.fontFamily ?? referenceStyle.fontFamily}", "Segoe UI", Arial, sans-serif`, fontWeight: referenceLook?.weight ?? referenceStyle.weight, fontStyle: (referenceLook?.italic ?? referenceStyle.italic) ? 'italic' : 'normal' } : {}), ...(referenceLook?.color ? { color: referenceLook.color } : {}) } as CSSProperties}>{FOOTNOTE_MARKER}</span>)
        else if (tocPage !== undefined) nodes.push(<span key={key} className="toc-page-reference" data-reference={tocPage} style={{ '--toc-reference-size': `${referenceFontSize / FOOTNOTE_REFERENCE_SCALE}px` } as CSSProperties}>{TOC_PAGE_MARKER}</span>)
        else nodes.push(<span key={key} className="toc-leader" data-leader={tocLeader} style={{ '--toc-reference-size': `${referenceFontSize / FOOTNOTE_REFERENCE_SCALE}px` } as CSSProperties}>{TOC_LEADER_MARKER}</span>)
        plainStart = index + 1
      }
      if (plainStart < piece.text.length) nodes.push(piece.text.slice(plainStart))
    } else if (piece.kind === 'space') {
      nodes.push(showMarks ? <span key={i} className="mark-space">{piece.text}</span> : piece.text)
    } else {
      nodes.push(showMarks ? <span key={`${i}p`} className="mark-para">{piece.text}</span> : piece.text)
      // a paragraph break at the very end of this frame's WHOLE text (last piece of its last part) has no next
      // paragraph here to space away from or indent — see richtext.ts's buildRunNodes (the live editor's
      // vanilla-DOM twin of this same function) for why that includes the indent, not just the gap
      const atEnd = isLastPart && i === pieces.length - 1
      const gapValue = paraGaps[idx]
      idx++
      const spacers = i === pieces.length - 1 ? trailing : nodes
      if (gapValue && !atEnd) spacers.push(<span key={`${i}g`} className="para-gap" contentEditable={false} style={{ paddingTop: gapValue * scale }} />)
      if (firstLineIndent(idx) && !atEnd) spacers.push(<span key={`${i}i`} className="para-indent" contentEditable={false} style={{ width: firstLineIndent(idx) * scale }} />)
    }
    offset += piece.text.length
  }
  return { nodes, trailing }
}

interface Props {
  frame: TextFrame
  previewFontFamily?: string
  featherOverride?: Feather
  /** default style + alignment of the whole story (the first frame's) */
  style: TextStyle
  /** the part of the story shown in this frame, with its style runs */
  slice: string
  runs: Run[]
  /** part of `slice` to draw highlighted while the frame is not being edited: [from, to) */
  highlight: [number, number] | null
  /** areas kept free of text because of pictures with text wrap */
  floats: WrapFloat[]
  /** stacking rank (higher = in front) */
  z: number
  /** the story has more text than fits in its frames (only set on the last frame of a story) */
  overflow: boolean
  /** the last visible paragraph continues in the next frame */
  continuesParagraphAtEnd: boolean
  /** the story goes on in a linked frame after this one (this frame is not where it ends) */
  storyContinues?: boolean
  hasPrev: boolean
  zoom: number
  /** screen position of world (0, 0) inside the sheet */
  tx: number
  ty: number
  selected: boolean
  locked?: boolean
  /** part of a selection of several objects: outlined, without handles */
  marked?: boolean
  editing: boolean
  /** an out-port was clicked and this frame is waiting for a target */
  armed: boolean
  /** frame edges, handles and ports are non-printing: hidden in Preview mode */
  showEdge: boolean
  /** show a dot over spaces and a ¶ at paragraph breaks (View > תווים נסתרים); non-printing, like showEdge */
  showHidden: boolean
  /** the gap after each "\n" of the WHOLE story (document.ts's `paraGaps`); `startParaIndex` is where `slice` begins in it */
  paraGaps: (number | undefined)[]
  startParaIndex: number
  /** true when `slice`'s first character is itself a paragraph's first character, not a wrapped continuation */
  atParaStart: boolean
  paragraphPatches?: ParagraphPatch[]
  /** resolved space above the story's first line / below its last (document.ts's frameSpaceBefore/frameSpaceAfter) */
  spaceBeforeFirst: number
  spaceAfterLast: number
  /** the first line moved down, for a leading tighter than the letters (see firstLine.ts) */
  firstLineLift?: number
  footnoteMarkers?: Record<number, string>
  tocPageMarkers?: Record<number, string>
  tocLeaderMarkers?: Record<number, string>
  footnoteReferenceScale?: number
  footnoteReferenceGap?: number
  footnoteReferenceVerticalOffset?: number
  footnoteReferenceLook?: FootnoteReferenceLook
  footnoteAlignment?: 'right' | 'center'
  footnotes?: FootnotePlacement[]
  footnoteHeight: number
  footnoteAreaX?: number
  footnoteAreaWidth?: number
  footnoteDividerGap?: number
  footnoteDividerWidth?: number
  footnoteDividerThickness?: number
  footnoteDividerAlignment?: 'right' | 'center' | 'left'
  footnoteDividerHeading?: { text: string; height: number; style: TextStyle; showLines: boolean; decoration: FootnoteHeadingDecoration; ornament?: DividerOrnamentImage; ornamentScale?: number; ornamentOffset?: number; gap?: number }
  footnoteNumberGap?: number
  footnoteWidthScale?: number
  footnoteMode?: 'vertical' | 'horizontal'
  footnoteColumns?: 1 | 2
  onFootnoteWidthPreview?: (scale: number | null) => void
  onFootnoteWidthCommit?: (scale: number) => void
  onFootnoteEdit?: (id: string, localOffset: number, fragmentOffset: number) => void
  onFootnoteSelectionStart?: (id: string) => void
  footnoteRequest?: (SelRequest & { noteId: string }) | null
  editingFootnoteOffset?: number | null
  footnoteSelection?: { noteId: string; all: boolean; allNotes?: boolean } | null
  onFootnoteCopyText?: (id: string) => string | null
  editingFootnoteId?: string | null
  editingFootnoteFrameId?: string | null
  onFootnoteTextEdit?: (id: string, from: number, to: number, insert: string) => void
  onFootnoteSelect?: (id: string, from: number, to: number) => void
  onFootnoteSelectAll?: (id: string) => void
  onFootnoteStop?: () => void
  onSelectAllText?: () => void
  onSelectToStartText?: (frameId: string, localOffset: number) => void
  request: SelRequest | null
  /** the workspace's selection in this frame's text, kept when the editor is rebuilt (see RichEditor's `selectionHint`) */
  selectionHint?: [number, number] | null
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void
  onDoubleClick: () => void
  onHandleDown: (handle: HandleId, e: ReactPointerEvent<HTMLDivElement>) => void
  onRotateDown: (corner: RotateCorner, e: ReactPointerEvent<HTMLDivElement>) => void
  onOutPortDown: (e: ReactPointerEvent<HTMLDivElement>) => void
  onInPortDown: (e: ReactPointerEvent<HTMLDivElement>) => void
  onEdit: (from: number, to: number, insert: string) => void
  onSelect: (a: number, b: number) => void
  onCopyText: () => string | null
  onCopyFormattedText?: (a: number, b: number) => RichTextClipboard | null
  onPasteFormattedText?: (a: number, b: number, clipboard: RichTextClipboard) => void
  /** objects copied from the page pasted into the text: they become one anchored object; false = not taken */
  onPasteObjects?: (a: number, b: number, data: ClipObjects) => boolean
  /** a double click on an anchored object: its id, and where it is on the screen */
  onAnchorMenu?: (id: string, rect: DOMRect) => void
  onAnchorSelect?: (id: string | null) => void
  onBackspaceAtStart: () => void
  onBackspaceAtParagraphStart?: (offset: number) => boolean
  onStopEditing: () => void
  onLineBoundary?: (dir: 1 | -1, x: number, toStart?: boolean) => void
  onDragOutside?: (clientX: number, clientY: number, anchor: number) => void
}

/** Text as read-only spans, with an optional highlighted range. */
function RichText({
  text,
  runs,
  scale,
  highlight,
  floats,
  showMarks,
  paraGaps,
  startParaIndex,
  atParaStart,
  firstLineIndent,
  baseAlign,
  baseDirection,
  continuesParagraphAtEnd,
  paragraphPatches,
  baseFontSize,
  baseLeading,
  footnoteMarkers,
  tocPageMarkers,
  tocLeaderMarkers,
  footnoteReferenceScale,
  footnoteReferenceGap,
  footnoteReferenceVerticalOffset,
  footnoteReferenceLook,
}: {
  text: string
  runs: Run[]
  scale: number
  highlight: [number, number] | null
  floats: WrapFloat[]
  showMarks: boolean
  paraGaps: (number | undefined)[]
  startParaIndex: number
  atParaStart: boolean
  firstLineIndent: (paragraphIndex: number) => number
  baseAlign: TextStyle['align']
  baseDirection?: TextDirection
  continuesParagraphAtEnd: boolean
  paragraphPatches?: ParagraphPatch[]
  baseFontSize: number
  baseLeading: number
  footnoteMarkers?: Record<number, string>
  tocPageMarkers?: Record<number, string>
  tocLeaderMarkers?: Record<number, string>
  footnoteReferenceScale: number
  footnoteReferenceGap: number
  footnoteReferenceVerticalOffset: number
  footnoteReferenceLook?: FootnoteReferenceLook
}) {
  const parts: { key: string; text: string; run: Run; hl: boolean }[] = []
  let pos = 0
  for (const run of runs) {
    const end = pos + run.len
    // split the run at the highlight edges
    const cuts = [pos, end]
    if (highlight) for (const c of highlight) if (c > pos && c < end) cuts.push(c)
    for (let breakAt = text.indexOf('\n', pos); breakAt >= 0 && breakAt + 1 < end; breakAt = text.indexOf('\n', breakAt + 1)) cuts.push(breakAt + 1)
    cuts.sort((a, b) => a - b)
    for (let i = 0; i + 1 < cuts.length; i++) {
      const [s, e] = [cuts[i], cuts[i + 1]]
      parts.push({ key: `${s}`, text: text.slice(s, e), run, hl: !!highlight && s >= highlight[0] && e <= highlight[1] })
    }
    pos = end
  }
  if (text.includes(TOC_PAGE_MARKER)) {
    const renderRange = (from: number, to: number, paraIndex: number): ReactNode[] => parts.flatMap((part) => {
      const partStart = Number(part.key)
      const segmentStart = Math.max(from, partStart)
      const segmentEnd = Math.min(to, partStart + part.text.length)
      if (segmentStart >= segmentEnd) return []
      const segment = part.text.slice(segmentStart - partStart, segmentEnd - partStart)
      const referenceStyle = styleAtChar(runs, Math.max(0, segmentStart - 1), part.run.style)
      const { nodes } = withMarks(segment, showMarks, paraGaps, paraIndex, true, true, (index) => paragraphPatches?.[index]?.firstLineIndent ?? firstLineIndent(index), scale, footnoteMarkers, tocPageMarkers, tocLeaderMarkers, referenceStyle.fontSize * scale * footnoteReferenceScale, footnoteReferenceGap, footnoteReferenceVerticalOffset, segmentStart, referenceStyle, footnoteReferenceLook)
      return [<span key={`toc-title-run-${segmentStart}`} className={part.hl ? 'sel' : 'toc-title-run'} style={{ fontFamily: `"${part.run.style.fontFamily}", "Segoe UI", Arial, sans-serif`, color: part.run.style.color ?? '#111', fontSize: part.run.style.fontSize * scale, fontWeight: part.run.style.weight, fontStyle: part.run.style.italic ? 'italic' : 'normal', letterSpacing: part.run.style.tracking ? `${(part.run.style.tracking / 1000) * part.run.style.fontSize * scale}px` : undefined, textShadow: textShadow(part.run.style, scale) || undefined }}>{nodes}</span>]
    })
    const rows: ReactNode[] = []
    let lineStart = 0
    let rowIndex = 0
    while (lineStart < text.length) {
      const newlineAt = text.indexOf('\n', lineStart)
      const lineEnd = newlineAt < 0 ? text.length : newlineAt
      const pageAt = text.indexOf(TOC_PAGE_MARKER, lineStart)
      const pageOffset = pageAt >= 0 && pageAt < lineEnd ? pageAt : -1
      const leaderAt = pageOffset >= 0 ? text.lastIndexOf(TOC_LEADER_MARKER, pageOffset) : -1
      const tabAt = leaderAt >= lineStart ? text.lastIndexOf('\t', leaderAt) : -1
      const titleEnd = tabAt >= lineStart ? tabAt : lineEnd
      const paragraph = startParaIndex + rowIndex
      const patch = paragraphPatches?.[paragraph]
      const indent = patch?.firstLineIndent ?? firstLineIndent(paragraph)
      const gapsBefore = paraGaps[paragraph - 1] ?? 0
      const rowStyle: CSSProperties = {
        ...(patch?.align ? cssTextAlign(patch.align) : {}),
        lineHeight: patch?.leading ? `${patch.leading * scale}px` : undefined,
        paddingTop: gapsBefore ? `${gapsBefore * scale}px` : undefined,
        ...paragraphSidePadding(patch, scale, baseDirection),
        ...(patch?.direction ? { direction: cssTextDirection(patch.direction).direction } : {}),
        textIndent: patch?.secondLineIndent ? `${-patch.secondLineIndent * scale}px` : undefined,
        boxSizing: 'border-box',
      }
      if (pageOffset >= 0 && leaderAt >= lineStart) {
        rows.push(
          <div key={`toc-row-${rowIndex}`} className="toc-row" dir={cssTextDirection(patch?.direction ?? baseDirection).direction} style={rowStyle}>
            {indent > 0 && <span className="para-indent" aria-hidden="true" style={{ width: indent * scale }} />}
            <span className="toc-title">{renderRange(lineStart, titleEnd, paragraph)}</span>
            <span className="toc-tab" aria-hidden="true">{'\t'}</span>
            <span className="toc-leader" data-leader={tocLeaderMarkers?.[leaderAt] ?? '.'.repeat(128)} style={{ '--toc-reference-size': `${baseFontSize * scale}px` } as CSSProperties}>{TOC_LEADER_MARKER}</span>
            <span className="toc-page-reference" data-reference={tocPageMarkers?.[pageOffset] ?? '8888'} style={{ '--toc-reference-size': `${baseFontSize * scale}px` } as CSSProperties}>{TOC_PAGE_MARKER}</span>
            {newlineAt >= 0 && <span className="toc-line-break" aria-hidden="true">{'\n'}</span>}
          </div>,
        )
      } else rows.push(<div key={`toc-row-${rowIndex}`} style={rowStyle}>{renderRange(lineStart, lineEnd, paragraph)}{newlineAt >= 0 ? '\n' : ''}</div>)
      lineStart = newlineAt < 0 ? text.length : newlineAt + 1
      rowIndex++
    }
    return <>{floats.map((float, index) => <div key={`float${index}`} className="wrap-float" style={{ float: float.side, width: float.width * scale, height: float.height * scale, shapeOutside: shapeOf(float, scale) }} />)}{rows}</>
  }
  // a running paragraph counter across every part, in order, so a "\n" right at a run/highlight boundary is still
  // only counted once and still gets the right entry of `paraGaps`
  const paragraphNodes: { index: number; nodes: ReactNode[]; sizes: Map<number, number>; opening: number }[] = []
  const tocParagraphs = new Set(text.split('\n').flatMap((line, index) => line.includes(TOC_PAGE_MARKER) ? [startParaIndex + index] : []))
  let renderParaIndex = startParaIndex
  // the spacers closing the previous paragraph, waiting to open the next one (see withMarks)
  let carry: ReactNode[] = []
  for (const [i, part] of parts.entries()) {
    const referenceStyle = styleAtChar(runs, Math.max(0, Number(part.key) - 1), part.run.style)
    const { nodes: rendered, trailing } = withMarks(part.text, showMarks, paraGaps, renderParaIndex, i === 0 && atParaStart, i === parts.length - 1, (index) => paragraphPatches?.[index]?.firstLineIndent ?? firstLineIndent(index), scale, footnoteMarkers, tocPageMarkers, tocLeaderMarkers, referenceStyle.fontSize * scale * footnoteReferenceScale, footnoteReferenceGap, footnoteReferenceVerticalOffset, Number(part.key), referenceStyle, footnoteReferenceLook)
    let group = paragraphNodes[paragraphNodes.length - 1]
    let opening: ReactNode[] = []
    if (!group || group.index !== renderParaIndex) {
      group = { index: renderParaIndex, nodes: [], sizes: new Map(), opening: part.run.style.fontSize * scale }
      paragraphNodes.push(group)
      opening = carry
    }
    carry = trailing
    // the sizes the paragraph is set in, for the height of its first lines (a window's band lies on its second)
    group.sizes.set(part.run.style.fontSize * scale, (group.sizes.get(part.run.style.fontSize * scale) ?? 0) + part.text.length)
    const anchored = isAnchorRun(part.run.style, part.text)
    const partStyle: CSSProperties = {
      fontFamily: `"${part.run.style.fontFamily}", "Segoe UI", Arial, sans-serif`,
      color: part.run.style.color ?? '#111',
      fontSize: part.run.style.fontSize * scale,
      fontWeight: part.run.style.weight,
      fontStyle: part.run.style.italic ? 'italic' : 'normal',
      letterSpacing: part.run.style.tracking ? `${(part.run.style.tracking / 1000) * part.run.style.fontSize * scale}px` : undefined,
      textShadow: textShadow(part.run.style, scale) || undefined,
      ...baselineShiftCss(part.run.style, scale),
      ...(anchored ? anchorRunCss(part.run.style, scale) : {}),
    }
    const pageMarkerAt = part.text.indexOf(TOC_PAGE_MARKER)
    const leaderMarkerAt = pageMarkerAt < 0 ? -1 : part.text.lastIndexOf(TOC_LEADER_MARKER, pageMarkerAt)
    const tabAt = leaderMarkerAt < 0 ? -1 : part.text.lastIndexOf('\t', leaderMarkerAt)
    if (pageMarkerAt >= 0 && leaderMarkerAt >= 0 && tabAt >= 0) {
      const title = part.text.slice(0, tabAt)
      const titleNodes = withMarks(title, showMarks, paraGaps, renderParaIndex, i === 0 && atParaStart, i === parts.length - 1, (index) => paragraphPatches?.[index]?.firstLineIndent ?? firstLineIndent(index), scale).nodes
      const pageOffset = Number(part.key) + pageMarkerAt
      const leaderOffset = Number(part.key) + leaderMarkerAt
      group.nodes.push(
        ...opening,
        <span key={`${part.key}-toc-title`} className="toc-title" style={partStyle}>{titleNodes}</span>,
        <span key={`${part.key}-toc-tab`} className="toc-tab" aria-hidden="true">{'\t'}</span>,
        <span key={`${part.key}-toc-leader`} className="toc-leader" data-leader={tocLeaderMarkers?.[leaderOffset] ?? '.'.repeat(128)} style={{ '--toc-reference-size': `${part.run.style.fontSize * scale}px` } as CSSProperties}>{TOC_LEADER_MARKER}</span>,
        <span key={`${part.key}-toc-page`} className="toc-page-reference" data-reference={tocPageMarkers?.[pageOffset] ?? '8888'} style={{ '--toc-reference-size': `${part.run.style.fontSize * scale}px` } as CSSProperties}>{TOC_PAGE_MARKER}</span>,
        ...(part.text.endsWith('\n') ? [<span key={`${part.key}-toc-newline`} className="toc-line-break" aria-hidden="true">{'\n'}</span>] : []),
      )
    } else {
      group.nodes.push(
        <span key={part.key} className={anchored ? (part.hl ? 'sel anchored-object' : 'anchored-object') : part.hl ? 'sel' : undefined} data-anchor-id={anchored ? part.run.style.anchor!.id : undefined} style={partStyle}>
          {opening}
          {rendered}
        </span>,
      )
    }
    renderParaIndex += (part.text.match(/\n/g) ?? []).length
  }
  return (
    <>
      {floats.map((f, i) => (
        <div
          key={`float${i}`}
          className="wrap-float"
          style={{ float: f.side, width: f.width * scale, height: f.height * scale, shapeOutside: shapeOf(f, scale) }}
        />
      ))}
      {paragraphNodes.map((paragraph) => {
        const patch = paragraphPatches?.[paragraph.index]
        const marker = paragraph.index > startParaIndex || atParaStart ? paragraphListMarker(paragraphPatches, paragraph.index) : undefined
        const isJustified = (patch?.align ?? baseAlign) === 'justify' || (patch?.align ?? baseAlign) === 'justifyCenter'
        // the same sum as document.ts's wordSpacingPt: the wanted spacing, and for a justified paragraph its minimum / maximum on top
        const spacingPercent = (patch?.wordSpacing ?? 100) - 100 + (isJustified ? (((patch?.wordSpacingMin ?? 90) + (patch?.wordSpacingMax ?? 120)) / 2 - 100) : 0)
        const wordSpacing = patch && (patch.wordSpacingMin !== undefined || patch.wordSpacingMax !== undefined || patch.wordSpacing !== undefined) ? `${(spacingPercent * 0.25 * baseFontSize) / 100}px` : undefined
        const continues = continuesParagraphAtEnd && paragraph === paragraphNodes[paragraphNodes.length - 1] && (patch?.align ?? baseAlign) === 'justify'
        // the same rule as richtext.ts's buildParagraphNodes: a window only opens a paragraph that starts here, and the
        // spacer closing the previous paragraph sits on its first line (so the floated band starts that much lower)
        const windowWidth = patch?.windowIndent && (paragraph.index > startParaIndex || atParaStart) ? patch.windowIndent * scale : 0
        const windowGap = paragraph.index > startParaIndex ? (paraGaps[paragraph.index - 1] ?? 0) * scale : 0
        const windowFonts: WindowFonts | undefined = windowWidth && paragraph.sizes.size > 0 ? { opening: paragraph.opening, main: [...paragraph.sizes.entries()].sort((a, b) => b[1] - a[1])[0][0] } : undefined
        const markerOffset = marker ? paragraphListMarkerOffset(windowGap + (patch?.leading ?? baseLeading) * scale, patch?.leading ?? baseLeading, scale) : 0
        // the marker has the size of the text of its paragraph (the frame's own size can be smaller than a style's), so it lies level with the line
        const markerSize = marker && paragraph.sizes.size > 0 ? [...paragraph.sizes.entries()].sort((a, b) => b[1] - a[1])[0][0] : undefined
        const decoration = patch?.decoration
        const decoWanted = decoration && !marker && (decoration.position === 'below' ? paragraph.index < startParaIndex + (text.match(/\n/g) ?? []).length : decoration.position === 'above' ? paragraph.index > startParaIndex || atParaStart : true)
        const decoVars = decoration && decoWanted ? decorationVars(decoration, scale, { align: patch?.align ?? baseAlign, gapBefore: paragraph.index > startParaIndex ? paraGaps[paragraph.index - 1] ?? 0 : 0 }) : null
        const listMarkerStyle = marker ? { '--list-marker-offset': `${markerOffset}px`, ...(markerSize ? { fontSize: `${markerSize}px` } : {}) } as CSSProperties : {}
        return <div key={`paragraph-${paragraph.index}`} className={[tocParagraphs.has(paragraph.index) ? 'toc-row' : marker ? 'paragraph-list-item' : '', decoVars ? decorationClass(decoration) : ''].filter(Boolean).join(' ') || undefined} data-list-marker={marker} style={{ ...listMarkerStyle, ...(decoVars as CSSProperties | null ?? {}), ...(patch?.align ? cssTextAlign(patch.align) : {}), ...(patch?.direction ? { direction: cssTextDirection(patch.direction).direction, ...(cssTextDirection(patch.direction).unicodeBidi === 'plaintext' ? { unicodeBidi: 'plaintext' as const } : {}) } : {}), ...(continues ? { textAlignLast: 'justify' as const } : {}), lineHeight: patch?.leading ? `${patch.leading * scale}px` : undefined, wordSpacing, ...paragraphSidePadding(patch, scale, baseDirection), ...paragraphBoxStyle(patch, scale), gridTemplateColumns: marker ? `${paragraphListMarkerWidth(marker) * scale}em minmax(0, 1fr)` : undefined, columnGap: marker ? `${(patch?.listGap ?? 4) * scale}px` : undefined, textIndent: patch?.secondLineIndent ? `${-patch.secondLineIndent * scale}px` : undefined, minHeight: windowWidth ? windowBlockMinHeight(windowGap, windowFonts) : undefined, boxSizing: 'border-box' }}>{windowWidth ? <div className="wrap-float" style={windowFloatStyle(windowWidth, windowGap, windowFonts, startSideOf(patch?.direction ?? baseDirection))} /> : null}{marker ? <span className="paragraph-list-content">{paragraph.nodes}</span> : paragraph.nodes}</div>
      })}
    </>
  )
}

/** A right-to-left text frame with its handles and thread ports. */
export function TextFrameView(p: Props) {
  const { frame, style, slice, selected, editing, showEdge, marked, locked } = p
  const footnoteWidthDrag = useRef<{ pointerId: number; startX: number; startY: number; startScale: number; screenScale: number; cos: number; sin: number } | null>(null)
  const resizeWidthBasis = p.footnoteMode === 'vertical' && p.footnoteColumns === 2 ? frame.w / 2 : frame.w
  const footnoteWidthScale = p.footnoteWidthScale ?? 1
  const maskFeather = p.featherOverride ?? frame.feather
  const textFlowBox = textFlowBoxOf(frame)
  const paragraphPatches = p.paragraphPatches ?? frame.paragraphStylePatches
  /** how far the heading's ornaments and lines are moved to be level with the middle of the heading's letters (px, down is positive) */
  const shift = p.footnoteDividerHeading ? letterCenterShift(p.footnoteDividerHeading.style, p.footnoteDividerHeading.height, p.footnoteDividerHeading.text) : 0
  const masterPreview = !editing && (slice.includes(PAGE_NUMBER_MARKER) || slice.includes(INTERNAL_PAGE_NUMBER_MARKER) || slice.includes(EXTERNAL_PAGE_NUMBER_MARKER) || slice.includes(INTERNAL_LETTER_PAGE_NUMBER_MARKER) || slice.includes(LETTER_PAGE_NUMBER_MARKER) || slice.includes(RUNNING_HEADER_MARKER))
  let masterDisplay = { text: slice, runs: p.runs }
  if (masterPreview) {
    masterDisplay = substituteMarker(masterDisplay.text, masterDisplay.runs, PAGE_NUMBER_MARKER, '1')
    masterDisplay = substituteMarker(masterDisplay.text, masterDisplay.runs, INTERNAL_PAGE_NUMBER_MARKER, '1')
    masterDisplay = substituteMarker(masterDisplay.text, masterDisplay.runs, EXTERNAL_PAGE_NUMBER_MARKER, '1')
    masterDisplay = substituteMarker(masterDisplay.text, masterDisplay.runs, INTERNAL_LETTER_PAGE_NUMBER_MARKER, style.direction === 'ltr' ? 'a' : 'א')
    masterDisplay = substituteMarker(masterDisplay.text, masterDisplay.runs, LETTER_PAGE_NUMBER_MARKER, style.direction === 'ltr' ? 'a' : 'א')
    masterDisplay = substituteMarker(masterDisplay.text, masterDisplay.runs, RUNNING_HEADER_MARKER, t('כותרת'))
    masterDisplay.runs = normalizeRuns(masterDisplay.text, masterDisplay.runs, style)
  }
  const hasNext = frame.next !== null
  const showOut = showEdge && (selected || hasNext || p.overflow || p.armed)
  const showIn = showEdge && (selected || p.hasPrev)
  const footnoteWidthAtPointer = (event: ReactPointerEvent<HTMLButtonElement>, drag: NonNullable<typeof footnoteWidthDrag.current>) => {
    const deltaX = event.clientX - drag.startX
    const deltaY = event.clientY - drag.startY
    const localDeltaX = deltaX * drag.cos + deltaY * drag.sin
    return Math.round(Math.max(0.2, Math.min(1, drag.startScale - localDeltaX / (resizeWidthBasis * drag.screenScale))) * 1000) / 1000
  }
  const beginFootnoteWidthDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const radians = (frame.rotation ?? 0) * Math.PI / 180
    const screenScale = p.zoom * (frame.textScale?.x ?? 1)
    if (frame.w <= 0 || screenScale <= 0) return
    footnoteWidthDrag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScale: p.footnoteWidthScale ?? 1,
      screenScale,
      cos: Math.cos(radians),
      sin: Math.sin(radians),
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveFootnoteWidthDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = footnoteWidthDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    p.onFootnoteWidthPreview?.(footnoteWidthAtPointer(event, drag))
  }
  const finishFootnoteWidthDrag = (event: ReactPointerEvent<HTMLButtonElement>, cancel = false) => {
    const drag = footnoteWidthDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    footnoteWidthDrag.current = null
    if (cancel) {
      p.onFootnoteWidthPreview?.(null)
      return
    }
    const scale = footnoteWidthAtPointer(event, drag)
    p.onFootnoteWidthPreview?.(scale)
    p.onFootnoteWidthCommit?.(scale)
  }

  return (
    <div
      className={'text-frame' + (showEdge ? ' edge' : '') + (selected ? ' selected' : '') + (marked ? ' marked' : '') + (locked ? ' locked' : '') + (p.previewFontFamily ? ' font-preview' : '')}
      data-frame-id={frame.id}
      data-object-id={frame.id}
      data-object-kind="frame"
      style={{
        zIndex: p.z,
        ...(p.previewFontFamily ? { '--font-preview-family': `"${p.previewFontFamily.replace(/["\\]/g, '')}", "Segoe UI", Arial, sans-serif` } as CSSProperties : {}),
        left: p.tx + frame.x * p.zoom,
        top: p.ty + frame.y * p.zoom,
        width: frame.w * p.zoom,
        height: frame.h * p.zoom,
        transform: frame.rotation ? `rotate(${frame.rotation}deg)` : undefined,
        mixBlendMode: frame.blendMode,
        pointerEvents: frame.rasterized ? 'none' : undefined,
      }}
      onPointerDown={p.onPointerDown}
      onDoubleClick={p.onDoubleClick}
    >
      {/* text is laid out at a FIXED 1x scale (world points = css px) here and visually scaled as a whole via
       *  `transform`, instead of recomputing every size at `zoom` — the browser's own word-wrap is not perfectly
       *  scale-invariant (font hinting/kerning shift subtly at different pixel sizes), so re-laying-out text at
       *  each zoom level let a paragraph wrap differently than it does at 100%, drifting from what `textLayout.ts`'s
       *  own fixed-scale measurer (used for pagination/overflow) assumed. A pure visual transform can't do that:
       *  it's computed once and never re-triggers line-breaking. Matches how professional DTP tools handle zoom.
       *  Handles/ports stay OUTSIDE this wrapper, on the outer (still zoom-multiplied) box, so their own fixed
       *  on-screen size is untouched by this transform. */}
      <div className="text-frame-clip">
        <div
          className="text-frame-scale"
          style={{
            width: textFlowBox.w,
            height: textFlowBox.h,
            opacity: frame.opacity ?? 1,
            ...(maskFeather ? featherMaskStyles(maskFeather, textFlowBox.w, textFlowBox.h) : {}),
            visibility: frame.rasterized ? 'hidden' : undefined,
            fontSize: style.fontSize,
            fontFamily: `"${style.fontFamily}", "Segoe UI", Arial, sans-serif`,
            lineHeight: `${effectiveLeading(style)}px`,
            ...cssTextAlign(style.align),
            wordSpacing: wordSpacingPt(style) ? `${wordSpacingPt(style)}px` : undefined,
            // paragraph spacing/indents belong to the whole story (like leading/align): spaceBefore only on the frame
            // holding the story's first line, spaceAfter only on the one holding its last (firstLineIndent applies to
            // every paragraph's own first line — see withMarks/richtext.ts's buildRunNodes — not shown as CSS here)
            paddingTop: !p.hasPrev && p.spaceBeforeFirst ? p.spaceBeforeFirst : undefined,
            paddingBottom: (!hasNext ? p.spaceAfterLast : 0) + p.footnoteHeight || undefined,
            '--text-body-top': `${!p.hasPrev ? p.spaceBeforeFirst : 0}px`,
            '--text-body-height': `${Math.max(0, textFlowBox.h - (!p.hasPrev ? p.spaceBeforeFirst : 0) - p.footnoteHeight)}px`,
            // the first line moved down inside the text area (not the area itself: the letters of a tight leading stick out above their line)
            '--text-first-lift': `${p.firstLineLift ?? 0}px`,
            paddingLeft: style.indentLeft || undefined,
            paddingRight: style.indentRight || undefined,
            transform: `scale(${p.zoom * (frame.textScale?.x ?? 1)}, ${p.zoom * (frame.textScale?.y ?? 1)})`,
            transformOrigin: '0 0',
          } as CSSProperties}
        >
      {editing ? (
        <RichEditor
          text={slice}
          runs={p.runs}
          scale={1}
          floats={p.floats}
          showMarks={p.showHidden}
          paraGaps={p.paraGaps}
          startParaIndex={p.startParaIndex}
          atParaStart={p.atParaStart}
          firstLineIndent={style.firstLineIndent ?? 0}
          baseLeading={effectiveLeading(style)}
          paragraphPatches={paragraphPatches}
          baseAlign={style.align}
          baseDirection={style.direction}
          continuesAtEnd={p.continuesParagraphAtEnd}
          storyContinues={p.storyContinues}
          footnoteMarkers={p.footnoteMarkers}
          tocPageMarkers={p.tocPageMarkers}
          tocLeaderMarkers={p.tocLeaderMarkers}
          footnoteReferenceScale={p.footnoteReferenceScale ?? FOOTNOTE_REFERENCE_SCALE}
          footnoteReferenceGap={p.footnoteReferenceGap ?? 0}
          footnoteReferenceVerticalOffset={p.footnoteReferenceVerticalOffset ?? 0}
          footnoteReferenceLook={p.footnoteReferenceLook}
          onSelectAll={p.onSelectAllText}
          onSelectToStart={(offset) => p.onSelectToStartText?.(frame.id, offset)}
          hasPrev={p.hasPrev}
          request={p.request}
          selectionHint={p.selectionHint}
          onEdit={p.onEdit}
          onSelect={p.onSelect}
          onBackspaceAtStart={p.onBackspaceAtStart}
          onBackspaceAtParagraphStart={p.onBackspaceAtParagraphStart}
          onCopyText={p.onCopyText}
          onCopyFormattedText={p.onCopyFormattedText}
          onPasteFormattedText={p.onPasteFormattedText}
          onPasteObjects={p.onPasteObjects}
          onAnchorMenu={p.onAnchorMenu}
          onAnchorSelect={p.onAnchorSelect}
          onStop={p.onStopEditing}
          onLineBoundary={p.onLineBoundary}
          onDragOutside={p.onDragOutside}
        />
      ) : (
        <div className="text-frame-body" dir={cssTextDirection(style.direction).direction} style={cssTextDirection(style.direction).unicodeBidi === 'plaintext' ? { unicodeBidi: 'plaintext' } : undefined}>
          <RichText
            text={masterDisplay.text}
            runs={masterDisplay.runs}
            scale={1}
            highlight={p.highlight}
            floats={p.floats}
            showMarks={p.showHidden}
            paraGaps={p.paraGaps}
            startParaIndex={p.startParaIndex}
            atParaStart={p.atParaStart}
            footnoteMarkers={p.footnoteMarkers}
            tocPageMarkers={p.tocPageMarkers}
            tocLeaderMarkers={p.tocLeaderMarkers}
            footnoteReferenceScale={p.footnoteReferenceScale ?? FOOTNOTE_REFERENCE_SCALE}
            footnoteReferenceGap={p.footnoteReferenceGap ?? 0}
            footnoteReferenceVerticalOffset={p.footnoteReferenceVerticalOffset ?? 0}
            footnoteReferenceLook={p.footnoteReferenceLook}
            firstLineIndent={(index) => paragraphPatches?.[index]?.firstLineIndent ?? style.firstLineIndent ?? 0}
            paragraphPatches={paragraphPatches}
            baseFontSize={style.fontSize}
            baseLeading={effectiveLeading(style)}
            baseAlign={style.align}
            baseDirection={style.direction}
            continuesParagraphAtEnd={p.continuesParagraphAtEnd}
          />
        </div>
      )}
        </div>
        {!!p.footnotes?.length && (
          <div className="footnotes-scale" style={{ width: textFlowBox.w, height: textFlowBox.h, fontFamily: style.fontFamily, fontSize: `${style.fontSize}px`, fontWeight: style.weight, fontStyle: style.italic ? 'italic' : 'normal', lineHeight: `${effectiveLeading(style)}px`, transform: `scale(${p.zoom * (frame.textScale?.x ?? 1)}, ${p.zoom * (frame.textScale?.y ?? 1)})` }}>
          <div className="footnotes-area" dir={cssTextDirection(style.direction).direction} style={{ direction: cssTextDirection(style.direction).direction, bottom: 0, right: p.footnoteAreaX === undefined ? 0 : 'auto', left: p.footnoteAreaX ?? 'auto', width: p.footnoteAreaWidth ?? textFlowBox.w, height: p.footnoteHeight, '--footnote-number-gap': `${p.footnoteNumberGap ?? 5}px` } as CSSProperties}>
            {p.footnoteDividerHeading ? (
              <div
                className="footnote-divider-heading"
                dir="rtl"
                style={{
                  top: p.footnoteDividerGap ?? 0,
                  // the width that is set is the least the heading has: a longer text (a big font) and its ornaments widen it, up to the whole width
                  width: 'max-content',
                  minWidth: `${p.footnoteDividerWidth ?? 35}%`,
                  maxWidth: '100%',
                  height: p.footnoteDividerHeading.height,
                  // an ornament may be taller than the line of the heading's text
                  overflow: p.footnoteDividerHeading.showLines && isOrnamentDecoration(p.footnoteDividerHeading.decoration) ? 'visible' : undefined,
                  justifyContent: 'center',
                  left: '50%',
                  right: 'auto',
                  transform: 'translateX(-50%)',
                  gap: p.footnoteDividerHeading.showLines ? `${p.footnoteDividerHeading.gap ?? Math.max(6, p.footnoteDividerHeading.style.fontSize * 0.4)}px` : '0',
                  color: p.footnoteDividerHeading.style.color ?? '#111111',
                  fontFamily: p.footnoteDividerHeading.style.fontFamily,
                  fontSize: `${p.footnoteDividerHeading.style.fontSize}px`,
                  fontWeight: p.footnoteDividerHeading.style.weight,
                  fontStyle: p.footnoteDividerHeading.style.italic ? 'italic' : 'normal',
                  lineHeight: `${p.footnoteDividerHeading.height}px`,
                  letterSpacing: p.footnoteDividerHeading.style.tracking ? `${(p.footnoteDividerHeading.style.tracking / 1000) * p.footnoteDividerHeading.style.fontSize}px` : undefined,
                }}
              >
                {p.footnoteDividerHeading.showLines && isOrnamentDecoration(p.footnoteDividerHeading.decoration) && (
                  <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: ornamentSideMarkup({ decoration: p.footnoteDividerHeading.decoration, side: 'right', color: p.footnoteDividerHeading.style.color ?? '#111111', thickness: p.footnoteDividerThickness ?? 1, height: p.footnoteDividerHeading.height, shift: shift - (p.footnoteDividerHeading.ornamentOffset ?? 0), fontSize: p.footnoteDividerHeading.style.fontSize, scale: (p.footnoteDividerHeading.ornamentScale ?? 100) / 100, custom: p.footnoteDividerHeading.ornament }) }} />
                )}
                {p.footnoteDividerHeading.showLines && !isOrnamentDecoration(p.footnoteDividerHeading.decoration) && (p.footnoteDividerHeading.decoration === 'needle'
                  ? <span className="footnote-divider-heading-line side-right decor-needle" aria-hidden="true" style={{ borderTopWidth: 0, height: `${Math.max(1, p.footnoteDividerThickness ?? 1)}px`, top: shift }} />
                  : <span className={`footnote-divider-heading-line side-right decor-${p.footnoteDividerHeading.decoration}`} aria-hidden="true" style={{ borderTopWidth: `${p.footnoteDividerThickness ?? 1}px`, top: shift }} />)}
                <span className="footnote-divider-heading-text">{p.footnoteDividerHeading.text}</span>
                {p.footnoteDividerHeading.showLines && isOrnamentDecoration(p.footnoteDividerHeading.decoration) && (
                  <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: ornamentSideMarkup({ decoration: p.footnoteDividerHeading.decoration, side: 'left', color: p.footnoteDividerHeading.style.color ?? '#111111', thickness: p.footnoteDividerThickness ?? 1, height: p.footnoteDividerHeading.height, shift: shift - (p.footnoteDividerHeading.ornamentOffset ?? 0), fontSize: p.footnoteDividerHeading.style.fontSize, scale: (p.footnoteDividerHeading.ornamentScale ?? 100) / 100, custom: p.footnoteDividerHeading.ornament }) }} />
                )}
                {p.footnoteDividerHeading.showLines && !isOrnamentDecoration(p.footnoteDividerHeading.decoration) && (p.footnoteDividerHeading.decoration === 'needle'
                  ? <span className="footnote-divider-heading-line side-left decor-needle" aria-hidden="true" style={{ borderTopWidth: 0, height: `${Math.max(1, p.footnoteDividerThickness ?? 1)}px`, top: shift }} />
                  : <span className={`footnote-divider-heading-line side-left decor-${p.footnoteDividerHeading.decoration}`} aria-hidden="true" style={{ borderTopWidth: `${p.footnoteDividerThickness ?? 1}px`, top: shift }} />)}
              </div>
            ) : (
              <div className="footnote-divider" style={{
                top: p.footnoteDividerGap ?? 0,
                width: `${p.footnoteDividerWidth ?? 35}%`,
                borderTop: `${p.footnoteDividerThickness ?? 1}px solid currentColor`,
                left: p.footnoteDividerAlignment === 'left' ? 0 : p.footnoteDividerAlignment === 'center' ? '50%' : 'auto',
                right: p.footnoteDividerAlignment === 'right' ? 0 : 'auto',
                transform: p.footnoteDividerAlignment === 'center' ? 'translateX(-50%)' : 'none',
              }} />
            )}
            {!!p.editingFootnoteId && p.editingFootnoteFrameId === frame.id && showEdge && (
              <button
                type="button"
                className="footnote-width-handle"
                title={t('גרירה לצמצום או להרחבת כל מסגרות הערות השוליים')}
                aria-label={t('רוחב כל מסגרות הערות השוליים')}
                style={{ left: `${frame.w - footnoteBlockWidth(resizeWidthBasis, footnoteWidthScale)}px` }}
                onPointerDown={beginFootnoteWidthDrag}
                onPointerMove={moveFootnoteWidthDrag}
                onPointerUp={finishFootnoteWidthDrag}
                onPointerCancel={(event) => finishFootnoteWidthDrag(event, true)}
              />
            )}
            {p.footnotes.map((note) => {
              const noteStyle = note.style ?? style
              const fragmentOffset = note.offset ?? 0
              const isEditingFootnote = p.editingFootnoteId === note.id && p.editingFootnoteFrameId === frame.id && p.editingFootnoteOffset === fragmentOffset
              const showFootnoteFrame = !!p.editingFootnoteId && p.editingFootnoteFrameId === frame.id && showEdge
              const selectedFootnoteText = !!p.footnoteSelection?.allNotes || (p.footnoteSelection?.noteId === note.id && p.footnoteSelection.all)
              const referenceLabel = String(note.referenceNumber)
              let offset = 0
              const content = note.runs?.length
                ? note.runs.map((run, index) => {
                    const text = note.content.slice(offset, offset + run.len)
                    offset += run.len
                    return <span key={index} style={{ fontFamily: run.style.fontFamily, fontSize: `${run.style.fontSize}px`, fontWeight: run.style.weight, fontStyle: run.style.italic ? 'italic' : 'normal', color: run.style.color ?? noteStyle.color, letterSpacing: run.style.tracking ? `${(run.style.tracking / 1000) * run.style.fontSize}px` : undefined, textShadow: textShadow(run.style, 1) || undefined, ...baselineShiftCss(run.style, 1) }}>{text}</span>
                  })
                : note.content
              return (
                <div
                  key={`${note.id}:${fragmentOffset}`}
                  className={'footnote-item' + (showFootnoteFrame ? ' footnote-frame-visible' : '') + (p.footnoteSelection?.allNotes ? ' footnote-all-selected' : '')}
                  data-footnote-frame-id={note.id}
                  title={t('לחיצה לעריכת הערת השוליים')}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    if (event.button === 0) p.onFootnoteSelectionStart?.(note.id)
                    if (isEditingFootnote || event.button !== 0) return
                    // the editor only exists once edit mode is entered, so a drag that starts on the still-static text
                    // would show no selection until release: enter edit mode on the press itself (caret at the press
                    // point), then drive the selection by hand for as long as the button stays down - the preventDefault
                    // keeps the browser from starting its own selection on the static text meanwhile
                    event.preventDefault()
                    const item = event.currentTarget
                    const contentRoot = item.querySelector<HTMLElement>('.footnote-content')
                    const onNumber = event.target instanceof Element && !!event.target.closest('.footnote-number')
                    const anchor = onNumber ? 0 : caretOffsetAt(event.clientX, event.clientY, contentRoot) ?? 0
                    p.onFootnoteEdit?.(note.id, anchor, fragmentOffset)
                    if (onNumber) return
                    // false while the editor has not mounted yet (it appears after the render the press just caused)
                    const extend = (clientX: number, clientY: number) => {
                      const editor = item.querySelector<HTMLElement>('.rich-editor')
                      if (!editor) return false
                      const box = editor.getBoundingClientRect()
                      const inside = caretOffsetAt(clientX, clientY, editor)
                      const head = inside ?? (clientY > box.bottom ? note.content.length : clientY < box.top ? 0 : anchor)
                      setSelectionIn(editor, Math.min(anchor, head), Math.max(anchor, head))
                      return true
                    }
                    const stop = () => {
                      window.removeEventListener('pointermove', move)
                      window.removeEventListener('pointerup', up)
                      window.removeEventListener('pointercancel', stop)
                    }
                    const move = (e: PointerEvent) => {
                      if (!(e.buttons & 1)) return stop()
                      extend(e.clientX, e.clientY)
                    }
                    const up = (e: PointerEvent) => {
                      stop()
                      let tries = 0
                      const settle = () => { if (!extend(e.clientX, e.clientY) && tries++ < 10) requestAnimationFrame(settle) }
                      settle()
                    }
                    window.addEventListener('pointermove', move)
                    window.addEventListener('pointerup', up)
                    window.addEventListener('pointercancel', stop)
                  }}
                  onClick={(event) => event.stopPropagation()}
                  style={{ left: `${style.direction === 'ltr' ? note.x : (p.footnoteAreaWidth ?? frame.w) - note.x - note.width}px`, top: `${note.y}px`, width: `${note.width}px`, height: `${note.height}px`, fontFamily: noteStyle.fontFamily, fontSize: `${noteStyle.fontSize}px`, fontWeight: noteStyle.weight, fontStyle: noteStyle.italic ? 'italic' : 'normal', lineHeight: `${effectiveLeading(noteStyle)}px`, wordSpacing: wordSpacingPt(noteStyle) ? `${wordSpacingPt(noteStyle)}px` : undefined, color: noteStyle.color ?? '#111', textShadow: note.runs?.length ? undefined : textShadow(noteStyle, 1) || undefined, ...cssTextAlign(noteStyle.align) }}
                >
                  {!note.continued && (
                    <span className="footnote-number" dir="rtl" style={{ fontSize: `${noteStyle.fontSize}px` }}>
                      {footnoteLabelParts(referenceLabel).map((part, index) => <span key={index} dir={part.direction}>{part.text}</span>)}
                    </span>
                  )}
                  {isEditingFootnote ? (
                    <RichEditor
                      text={note.content}
                      runs={normalizeRuns(note.content, note.runs, noteStyle)}
                      scale={1}
                      floats={[]}
                      hasPrev={false}
                      request={p.footnoteRequest?.noteId === note.id ? p.footnoteRequest : null}
                      onEdit={(from, to, insert) => p.onFootnoteTextEdit?.(note.id, (note.offset ?? 0) + from, (note.offset ?? 0) + to, insert)}
                      onSelect={(from, to) => p.onFootnoteSelect?.(note.id, (note.offset ?? 0) + from, (note.offset ?? 0) + to)}
                      onSelectAll={() => p.onFootnoteSelectAll?.(note.id)}
                      onSelectionStart={() => p.onFootnoteSelectionStart?.(note.id)}
                      onBackspaceAtStart={() => {}}
                      onCopyText={() => p.onFootnoteCopyText?.(note.id) ?? null}
                      onStop={() => p.onFootnoteStop?.()}
                    />
                  ) : <span className={'footnote-content' + (selectedFootnoteText ? ' selected' : '')}>{content}</span>}
                </div>
              )
            })}
          </div>
          </div>
        )}
      </div>

      {showIn && (
        <div
          className={'port port-in' + (p.hasPrev ? ' linked' : '')}
          title={p.hasPrev ? t('נתק מהתיבה הקודמת') : t('כניסת טקסט')}
          onPointerDown={p.onInPortDown}
        >
          {p.hasPrev && '‹'}
        </div>
      )}
      {showOut && (
        <div
          className={'port port-out' + (hasNext ? ' linked' : '') + (p.overflow ? ' overflow' : '') + (p.armed ? ' armed' : '')}
          title={p.overflow ? t('יש טקסט שלא נכנס — לחץ וחבר לתיבה נוספת') : hasNext ? t('הטקסט ממשיך בתיבה הבאה') : t('לחץ כדי לחבר לתיבה נוספת')}
          onPointerDown={p.onOutPortDown}
        >
          {p.overflow ? '+' : hasNext ? '‹' : ''}
        </div>
      )}

      {selected && showEdge && HANDLES.map((h) => <div key={h} className={'handle ' + h} onPointerDown={(e) => p.onHandleDown(h, e)} />)}
      {selected && showEdge && ROTATE_CORNERS.map((c) => <div key={c} className={'rotate-handle ' + c} title={t('גרור כדי לסובב (Shift: קפיצות של 45°)')} onPointerDown={(e) => p.onRotateDown(c, e)} />)}
    </div>
  )
}
