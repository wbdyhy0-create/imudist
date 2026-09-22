import type { ReactNode, PointerEvent as ReactPointerEvent } from 'react'
import { DEFAULT_SPACE_AFTER, defaultLeading, type Run, type TextFrame, type TextStyle } from '../document'
import { HANDLES, ROTATE_CORNERS, type HandleId, type RotateCorner } from '../frames'
import { splitMarks } from '../richtext'
import { shapeOf, type WrapFloat } from '../wrap'
import { RichEditor, type SelRequest } from './RichEditor'

/** Text split at spaces/paragraph breaks into plain strings plus `.mark-space`/`.mark-para` spans (see styles.css). */
function withMarks(text: string): ReactNode {
  return splitMarks(text).map((piece, i) =>
    piece.kind === 'text' ? piece.text : (
      <span key={i} className={piece.kind === 'space' ? 'mark-space' : 'mark-para'}>
        {piece.text}
      </span>
    ),
  )
}

/**
 * Extra space to add between words while a paragraph is justified, so it can lean on `wordSpacingMin` / `wordSpacingMax`
 * a little instead of only on the browser's own (unbounded) stretching. Plain (non-justified) text never gets this: it
 * always keeps the normal 100% spacing. This nudges the WHOLE frame by one fixed amount, in world points — a real
 * per-line minimum/maximum, chosen line by line the way a proper justification engine would, is a much bigger feature
 * this does not attempt.
 */
function wordSpacingPt(style: TextStyle): number {
  if (style.align !== 'justify') return 0
  const min = style.wordSpacingMin ?? 90
  const max = style.wordSpacingMax ?? 120
  const percent = (min + max) / 2
  // a typical space is about a quarter of an em; word-spacing is an amount ADDED to it, not a multiplier
  return ((percent - 100) / 100) * 0.25 * style.fontSize
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
  /** part of a selection of several objects: outlined, without handles */
  marked?: boolean
  editing: boolean
  /** an out-port was clicked and this frame is waiting for a target */
  armed: boolean
  /** frame edges, handles and ports are non-printing: hidden in Preview mode */
  showEdge: boolean
  /** show a dot over spaces and a ¶ at paragraph breaks (View > תווים נסתרים); non-printing, like showEdge */
  showHidden: boolean
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
}

/** Text as read-only spans, with an optional highlighted range. */
function RichText({
  text,
  runs,
  scale,
  highlight,
  floats,
  showMarks,
}: {
  text: string
  runs: Run[]
  scale: number
  highlight: [number, number] | null
  floats: WrapFloat[]
  showMarks: boolean
}) {
  const parts: { key: string; text: string; run: Run; hl: boolean }[] = []
  let pos = 0
  for (const run of runs) {
    const end = pos + run.len
    // split the run at the highlight edges
    const cuts = [pos, end]
    if (highlight) for (const c of highlight) if (c > pos && c < end) cuts.push(c)
    cuts.sort((a, b) => a - b)
    for (let i = 0; i + 1 < cuts.length; i++) {
      const [s, e] = [cuts[i], cuts[i + 1]]
      parts.push({ key: `${s}`, text: text.slice(s, e), run, hl: !!highlight && s >= highlight[0] && e <= highlight[1] })
    }
    pos = end
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
      {parts.map((p) => (
        <span
          key={p.key}
          className={p.hl ? 'sel' : undefined}
          style={{
            fontFamily: `"${p.run.style.fontFamily}", "Segoe UI", Arial, sans-serif`,
            fontSize: p.run.style.fontSize * scale,
            fontWeight: p.run.style.weight,
            fontStyle: p.run.style.italic ? 'italic' : 'normal',
            // tracking is 1/1000 em (InDesign's own unit), same formula as richtext.ts's applyRunStyle
            letterSpacing: p.run.style.tracking ? `${(p.run.style.tracking / 1000) * p.run.style.fontSize * scale}px` : undefined,
          }}
        >
          {showMarks ? withMarks(p.text) : p.text}
        </span>
      ))}
    </>
  )
}

/** A right-to-left text frame with its handles and thread ports. */
export function TextFrameView(p: Props) {
  const { frame, style, slice, selected, editing, showEdge, marked } = p
  const hasNext = frame.next !== null
  const showOut = showEdge && (selected || hasNext || p.overflow || p.armed)
  const showIn = showEdge && (selected || p.hasPrev)

  return (
    <div
      className={'text-frame' + (showEdge ? ' edge' : '') + (selected ? ' selected' : '') + (marked ? ' marked' : '')}
      style={{
        zIndex: p.z,
        left: p.tx + frame.x * p.zoom,
        top: p.ty + frame.y * p.zoom,
        width: frame.w * p.zoom,
        height: frame.h * p.zoom,
        fontSize: style.fontSize * p.zoom,
        fontFamily: `"${style.fontFamily}", "Segoe UI", Arial, sans-serif`,
        lineHeight: `${(style.leading ?? defaultLeading(style)) * p.zoom}px`,
        textAlign: style.align,
        wordSpacing: wordSpacingPt(style) ? `${wordSpacingPt(style) * p.zoom}px` : undefined,
        transform: frame.rotation ? `rotate(${frame.rotation}deg)` : undefined,
        // paragraph spacing/indents belong to the whole story (like leading/align): spaceBefore/firstLineIndent
        // only on the frame holding the story's first line, spaceAfter only on the one holding its last
        paddingTop: !p.hasPrev && style.spaceBefore ? style.spaceBefore * p.zoom : undefined,
        paddingBottom: !hasNext ? (style.spaceAfter ?? DEFAULT_SPACE_AFTER) * p.zoom : undefined,
        paddingLeft: style.indentLeft ? style.indentLeft * p.zoom : undefined,
        paddingRight: style.indentRight ? style.indentRight * p.zoom : undefined,
        textIndent: !p.hasPrev && style.firstLineIndent ? style.firstLineIndent * p.zoom : undefined,
      }}
      onPointerDown={p.onPointerDown}
      onDoubleClick={p.onDoubleClick}
    >
      {editing ? (
        <RichEditor
          text={slice}
          runs={p.runs}
          scale={p.zoom}
          floats={p.floats}
          showMarks={p.showHidden}
          hasPrev={p.hasPrev}
          request={p.request}
          onEdit={p.onEdit}
          onSelect={p.onSelect}
          onBackspaceAtStart={p.onBackspaceAtStart}
          onCopyText={p.onCopyText}
          onStop={p.onStopEditing}
        />
      ) : (
        <div className="text-frame-body" dir="rtl">
          <RichText text={slice} runs={p.runs} scale={p.zoom} highlight={p.highlight} floats={p.floats} showMarks={p.showHidden} />
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
