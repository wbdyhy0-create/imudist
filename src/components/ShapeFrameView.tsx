import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { Asset, Feather, PathVertex, ShapeFrame } from '../document'
import { linearGradientLine } from '../colorModels'
import { featherMaskStyles } from '../feather'
import { HANDLES, ROTATE_CORNERS, type HandleId, type RotateCorner } from '../frames'
import { arcPoints, pointAtFraction, ringInfo, textPlacement, usedSpan } from '../pathText'
import { CORNERS, editablePoints, fitRadii, imageGeometry, shapePath, vertexHi, vertexHo, vertexPoint } from '../shapes'
import { isProfiledLine, lineOutlinePath } from '../lineProfile'
import { normalizeRuns } from '../story'
import { dropShadowFilter } from '../shadow'
import type { CellRange, TableData, TableLayout } from '../table'
import { TableView, type TableSelection } from './TableView'

/** the picture's corner handles, while its own content (not the frame) is being resized */
const CONTENT_CORNERS = ['nw', 'ne', 'se', 'sw'] as const
type ContentCorner = (typeof CONTENT_CORNERS)[number]

/** Distance of a rounding handle from the arc of its corner, screen px. */
export const CORNER_HANDLE_OFFSET = 14
/** Below this size (screen px) the rounding handles would sit on top of each other, so they are hidden. */
export const MIN_CORNER_HANDLES = 56

interface Props {
  shape: ShapeFrame
  featherOverride?: Feather
  zoom: number
  /** screen position of world (0, 0) inside the sheet */
  tx: number
  ty: number
  /** stacking rank (higher = in front) */
  z: number
  selected: boolean
  locked?: boolean
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
  /** the picture data of `shape.image`, when it has one and it is not missing */
  asset?: Asset
  /** a preview while the shape is being drawn: no handles, and clicks go through */
  ghost?: boolean
  onPointerDown?: (e: ReactPointerEvent<SVGPathElement>) => void
  onHandleDown?: (handle: HandleId, e: ReactPointerEvent<HTMLDivElement>) => void
  onRotateDown?: (corner: RotateCorner, e: ReactPointerEvent<HTMLDivElement>) => void
  onCornerDown?: (corner: number, e: ReactPointerEvent<HTMLDivElement>) => void
  /** double click on the shape (to edit its text on the outline) */
  onDoubleClick?: () => void
  /** a peg of the text on the outline: where it starts, where it is cut off, or the middle one that turns it in / out */
  onPegDown?: (peg: PathPeg, e: ReactPointerEvent<HTMLDivElement>) => void
  /** grabbing one of the shape's own corner points: it moves on its own (with the rest of the selected points, if there are more), reshaping the outline. Alt: pull new, symmetric curve handles out of it instead. A
   * second press shortly after on the very same point is a double click - toggling it between a sharp corner and a
   * smooth curve point - detected here rather than through onDoubleClick, which the preventDefault this needs (to
   * start a drag) would otherwise suppress. */
  onPointDown?: (index: number, e: ReactPointerEvent<HTMLDivElement>) => void
  onDirectMove?: (e: ReactPointerEvent<HTMLDivElement>) => void
  /** grabbing the middle of one of its edges: a new point is added there and dragged */
  onEdgeDown?: (edgeIndex: number, e: ReactPointerEvent<HTMLDivElement>) => void
  /** grabbing one of a point's own curve handles: it reshapes the curve on that side (and the other side too, unless Alt is held) */
  onHandleGrab?: (index: number, which: 'hi' | 'ho', e: ReactPointerEvent<HTMLDivElement>) => void
  /** grabbing the round handle at the middle of the picture inside the shape: it moves on its own, the frame staying put */
  onContentGrab?: (e: ReactPointerEvent<HTMLDivElement>) => void
  /** grabbing one of the picture's own corner handles: it resizes on its own */
  onContentResize?: (corner: ContentCorner, e: ReactPointerEvent<HTMLDivElement>) => void
  /** grabbing one of a line's two endpoint handles (0 = its first point, 1 = its second): it moves on its own, the other end staying put */
  onLineEndDown?: (which: 0 | 1, e: ReactPointerEvent<HTMLDivElement>) => void
  /** the handle in the middle of a line: along the line it moves where the line is thickest, across it the line gets thicker or thinner there */
  onLineWidthDown?: (e: ReactPointerEvent<HTMLDivElement>, which: 0 | 1 | 2) => void
  /** a table shape: how its cells are laid out, which are picked, and how they are changed */
  tableUi?: {
    layout: TableLayout
    /** cells can be picked and typed into (the select tool is on) */
    active: boolean
    selection: TableSelection | null
    onSelection: (selection: TableSelection | null) => void
    onContextMenu: (selection: CellRange, x: number, y: number) => void
    onTable: (table: TableData, key?: string) => void
  }
}

export type PathPeg = 'anchor' | 'end' | 'flip'

/** A drawn shape: the outline is an SVG path (so only the shape itself catches the pointer), plus handles when selected. */
export function ShapeFrameView({
  shape,
  featherOverride,
  zoom,
  tx,
  ty,
  z,
  selected,
  locked,
  marked,
  showEdge,
  hotCorners = [],
  activeCorners,
  together,
  directMode,
  selectedPoints,
  asset,
  ghost,
  onPointerDown,
  onHandleDown,
  onRotateDown,
  onCornerDown,
  onDoubleClick,
  onPegDown,
  onPointDown,
  onDirectMove,
  onEdgeDown,
  onHandleGrab,
  onContentGrab,
  onContentResize,
  onLineEndDown,
  onLineWidthDown,
  tableUi,
}: Props) {
  const isLine = shape.kind === 'line'
  const isPath = shape.kind === 'path'
  const tableShape = shape.kind === 'table' && shape.table && tableUi ? (shape as typeof shape & { table: TableData }) : null
  const w = shape.w * zoom
  const h = shape.h * zoom
  const maskFeather = featherOverride ?? shape.feather
  const radii = shape.kind === 'rect' ? fitRadii(shape.radii, shape.w, shape.h) : null
  /** the shape's own points (every ring of it), while the point-editing tool has it selected */
  const points = directMode ? editablePoints(shape) : null
  const showHandles = selected && showEdge && !ghost && !points
  const showCorners = showHandles && radii !== null
  const showPoints = !!points && selected && showEdge
  // the edge between two points is a place to grab, one for each: for an outline of thousands of points (a headline turned into
  // outlines) they are left out, the points themselves stay
  const showEdges = !!points && points.length <= MANY_POINTS
  const img = shape.image && asset ? { box: imageGeometry(shape, asset), asset } : null
  const showContent = !!img && directMode && selected && showEdge && !ghost
  const clipId = `clip-${shape.id}`
  const shapeFill = shape.frame ? 'none' : shape.fill ?? 'none'
  const gradientId = `shape-gradient-${shape.id}`
  const fillPaint = shape.fillGradient ? `url(#${gradientId})` : shapeFill
  const pathInteriorHit = isPath && (shape.closed !== false || !shape.frame && (shape.fill != null || !!shape.fillGradient))
  const gradientStops = shape.fillGradient?.stops?.length
    ? shape.fillGradient.stops
    : shape.fillGradient
      ? [{ offset: 0, color: shape.fillGradient.start }, { offset: 1, color: shape.fillGradient.end }]
      : []

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

  // a purely horizontal or vertical line has w or h = 0 — an SVG clips to a 0-sized viewport by default, which would
  // hide the line (and its own stroke width) entirely, so it draws outside that box instead
  const lineStrokeWidth = shape.strokeWidth * zoom
  /** a line that is thicker in some places than others is drawn as the shape it covers, filled with the line's colour */
  const profiled = isLine && isProfiledLine(shape)
  const dashArray = isLine && shape.strokeDash === 'dashed' ? `${lineStrokeWidth * 3} ${lineStrokeWidth * 2}` : undefined

  return (
    <div
      className={'shape-frame' + (shape.frame ? ' graphic-frame' : '') + (tableShape ? ' table-frame' : '') + (selected && showEdge ? ' selected' : '') + (marked ? ' marked' : '') + (ghost ? ' ghost' : '') + (locked ? ' locked' : '')}
      data-object-id={shape.id}
      data-object-kind="shape"
      style={{
        left: tx + shape.x * zoom,
        top: ty + shape.y * zoom,
        width: w,
        height: h,
        zIndex: z,
        opacity: shape.opacity ?? 1,
        mixBlendMode: shape.blendMode,
        overflow: isLine || tableShape ? 'visible' : undefined,
        transform: shape.rotation ? `rotate(${shape.rotation}deg)` : undefined,
      }}
    >
      {tableShape && tableUi && (
        <TableView
          shape={tableShape}
          layout={tableUi.layout}
          zoom={zoom}
          selected={selected && tableUi.active}
          showEdge={showEdge}
          locked={locked}
          selection={tableUi.selection}
          onSelection={tableUi.onSelection}
          onContextMenu={tableUi.onContextMenu}
          onTable={tableUi.onTable}
          onBodyPointerDown={(event) => onPointerDown?.(event as unknown as ReactPointerEvent<SVGPathElement>)}
        />
      )}
      {!tableShape && <svg
        // an svg with no width or no height is not drawn at all (even with its overflow visible): a perfectly horizontal or vertical line gets a pixel of one
        width={Math.max(w, 1)}
        height={Math.max(h, 1)}
        viewBox={`0 0 ${Math.max(w, 1)} ${Math.max(h, 1)}`}
        style={{
          overflow: 'visible',
          filter: [(shape.blur ?? 0) > 0 ? `blur(${shape.blur! * zoom}px)` : undefined, dropShadowFilter(shape.shadowOffsetX, shape.shadowOffsetY ?? shape.shadowOffset, shape.shadowOpacity, zoom, shape.shadowColor)].filter(Boolean).join(' ') || undefined,
          ...(maskFeather ? featherMaskStyles(maskFeather, w, h, zoom) : {}),
        }}
        aria-hidden="true"
      >
        {shape.fillGradient && (
          <defs>
            {shape.fillGradient.type === 'radial' ? (
              <radialGradient id={gradientId} cx="50%" cy="50%" r="70%">
                {gradientStops.map((stop, index) => <stop key={index} offset={`${stop.offset * 100}%`} stopColor={shape.fillGradient!.reverse ? gradientStops[gradientStops.length - 1 - index].color : stop.color} />)}
              </radialGradient>
            ) : (
              <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" {...linearGradientLine((shape.fillGradient.angle ?? 0) + (shape.fillGradient.reverse ? 180 : 0), w, h)}>
                {gradientStops.map((stop, index) => <stop key={index} offset={`${stop.offset * 100}%`} stopColor={stop.color} />)}
              </linearGradient>
            )}
          </defs>
        )}
        {!img ? (
          <>
            {isPath && shape.closed === false && !shape.frame && (
              <rect
                width={w}
                height={h}
                fill="transparent"
                pointerEvents={ghost ? 'none' : 'all'}
                onPointerDown={onPointerDown}
                onDoubleClick={onDoubleClick}
              />
            )}
            {(isLine || isPath) && (
              // a thin (or even 1pt) line is genuinely hard to click exactly on — this invisible, much wider twin
              // of the same path takes the click/hover instead, so getting NEAR the line is enough to select it
              <path
                d={shapePath(shape, zoom)}
                fill={pathInteriorHit ? 'transparent' : 'none'}
                stroke="transparent"
                strokeWidth={Math.max(profiled ? lineStrokeWidth * 2 : lineStrokeWidth, 12)}
                strokeLinecap="round"
                pointerEvents={ghost ? 'none' : pathInteriorHit ? 'all' : 'stroke'}
                onPointerDown={onPointerDown}
                onDoubleClick={onDoubleClick}
              />
            )}
            <path
              d={profiled ? lineOutlinePath(shape, zoom) : shapePath(shape, zoom)}
              fill={profiled ? shape.stroke ?? 'none' : fillPaint}
              fillRule="evenodd"
              stroke={profiled ? 'none' : shape.stroke ?? 'none'}
              strokeWidth={lineStrokeWidth}
              strokeLinejoin={isPath ? (shape.strokeCap === 'butt' ? 'miter' : 'round') : 'round'}
              strokeLinecap={isLine || isPath ? (shape.strokeCap ?? (isPath ? 'round' : 'butt')) : undefined}
              strokeDasharray={profiled ? undefined : dashArray}
              pointerEvents={ghost ? 'none' : isLine || isPath ? 'none' : 'all'}
              onPointerDown={isLine || isPath ? undefined : onPointerDown}
              onDoubleClick={isLine || isPath ? undefined : onDoubleClick}
            />
          </>
        ) : (
          <>
            <defs>
              <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
                <path d={shapePath(shape, zoom)} />
              </clipPath>
            </defs>
            {/* the fill (if any) is the click target, and shows through a picture with transparency */}
            <path
              d={shapePath(shape, zoom)}
              fill={fillPaint}
              fillRule="evenodd"
              pointerEvents={ghost ? 'none' : 'all'}
              onPointerDown={onPointerDown}
              onDoubleClick={onDoubleClick}
            />
            <image
              href={img.asset.dataUrl}
              x={img.box.x * zoom}
              y={img.box.y * zoom}
              width={img.box.w * zoom}
              height={img.box.h * zoom}
              clipPath={`url(#${clipId})`}
              preserveAspectRatio="none"
              pointerEvents="none"
            />
            <path d={shapePath(shape, zoom)} fill="none" fillRule="evenodd" stroke={shape.stroke ?? 'none'} strokeWidth={shape.strokeWidth * zoom} strokeLinejoin="round" pointerEvents="none" />
          </>
        )}
        {shape.frame && !shape.image && !ghost && showEdge && Math.min(w, h) >= 20 && (
          <g className="empty-frame-icon" pointerEvents="none" transform={`translate(${w / 2} ${h / 2}) scale(${Math.min(1, Math.min(w, h) / 70)})`}>
            <rect x="-15" y="-11" width="30" height="22" rx="2" />
            <circle cx="-7" cy="-4" r="3" />
            <path d="M-15 7 -4 -3 4 3 10 -2 15 3V9H-15Z" />
          </g>
        )}
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
                      <tspan
                        key={i}
                        fontFamily={`"${r.style.fontFamily}", "Segoe UI", Arial, sans-serif`}
                        fontSize={r.style.fontSize * zoom}
                        fontWeight={r.style.weight}
                        fontStyle={r.style.italic ? 'italic' : 'normal'}
                        stroke={r.style.outlineWidth ? r.style.outlineColor ?? '#000000' : 'none'}
                        strokeWidth={(r.style.outlineWidth ?? 0) * zoom}
                        paintOrder="stroke fill"
                        filter={dropShadowFilter(r.style.shadowOffsetX, r.style.shadowOffsetY ?? r.style.shadowOffset, r.style.shadowOpacity, zoom, r.style.shadowColor)}
                        style={r.style.tracking ? { letterSpacing: (r.style.tracking / 1000) * r.style.fontSize * zoom } : undefined}
                      >
                        {piece}
                      </tspan>
                    )
                  })
                })()}
              </textPath>
            </text>
          </>
        )}
      </svg>}

      {showHandles && !isLine && (tableShape ? HANDLES.filter((handle) => ['nw', 'ne', 'se', 'sw', 'e', 'w'].includes(handle)) : HANDLES).map((handle) => <div key={handle} className={'handle ' + handle} onPointerDown={(e) => onHandleDown?.(handle, e)} />)}
      {showHandles &&
        isLine &&
        (shape.flip ? [[0, h], [w, 0]] : [[0, 0], [w, h]]).map(([left, top], i) => (
          <div
            key={i}
            className="handle line-end"
            title="גרור כדי להזיז את קצה הקו (Shift: זווית ישרה, ב-45°)"
            style={{ left, top }}
            onPointerDown={(e) => onLineEndDown?.(i as 0 | 1, e)}
          />
        ))}
      {showHandles && isLine && onLineWidthDown && (() => {
        const pos = shape.lineWidthPos ?? 0.5
        const [x0, y0, x1, y1] = shape.flip ? [0, h, w, 0] : [0, 0, w, h]
        return <div className="handle line-width" title="גרור לאורך הקו כדי להזיז את המקום העבה, ולמעלה או למטה כדי לעבות או לדקק את הקו" style={{ left: x0 + (x1 - x0) * pos, top: y0 + (y1 - y0) * pos }} onPointerDown={(e) => onLineWidthDown(e, 1)} />
      })()}
      {showHandles && isLine && onLineWidthDown && (() => {
        const [x0, y0, x1, y1] = shape.flip ? [0, h, w, 0] : [0, 0, w, h]
        const inset = Math.min(0.25, 16 / Math.max(1, Math.hypot(w, h)))
        const edges = shape.lineWidthEdges
        return ([[0, edges ? edges[0] : inset], [2, 1 - (edges ? edges[1] : inset)]] as const).map(([which, t]) => (
          <div key={which} className="handle line-width side" title="גרור למעלה או למטה כדי לעבות או לדקק את הקצה, ולאורך הקו כדי להזיז את המקום" style={{ left: x0 + (x1 - x0) * t, top: y0 + (y1 - y0) * t }} onPointerDown={(e) => onLineWidthDown(e, which)} />
        ))
      })()}
      {showHandles && !tableShape &&
        ROTATE_CORNERS.map((c) => <div key={c} className={'rotate-handle ' + c} title="גרור כדי לסובב (Shift: קפיצות של 45°)" onPointerDown={(e) => onRotateDown?.(c, e)} />)}

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
          <div className="direct-move-handle" title="גרור כדי להזיז את האובייקט" style={{ left: w / 2, top: h / 2 }} onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onDirectMove?.(e) }} />
          <svg className="curve-handle-lines" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
            {points!.map(({ vertex: v, index: i }) => {
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

          {showEdges && points!.map(({ vertex, next, index: i }) => (
            <div key={`edge${i}`} className="edge-handle" title="גרור כדי להוסיף נקודה ולעצב את הקו" style={edgeAt(vertex, next, w, h)} onPointerDown={(e) => onEdgeDown?.(i, e)} />
          ))}

          {points!.map(({ vertex: v, index: i }) => {
            const p = vertexPoint(v)
            const on = selectedPoints?.includes(i)
            return (
              <div
                key={`pt${i}`}
                className={'point-handle' + (on ? ' on' : '')}
                title="נקודת עיגון — לחיצה לבחירה וגרירה להזזה (Shift מוסיף לבחירה). לחיצה כפולה הופכת בין פינה חדה לעקומה חלקה. Alt-גרירה ממנה מוציאה ידיות עיצוב."
                style={{ left: p[0] * w, top: p[1] * h }}
                onPointerDown={(e) => onPointDown?.(i, e)}
              />
            )
          })}

          {points!.flatMap(({ vertex: v, index: i }): ReactNode[] => {
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
                  onPointerDown={(e) => { e.stopPropagation(); onHandleGrab?.(i, 'hi', e) }}
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
                  onPointerDown={(e) => { e.stopPropagation(); onHandleGrab?.(i, 'ho', e) }}
                />,
              )
            return out
          })}
        </>
      )}

      {showContent && (
        <>
          <div
            className="content-grabber"
            title="תוכן התמונה — גרור כדי להזיז את התמונה בתוך המסגרת, בלי להזיז את המסגרת עצמה"
            style={{ left: (img!.box.x + img!.box.w / 2) * zoom, top: (img!.box.y + img!.box.h / 2) * zoom }}
            onPointerDown={onContentGrab}
          />
          {CONTENT_CORNERS.map((c) => (
            <div
              key={c}
              className={'content-handle ' + c}
              title="גרור כדי לשנות את גודל התמונה בתוך המסגרת"
              style={contentHandleAt(c, img!.box, zoom)}
              onPointerDown={(e) => onContentResize?.(c, e)}
            />
          ))}
        </>
      )}
    </div>
  )
}

function contentHandleAt(corner: ContentCorner, box: { x: number; y: number; w: number; h: number }, zoom: number) {
  const left = (corner.includes('w') ? box.x : box.x + box.w) * zoom
  const top = (corner.includes('n') ? box.y : box.y + box.h) * zoom
  return { left, top }
}

/** the screen position of the middle of the edge from point `i` to the next one (wrapping around) */
function edgeAt(from: PathVertex, to: PathVertex, w: number, h: number) {
  const [ax, ay] = vertexPoint(from)
  const [bx, by] = vertexPoint(to)
  return { left: ((ax + bx) / 2) * w, top: ((ay + by) / 2) * h }
}

/** an outline with more points than this has no grabbing places on its edges */
const MANY_POINTS = 1500
