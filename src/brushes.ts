import polygonClipping from 'polygon-clipping'
import type { Pair, Polygon } from 'polygon-clipping'
import type { PathGeom, Sharpness, ShapeFrame } from './document'
import { softBrushBlur } from './sharpness'
import { shapePath } from './shapes'
import { parseSvgPath } from './vectorShapes'

/**
 * Brushes: a stroke drawn with one becomes plain vector shapes - the outline of what the brush covers, as one shape (a compound path
 * when it is several pieces) filled with the colour. Nothing about a brush is kept: what is made is as sharp at any size, and as
 * editable, as any other shape.
 */

type Pt = [number, number]

export type BrushStyleId = 'round' | 'calligraphic' | 'taper' | 'splatter' | 'dry' | 'dots'

export interface BrushStyle {
  id: BrushStyleId
  label: string
  hint: string
  /** the size (points) the brush starts with */
  size: number
}

export const BRUSH_STYLES: BrushStyle[] = [
  { id: 'round', label: 'קו עגול', hint: 'קו אחיד בקצוות עגולים', size: 8 },
  { id: 'calligraphic', label: 'קליגרפי', hint: 'קצה שטוח בזווית: הקו עבה ודק לפי הכיוון', size: 18 },
  { id: 'taper', label: 'מדורג', hint: 'דק בקצוות ועבה באמצע', size: 16 },
  { id: 'splatter', label: 'נתז צבע', hint: 'גוף של צבע עם טיפות ונתזים סביבו', size: 22 },
  { id: 'dry', label: 'מברשת יבשה', hint: 'שערות מקבילות שנקטעות', size: 26 },
  { id: 'dots', label: 'נקודות', hint: 'נקודות לאורך הקו', size: 14 },
]

export const MIN_BRUSH_SIZE = 1
export const MAX_BRUSH_SIZE = 120

/** the most pieces of one stroke: a stroke longer than that is drawn with larger steps */
const MAX_PIECES = 900

// ── small things ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** a number generator that gives the same numbers for the same seed, so the same stroke makes the same drops */
function random(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** a seed from the points of a stroke */
export function seedOf(points: Pt[]): number {
  let hash = 2166136261
  for (const [x, y] of points) {
    hash = Math.imul(hash ^ Math.round(x * 10), 16777619)
    hash = Math.imul(hash ^ Math.round(y * 10), 16777619)
  }
  return hash >>> 0
}

const length = (points: Pt[]) => points.reduce((sum, p, i) => (i === 0 ? 0 : sum + Math.hypot(p[0] - points[i - 1]![0], p[1] - points[i - 1]![1])), 0)
/** the length of a polyline, and the number generator (for the brushes that come from outside) */
export const pathLength = length
export const seededRandom = random

/** the polyline smoothed: every corner is cut (twice), the two ends stay where they are */
export function smoothPoints(points: Pt[], passes = 2): Pt[] {
  let current = points
  for (let pass = 0; pass < passes; pass += 1) {
    if (current.length < 3) return current
    const next: Pt[] = [current[0]!]
    for (let i = 0; i < current.length - 1; i += 1) {
      const a = current[i]!
      const b = current[i + 1]!
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75])
    }
    next.push(current[current.length - 1]!)
    current = next
  }
  return current
}

/** points a given distance apart along the polyline (its two ends are kept) */
export function resample(points: Pt[], spacing: number): Pt[] {
  if (points.length < 2) return points.slice()
  const total = length(points)
  const step = Math.max(0.05, spacing)
  const count = Math.max(1, Math.round(total / step))
  const out: Pt[] = [points[0]!]
  let segment = 0
  let walked = 0
  for (let k = 1; k < count; k += 1) {
    const target = (total * k) / count
    while (segment < points.length - 2 && walked + Math.hypot(points[segment + 1]![0] - points[segment]![0], points[segment + 1]![1] - points[segment]![1]) < target) {
      walked += Math.hypot(points[segment + 1]![0] - points[segment]![0], points[segment + 1]![1] - points[segment]![1])
      segment += 1
    }
    const a = points[segment]!
    const b = points[segment + 1]!
    const run = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const t = (target - walked) / run
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
  }
  out.push(points[points.length - 1]!)
  return out
}

const circle = (cx: number, cy: number, r: number, n = 14): Pt[] =>
  Array.from({ length: n }, (_, i): Pt => [cx + r * Math.cos((2 * Math.PI * i) / n), cy + r * Math.sin((2 * Math.PI * i) / n)])

const ellipse = (cx: number, cy: number, rx: number, ry: number, angle: number, n = 14): Pt[] => {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return Array.from({ length: n }, (_, i): Pt => {
    const t = (2 * Math.PI * i) / n
    const x = rx * Math.cos(t)
    const y = ry * Math.sin(t)
    return [cx + x * cos - y * sin, cy + x * sin + y * cos]
  })
}

/** the smallest convex polygon that holds the points */
function hull(points: Pt[]): Pt[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (sorted.length < 3) return sorted
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: Pt[] = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Pt[] = []
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return [...lower, ...upper]
}

/** the pieces joined into the polygons they make (a ring that is not a hole of another), without the closing point the library repeats */
function union(rings: Pt[][]): Pt[][][] {
  const usable = rings.filter((ring) => ring.length >= 3)
  if (usable.length === 0) return []
  const polygons: Polygon[] = usable.map((ring) => [ring as Pair[]])
  let merged: ReturnType<typeof polygonClipping.union>
  try {
    merged = polygonClipping.union(polygons[0]!, ...polygons.slice(1))
  } catch {
    // the library gave up on a degenerate piece: the pieces stay as they are, each a polygon of its own
    return usable.map((ring) => [ring])
  }
  return merged.map((polygon) =>
    polygon.map((ring) => {
      const open = ring.length > 1 && ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1] ? ring.slice(0, -1) : ring
      return open.map(([x, y]): Pt => [x, y])
    }),
  )
}

/** a stroke of even width with flat ends and sharp corners: a quadrilateral for every step of the line, and a wedge at every corner */
function buttStroke(points: Pt[], radius: number): Pt[][][] {
  const pieces: Pt[][] = []
  let before: Pt | null = null
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!
    const b = points[i + 1]!
    const run = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (run < 1e-6) continue
    const nx = (-(b[1] - a[1]) / run) * radius
    const ny = ((b[0] - a[0]) / run) * radius
    pieces.push([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]])
    if (before) {
      // the two sides of the corner: the one on the outside of the turn is the one that has a gap
      const px = before[0]
      const py = before[1]
      pieces.push([[a[0], a[1]], [a[0] + px, a[1] + py], [a[0] + nx, a[1] + ny]], [[a[0], a[1]], [a[0] - px, a[1] - py], [a[0] - nx, a[1] - ny]])
    }
    before = [nx, ny]
  }
  return union(pieces)
}

/** a rectangle, turned: the flat nib of a chisel */
const rectangle = (cx: number, cy: number, rx: number, ry: number, angle: number): Pt[] => {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return [[-rx, -ry], [rx, -ry], [rx, ry], [-rx, ry]].map(([x, y]): Pt => [cx + x! * cos - y! * sin, cy + x! * sin + y! * cos])
}

/** a stroke of changing width: the capsule between every two neighbouring round stamps, joined */
function variableStroke(points: Pt[], radii: number[]): Pt[][][] {
  const stamps = points.map(([x, y], i) => circle(x, y, Math.max(0.15, radii[i]!), 12))
  if (stamps.length === 1) return union([stamps[0]!])
  const pieces: Pt[][] = []
  for (let i = 0; i < stamps.length - 1; i += 1) pieces.push(hull([...stamps[i]!, ...stamps[i + 1]!]))
  return union(pieces)
}

/** how far apart the stamps of a brush are: the wanted distance, or more when there would be too many (`lanes` strands run side by side) */
function stepFor(points: Pt[], wanted: number, lanes = 1): number {
  const total = length(points)
  return Math.max(wanted, (total * lanes) / MAX_PIECES)
}

// ── the brushes ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * What a brush of `style` and `size` covers when it is drawn along `points` (world points): polygons, each a list of rings (the first
 * is the outline, the others are holes).
 */
export function brushPolygons(points: Pt[], style: BrushStyleId, size: number, seed = seedOf(points), sharpness: Sharpness = 'medium'): Pt[][][] {
  if (points.length === 0) return []
  // sharp: flat ends, straight facets and pointed ends instead of round ones (soft is as medium: the blur is the shape's, see brushShape)
  const sharp = sharpness === 'sharp'
  const facets = (n: number) => (sharp ? Math.min(n, 5) : n)
  const clean = points.length > 2 ? smoothPoints(points, 2) : points
  const s = Math.max(MIN_BRUSH_SIZE, Math.min(MAX_BRUSH_SIZE, size))
  const rng = random(seed)
  // a ring (the outline of a closed shape) has no ends to thin: it keeps its width all the way round
  const ring = points.length > 3 && Math.hypot(points[0]![0] - points[points.length - 1]![0], points[0]![1] - points[points.length - 1]![1]) < 0.5
  if (clean.length === 1 || length(clean) < 0.5) {
    // a click: a dot of the size of the brush
    const [x, y] = clean[0]!
    if (style === 'splatter') return union([circle(x, y, s * 0.45, 16), ...Array.from({ length: 7 }, () => {
      const angle = rng() * Math.PI * 2
      const distance = s * (0.6 + rng() * 0.9)
      return circle(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, Math.max(0.5, s * 0.22 * rng() ** 2), 10)
    })])
    return union([circle(x, y, s / 2, 18)])
  }

  if (style === 'round') {
    const path = resample(clean, stepFor(clean, s * 0.5))
    if (sharp) return buttStroke(path, s / 2)
    return variableStroke(path, path.map(() => s / 2))
  }

  if (style === 'calligraphic') {
    // a flat nib held at an angle: an ellipse that is wide and thin, stamped along the path
    const path = resample(clean, stepFor(clean, s * 0.4))
    const angle = (-40 * Math.PI) / 180
    const stamps = path.map(([x, y]) => (sharp ? rectangle(x, y, s / 2, Math.max(0.3, s / 9), angle) : ellipse(x, y, s / 2, Math.max(0.3, s / 7), angle, 12)))
    const pieces: Pt[][] = stamps.length === 1 ? [stamps[0]!] : []
    for (let i = 0; i < stamps.length - 1; i += 1) pieces.push(hull([...stamps[i]!, ...stamps[i + 1]!]))
    return union(pieces)
  }

  if (style === 'taper') {
    const path = resample(clean, stepFor(clean, s * 0.5))
    const last = Math.max(1, path.length - 1)
    // sharp: the width falls away in a straight line to a point at each end
    const profile = (i: number) => (sharp ? Math.max(0.02, 1 - Math.abs((2 * i) / last - 1)) : Math.max(0.04, Math.sin((Math.PI * i) / last) ** 0.7))
    return variableStroke(path, path.map((_, i) => (s / 2) * (ring ? 0.8 : profile(i))))
  }

  if (style === 'dots') {
    const path = resample(clean, stepFor(clean, s * 1.5))
    return union(path.map(([x, y]) => (sharp ? rectangle(x, y, (s / 2) * (0.65 + rng() * 0.45), (s / 2) * (0.65 + rng() * 0.45), rng() * Math.PI) : circle(x, y, (s / 2) * (0.65 + rng() * 0.45), 14))))
  }

  if (style === 'dry') {
    // parallel hairs, each running and stopping at random
    const hairs = Math.max(4, Math.min(14, Math.round(s / 2.5)))
    const path = resample(clean, stepFor(clean, Math.max(1, s * 0.18), hairs))
    const radius = Math.max(0.35, s / (hairs * 2.3))
    const pieces: Pt[][] = []
    for (let h = 0; h < hairs; h += 1) {
      const across = (h / (hairs - 1) - 0.5) * s
      let on = rng() > 0.15
      let left = Math.floor(6 + rng() * 40)
      let previous: Pt[] | null = null
      for (let i = 0; i < path.length; i += 1) {
        if (left-- <= 0) {
          on = !on
          // the hairs at the edge stop more often than those in the middle
          const edge = Math.abs(h / (hairs - 1) - 0.5) * 2
          left = on ? Math.floor(5 + rng() * 40 * (1 - 0.5 * edge)) : Math.floor(1 + rng() * (6 + 10 * edge))
        }
        const a = path[Math.max(0, i - 1)]!
        const b = path[Math.min(path.length - 1, i + 1)]!
        const run = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
        const nx = -(b[1] - a[1]) / run
        const ny = (b[0] - a[0]) / run
        const stamp = circle(path[i]![0] + nx * across, path[i]![1] + ny * across, radius, facets(8))
        if (on) pieces.push(previous ? hull([...previous, ...stamp]) : stamp)
        previous = on ? stamp : null
      }
    }
    return union(pieces)
  }

  // splatter: a thin body and drops thrown round it
  const path = resample(clean, stepFor(clean, s * 0.3))
  const last = Math.max(1, path.length - 1)
  const body = variableStroke(path, path.map((_, i) => (s * 0.28) * (ring ? 1 : 0.55 + 0.45 * Math.sin((Math.PI * i) / last)) * (0.85 + rng() * 0.3)))
  const pieces: Pt[][] = body.flatMap((polygon) => polygon.slice(0, 1))
  for (let i = 0; i < path.length; i += 1) {
    const a = path[Math.max(0, i - 1)]!
    const b = path[Math.min(path.length - 1, i + 1)]!
    const run = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const tx = (b[0] - a[0]) / run
    const ty = (b[1] - a[1]) / run
    const nx = -ty
    const ny = tx
    const throws = 1 + Math.floor(rng() * 3)
    for (let k = 0; k < throws; k += 1) {
      // most drops are near the body, few are far, and a few are big
      const across = (rng() + rng() + rng() - 1.5) * s * 1.7
      const along = (rng() - 0.5) * s * 0.6
      const x = path[i]![0] + nx * across + tx * along
      const y = path[i]![1] + ny * across + ty * along
      const kind = rng()
      if (kind < 0.06) {
        // a streak thrown outwards
        const direction = Math.atan2(across >= 0 ? ny : -ny, across >= 0 ? nx : -nx)
        pieces.push(ellipse(x, y, s * (0.5 + rng() * 0.9), Math.max(0.3, s * 0.07), direction + (rng() - 0.5) * 0.4, facets(10)))
      } else if (kind < 0.12) {
        const radius = s * (0.28 + rng() * 0.3)
        pieces.push(ellipse(x, y, radius, radius * (0.7 + rng() * 0.5), rng() * Math.PI, facets(12)))
      } else {
        const radius = Math.max(0.5, s * 0.3 * rng() ** 2.2)
        pieces.push(ellipse(x, y, radius, radius * (0.75 + rng() * 0.6), rng() * Math.PI, facets(8)))
      }
      if (pieces.length > MAX_PIECES) break
    }
    if (pieces.length > MAX_PIECES) break
  }
  return union(pieces)
}

// ── a stroke as a shape ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** polygons (world points) as one shape: a compound path, in the box that holds them, filled with `color` */
export function shapeFromPolygons(polygons: Pt[][][], color: string, id: string, z: number, layerId?: string): ShapeFrame | null {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [x, y] of ring) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (!Number.isFinite(x0)) return null
  const w = Math.max(0.01, x1 - x0)
  const h = Math.max(0.01, y1 - y0)
  const round = (v: number) => Math.round(v * 1e5) / 1e5
  const geom: PathGeom = polygons.map((polygon) => polygon.map((ring) => ring.map(([x, y]): [number, number] => [round((x - x0) / w), round((y - y0) / h)])))
  const shape: ShapeFrame = { id, kind: 'path', x: x0, y: y0, w, h, geom, fill: color, stroke: null, strokeWidth: 0, z }
  if (layerId) shape.layerId = layerId
  return shape
}

/** a stroke drawn with a brush (the points the pointer went through), as a shape; null when it covers nothing */
export function brushShape(points: Pt[], style: BrushStyleId, size: number, color: string, id: string, z: number, layerId?: string, sharpness: Sharpness = 'medium'): ShapeFrame | null {
  const shape = shapeFromPolygons(brushPolygons(points, style, size, seedOf(points), sharpness), color, id, z, layerId)
  // soft: the whole stroke is blurred a little
  if (shape && sharpness === 'soft') shape.blur = softBrushBlur(size)
  return shape
}

/**
 * The lines a shape's outline is made of, as points in the page: a line, an open path, the ring of a closed shape (with its first point
 * repeated at the end). Curves are sampled; the turn of the shape is applied.
 */
export function centerlinesOf(shape: ShapeFrame): Pt[][] | null {
  if (shape.kind === 'table') return null
  if (shape.kind === 'path' && !shape.geom?.length) return null
  const ops = parseSvgPath(shapePath(shape, 1))
  if (!ops) return null
  const turn = ((shape.rotation ?? 0) * Math.PI) / 180
  const cos = Math.cos(turn)
  const sin = Math.sin(turn)
  const move = (px: number, py: number): Pt => {
    const dx = px - shape.w / 2
    const dy = py - shape.h / 2
    return [shape.x + shape.w / 2 + dx * cos - dy * sin, shape.y + shape.h / 2 + dx * sin + dy * cos]
  }
  const lines: Pt[][] = []
  let current: Pt[] = []
  let start: Pt = [0, 0]
  let last: Pt = [0, 0]
  const flush = (closed: boolean) => {
    if (current.length >= 2) {
      if (closed) current.push(current[0]!)
      lines.push(current)
    }
    current = []
  }
  for (const op of ops) {
    if (op[0] === 'M') {
      flush(false)
      start = [op[1], op[2]]
      last = start
      current = [move(op[1], op[2])]
    } else if (op[0] === 'L') {
      current.push(move(op[1], op[2]))
      last = [op[1], op[2]]
    } else if (op[0] === 'C') {
      const [, c1x, c1y, c2x, c2y, x, y] = op
      const approx = Math.hypot(c1x - last[0], c1y - last[1]) + Math.hypot(c2x - c1x, c2y - c1y) + Math.hypot(x - c2x, y - c2y)
      const steps = Math.max(4, Math.min(48, Math.ceil(approx / 4)))
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps
        const u = 1 - t
        current.push(move(u * u * u * last[0] + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x, u * u * u * last[1] + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y))
      }
      last = [x, y]
    } else {
      flush(true)
      last = start
    }
  }
  flush(false)
  return lines.length > 0 ? lines : null
}
