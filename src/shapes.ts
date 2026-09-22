import { MAX_SIDES, MIN_SIDES, type DrawKind, type PathGeom, type PathVertex, type ShapeFrame, type ShapeKind } from './document'

export type Pt = [number, number]

/** A vertex's own position, whether it is a plain corner or a smooth point. */
export const vertexPoint = (v: PathVertex): Pt => (Array.isArray(v) ? v : v.p)
/** Its handle toward the previous point, if it has one (an offset from the point, 0…1 of the box). */
export const vertexHi = (v: PathVertex): Pt | undefined => (Array.isArray(v) ? undefined : v.hi)
/** Its handle toward the next point, if it has one. */
export const vertexHo = (v: PathVertex): Pt | undefined => (Array.isArray(v) ? undefined : v.ho)

/** Geometry of the shapes, in the shape's own units (0,0 = its top-left corner, w × h = its size). */

export const SHAPE_NAMES: Record<ShapeKind, string> = { rect: 'מלבן', ellipse: 'אליפסה', polygon: 'מצולע', path: 'צורה מורכבת' }
export const DRAW_KINDS: DrawKind[] = ['rect', 'ellipse', 'polygon']
export const SIDE_NAMES: Record<number, string> = { 3: 'משולש', 4: 'מרובע', 5: 'מחומש', 6: 'משושה' }

/** What a click without dragging creates (points), and the last settings of each tool. */
export interface ShapePrefs {
  rect: { w: number; h: number; radius: number }
  ellipse: { w: number; h: number }
  polygon: { w: number; h: number; sides: number }
}

export const DEFAULT_SHAPE_PREFS: ShapePrefs = {
  rect: { w: 150, h: 100, radius: 0 },
  ellipse: { w: 150, h: 100 },
  polygon: { w: 120, h: 120, sides: 6 },
}

export const clampSides = (n: number) => Math.min(MAX_SIDES, Math.max(MIN_SIDES, Math.round(n)))

/**
 * The width / height ratio of a shape that is exactly regular: 1 for a square or a circle, and for a polygon the ratio of the
 * box around a regular polygon with its apex up (a hexagon is about 0.87, a pentagon about 1.05, a triangle about 1.15).
 */
export function regularRatio(kind: ShapeKind, sides: number): number {
  if (kind !== 'polygon') return 1
  const n = clampSides(sides)
  const pts = Array.from({ length: n }, (_, i) => [Math.cos(-Math.PI / 2 + (2 * Math.PI * i) / n), Math.sin(-Math.PI / 2 + (2 * Math.PI * i) / n)])
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  return (Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys))
}

/** The corner points of a regular polygon (apex up), stretched so it fills the w × h box exactly. */
export function polygonPoints(sides: number, w: number, h: number): [number, number][] {
  const n = clampSides(sides)
  const raw = Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n
    return [Math.cos(a), Math.sin(a)] as [number, number]
  })
  const xs = raw.map((p) => p[0])
  const ys = raw.map((p) => p[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  return raw.map(([x, y]) => [((x - x0) / (x1 - x0)) * w, ((y - y0) / (y1 - y0)) * h])
}

/** A rectangle's corner radii, each limited so that neighbouring corners never overlap. */
export function fitRadii(radii: [number, number, number, number] | undefined, w: number, h: number): [number, number, number, number] {
  const [tl, tr, br, bl] = (radii ?? [0, 0, 0, 0]).map((r) => Math.max(0, r))
  // the same rule as CSS border-radius: shrink every radius by the tightest side
  const k = Math.min(1, w / Math.max(tl + tr, br + bl, 1e-9), h / Math.max(tl + bl, tr + br, 1e-9))
  return [tl * k, tr * k, br * k, bl * k]
}

/** The SVG path of a rectangle with (possibly different) rounded corners. */
export function roundedRectPath(w: number, h: number, radii?: [number, number, number, number]): string {
  const [tl, tr, br, bl] = fitRadii(radii, w, h)
  return [
    `M${tl} 0`,
    `H${w - tr}`,
    tr ? `A${tr} ${tr} 0 0 1 ${w} ${tr}` : '',
    `V${h - br}`,
    br ? `A${br} ${br} 0 0 1 ${w - br} ${h}` : '',
    `H${bl}`,
    bl ? `A${bl} ${bl} 0 0 1 0 ${h - bl}` : '',
    `V${tl}`,
    tl ? `A${tl} ${tl} 0 0 1 ${tl} 0` : '',
    'Z',
  ].join('')
}

/** One ring of a 'path' shape as an SVG sub-path: a straight line between two plain corners, a cubic curve wherever either
 * end has a direction handle. */
function ringPath(ring: PathVertex[], w: number, h: number): string {
  if (ring.length === 0) return ''
  const at = (p: Pt) => `${p[0] * w} ${p[1] * h}`
  let d = 'M' + at(vertexPoint(ring[0]))
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const ho = vertexHo(a)
    const hi = vertexHi(b)
    if (!ho && !hi) {
      d += 'L' + at(vertexPoint(b))
      continue
    }
    const ap = vertexPoint(a)
    const bp = vertexPoint(b)
    const c1: Pt = ho ? [ap[0] + ho[0], ap[1] + ho[1]] : ap
    const c2: Pt = hi ? [bp[0] + hi[0], bp[1] + hi[1]] : bp
    d += `C${at(c1)} ${at(c2)} ${at(bp)}`
  }
  return d + 'Z'
}

/** The outline of any shape as an SVG path, in its own units scaled by `k`. */
export function shapePath(s: ShapeFrame, k = 1): string {
  const w = s.w * k
  const h = s.h * k
  if (s.kind === 'rect') return roundedRectPath(w, h, s.radii?.map((r) => r * k) as [number, number, number, number] | undefined)
  if (s.kind === 'path') {
    // every ring of every polygon is a closed sub-path; holes come out right with the even-odd fill rule
    return (s.geom ?? []).flatMap((poly) => poly.map((ring) => ringPath(ring, w, h))).join('')
  }
  if (s.kind === 'ellipse') return `M0 ${h / 2}A${w / 2} ${h / 2} 0 1 1 ${w} ${h / 2}A${w / 2} ${h / 2} 0 1 1 0 ${h / 2}Z`
  return 'M' + polygonPoints(s.sides ?? 6, w, h).map(([x, y]) => `${x} ${y}`).join('L') + 'Z'
}

/**
 * The vertices a shape can be point-edited by, 0…1 of its box (a rectangle's corners regardless of any rounding, a
 * regular polygon's corners, or a path's own outline — its first ring, with whatever curve handles it already has). An
 * ellipse has no natural vertices, so null: it keeps the ordinary resize handles.
 */
export function editableRing(s: ShapeFrame): PathVertex[] | null {
  if (s.kind === 'path') return s.geom?.[0]?.[0] ?? null
  if (s.kind === 'rect') return [[0, 0], [1, 0], [1, 1], [0, 1]]
  if (s.kind === 'polygon') return polygonPoints(s.sides ?? 6, 1, 1)
  return null
}

/** A copy of `geom`'s first ring (of its first polygon) with one vertex replaced; everything else — other rings, other
 * polygons (holes, extra pieces) — unchanged. */
export function replaceVertex(geom: PathGeom, index: number, v: PathVertex): PathGeom {
  return [[geom[0][0].map((old, i) => (i === index ? v : old)), ...geom[0].slice(1)], ...geom.slice(1)]
}

/** Where the four rounding handles of a rectangle sit, and which way is "inside" at each corner. */
export const CORNERS = [
  { name: 'שמאל למעלה', sx: 1, sy: 1, fx: 0, fy: 0 },
  { name: 'ימין למעלה', sx: -1, sy: 1, fx: 1, fy: 0 },
  { name: 'ימין למטה', sx: -1, sy: -1, fx: 1, fy: 1 },
  { name: 'שמאל למטה', sx: 1, sy: -1, fx: 0, fy: 1 },
] as const
