import polygonClipping from 'polygon-clipping'
import type { MultiPolygon, Pair, Polygon } from 'polygon-clipping'
import type { BrushStroke, Sharpness, ShapeFrame } from './document'
import { softBrushBlur } from './sharpness'
import { brushShape, MAX_BRUSH_SIZE, MIN_BRUSH_SIZE, pathLength, resample, seededRandom, seedOf, shapeFromPolygons, smoothPoints, type BrushStyleId } from './brushes'

/**
 * Brushes that come from outside: a shape (from an SVG file, or a picture traced into an outline) that is either repeated along the
 * stroke or stretched along it. What is drawn is, as with the brushes of the program, plain vector outlines - nothing of the file is
 * kept in the shape the brush makes.
 */

type Pt = [number, number]

export type CustomBrushMode = 'repeat' | 'stretch'

export interface CustomBrush {
  /** `custom:` and a number: tells it from the brushes of the program */
  id: string
  name: string
  /** one copy: polygons (the outline first, holes after), one unit high, centred on 0,0 */
  polygons: Pt[][][]
  /** the width of the shape, in units of its height */
  aspect: number
  mode: CustomBrushMode
  /** repeat: the distance between copies, in widths of a copy (1: one after the other) */
  spacing: number
  /** repeat: every copy is turned to the direction of the line */
  rotate: boolean
  /** repeat: how much the size, the turn and the place of the copies vary (0…1) */
  variation: number
}

export const MAX_CUSTOM_BRUSHES = 100
/** the points a shape of a brush may have: a drawing with more is simplified (a hundred brushes have to fit in what the browser keeps) */
export const MAX_BRUSH_POINTS = 1500
/** the points of all the copies of one stroke */
const MAX_STROKE_POINTS = 40000
const MAX_PIECES = 900

export const isCustomBrushId = (id: string): boolean => id.startsWith('custom:')

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

// ── making a brush from outlines ──────────────────────────────────────────────────────────────────────────────────────────────

/** a ring without the closing point the clipping library repeats */
const open = (ring: Pair[]): Pt[] => {
  const last = ring[ring.length - 1]
  const same = ring.length > 1 && last![0] === ring[0]![0] && last![1] === ring[0]![1]
  return (same ? ring.slice(0, -1) : ring).map(([x, y]): Pt => [x, y])
}

/** the line simplified: points that are within `tolerance` of the line between their neighbours are dropped (Douglas-Peucker) */
function simplify(ring: Pt[], tolerance: number): Pt[] {
  if (ring.length <= 4) return ring
  const keep = new Uint8Array(ring.length)
  keep[0] = 1
  keep[ring.length - 1] = 1
  const stack: [number, number][] = [[0, ring.length - 1]]
  while (stack.length > 0) {
    const [from, to] = stack.pop()!
    const [ax, ay] = ring[from]!
    const [bx, by] = ring[to]!
    const run = Math.hypot(bx - ax, by - ay)
    let farthest = -1
    let distance = tolerance
    for (let i = from + 1; i < to; i += 1) {
      const [px, py] = ring[i]!
      const d = run === 0 ? Math.hypot(px - ax, py - ay) : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / run
      if (d > distance) {
        distance = d
        farthest = i
      }
    }
    if (farthest >= 0) {
      keep[farthest] = 1
      stack.push([from, farthest], [farthest, to])
    }
  }
  return ring.filter((_, i) => keep[i])
}

const round = (value: number) => Math.round(value * 1e4) / 1e4

const pointsIn = (polygons: Pt[][][]) => polygons.reduce((sum, polygon) => sum + polygon.reduce((inner, ring) => inner + ring.length, 0), 0)

/**
 * A brush from outlines: each group is the closed lines of one drawn thing (what is inside two of them is a hole, by the even-odd rule);
 * the things are joined. The shape is made one unit high and centred. Null when there is nothing to draw with.
 */
export function brushFromOutlines(groups: Pt[][][], name: string, id = newBrushId()): CustomBrush | null {
  const parts: MultiPolygon[] = []
  for (const group of groups) {
    const rings = group.filter((ring) => ring.length >= 3)
    if (rings.length === 0) continue
    try {
      parts.push(rings.length === 1 ? [[rings[0] as Pair[]]] : polygonClipping.xor([rings[0] as Pair[]], ...rings.slice(1).map((ring) => [ring as Pair[]] as Polygon)))
    } catch {
      parts.push(rings.map((ring) => [ring as Pair[]] as Polygon))
    }
  }
  if (parts.length === 0) return null
  let joined: MultiPolygon
  try {
    joined = parts.length === 1 ? parts[0]! : polygonClipping.union(parts[0]!, ...parts.slice(1))
  } catch {
    joined = parts.flat()
  }
  let polygons: Pt[][][] = joined.map((polygon) => polygon.map((ring) => open(ring)).filter((ring) => ring.length >= 3)).filter((polygon) => polygon.length > 0)
  if (polygons.length === 0) return null
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const polygon of polygons) {
    for (const [x, y] of polygon[0]!) {
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  const width = x1 - x0
  const height = y1 - y0
  if (!(width > 0) || !(height > 0)) return null
  // simplified until the shape is small enough to keep
  let tolerance = height * 0.0015
  const count = () => polygons.reduce((sum, polygon) => sum + polygon.reduce((inner, ring) => inner + ring.length, 0), 0)
  for (let pass = 0; pass < 12 && count() > MAX_BRUSH_POINTS; pass += 1) {
    polygons = polygons
      .map((polygon) => polygon.map((ring) => simplify(ring, tolerance)).filter((ring) => ring.length >= 3))
      .filter((polygon) => polygon.length > 0)
    tolerance *= 1.6
  }
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const aspect = clamp(width / height, 0.05, 40)
  const unit = polygons.map((polygon) => polygon.map((ring) => ring.map(([x, y]): Pt => [round(((x - cx) / height)), round((y - cy) / height)])))
  return {
    id,
    name: name.trim() || 'מברשת',
    polygons: unit,
    aspect: round(aspect),
    mode: aspect > 2.5 ? 'stretch' : 'repeat',
    spacing: 1.1,
    rotate: true,
    variation: 0.25,
  }
}

/** the shape of a brush with few points, for drawing it small in a list (it is the same shape, drawn with less) */
const previewShapes = new WeakMap<Pt[][][], Pt[][][]>()
export function previewBrush(brush: CustomBrush, points = 160): CustomBrush {
  if (pointsIn(brush.polygons) <= points) return brush
  let polygons = previewShapes.get(brush.polygons)
  if (!polygons) {
    polygons = brush.polygons
    let tolerance = 0.004
    for (let pass = 0; pass < 12 && pointsIn(polygons) > points; pass += 1) {
      polygons = polygons
        .map((polygon) => polygon.map((ring) => simplify(ring, tolerance)).filter((ring) => ring.length >= 3))
        .filter((polygon) => polygon.length > 0)
      tolerance *= 1.6
    }
    previewShapes.set(brush.polygons, polygons)
  }
  return { ...brush, polygons }
}

let counter = 0
export function newBrushId(): string {
  counter += 1
  return `custom:${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

// ── what a brush covers ───────────────────────────────────────────────────────────────────────────────────────────────────────


/** a shape of closed lines, joined into the polygons it makes (what overlaps becomes one) */
function joined(parts: Pair[][][][]): Pt[][][] {
  if (parts.length === 0) return []
  let merged: MultiPolygon
  try {
    merged = parts.length === 1 ? polygonClipping.union(parts[0]!) : polygonClipping.union(parts[0]!, ...parts.slice(1))
  } catch {
    merged = parts.flat()
  }
  return merged.map((polygon) => polygon.map((ring) => open(ring)))
}

/**
 * What `brush` covers when it is drawn along `points` (world points) at `size` (the height of a copy; the thickness of a stretched
 * shape): polygons, each a list of rings (the outline first, then its holes).
 */
export function customBrushPolygons(points: Pt[], brush: CustomBrush, size: number, seed = seedOf(points)): Pt[][][] {
  if (points.length === 0 || brush.polygons.length === 0) return []
  const s = clamp(size, MIN_BRUSH_SIZE, MAX_BRUSH_SIZE)
  const clean = points.length > 2 ? smoothPoints(points, 2) : points
  const total = pathLength(clean)
  const place = (x: number, y: number, scale: number, angle: number): Pair[][][] => {
    const cos = Math.cos(angle) * scale
    const sin = Math.sin(angle) * scale
    return brush.polygons.map((polygon) => polygon.map((ring) => ring.map(([px, py]): Pair => [x + px * cos - py * sin, y + px * sin + py * cos])))
  }

  if (clean.length === 1 || total < 0.5) return joined([place(clean[0]![0], clean[0]![1], s, 0)])

  if (brush.mode === 'stretch') {
    // the length of the shape is the length of the line, its height the size: every point is carried to where the line is at its
    // distance along, and pushed to the side of the line by its height
    const cumulative = [0]
    for (let i = 1; i < clean.length; i += 1) cumulative.push(cumulative[i - 1]! + Math.hypot(clean[i]![0] - clean[i - 1]![0], clean[i]![1] - clean[i - 1]![1]))
    const at = (distance: number): [number, number, number, number] => {
      let low = 0
      let high = clean.length - 1
      while (high - low > 1) {
        const middle = (low + high) >> 1
        if (cumulative[middle]! <= distance) low = middle
        else high = middle
      }
      const a = clean[low]!
      const b = clean[high]!
      const run = cumulative[high]! - cumulative[low]! || 1
      const t = clamp((distance - cumulative[low]!) / run, 0, 1)
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const norm = Math.hypot(dx, dy) || 1
      return [a[0] + dx * t, a[1] + dy * t, dx / norm, dy / norm]
    }
    let step = clamp(6 / total, 0.002, 0.05)
    // the edges of the shape are cut into pieces so that the shape can bend: as many pieces as are worth the points
    const edges = brush.polygons.reduce((sum, polygon) => sum + polygon.reduce((inner, ring) => inner + ring.length, 0), 0)
    while (edges / Math.max(1e-6, step) > MAX_STROKE_POINTS / 4 && step < 1) step *= 1.5
    const parts: Pair[][][][] = []
    for (const polygon of brush.polygons) {
      const mapped: Pair[][] = []
      for (const ring of polygon) {
        const out: Pair[] = []
        for (let i = 0; i < ring.length; i += 1) {
          const a = ring[i]!
          const b = ring[(i + 1) % ring.length]!
          const ua = (a[0] + brush.aspect / 2) / brush.aspect
          const ub = (b[0] + brush.aspect / 2) / brush.aspect
          const pieces = Math.max(1, Math.ceil(Math.abs(ub - ua) / step))
          for (let k = 0; k < pieces; k += 1) {
            const t = k / pieces
            const u = clamp(ua + (ub - ua) * t, 0, 1)
            const v = a[1] + (b[1] - a[1]) * t
            const [px, py, tx, ty] = at(u * total)
            out.push([px - ty * v * s, py + tx * v * s])
          }
        }
        if (out.length >= 3) mapped.push(out)
      }
      if (mapped.length > 0) parts.push([mapped])
    }
    return joined(parts)
  }

  // repeated: a copy at every step along the line, as many as the stroke can have
  const rng = seededRandom(seed)
  const vertices = Math.max(8, pointsIn(brush.polygons))
  const most = Math.max(12, Math.min(MAX_PIECES, Math.floor(MAX_STROKE_POINTS / vertices)))
  const distance = Math.max(0.05, brush.spacing) * s * brush.aspect
  // the copies are one more than the steps: both ends of the line have one
  const path = resample(clean, Math.max(distance, total / (most - 1)))
  const copies: Pair[][][][] = []
  for (let i = 0; i < path.length; i += 1) {
    const a = path[Math.max(0, i - 1)]!
    const b = path[Math.min(path.length - 1, i + 1)]!
    const run = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const along = brush.rotate ? Math.atan2(b[1] - a[1], b[0] - a[0]) : 0
    const v = brush.variation
    const scale = s * (1 + (rng() * 2 - 1) * 0.4 * v)
    const angle = along + (rng() * 2 - 1) * Math.PI * v
    const across = (rng() * 2 - 1) * 0.5 * s * v
    const x = path[i]![0] - ((b[1] - a[1]) / run) * across
    const y = path[i]![1] + ((b[0] - a[0]) / run) * across
    copies.push(place(x, y, scale, angle))
  }
  return joined(copies)
}

/** the most points of a stroke that are kept on its shape, so that it can be drawn again in another style */
const MAX_KEPT_POINTS = 20000

/**
 * One brush of any of the two kinds, as the shape of a stroke; null when it covers nothing. The shape keeps what it was drawn with
 * (`brush`), so that `restyleStroke` can draw it again. Sharp is straight and crisp (for the brushes of the program: flat ends and
 * facets), soft is blurred a little; an imported brush is the same shape at the sharp and the medium level.
 */
export function strokeShape(
  points: Pt[],
  styleId: string,
  customs: CustomBrush[],
  size: number,
  color: string,
  id: string,
  z: number,
  layerId?: string,
  sharpness: Sharpness = 'medium',
): ShapeFrame | null {
  const custom = isCustomBrushId(styleId) ? customs.find((brush) => brush.id === styleId) : undefined
  let shape: ShapeFrame | null
  if (custom) {
    shape = shapeFromPolygons(customBrushPolygons(points, custom, size), color, id, z, layerId)
    if (shape && sharpness === 'soft') shape.blur = softBrushBlur(size)
  } else {
    shape = brushShape(points, (isCustomBrushId(styleId) ? 'round' : styleId) as BrushStyleId, size, color, id, z, layerId, sharpness)
  }
  if (shape && points.length > 0 && points.length <= MAX_KEPT_POINTS) {
    const round = (value: number) => Math.round(value * 1e4) / 1e4
    const brush: BrushStroke = {
      style: styleId,
      size: Math.max(MIN_BRUSH_SIZE, Math.min(MAX_BRUSH_SIZE, size)),
      sharpness,
      points: points.map(([x, y]): [number, number] => [round((x - shape!.x) / shape!.w), round((y - shape!.y) / shape!.h)]),
    }
    shape.brush = brush
  }
  return shape
}

/**
 * A stroke drawn again with another style, size, sharpness or colour (what is not given stays): the points it was drawn through are
 * placed where the shape is now (moved, stretched or turned since), and the shape keeps what it had besides its outline (its place in
 * the stack and in its group, its opacity). Null for a shape that was not made with the brush tool.
 */
export function restyleStroke(shape: ShapeFrame, change: { style?: string; size?: number; sharpness?: Sharpness; color?: string }, customs: CustomBrush[]): ShapeFrame | null {
  const kept = shape.brush
  if (!kept || kept.points.length === 0) return null
  const turn = ((shape.rotation ?? 0) * Math.PI) / 180
  const cos = Math.cos(turn)
  const sin = Math.sin(turn)
  const cx = shape.x + shape.w / 2
  const cy = shape.y + shape.h / 2
  const world = kept.points.map(([u, v]): Pt => {
    const x = shape.x + u * shape.w
    const y = shape.y + v * shape.h
    if (!turn) return [x, y]
    return [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos]
  })
  const color = change.color ?? shape.fill ?? '#000000'
  const made = strokeShape(world, change.style ?? kept.style, customs, change.size ?? kept.size, color, shape.id, shape.z ?? 0, shape.layerId, change.sharpness ?? kept.sharpness)
  if (!made) return null
  const next: ShapeFrame = { ...shape, x: made.x, y: made.y, w: made.w, h: made.h, geom: made.geom, fill: change.color ?? shape.fill, brush: made.brush }
  // the turn is in the points now
  delete next.rotation
  if (made.blur !== undefined) next.blur = made.blur
  else delete next.blur
  return next
}

// ── keeping the brushes ───────────────────────────────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'imudist.customBrushes'

const isPoint = (value: unknown): value is Pt =>
  Array.isArray(value) && value.length === 2 && typeof value[0] === 'number' && typeof value[1] === 'number' && Number.isFinite(value[0]) && Number.isFinite(value[1])

/** the brushes in what was stored: whatever is not a usable brush is left out */
export function parseStoredBrushes(raw: unknown): CustomBrush[] {
  if (!Array.isArray(raw)) return []
  const brushes: CustomBrush[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const b = item as Record<string, unknown>
    if (typeof b.id !== 'string' || !isCustomBrushId(b.id) || typeof b.name !== 'string' || !Array.isArray(b.polygons)) continue
    let usable = true
    let points = 0
    const polygons: Pt[][][] = []
    for (const polygon of b.polygons) {
      if (!Array.isArray(polygon)) {
        usable = false
        break
      }
      const rings: Pt[][] = []
      for (const ring of polygon) {
        if (!Array.isArray(ring) || !ring.every(isPoint)) {
          usable = false
          break
        }
        points += ring.length
        if (ring.length >= 3) rings.push(ring as Pt[])
      }
      if (!usable) break
      if (rings.length > 0) polygons.push(rings)
    }
    if (!usable || polygons.length === 0 || points > MAX_BRUSH_POINTS * 2) continue
    const aspect = typeof b.aspect === 'number' && Number.isFinite(b.aspect) ? clamp(b.aspect, 0.05, 40) : 1
    brushes.push({
      id: b.id,
      name: b.name.slice(0, 60),
      polygons,
      aspect,
      mode: b.mode === 'stretch' ? 'stretch' : 'repeat',
      spacing: typeof b.spacing === 'number' && Number.isFinite(b.spacing) ? clamp(b.spacing, 0.05, 10) : 1.1,
      rotate: b.rotate !== false,
      variation: typeof b.variation === 'number' && Number.isFinite(b.variation) ? clamp(b.variation, 0, 1) : 0.25,
    })
    if (brushes.length >= MAX_CUSTOM_BRUSHES) break
  }
  return brushes
}

export function loadCustomBrushes(): CustomBrush[] {
  try {
    return parseStoredBrushes(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'))
  } catch {
    return []
  }
}

/** keeps the brushes; false when the browser would not (the storage is full or blocked): they stay for this session */
export function saveCustomBrushes(brushes: CustomBrush[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(brushes))
    return true
  } catch {
    return false
  }
}
