import type { ReactNode, PointerEvent as ReactPointerEvent } from 'react'
import { cssTextAlign, defaultLeading, wordSpacingPt, type Run, type TextFrame, type TextStyle } from '../document'
import { HANDLES, ROTATE_CORNERS, type HandleId, type RotateCorner } from '../frames'
import { splitMarks } from '../richtext'
import { shapeOf, type WrapFloat } from '../wrap'
import { RichEditor, type SelRequest } from './RichEditor'

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
): { nodes: ReactNode[]; trailing: ReactNode[] } {
  if (!showMarks && paraGaps.length === 0 && !firstLineIndent(startParaIndex)) return { nodes: [text], trailing: [] }
  let idx = startParaIndex
  const nodes: ReactNode[] = []
  // the `.para-gap` / `.para-indent` spacers that follow a paragraph's closing "\n" belong to the START of the next
  // paragraph's line. RichText wraps each paragraph in its own block, so leaving them at the end of this one would
  // put them alone on an extra empty line (a full strut + the gap) at the end of every paragraph — text the frame's
  // measurer (richtext.ts's flat buildRunNodes) never has, so the visible text ran taller than what was measured to fit
  const trailing: ReactNode[] = []
  if (firstLineIndent(startParaIndex) && atStart) nodes.push(<span key="i0" className="para-indent" contentEditable={false} style={{ width: firstLineIndent(startParaIndex) * scale }} />)
  const pieces = splitMarks(text)
  for (const [i, piece] of pieces.entries()) {
    if (piece.kind === 'text') {
      nodes.push(piece.text)
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
  paragraphPatches?: Partial<Pick<TextStyle, 'leading' | 'firstLineIndent' | 'indentLeft' | 'indentRight' | 'align'>>[]
  /** resolved space above the story's first line / below its last (document.ts's frameSpaceBefore/frameSpaceAfter) */
  spaceBeforeFirst: number
  spaceAfterLast: number
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
  paragraphPatches,
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
  paragraphPatches?: Partial<Pick<TextStyle, 'leading' | 'firstLineIndent' | 'indentLeft' | 'indentRight' | 'align'>>[]
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
    const { nodes: rendered, trailing } = withMarks(part.text, showMarks, paraGaps, renderParaIndex, i === 0 && atParaStart, i === parts.length - 1, (index) => paragraphPatches?.[index]?.firstLineIndent ?? firstLineIndent(index), scale)
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
        return <div key={`paragraph-${paragraph.index}`} style={{ ...(patch?.align ? cssTextAlign(patch.align) : {}), lineHeight: patch?.leading ? `${patch.leading * scale}px` : undefined, paddingLeft: patch?.indentLeft ? `${patch.indentLeft * scale}px` : undefined, paddingRight: patch?.indentRight ? `${patch.indentRight * scale}px` : undefined, boxSizing: 'border-box' }}>{paragraph.nodes}</div>
      })}
    </>
  )
}

/** A right-to-left text frame with its handles and thread ports. */
export function TextFrameView(p: Props) {
  const { frame, style, slice, selected, editing, showEdge, marked, locked } = p
  const paragraphPatches = p.paragraphPatches ?? frame.paragraphStylePatches
  const hasNext = frame.next !== null
  const showOut = showEdge && (selected || hasNext || p.overflow || p.armed)
  const showIn = showEdge && (selected || p.hasPrev)

  return (
    <div
      className={'text-frame' + (showEdge ? ' edge' : '') + (selected ? ' selected' : '') + (marked ? ' marked' : '') + (locked ? ' locked' : '')}
      data-frame-id={frame.id}
      style={{
        zIndex: p.z,
        left: p.tx + frame.x * p.zoom,
        top: p.ty + frame.y * p.zoom,
        width: frame.w * p.zoom,
        height: frame.h * p.zoom,
        transform: frame.rotation ? `rotate(${frame.rotation}deg)` : undefined,
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
          fontSize: style.fontSize,
          fontFamily: `"${style.fontFamily}", "Segoe UI", Arial, sans-serif`,
          lineHeight: `${style.leading ?? defaultLeading(style)}px`,
          ...cssTextAlign(style.align),
          wordSpacing: wordSpacingPt(style) ? `${wordSpacingPt(style)}px` : undefined,
          // paragraph spacing/indents belong to the whole story (like leading/align): spaceBefore only on the frame
          // holding the story's first line, spaceAfter only on the one holding its last (firstLineIndent applies to
          // every paragraph's own first line — see withMarks/richtext.ts's buildRunNodes — not shown as CSS here)
          paddingTop: !p.hasPrev && p.spaceBeforeFirst ? p.spaceBeforeFirst : undefined,
          paddingBottom: !hasNext ? p.spaceAfterLast : undefined,
          paddingLeft: style.indentLeft || undefined,
          paddingRight: style.indentRight || undefined,
          transform: `scale(${p.zoom})`,
          transformOrigin: '0 0',
        }}
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
            text={slice}
            runs={p.runs}
            scale={1}
            highlight={p.highlight}
            floats={p.floats}
            showMarks={p.showHidden}
            paraGaps={p.paraGaps}
            startParaIndex={p.startParaIndex}
            atParaStart={p.atParaStart}
            firstLineIndent={(index) => paragraphPatches?.[index]?.firstLineIndent ?? style.firstLineIndent ?? 0}
            paragraphPatches={paragraphPatches}
          />
        </div>
      )}
      </div>

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
