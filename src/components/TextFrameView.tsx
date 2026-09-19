import { useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { TextFrame, TextStyle } from '../document'
import { HANDLES, type HandleId } from '../frames'

/** Where to put the caret in the frame's text box, `token` changes on every request. */
export interface CaretRequest {
  pos: number
  token: number
}

interface Props {
  frame: TextFrame
  /** style of the whole story (the first frame's) */
  style: TextStyle
  /** the part of the story shown in this frame */
  slice: string
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
  caret: CaretRequest | null
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void
  onDoubleClick: () => void
  onHandleDown: (handle: HandleId, e: ReactPointerEvent<HTMLDivElement>) => void
  onOutPortDown: (e: ReactPointerEvent<HTMLDivElement>) => void
  onInPortDown: (e: ReactPointerEvent<HTMLDivElement>) => void
  onChange: (slice: string, caretPos: number) => void
  onBackspaceAtStart: () => void
  onStopEditing: () => void
}

/** A right-to-left text frame with its handles and thread ports. */
export function TextFrameView(p: Props) {
  const { frame, style, slice, selected, editing, showEdge } = p
  const areaRef = useRef<HTMLTextAreaElement>(null)

  // move the caret where the story logic wants it (also when the text just flowed into another frame)
  useLayoutEffect(() => {
    if (editing && p.caret && areaRef.current) areaRef.current.setSelectionRange(p.caret.pos, p.caret.pos)
  }, [editing, p.caret?.token])

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
        fontWeight: style.bold ? 700 : 400,
        fontStyle: style.italic ? 'italic' : 'normal',
        textAlign: style.align,
      }}
      onPointerDown={p.onPointerDown}
      onDoubleClick={p.onDoubleClick}
    >
      {editing ? (
        <textarea
          ref={areaRef}
          autoFocus
          dir="rtl"
          spellCheck={false}
          aria-label="תיבת טקסט"
          value={slice}
          onChange={(e) => p.onChange(e.target.value, e.target.selectionStart)}
          onFocus={(e) => {
            const pos = p.caret ? p.caret.pos : slice.length
            e.currentTarget.setSelectionRange(pos, pos)
          }}
          onBlur={p.onStopEditing}
          onKeyDown={(e) => {
            if (e.key === 'Escape') e.currentTarget.blur()
            else if (e.key === 'Backspace' && e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0 && p.hasPrev) {
              e.preventDefault()
              p.onBackspaceAtStart()
            }
          }}
        />
      ) : (
        <div className="text-frame-body" dir="rtl">
          {slice}
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
