import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { PathVertex, ShapeFrame } from '../document'
import { HANDLES, type HandleId } from '../frames'
import { arcPoints, pointAtFraction, ringInfo, textPlacement, usedSpan } from '../pathText'
import { CORNERS, editableRing, fitRadii, shapePath, vertexHi, vertexHo, vertexPoint } from '../shapes'
import { normalizeRuns } from '../story'

/** Distance of a rounding handle from the arc of its corner, screen px. */
export const CORNER_HANDLE_OFFSET = 14
/** Below this size (screen px) the rounding handles would sit on top of each other, so they are hidden. */
export const MIN_CORNER_HANDLES = 56

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
  /** the corners that have a rounding handle (all four when not given) */
  activeCorners?: number[]
  /** all four corners are rounded together: the handles say so */
  together?: boolean
  /** the point-editing tool is active: show the shape's own corner points instead of the usual resize handles (an ellipse has none of its own, so it keeps them) */
  directMode?: boolean
  /** which of the shape's own points are selected: they show solid, and a selected point's own curve handles (if it has any) are shown too */
  selectedPoints?: number[]
  /** a preview while the shape is being drawn: no handles, and clicks go through */
  ghost?: boolean
  onPointerDown?: (e: ReactPointerEvent<SVGPathElement>) => void
  onHandleDown?: (handle: HandleId, e: ReactPointerEvent<HTMLDivElement>) => void
  onCornerDown?: (corner: number, e: ReactPointerEvent<HTMLDivElement>) => void
  /** double click on the shape (to edit its text on the outline) */
  onDoubleClick?: () => void
  /** a peg of the text on the outline: where it starts, where it is cut off, or the middle one that turns it in / out */
  onPegDown?: (peg: PathPeg, e: ReactPointerEvent<HTMLDivElement>) => void
  /** grabbing one of the shape's own corner points: it moves on its own (with the rest of the selected points, if there are more), reshaping the outline. Alt: pull new, symmetric curve handles out of it instead. */
  onPointDown?: (index: number, e: ReactPointerEvent<HTMLDivElement>) => void
  /** double click on one of the shape's own points: turns it from a sharp corner into a smooth curve point, or back */
  onPointDouble?: (index: number) => void
  /** grabbing the middle of one of its edges: a new point is added there and dragged */
  onEdgeDown?: (edgeIndex: number, e: ReactPointerEvent<HTMLDivElement>) => void
  /** grabbing one of a point's own curve handles: it reshapes the curve on that side (and the other side too, unless Alt is held) */
  onHandleGrab?: (index: number, which: 'hi' | 'ho', e: ReactPointerEvent<HTMLDivElement>) => void
}

export type PathPeg = 'anchor' | 'end' | 'flip'

/** A drawn shape: the outline is an SVG path (so only the shape itself catches the pointer), plus handles when selected. */
export function ShapeFrameView({
  shape,
  zoom,
  tx,
  ty,
  z,
  selected,
  marked,
  showEdge,
  hotCorners = [],
  activeCorners,
  together,
  directMode,
  selectedPoints,
  ghost,
  onPointerDown,
  onHandleDown,
  onCornerDown,
  onDoubleClick,
  onPegDown,
  onPointDown,
  onPointDouble,
  onEdgeDown,
  onHandleGrab,
}: Props) {
  const w = shape.w * zoom
  const h = shape.h * zoom
  const radii = shape.kind === 'rect' ? fitRadii(shape.radii, shape.w, shape.h) : null
  /** the shape's own corner points, while the point-editing tool has it selected */
  const ring = directMode ? editableRing(shape) : null
  const showHandles = selected && showEdge && !ghost && !ring
  const showCorners = showHandles && radii !== null && Math.min(w, h) >= MIN_CORNER_HANDLES
  const showPoints = !!ring && selected && showEdge && !ghost

  // text along the outline
  const pt = shape.pathText
  const info = pt ? ringInfo(shape) : null
  const place = pt && info ? textPlacement(pt, usedSpan(pt, info)) : null
  const line = pt && info && place ? arcPoints(info, place.startFrac, pt.span, place.dir).map(([x, y]) => [x * zoom, y * zoom] as const) : null
  const lineLength = line ? line.reduce((sum, p, i) => (i ? sum + Math.hypot(p[0] - line[i - 1][0], p[1] - line[i - 1][1]) : 0), 0) : 0
  const runs = pt && pt.text ? normalizeRuns(pt.text, pt.runs, pt.style) : []
  const pathId = `ptp-${shape.id}`
  const pegAt = (fraction: number) => {
    const [x, y] = pointAtFraction(info!, fraction)
    return { left: x * zoom, top: y * zoom }
  }

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
          onDoubleClick={onDoubleClick}
        />
        {line && pt && place && runs.length > 0 && (
          <>
            <defs>
              <path id={pathId} d={'M' + line.map(([x, y]) => `${x} ${y}`).join('L')} fill="none" />
            </defs>
            <text fill={pt.color} pointerEvents="none" xmlSpace="preserve" style={{ direction: place.rtl ? 'rtl' : 'ltr', unicodeBidi: 'plaintext' }}>
              {/* text that reads right to left ends at the anchor, which is the end of the path */}
              <textPath href={`#${pathId}`} startOffset={place.rtl ? lineLength : 0}>
                {(() => {
                  let at = 0
                  return runs.map((r, i) => {
                    const piece = pt.text.slice(at, at + r.len).replace(/\n/g, ' ')
                    at += r.len
                    return (
                      <tspan key={i} fontFamily={`"${r.style.fontFamily}", "Segoe UI", Arial, sans-serif`} fontSize={r.style.fontSize * zoom} fontWeight={r.style.weight} fontStyle={r.style.italic ? 'italic' : 'normal'}>
                        {piece}
                      </tspan>
                    )
                  })
                })()}
              </textPath>
            </text>
          </>
        )}
      </svg>

      {showHandles && HANDLES.map((handle) => <div key={handle} className={'handle ' + handle} onPointerDown={(e) => onHandleDown?.(handle, e)} />)}

      {showHandles && pt && info && place && (
        <>
          <div className="path-peg anchor" title="תחילת הטקסט — גרור כדי להזיז את הטקסט לאורך הקו" style={pegAt(pt.anchor)} onPointerDown={(e) => onPegDown?.('anchor', e)} />
          <div className="path-peg end" title="סוף הטקסט — גרור כדי לקצר או להאריך את המקום שהטקסט תופס על הקו" style={pegAt(place.endFrac)} onPointerDown={(e) => onPegDown?.('end', e)} />
          <div
            className={'path-peg flip ' + pt.side}
            title="גרור פנימה אל הצורה כדי להכניס את הטקסט פנימה, וגרור החוצה כדי להוציא אותו"
            style={pegAt(place.middleFrac)}
            onPointerDown={(e) => onPegDown?.('flip', e)}
          />
        </>
      )}

      {showCorners &&
        CORNERS.map((c, i) => {
          if (activeCorners && !activeCorners.includes(i)) return null
          const r = radii![i] * zoom
          const at = r + CORNER_HANDLE_OFFSET
          return (
            <div
              key={i}
              className={'corner-handle' + (hotCorners.includes(i) ? ' hot' : '')}
              title={together ? 'עגל את כל הפינות (גרור)' : `עגל פינה: ${c.name} (גרור, ועבור על פינות נוספות כדי לבחור גם אותן)`}
              style={{ left: c.fx * w + c.sx * at, top: c.fy * h + c.sy * at }}
              onPointerDown={(e) => onCornerDown?.(i, e)}
            />
          )
        })}

      {showPoints && (
        <>
          <svg className="curve-handle-lines" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
            {ring!.map((v, i) => {
              if (!selectedPoints?.includes(i)) return null
              const p = vertexPoint(v)
              const hi = vertexHi(v)
              const ho = vertexHo(v)
              return (
                <g key={i}>
                  {hi && <line x1={p[0] * w} y1={p[1] * h} x2={(p[0] + hi[0]) * w} y2={(p[1] + hi[1]) * h} />}
                  {ho && <line x1={p[0] * w} y1={p[1] * h} x2={(p[0] + ho[0]) * w} y2={(p[1] + ho[1]) * h} />}
                </g>
              )
            })}
          </svg>

          {ring!.map((_, i) => (
            <div key={`edge${i}`} className="edge-handle" title="גרור כדי להוסיף נקודה ולעצב את הקו" style={edgeAt(ring!, i, w, h)} onPointerDown={(e) => onEdgeDown?.(i, e)} />
          ))}

          {ring!.map((v, i) => {
            const p = vertexPoint(v)
            const on = selectedPoints?.includes(i)
            return (
              <div
                key={`pt${i}`}
                className={'point-handle' + (on ? ' on' : '')}
                title="נקודת עיגון — לחיצה לבחירה וגרירה להזזה (Shift מוסיף לבחירה). לחיצה כפולה הופכת בין פינה חדה לעקומה חלקה. Alt-גרירה ממנה מוציאה ידיות עיצוב."
                style={{ left: p[0] * w, top: p[1] * h }}
                onPointerDown={(e) => onPointDown?.(i, e)}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  onPointDouble?.(i)
                }}
              />
            )
          })}

          {ring!.flatMap((v, i): ReactNode[] => {
            if (!selectedPoints?.includes(i)) return []
            const p = vertexPoint(v)
            const out: ReactNode[] = []
            const hi = vertexHi(v)
            if (hi)
              out.push(
                <div
                  key={`hi${i}`}
                  className="direction-handle"
                  title="ידית עיצוב עקומה — גרור כדי לשנות את כיוון ועוצמת העקומה. Alt: מזיז רק את הידית הזאת."
                  style={{ left: (p[0] + hi[0]) * w, top: (p[1] + hi[1]) * h }}
                  onPointerDown={(e) => onHandleGrab?.(i, 'hi', e)}
                />,
              )
            const ho = vertexHo(v)
            if (ho)
              out.push(
                <div
                  key={`ho${i}`}
                  className="direction-handle"
                  title="ידית עיצוב עקומה — גרור כדי לשנות את כיוון ועוצמת העקומה. Alt: מזיז רק את הידית הזאת."
                  style={{ left: (p[0] + ho[0]) * w, top: (p[1] + ho[1]) * h }}
                  onPointerDown={(e) => onHandleGrab?.(i, 'ho', e)}
                />,
              )
            return out
          })}
        </>
      )}
    </div>
  )
}

/** the screen position of the middle of the edge from point `i` to the next one (wrapping around) */
function edgeAt(ring: PathVertex[], i: number, w: number, h: number) {
  const [ax, ay] = vertexPoint(ring[i])
  const [bx, by] = vertexPoint(ring[(i + 1) % ring.length])
  return { left: ((ax + bx) / 2) * w, top: ((ay + by) / 2) * h }
}
