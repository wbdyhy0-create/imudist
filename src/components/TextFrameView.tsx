import type { PointerEvent as ReactPointerEvent } from 'react'
import { LINE_HEIGHT, type Run, type TextFrame, type TextStyle } from '../document'
import { HANDLES, type HandleId } from '../frames'
import { RichEditor, type SelRequest } from './RichEditor'

interface Props {
  frame: TextFrame
  /** default style + alignment of the whole story (the first frame's) */
  style: TextStyle
  /** the part of the story shown in this frame, with its style runs */
  slice: string
  runs: Run[]
  /** part of `slice` to draw highlighted while the frame is not being edited: [from, to) */
  highlight: [number, number] | null
  /** the story has more text than fits in its frames (only set on the last frame of a story) */
  overflow: boolean
  hasPrev: boolean
  zoom: number
  /** screen position of world (0, 0) inside the sheet */
  tx: number
  ty: number
  selected: boolean
  editing: boolean
  /** an out-port was clicked and this frame is waiting for a target */
  armed: boolean
  /** frame edges, handles and ports are non-printing: hidden in Preview mode */
  showEdge: boolean
  request: SelRequest | null
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void
  onDoubleClick: () => void
  onHandleDown: (handle: HandleId, e: ReactPointerEvent<HTMLDivElement>) => void
  onOutPortDown: (e: ReactPointerEvent<HTMLDivElement>) => void
  onInPortDown: (e: ReactPointerEvent<HTMLDivElement>) => void
  onEdit: (from: number, to: number, insert: string) => void
  onSelect: (a: number, b: number) => void
  onCopyText: () => string | null
  onBackspaceAtStart: () => void
  onStopEditing: () => void
}

/** Text as read-only spans, with an optional highlighted range. */
function RichText({ text, runs, scale, highlight }: { text: string; runs: Run[]; scale: number; highlight: [number, number] | null }) {
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
      {parts.map((p) => (
        <span
          key={p.key}
          className={p.hl ? 'sel' : undefined}
          style={{
            fontFamily: `"${p.run.style.fontFamily}", "Segoe UI", Arial, sans-serif`,
            fontSize: p.run.style.fontSize * scale,
            fontWeight: p.run.style.weight,
            fontStyle: p.run.style.italic ? 'italic' : 'normal',
          }}
        >
          {p.text}
        </span>
      ))}
    </>
  )
}

/** A right-to-left text frame with its handles and thread ports. */
export function TextFrameView(p: Props) {
  const { frame, style, slice, selected, editing, showEdge } = p
  const hasNext = frame.next !== null
  const showOut = showEdge && (selected || hasNext || p.overflow || p.armed)
  const showIn = showEdge && (selected || p.hasPrev)

  return (
    <div
      className={'text-frame' + (showEdge ? ' edge' : '') + (selected ? ' selected' : '')}
      style={{
        left: p.tx + frame.x * p.zoom,
        top: p.ty + frame.y * p.zoom,
        width: frame.w * p.zoom,
        height: frame.h * p.zoom,
        fontSize: style.fontSize * p.zoom,
        fontFamily: `"${style.fontFamily}", "Segoe UI", Arial, sans-serif`,
        lineHeight: LINE_HEIGHT,
        textAlign: style.align,
      }}
      onPointerDown={p.onPointerDown}
      onDoubleClick={p.onDoubleClick}
    >
      {editing ? (
        <RichEditor
          text={slice}
          runs={p.runs}
          scale={p.zoom}
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
          <RichText text={slice} runs={p.runs} scale={p.zoom} highlight={p.highlight} />
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
    </div>
  )
}
