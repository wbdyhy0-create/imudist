import type { PointerEvent as ReactPointerEvent } from 'react'
import { DEFAULT_FONT_PT, type TextFrame } from '../document'

interface Props {
  frame: TextFrame
  zoom: number
  /** screen position of world (0, 0) inside the sheet */
  tx: number
  ty: number
  selected: boolean
  editing: boolean
  /** frame edges are a non-printing guide: hidden in Preview mode */
  showEdge: boolean
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void
  onChange: (text: string) => void
  onStopEditing: () => void
}

/** A right-to-left text frame. Hebrew text is right-aligned and flows from the right edge. */
export function TextFrameView({ frame, zoom, tx, ty, selected, editing, showEdge, onPointerDown, onChange, onStopEditing }: Props) {
  return (
    <div
      className={'text-frame' + (showEdge ? ' edge' : '') + (selected ? ' selected' : '')}
      style={{
        left: tx + frame.x * zoom,
        top: ty + frame.y * zoom,
        width: frame.w * zoom,
        height: frame.h * zoom,
        fontSize: DEFAULT_FONT_PT * zoom,
      }}
      onPointerDown={onPointerDown}
    >
      {editing ? (
        <textarea
          autoFocus
          dir="rtl"
          spellCheck={false}
          aria-label="תיבת טקסט"
          value={frame.text}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => e.currentTarget.setSelectionRange(frame.text.length, frame.text.length)}
          onBlur={onStopEditing}
          onKeyDown={(e) => {
            if (e.key === 'Escape') e.currentTarget.blur()
          }}
        />
      ) : (
        <div className="text-frame-body" dir="rtl">
          {frame.text}
        </div>
      )}
    </div>
  )
}
