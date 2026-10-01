import polygonClipping from 'polygon-clipping'
import type { Pair, Polygon, MultiPolygon } from 'polygon-clipping'
import type { PathGeom, PathVertex, ShapeFrame } from './document'
import { fitRadii, polygonPoints, vertexHi, vertexHo, vertexPoint, type Pt } from './shapes'

/** Combining shapes: unite, subtract, intersect, exclude. The result is one new shape whose outline is a polygon. */

export type BoolOp = 'unite' | 'subtract' | 'intersect' | 'exclude'

export const BOOL_OP_NAMES: Record<BoolOp, string> = { unite: 'איחוד', subtract: 'חיסור', intersect: 'חיתוך', exclude: 'החרגה' }

/** Points per full circle when a curve is turned into a polygon: fine enough that the straight pieces cannot be seen. */
const ARC_STEPS = 160
/** Points per curved segment of a path shape, its two ends not counted. */
const BEZIER_STEPS = 16

const arc = (cx: number, cy: number, r: number, a0: number, a1: number, steps: number): Pair[] =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / steps
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  })

/** Points along the cubic curve from `a` to `b` (control points `c1`, `c2`), not counting either end. */
function bezierInterior(a: Pt, c1: Pt, c2: Pt, b: Pt): Pt[] {
  const pts: Pt[] = []
  for (let i = 1; i < BEZIER_STEPS; i++) {
    const t = i / BEZIER_STEPS
    const mt = 1 - t
    pts.push([
      mt * mt * mt * a[0] + 3 * mt * mt * t * c1[0] + 3 * mt * t * t * c2[0] + t * t * t * b[0],
      mt * mt * mt * a[1] + 3 * mt * mt * t * c1[1] + 3 * mt * t * t * c2[1] + t * t * t * b[1],
    ])
  }
  return pts
}

/** One ring of a path shape, flattened to a polygon in world coordinates: a straight edge between two plain corners, a
 * sampled curve wherever either end has a direction handle. */
function ringToPolygon(ring: PathVertex[], x: number, y: number, w: number, h: number): Pair[] {
  const out: Pair[] = []
  const n = ring.length
  for (let i = 0; i < n; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % n]
    const ap = vertexPoint(a)
    const bp = vertexPoint(b)
    out.push([x + ap[0] * w, y + ap[1] * h])
    const ho = vertexHo(a)
    const hi = vertexHi(b)
    if (ho || hi) {
      const c1: Pt = ho ? [ap[0] + ho[0], ap[1] + ho[1]] : ap
      const c2: Pt = hi ? [bp[0] + hi[0], bp[1] + hi[1]] : bp
      for (const [px, py] of bezierInterior(ap, c1, c2, bp)) out.push([x + px * w, y + py * h])
    }
  }
  return out
}

/** A shape as polygons in world coordinates. */
export function shapeToPolygons(s: ShapeFrame): MultiPolygon {
  const { x, y, w, h } = s
  let ring: Pair[]
  if (s.kind === 'path') {
    return (s.geom ?? []).map((poly) => poly.map((r) => ringToPolygon(r, x, y, w, h)))
  } else if (s.kind === 'ellipse') {
    ring = Array.from({ length: ARC_STEPS }, (_, i): Pair => {
      const a = (2 * Math.PI * i) / ARC_STEPS
      return [x + w / 2 + (w / 2) * Math.cos(a), y + h / 2 + (h / 2) * Math.sin(a)]
    })
  } else if (s.kind === 'polygon') {
    ring = polygonPoints(s.sides ?? 6, w, h).map(([px, py]) => [x + px, y + py])
  } else {
    const [tl, tr, br, bl] = fitRadii(s.radii, w, h)
    const steps = 24
    const q = Math.PI / 2
    ring = [
      ...(tl ? arc(x + tl, y + tl, tl, Math.PI, Math.PI + q, steps) : [[x, y] as Pair]),
      ...(tr ? arc(x + w - tr, y + tr, tr, -q, 0, steps) : [[x + w, y] as Pair]),
      ...(br ? arc(x + w - br, y + h - br, br, 0, q, steps) : [[x + w, y + h] as Pair]),
      ...(bl ? arc(x + bl, y + h - bl, bl, q, Math.PI, steps) : [[x, y + h] as Pair]),
    ]
  }
  return [[ring]]
}

/** Polygons back into a shape's own box: the new position and size, and the outline relative to it. Null when nothing is left. */
function toGeometry(polys: MultiPolygon): { x: number; y: number; w: number; h: number; geom: PathGeom } | null {
  const pts = polys.flatMap((p) => p.flatMap((r) => r))
  if (pts.length < 3) return null
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  const w = Math.max(...xs) - x
  const h = Math.max(...ys) - y
  if (w < 0.01 || h < 0.01) return null
  const round = (v: number) => Math.round(v * 1e6) / 1e6
  const geom: PathGeom = polys.map((poly) =>
    poly.map((ring) => {
      // the library closes every ring by repeating its first point: the path closes itself
      const open = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring
      return open.map(([px, py]): [number, number] => [round((px - x) / w), round((py - y) / h)])
    }),
  )
  return { x, y, w, h, geom }
}

/**
 * Combine shapes given from the back to the front.
 * unite: everything as one shape. subtract: the back shape minus all the shapes in front of it (they disappear).
 * intersect: only where all overlap. exclude: where an odd number of them cover.
 * The result takes the look (fill, line) of the BACK shape. Null when nothing remains.
 */
export function combineShapes(backToFront: ShapeFrame[], op: BoolOp): ({ x: number; y: number; w: number; h: number; geom: PathGeom } & Pick<ShapeFrame, 'fill' | 'stroke' | 'strokeWidth'>) | null {
  if (backToFront.length < 2) return null
  const [first, ...rest] = backToFront.map(shapeToPolygons)
  const result: MultiPolygon =
    op === 'unite'
      ? polygonClipping.union(first, ...rest)
      : op === 'subtract'
        ? polygonClipping.difference(first, ...rest)
        : op === 'intersect'
          ? polygonClipping.intersection(first, ...rest)
          : polygonClipping.xor(first, ...rest)
  const g = toGeometry(result as MultiPolygon)
  if (!g) return null
  const back = backToFront[0]
  return { ...g, fill: back.fill, stroke: back.stroke, strokeWidth: back.strokeWidth }
}

export function splitShapeByMask(shape: ShapeFrame, mask: ShapeFrame): {
  remainder: { x: number; y: number; w: number; h: number; geom: PathGeom } | null
  piece: { x: number; y: number; w: number; h: number; geom: PathGeom } | null
} {
  const cx = shape.x + shape.w / 2
  const cy = shape.y + shape.h / 2
  const angle = ((shape.rotation ?? 0) * Math.PI) / 180
  const source: MultiPolygon = shapeToPolygons(shape).map((poly) => poly.map((ring) => ring.map(([x, y]): Pair => [
    cx + (x - cx) * Math.cos(angle) - (y - cy) * Math.sin(angle),
    cy + (x - cx) * Math.sin(angle) + (y - cy) * Math.cos(angle),
  ])))
  const cutter = shapeToPolygons(mask)
  const remainder = polygonClipping.difference(source, cutter) as MultiPolygon
  const piece = polygonClipping.intersection(source, cutter) as MultiPolygon
  return { remainder: toGeometry(remainder), piece: toGeometry(piece) }
}

export type { Polygon }
