import type { CSSProperties, ReactNode, PointerEvent as ReactPointerEvent } from 'react'
import { cssTextAlign, defaultLeading, EXTERNAL_PAGE_NUMBER_MARKER, FOOTNOTE_MARKER, FOOTNOTE_REFERENCE_SCALE, INTERNAL_LETTER_PAGE_NUMBER_MARKER, INTERNAL_PAGE_NUMBER_MARKER, LETTER_PAGE_NUMBER_MARKER, PAGE_NUMBER_MARKER, RUNNING_HEADER_MARKER, wordSpacingPt, type Run, type TextFrame, type TextStyle } from '../document'
import { HANDLES, ROTATE_CORNERS, type HandleId, type RotateCorner } from '../frames'
import { caretOffsetAt, splitMarks } from '../richtext'
import { substituteMarker } from '../numbering'
import { normalizeRuns } from '../story'
import { shapeOf, type WrapFloat } from '../wrap'
import { RichEditor, type SelRequest } from './RichEditor'
import type { FootnotePlacement } from '../footnoteLayout'

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
  referenceFontSize = 9,
  textOffset = 0,
): { nodes: ReactNode[]; trailing: ReactNode[] } {
  if (!showMarks && paraGaps.length === 0 && !firstLineIndent(startParaIndex) && !footnoteMarkers) return { nodes: [text], trailing: [] }
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
        const reference = footnoteMarkers?.[textOffset + offset + index]
        if (piece.text[index] !== FOOTNOTE_MARKER || !reference) continue
        if (index > plainStart) nodes.push(piece.text.slice(plainStart, index))
        nodes.push(<span key={`footnote-${textOffset + offset + index}`} className="footnote-reference" data-reference={reference} dir={/[\u0590-\u05ff]/.test(reference) ? 'rtl' : 'ltr'} style={{ '--footnote-marker-size': `${referenceFontSize}px` } as CSSProperties}>{FOOTNOTE_MARKER}</span>)
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
      if (gapValue && !atEnd) spacers.push(<span key={`${i}g`} className="para-gap" contentEditable={false} style={{ height: gapValue * scale }} />)
      if (firstLineIndent(idx) && !atEnd) spacers.push(<span key={`${i}i`} className="para-indent" contentEditable={false} style={{ width: firstLineIndent(idx) * scale }} />)
    }
    offset += piece.text.length
  }
  return { nodes, trailing }
}

interface Props {
  frame: TextFrame
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
  paragraphPatches?: Partial<Pick<TextStyle, 'leading' | 'wordSpacingMin' | 'wordSpacingMax' | 'firstLineIndent' | 'indentLeft' | 'indentRight' | 'align'>>[]
  /** resolved space above the story's first line / below its last (document.ts's frameSpaceBefore/frameSpaceAfter) */
  spaceBeforeFirst: number
  spaceAfterLast: number
  footnoteMarkers?: Record<number, string>
  footnoteReferenceScale?: number
  footnoteAlignment?: 'right' | 'center'
  footnotes?: FootnotePlacement[]
  footnoteHeight: number
  footnoteDividerGap?: number
  footnoteNumberGap?: number
  onFootnoteEdit?: (id: string, localOffset: number, fragmentOffset: number) => void
  footnoteRequest?: (SelRequest & { noteId: string }) | null
  editingFootnoteOffset?: number | null
  footnoteSelection?: { noteId: string; all: boolean } | null
  onFootnoteCopyText?: (id: string) => string | null
  editingFootnoteId?: string | null
  editingFootnoteFrameId?: string | null
  onFootnoteTextEdit?: (id: string, from: number, to: number, insert: string) => void
  onFootnoteSelect?: (id: string, from: number, to: number) => void
  onFootnoteSelectAll?: (id: string) => void
  onFootnoteStop?: () => void
  onSelectAllText?: () => void
  request: SelRequest | null
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void
  onDoubleClick: () => void
  onHandleDown: (handle: HandleId, e: ReactPointerEvent<HTMLDivElement>) => void
  onRotateDown: (corner: RotateCorner, e: ReactPointerEvent<HTMLDivElement>) => void
  onOutPortDown: (e: ReactPointerEvent<HTMLDivElement>) => void
  onInPortDown: (e: ReactPointerEvent<HTMLDivElement>) => void
  onEdit: (from: number, to: number, insert: string) => void
  onSelect: (a: number, b: number) => void
  onCopyText: () => string | null
  onBackspaceAtStart: () => void
  onStopEditing: () => void
  onLineBoundary?: (dir: 1 | -1, x: number) => void
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
  continuesParagraphAtEnd,
  paragraphPatches,
  baseFontSize,
  footnoteMarkers,
  footnoteReferenceScale,
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
  continuesParagraphAtEnd: boolean
  paragraphPatches?: Partial<Pick<TextStyle, 'leading' | 'wordSpacingMin' | 'wordSpacingMax' | 'firstLineIndent' | 'indentLeft' | 'indentRight' | 'align'>>[]
  baseFontSize: number
  footnoteMarkers?: Record<number, string>
  footnoteReferenceScale: number
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
  // a running paragraph counter across every part, in order, so a "\n" right at a run/highlight boundary is still
  // only counted once and still gets the right entry of `paraGaps`
  const paragraphNodes: { index: number; nodes: ReactNode[] }[] = []
  let renderParaIndex = startParaIndex
  // the spacers closing the previous paragraph, waiting to open the next one (see withMarks)
  let carry: ReactNode[] = []
  for (const [i, part] of parts.entries()) {
    const { nodes: rendered, trailing } = withMarks(part.text, showMarks, paraGaps, renderParaIndex, i === 0 && atParaStart, i === parts.length - 1, (index) => paragraphPatches?.[index]?.firstLineIndent ?? firstLineIndent(index), scale, footnoteMarkers, part.run.style.fontSize * scale * footnoteReferenceScale, Number(part.key))
    let group = paragraphNodes[paragraphNodes.length - 1]
    let opening: ReactNode[] = []
    if (!group || group.index !== renderParaIndex) {
      group = { index: renderParaIndex, nodes: [] }
      paragraphNodes.push(group)
      opening = carry
    }
    carry = trailing
    group.nodes.push(
      <span
        key={part.key}
        className={part.hl ? 'sel' : undefined}
        style={{
          fontFamily: `"${part.run.style.fontFamily}", "Segoe UI", Arial, sans-serif`,
          color: part.run.style.color ?? '#111',
          fontSize: part.run.style.fontSize * scale,
          fontWeight: part.run.style.weight,
          fontStyle: part.run.style.italic ? 'italic' : 'normal',
          letterSpacing: part.run.style.tracking ? `${(part.run.style.tracking / 1000) * part.run.style.fontSize * scale}px` : undefined,
        }}
      >
        {opening}
        {rendered}
      </span>,
    )
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
        const wordSpacing = patch?.wordSpacingMin !== undefined || patch?.wordSpacingMax !== undefined ? `${((((patch.wordSpacingMin ?? 90) + (patch.wordSpacingMax ?? 120)) / 2 - 100) * 0.25 * baseFontSize) / 100}px` : undefined
        const continues = continuesParagraphAtEnd && paragraph === paragraphNodes[paragraphNodes.length - 1] && (patch?.align ?? baseAlign) === 'justify'
        return <div key={`paragraph-${paragraph.index}`} style={{ ...(patch?.align ? cssTextAlign(patch.align) : {}), ...(continues ? { textAlignLast: 'justify' as const } : {}), lineHeight: patch?.leading ? `${patch.leading * scale}px` : undefined, wordSpacing, paddingLeft: patch?.indentLeft ? `${patch.indentLeft * scale}px` : undefined, paddingRight: patch?.indentRight ? `${patch.indentRight * scale}px` : undefined, boxSizing: 'border-box' }}>{paragraph.nodes}</div>
      })}
    </>
  )
}

/** A right-to-left text frame with its handles and thread ports. */
export function TextFrameView(p: Props) {
  const { frame, style, slice, selected, editing, showEdge, marked, locked } = p
  const paragraphPatches = p.paragraphPatches ?? frame.paragraphStylePatches
  const masterPreview = !editing && (slice.includes(PAGE_NUMBER_MARKER) || slice.includes(INTERNAL_PAGE_NUMBER_MARKER) || slice.includes(EXTERNAL_PAGE_NUMBER_MARKER) || slice.includes(INTERNAL_LETTER_PAGE_NUMBER_MARKER) || slice.includes(LETTER_PAGE_NUMBER_MARKER) || slice.includes(RUNNING_HEADER_MARKER))
  let masterDisplay = { text: slice, runs: p.runs }
  if (masterPreview) {
    masterDisplay = substituteMarker(masterDisplay.text, masterDisplay.runs, PAGE_NUMBER_MARKER, '1')
    masterDisplay = substituteMarker(masterDisplay.text, masterDisplay.runs, INTERNAL_PAGE_NUMBER_MARKER, '1')
    masterDisplay = substituteMarker(masterDisplay.text, masterDisplay.runs, EXTERNAL_PAGE_NUMBER_MARKER, '1')
    masterDisplay = substituteMarker(masterDisplay.text, masterDisplay.runs, INTERNAL_LETTER_PAGE_NUMBER_MARKER, 'א')
    masterDisplay = substituteMarker(masterDisplay.text, masterDisplay.runs, LETTER_PAGE_NUMBER_MARKER, 'א')
    masterDisplay = substituteMarker(masterDisplay.text, masterDisplay.runs, RUNNING_HEADER_MARKER, 'כותרת')
    masterDisplay.runs = normalizeRuns(masterDisplay.text, masterDisplay.runs, style)
  }
  const hasNext = frame.next !== null
  const showOut = showEdge && (selected || hasNext || p.overflow || p.armed)
  const showIn = showEdge && (selected || p.hasPrev)

  return (
    <div
      className={'text-frame' + (showEdge ? ' edge' : '') + (selected ? ' selected' : '') + (marked ? ' marked' : '') + (locked ? ' locked' : '')}
      data-frame-id={frame.id}
      data-object-id={frame.id}
      data-object-kind="frame"
      style={{
        zIndex: p.z,
        left: p.tx + frame.x * p.zoom,
        top: p.ty + frame.y * p.zoom,
        width: frame.w * p.zoom,
        height: frame.h * p.zoom,
        transform: frame.rotation ? `rotate(${frame.rotation}deg)` : undefined,
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
       *  it's computed once and never re-triggers line-breaking. Matches how real DTP tools (InDesign) handle zoom.
       *  Handles/ports stay OUTSIDE this wrapper, on the outer (still zoom-multiplied) box, so their own fixed
       *  on-screen size is untouched by this transform. */}
      <div
        className="text-frame-scale"
        style={{
          width: frame.w,
          height: frame.h,
          visibility: frame.rasterized ? 'hidden' : undefined,
          fontSize: style.fontSize,
          fontFamily: `"${style.fontFamily}", "Segoe UI", Arial, sans-serif`,
          lineHeight: `${style.leading ?? defaultLeading(style)}px`,
          ...cssTextAlign(style.align),
          wordSpacing: wordSpacingPt(style) ? `${wordSpacingPt(style)}px` : undefined,
          // paragraph spacing/indents belong to the whole story (like leading/align): spaceBefore only on the frame
          // holding the story's first line, spaceAfter only on the one holding its last (firstLineIndent applies to
          // every paragraph's own first line — see withMarks/richtext.ts's buildRunNodes — not shown as CSS here)
          paddingTop: !p.hasPrev && p.spaceBeforeFirst ? p.spaceBeforeFirst : undefined,
          paddingBottom: (!hasNext ? p.spaceAfterLast : 0) + p.footnoteHeight || undefined,
          '--text-body-top': `${!p.hasPrev ? p.spaceBeforeFirst : 0}px`,
          '--text-body-height': `${Math.max(0, frame.h - (!p.hasPrev ? p.spaceBeforeFirst : 0) - p.footnoteHeight)}px`,
          paddingLeft: style.indentLeft || undefined,
          paddingRight: style.indentRight || undefined,
          transform: `scale(${p.zoom * (frame.textScale?.x ?? 1), p.zoom * (frame.textScale?.y ?? 1)})`,
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
          paragraphPatches={paragraphPatches}
          baseAlign={style.align}
          continuesAtEnd={p.continuesParagraphAtEnd}
          footnoteMarkers={p.footnoteMarkers}
          footnoteReferenceScale={p.footnoteReferenceScale ?? FOOTNOTE_REFERENCE_SCALE}
          onSelectAll={p.onSelectAllText}
          hasPrev={p.hasPrev}
          request={p.request}
          onEdit={p.onEdit}
          onSelect={p.onSelect}
          onBackspaceAtStart={p.onBackspaceAtStart}
          onCopyText={p.onCopyText}
          onStop={p.onStopEditing}
          onLineBoundary={p.onLineBoundary}
          onDragOutside={p.onDragOutside}
        />
      ) : (
        <div className="text-frame-body" dir="rtl">
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
            footnoteReferenceScale={p.footnoteReferenceScale ?? FOOTNOTE_REFERENCE_SCALE}
            firstLineIndent={(index) => paragraphPatches?.[index]?.firstLineIndent ?? style.firstLineIndent ?? 0}
            paragraphPatches={paragraphPatches}
            baseFontSize={style.fontSize}
            baseAlign={style.align}
            continuesParagraphAtEnd={p.continuesParagraphAtEnd}
          />
        </div>
      )}
      </div>
      {!!p.footnotes?.length && (
        <div className="footnotes-scale" style={{ width: frame.w, height: frame.h, fontFamily: style.fontFamily, fontSize: `${style.fontSize}px`, fontWeight: style.weight, fontStyle: style.italic ? 'italic' : 'normal', lineHeight: `${style.leading ?? defaultLeading(style)}px`, transform: `scale(${p.zoom * (frame.textScale?.x ?? 1)}, ${p.zoom * (frame.textScale?.y ?? 1)})` }}>
          <div className="footnotes-area" dir="rtl" style={{ bottom: 0, height: p.footnoteHeight - (p.footnoteDividerGap ?? 0), '--footnote-number-gap': `${p.footnoteNumberGap ?? 5}px` } as CSSProperties}>
            <div className="footnote-divider" />
            {p.footnotes.map((note) => {
              const noteStyle = note.style ?? style
              const fragmentOffset = note.offset ?? 0
              const isEditingFootnote = p.editingFootnoteId === note.id && p.editingFootnoteFrameId === frame.id && p.editingFootnoteOffset === fragmentOffset
              const referenceLabel = String(note.referenceNumber)
              const dotAfterNumber = referenceLabel.endsWith('.')
              const numberLabel = dotAfterNumber ? referenceLabel.slice(0, -1) : referenceLabel
              const numberDirection = /[\u0590-\u05ff]/.test(numberLabel) ? 'rtl' : 'ltr'
              let offset = 0
              const content = note.runs?.length
                ? note.runs.map((run, index) => {
                    const text = note.content.slice(offset, offset + run.len)
                    offset += run.len
                    return <span key={index} style={{ fontFamily: run.style.fontFamily, fontSize: `${run.style.fontSize}px`, fontWeight: run.style.weight, fontStyle: run.style.italic ? 'italic' : 'normal', color: run.style.color ?? noteStyle.color, letterSpacing: run.style.tracking ? `${(run.style.tracking / 1000) * run.style.fontSize}px` : undefined }}>{text}</span>
                  })
                : note.content
              return (
                <div
                  key={`${note.id}:${fragmentOffset}`}
                  className="footnote-item"
                  title="לחיצה לעריכת הערת השוליים"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (isEditingFootnote) return
                    const clickedNumber = event.target instanceof Element && !!event.target.closest('.footnote-number')
                    const contentRoot = event.currentTarget.querySelector<HTMLElement>('.footnote-content')
                    const localOffset = clickedNumber ? 0 : caretOffsetAt(event.clientX, event.clientY, contentRoot) ?? 0
                    p.onFootnoteEdit?.(note.id, localOffset, fragmentOffset)
                  }}
                  style={{ left: `${frame.w - note.x - note.width}px`, top: `${note.y}px`, width: `${note.width}px`, height: `${note.height}px`, fontFamily: noteStyle.fontFamily, fontSize: `${noteStyle.fontSize}px`, fontWeight: noteStyle.weight, fontStyle: noteStyle.italic ? 'italic' : 'normal', lineHeight: `${noteStyle.leading ?? defaultLeading(noteStyle)}px`, wordSpacing: wordSpacingPt(noteStyle) ? `${wordSpacingPt(noteStyle)}px` : undefined, color: noteStyle.color ?? '#111', ...cssTextAlign(noteStyle.align) }}
                >
                  {!note.continued && (
                    <span className="footnote-number" dir="rtl" style={{ fontSize: `${noteStyle.fontSize}px` }}>
                      <span dir={numberDirection}>{numberLabel}</span>{dotAfterNumber && <span dir="rtl">.</span>}
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
                      onBackspaceAtStart={() => {}}
                      onCopyText={() => p.onFootnoteCopyText?.(note.id) ?? null}
                      onStop={() => p.onFootnoteStop?.()}
                    />
                  ) : <span className={'footnote-content' + (p.footnoteSelection?.noteId === note.id && p.footnoteSelection.all ? ' selected' : '')}>{content}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {showIn && (
        <div
          className={'port port-in' + (p.hasPrev ? ' linked' : '')}
          title={p.hasPrev ? 'נתק מהתיבה הקודמת' : 'כניסת טקסט'}
          onPointerDown={p.onInPortDown}
        >
          {p.hasPrev && '‹'}
        </div>
      )}
      {showOut && (
        <div
          className={'port port-out' + (hasNext ? ' linked' : '') + (p.overflow ? ' overflow' : '') + (p.armed ? ' armed' : '')}
          title={p.overflow ? 'יש טקסט שלא נכנס — לחץ וחבר לתיבה נוספת' : hasNext ? 'הטקסט ממשיך בתיבה הבאה' : 'לחץ כדי לחבר לתיבה נוספת'}
          onPointerDown={p.onOutPortDown}
        >
          {p.overflow ? '+' : hasNext ? '‹' : ''}
        </div>
      )}

      {selected && showEdge && HANDLES.map((h) => <div key={h} className={'handle ' + h} onPointerDown={(e) => p.onHandleDown(h, e)} />)}
      {selected && showEdge && ROTATE_CORNERS.map((c) => <div key={c} className={'rotate-handle ' + c} title="גרור כדי לסובב (Shift: קפיצות של 45°)" onPointerDown={(e) => p.onRotateDown(c, e)} />)}
    </div>
  )
}
