import type { PointerEvent as ReactPointerEvent } from 'react'
import type { ShapeFrame } from '../document'
import { HANDLES, type HandleId } from '../frames'
import { CORNERS, fitRadii, shapePath } from '../shapes'

/** Distance of a rounding handle from the arc of its corner, screen px. */
export const CORNER_HANDLE_OFFSET = 14
/** Below this size (screen px) the rounding handles would sit on top of each other, so they are hidden. */
const MIN_CORNER_HANDLES = 56

interface Props {
  shape: ShapeFrame
  zoom: number
  /** screen position of world (0, 0) inside the sheet */
  tx: number
  ty: number
  /** stacking rank (higher = in front) */
  z: number
  selected: boolean
  /** part of a selection of several objects: outlined, without handles */
  marked?: boolean
  /** outlines and handles are non-printing: hidden in Preview mode */
  showEdge: boolean
  /** the rounding handles that are part of the current rounding gesture */
  hotCorners?: number[]
  /** a preview while the shape is being drawn: no handles, and clicks go through */
  ghost?: boolean
  onPointerDown?: (e: ReactPointerEvent<SVGPathElement>) => void
  onHandleDown?: (handle: HandleId, e: ReactPointerEvent<HTMLDivElement>) => void
  onCornerDown?: (corner: number, e: ReactPointerEvent<HTMLDivElement>) => void
}

/** A drawn shape: the outline is an SVG path (so only the shape itself catches the pointer), plus handles when selected. */
export function ShapeFrameView({ shape, zoom, tx, ty, z, selected, marked, showEdge, hotCorners = [], ghost, onPointerDown, onHandleDown, onCornerDown }: Props) {
  const w = shape.w * zoom
  const h = shape.h * zoom
  const radii = shape.kind === 'rect' ? fitRadii(shape.radii, shape.w, shape.h) : null
  const showHandles = selected && showEdge && !ghost
  const showCorners = showHandles && radii !== null && Math.min(w, h) >= MIN_CORNER_HANDLES

  return (
    <div
      className={'shape-frame' + (selected && showEdge ? ' selected' : '') + (marked ? ' marked' : '') + (ghost ? ' ghost' : '')}
      style={{ left: tx + shape.x * zoom, top: ty + shape.y * zoom, width: w, height: h, zIndex: z }}
    >
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        <path
          d={shapePath(shape, zoom)}
          fill={shape.fill ?? 'none'}
          fillRule="evenodd"
          stroke={shape.stroke ?? 'none'}
          strokeWidth={shape.strokeWidth * zoom}
          strokeLinejoin="round"
          pointerEvents={ghost ? 'none' : 'all'}
          onPointerDown={onPointerDown}
        />
      </svg>

      {showHandles && HANDLES.map((handle) => <div key={handle} className={'handle ' + handle} onPointerDown={(e) => onHandleDown?.(handle, e)} />)}

      {showCorners &&
        CORNERS.map((c, i) => {
          const r = radii![i] * zoom
          const at = r + CORNER_HANDLE_OFFSET
          return (
            <div
              key={i}
              className={'corner-handle' + (hotCorners.includes(i) ? ' hot' : '')}
              title={`עגל פינה: ${c.name} (גרור, ועבור על פינות נוספות כדי לעגל גם אותן)`}
              style={{ left: c.fx * w + c.sx * at, top: c.fy * h + c.sy * at }}
              onPointerDown={(e) => onCornerDown?.(i, e)}
            />
          )
        })}
    </div>
  )
}
