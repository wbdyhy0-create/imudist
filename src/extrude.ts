import polygonClipping from 'polygon-clipping'
import type { ExtrudeSettings, GradientFill, PathGeom, ShapeFrame } from './document'
import { shapePath } from './shapes'
import { zOfShape } from './stacking'
import { parseSvgPath } from './vectorShapes'
import { t } from './i18n'

/**
 * Depth for a shape ("3D"): the shape is drawn out backwards along a direction, and the sides that can be seen become shapes of their
 * own - one for every flat side, and a band for every stretch of a curve - each with its own colour, shaded from one colour by the
 * way it faces. The shape itself stays in front, as it was. All of it is plain vector shapes: nothing in the drawing, the PDF or the
 * SVG needs to know that it is a solid.
 */

type Pt = [number, number]

export const DEFAULT_EXTRUDE: ExtrudeSettings = { depth: 36, angle: 45, shade: 0.6 }

/** a shape that has more points or more pieces than this is not drawn out: the sides would be a pile of slivers */
export const MAX_EXTRUDE_POINTS = 20000
export const MAX_EXTRUDE_RINGS = 200
export const MAX_EXTRUDE_FACES = 400

/** where the light comes from: above, a little from the left (screen coordinates, y down) */
const LIGHT: Pt = [-0.45, -0.893]
/** two neighbouring edges that turn more than this make a corner, and so a new side */
const CORNER_COS = Math.cos((30 * Math.PI) / 180)
/** a curve is cut into a new band when it has turned this much since the band began */
const BAND_COS = Math.cos((20 * Math.PI) / 180)

export type ExtrudeProblem = 'unsupported' | 'complex'

// ── colour ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

function parseHex(color: string | null | undefined): [number, number, number] | null {
  if (!color) return null
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (!m) return null
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

const toHex = (rgb: number[]) => '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')

const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/** the colour the sides get when none is chosen: the front's colour, darker (grey when the front has no plain colour) */
export function autoSideColor(fill: string | null | undefined): string {
  const rgb = parseHex(fill)
  return rgb ? toHex(mix(rgb, [0, 0, 0], 0.28)) : '#777777'
}

/** `base` as a side that faces `facing` (-1…1: 1 faces the light) shows it; `strength` 0…1 is how far the light changes it */
export function shadeSide(base: string, facing: number, strength: number): string {
  const rgb = parseHex(base) ?? [119, 119, 119]
  const s = Math.max(0, Math.min(1, strength))
  const t = Math.max(-1, Math.min(1, facing))
  return toHex(t >= 0 ? mix(rgb, [255, 255, 255], t * 0.4 * s) : mix(rgb, [0, 0, 0], -t * 0.5 * s))
}

// ── the outline ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** the rings of a shape as closed polylines in world points, turned as the shape is; null for a shape that has no closed outline */
export function worldRings(shape: ShapeFrame): Pt[][] | null {
  if (shape.kind === 'table' || shape.kind === 'line') return null
  if (shape.kind === 'path' && (shape.closed === false || !shape.geom?.length)) return null
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
  const rings: Pt[][] = []
  let current: Pt[] | null = null
  let last: Pt = [0, 0]
  const finish = () => {
    if (current) {
      const cleaned = current.filter((p, i) => i === 0 || Math.hypot(p[0] - current![i - 1]![0], p[1] - current![i - 1]![1]) > 1e-6)
      if (cleaned.length > 1 && Math.hypot(cleaned[0]![0] - cleaned[cleaned.length - 1]![0], cleaned[0]![1] - cleaned[cleaned.length - 1]![1]) <= 1e-6) cleaned.pop()
      if (cleaned.length >= 3) rings.push(cleaned)
    }
    current = null
  }
  for (const op of ops) {
    if (op[0] === 'M') {
      finish()
      current = [move(op[1], op[2])]
      last = [op[1], op[2]]
    } else if (op[0] === 'L') {
      current?.push(move(op[1], op[2]))
      last = [op[1], op[2]]
    } else if (op[0] === 'C') {
      const [, c1x, c1y, c2x, c2y, x, y] = op
      const approx = Math.hypot(c1x - last[0], c1y - last[1]) + Math.hypot(c2x - c1x, c2y - c1y) + Math.hypot(x - c2x, y - c2y)
      const steps = Math.max(4, Math.min(32, Math.ceil(approx / 5)))
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps
        const u = 1 - t
        const px = u * u * u * last[0] + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x
        const py = u * u * u * last[1] + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y
        current?.push(move(px, py))
      }
      last = [x, y]
    } else {
      finish()
    }
  }
  finish()
  return rings.length > 0 ? rings : null
}

const signedArea = (ring: Pt[]) => {
  let sum = 0
  for (let i = 0; i < ring.length; i += 1) {
    const [x0, y0] = ring[i]!
    const [x1, y1] = ring[(i + 1) % ring.length]!
    sum += x0 * y1 - x1 * y0
  }
  return sum / 2
}

function inside(ring: Pt[], x: number, y: number): boolean {
  let result = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i]!
    const [xj, yj] = ring[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) result = !result
  }
  return result
}

// ── the sides ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** the colour (red, green, blue) a list of stops gives at `t` (0…1): a colour that is not a plain hex is taken as grey */
function colourAt(stops: { offset: number; color: string }[], t: number): [number, number, number] {
  const at = Math.max(0, Math.min(1, t))
  const grey: [number, number, number] = [119, 119, 119]
  if (stops.length === 0) return grey
  if (at <= stops[0]!.offset) return parseHex(stops[0]!.color) ?? grey
  for (let i = 1; i < stops.length; i += 1) {
    const a = stops[i - 1]!
    const b = stops[i]!
    if (at <= b.offset) {
      const span = b.offset - a.offset
      return mix(parseHex(a.color) ?? grey, parseHex(b.color) ?? grey, span > 1e-9 ? (at - a.offset) / span : 0)
    }
  }
  return parseHex(stops[stops.length - 1]!.color) ?? grey
}

/** the stops of a gradient in order, a missing list made of its two ends */
function gradientStops(gradient: GradientFill): { offset: number; color: string }[] {
  const stops = gradient.stops?.length ? gradient.stops : [{ offset: 0, color: gradient.start }, { offset: 1, color: gradient.end }]
  return [...stops].sort((a, b) => a.offset - b.offset)
}

/**
 * What a side of a front with a gradient is filled with: the same gradient, carried on across the side - the part of it that lies
 * under the side's box, drawn along the same direction - and shaded by the way the side faces, so that the colours run on from the
 * front into the sides. A side that the gradient hardly changes along (and a radial gradient) gets the plain colour it has there.
 */
function gradientSidePaint(front: ShapeFrame, box: { x0: number; y0: number; x1: number; y1: number }, facing: number, strength: number): Pick<ShapeFrame, 'fill' | 'fillGradient'> {
  const gradient = front.fillGradient!
  const shade = (rgb: [number, number, number]) => shadeSide(toHex(rgb), facing, strength)
  const cx = front.x + front.w / 2
  const cy = front.y + front.h / 2
  const rotation = front.rotation ?? 0
  const rad = (rotation * Math.PI) / 180
  // a point of the page in the front's own (unturned) frame
  const local = (x: number, y: number): [number, number] => {
    const dx = x - cx
    const dy = y - cy
    return [dx * Math.cos(rad) + dy * Math.sin(rad), -dx * Math.sin(rad) + dy * Math.cos(rad)]
  }
  if (gradient.type === 'radial') {
    const stops = gradientStops(gradient)
    const colours = gradient.reverse ? stops.map((stop, i) => ({ offset: stop.offset, color: stops[stops.length - 1 - i]!.color })) : stops
    const [lx, ly] = local((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2)
    const t = Math.hypot(lx / (0.7 * Math.max(1, front.w)), ly / (0.7 * Math.max(1, front.h)))
    return { fill: shade(colourAt(colours, t)) }
  }
  const stops = gradientStops(gradient)
  const theta = (gradient.angle ?? 0) + (gradient.reverse ? 180 : 0)
  const thetaRad = (theta * Math.PI) / 180
  const half = (Math.abs(Math.cos(thetaRad)) * front.w + Math.abs(Math.sin(thetaRad)) * front.h) / 2
  // the direction on the page: the front's own direction turned with it
  const world = ((theta - rotation) * Math.PI) / 180
  const dirX = Math.cos(world)
  const dirY = -Math.sin(world)
  const along = (x: number, y: number) => ((x - cx) * dirX + (y - cy) * dirY) / (2 * Math.max(0.01, half)) + 0.5
  const corners = [along(box.x0, box.y0), along(box.x1, box.y0), along(box.x1, box.y1), along(box.x0, box.y1)]
  const t0 = Math.min(...corners)
  const t1 = Math.max(...corners)
  if (t1 - t0 < 0.02) return { fill: shade(colourAt(stops, (t0 + t1) / 2)) }
  const span = t1 - t0
  const inside = stops.filter((stop) => stop.offset > t0 + 1e-6 && stop.offset < t1 - 1e-6)
  const carried = [
    { offset: 0, color: shade(colourAt(stops, t0)) },
    ...inside.map((stop) => ({ offset: (stop.offset - t0) / span, color: shade(parseHex(stop.color) ?? [119, 119, 119]) })),
    { offset: 1, color: shade(colourAt(stops, t1)) },
  ]
  const angle = ((((theta - rotation) % 360) + 360) % 360)
  return {
    fill: carried[Math.floor(carried.length / 2)]!.color,
    fillGradient: { type: 'linear', start: carried[0]!.color, end: carried[carried.length - 1]!.color, stops: carried, angle: Math.round(angle * 100) / 100 },
  }
}

function pieceShape(front: ShapeFrame, ring: Pt[], paint: (box: { x0: number; y0: number; x1: number; y1: number }) => Pick<ShapeFrame, 'fill' | 'fillGradient'>, id: string, z: number, groupId: string | undefined): ShapeFrame | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of ring) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const spanX = maxX - minX
  const spanY = maxY - minY
  if (!(spanX > 0.001 || spanY > 0.001)) return null
  const w = Math.max(0.01, spanX)
  const h = Math.max(0.01, spanY)
  const round = (v: number) => Math.round(v * 1e5) / 1e5
  const piece: ShapeFrame = {
    id,
    kind: 'path',
    x: minX,
    y: minY,
    w,
    h,
    geom: [[ring.map(([x, y]): [number, number] => [round((x - minX) / w), round((y - minY) / h)])]],
    ...paint({ x0: minX, y0: minY, x1: maxX, y1: maxY }),
    stroke: front.stroke,
    strokeWidth: front.strokeWidth,
    z,
    extrudeOf: front.id,
  }
  if (front.layerId) piece.layerId = front.layerId
  if (groupId) piece.groupId = groupId
  if (front.opacity !== undefined && front.opacity < 1) piece.opacity = front.opacity
  if (front.blendMode) piece.blendMode = front.blendMode
  return piece
}

/**
 * The visible sides of a shape drawn out `settings.depth` points in the direction `settings.angle` (degrees, counter-clockwise from
 * the right, as it looks on the page), as shapes placed just behind it. The shape's own look is not touched.
 */
export function extrudeSides(front: ShapeFrame, settings: ExtrudeSettings, newId: () => string, groupId?: string): { sides: ShapeFrame[] } | { problem: ExtrudeProblem } {
  const rings = worldRings(front)
  if (!rings) return { problem: 'unsupported' }
  const points = rings.reduce((sum, ring) => sum + ring.length, 0)
  if (rings.length > MAX_EXTRUDE_RINGS || points > MAX_EXTRUDE_POINTS) return { problem: 'complex' }
  const depth = Math.max(0, settings.depth)
  if (depth < 0.01) return { sides: [] }
  const turn = (settings.angle * Math.PI) / 180
  const v: Pt = settings.view ? viewVector(depth, settings.view) : [depth * Math.cos(turn), -depth * Math.sin(turn)]
  const base = settings.sideColor && parseHex(settings.sideColor) ? settings.sideColor : autoSideColor(front.fill)
  const z = zOfShape(front) - 0.5

  // a ring that lies inside an odd number of the others is a hole: its walls face into it
  const boxes = rings.map((ring) => {
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const [x, y] of ring) {
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
    return [x0, y0, x1, y1] as const
  })
  const holeRing = rings.map((ring, index) => {
    const [px, py] = ring[0]!
    let depthOfRing = 0
    rings.forEach((other, otherIndex) => {
      if (otherIndex === index) return
      const b = boxes[otherIndex]!
      if (px < b[0] || px > b[2] || py < b[1] || py > b[3]) return
      if (inside(other, px, py)) depthOfRing += 1
    })
    return depthOfRing % 2 === 1
  })

  const sides: ShapeFrame[] = []
  // a front that has a gradient (and sides that are not given a colour of their own) has sides that go on with the gradient
  const followsGradient = !!front.fillGradient && !(settings.sideColor && parseHex(settings.sideColor))
  const add = (ring: Pt[], facing: number): boolean => {
    const paint = (box: { x0: number; y0: number; x1: number; y1: number }): Pick<ShapeFrame, 'fill' | 'fillGradient'> =>
      followsGradient ? gradientSidePaint(front, box, facing, settings.shade) : { fill: shadeSide(base, facing, settings.shade) }
    const piece = pieceShape(front, ring, paint, newId(), z, groupId)
    if (!piece) return true
    sides.push(piece)
    return sides.length <= MAX_EXTRUDE_FACES
  }

  for (let r = 0; r < rings.length; r += 1) {
    const ring = rings[r]!
    const n = ring.length
    const orient = Math.sign(signedArea(ring)) || 1
    // the way out of the material at every edge, and whether the edge can be seen from the front
    const normals: Pt[] = []
    const visible: boolean[] = []
    for (let i = 0; i < n; i += 1) {
      const a = ring[i]!
      const b = ring[(i + 1) % n]!
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const length = Math.hypot(dx, dy) || 1
      const s = (holeRing[r] ? 1 : -1) * orient
      const normal: Pt = [(s * -dy) / length, (s * dx) / length]
      normals.push(normal)
      visible.push(normal[0] * v[0] + normal[1] * v[1] > depth * 1e-4)
    }
    if (!visible.some(Boolean)) continue

    // a side begins where a visible edge follows one that is not visible or turns by a corner
    const corner = (i: number) => {
      const p = normals[(i + n - 1) % n]!
      const c = normals[i]!
      return p[0] * c[0] + p[1] * c[1] < CORNER_COS
    }
    let start = -1
    for (let i = 0; i < n; i += 1) {
      if (visible[i] && (!visible[(i + n - 1) % n] || corner(i))) {
        start = i
        break
      }
    }
    if (start < 0) start = visible.findIndex(Boolean)

    /** the side made of `edges`; `bleed` is the edge of the next band of the same curve, taken in a little so that two bands overlap and no seam shows between them */
    const flush = (edges: number[], bleed?: number) => {
      if (edges.length === 0) return true
      const chain: Pt[] = [ring[edges[0]!]!]
      let nx = 0
      let ny = 0
      for (const e of edges) {
        chain.push(ring[(e + 1) % n]!)
        nx += normals[e]![0]
        ny += normals[e]![1]
      }
      if (bleed !== undefined) chain.push(ring[(bleed + 1) % n]!)
      const nl = Math.hypot(nx, ny) || 1
      const facing = (nx / nl) * LIGHT[0] + (ny / nl) * LIGHT[1]
      const quad: Pt[] = [...chain, ...[...chain].reverse().map((p): Pt => [p[0] + v[0], p[1] + v[1]])]
      if (!holeRing[r]) return add(quad, facing)
      // the wall of a hole is only seen through the hole: what lies outside it is behind the front
      let clipped: ReturnType<typeof polygonClipping.intersection>
      try {
        clipped = polygonClipping.intersection([quad], [ring])
      } catch {
        return add(quad, facing)
      }
      for (const polygon of clipped) {
        const outer = polygon[0]
        if (!outer || outer.length < 3) continue
        const open = outer.length > 1 && outer[0]![0] === outer[outer.length - 1]![0] && outer[0]![1] === outer[outer.length - 1]![1] ? outer.slice(0, -1) : outer
        if (!add(open.map((p): Pt => [p[0]!, p[1]!]), facing)) return false
      }
      return true
    }

    let edges: number[] = []
    let firstNormal: Pt = normals[start]!
    for (let k = 0; k < n; k += 1) {
      const i = (start + k) % n
      if (!visible[i]) {
        if (!flush(edges)) return { problem: 'complex' }
        edges = []
        continue
      }
      const c = normals[i]!
      if (edges.length > 0) {
        const p = normals[edges[edges.length - 1]!]!
        const corner = p[0] * c[0] + p[1] * c[1] < CORNER_COS
        const turned = corner || firstNormal[0] * c[0] + firstNormal[1] * c[1] < BAND_COS
        if (turned) {
          // a band that ends only because the curve has turned enough runs on into the next one by one edge
          if (!flush(edges, corner ? undefined : i)) return { problem: 'complex' }
          edges = []
        }
      }
      if (edges.length === 0) firstNormal = c
      edges.push(i)
    }
    if (!flush(edges)) return { problem: 'complex' }
  }
  if (sides.length > MAX_EXTRUDE_FACES) return { problem: 'complex' }
  return { sides }
}

// ── ready-made solids ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export type SolidKind = 'cube' | 'box' | 'cylinder' | 'frame' | 'isoCube' | 'isoBox' | 'isoFrame' | 'isoBoxStanding' | 'isoFrameStanding'

export const SOLID_NAMES: Record<SolidKind, string> = {
  get cube() { return t('קוביה') },
  get box() { return t('תיבה') },
  get cylinder() { return t('גליל') },
  get frame() { return t('מסגרת') },
  get isoCube() { return t('קוביה איזומטרית') },
  get isoBox() { return t('תיבה איזומטרית שוכבת') },
  get isoFrame() { return t('מסגרת איזומטרית שוכבת') },
  get isoBoxStanding() { return t('תיבה איזומטרית זקופה') },
  get isoFrameStanding() { return t('מסגרת איזומטרית זקופה') },
}

export type FrameSpec = NonNullable<ExtrudeSettings['frame']>

/** the wall and the roundness a new frame is given: soft corners, like the frames of a shelf */
export const DEFAULT_FRAME: FrameSpec = { wall: 20, outer: 16, inner: 8 }

/** the radius that fits: no more than half of the smaller side */
const fitRadius = (r: number, w: number, h: number) => Math.max(0, Math.min(r, Math.min(w, h) / 2))

/** one rounded rectangle as a ring of a path, relative to a box of `w` by `h` (a cubic curve at every corner) */
function roundedRing(x0: number, y0: number, x1: number, y1: number, radius: number, w: number, h: number): PathGeom[number][number] {
  const r = fitRadius(radius, x1 - x0, y1 - y0)
  const nx = (v: number) => v / w
  const ny = (v: number) => v / h
  if (r < 0.01) return [[nx(x0), ny(y0)], [nx(x1), ny(y0)], [nx(x1), ny(y1)], [nx(x0), ny(y1)]]
  const k = r * 0.5523
  const hx = nx(k)
  const hy = ny(k)
  const at = (x: number, y: number, hi?: [number, number], ho?: [number, number]) => ({ p: [nx(x), ny(y)] as [number, number], ...(hi ? { hi } : {}), ...(ho ? { ho } : {}) })
  return [
    at(x0 + r, y0, [-hx, 0]),
    at(x1 - r, y0, undefined, [hx, 0]),
    at(x1, y0 + r, [0, -hy]),
    at(x1, y1 - r, undefined, [0, hy]),
    at(x1 - r, y1, [hx, 0]),
    at(x0 + r, y1, undefined, [-hx, 0]),
    at(x0, y1 - r, [0, hy]),
    at(x0, y0 + r, undefined, [0, -hy]),
  ]
}

export interface FrameWalls {
  top: number
  right: number
  bottom: number
  left: number
}

/** the thickness of every side of a frame: the one a side has of its own, or the wall of the frame */
export function frameWalls(spec: FrameSpec): FrameWalls {
  return { top: spec.top ?? spec.wall, right: spec.right ?? spec.wall, bottom: spec.bottom ?? spec.wall, left: spec.left ?? spec.wall }
}

/** walls that leave a hole of at least a point in a box of `w` by `h`: two that are too thick are made thinner in proportion */
export function fitWalls(walls: FrameWalls, w: number, h: number): FrameWalls {
  const limit = (a: number, b: number, size: number): [number, number] => {
    const lo = 0.1
    const x = Math.max(lo, a)
    const y = Math.max(lo, b)
    const room = Math.max(2 * lo, size - 1)
    return x + y <= room ? [x, y] : [(x * room) / (x + y), (y * room) / (x + y)]
  }
  const [left, right] = limit(walls.left, walls.right, w)
  const [top, bottom] = limit(walls.top, walls.bottom, h)
  return { top, right, bottom, left }
}

/** the outline of a frame in a box of `w` by `h`: the outside, and the hole as far in from each side as that side is thick; both with the corners rounded as given */
export function roundedFrameGeom(w: number, h: number, spec: FrameSpec): PathGeom {
  const width = Math.max(1, w)
  const height = Math.max(1, h)
  const walls = fitWalls(frameWalls(spec), width, height)
  return [[
    roundedRing(0, 0, width, height, spec.outer, width, height),
    roundedRing(walls.left, walls.top, width - walls.right, height - walls.bottom, spec.inner, width, height),
  ]]
}

/** the front of a new solid, and the depth it is given: sizes are in points */
export function solidSpec(kind: SolidKind): { front: Pick<ShapeFrame, 'kind' | 'w' | 'h' | 'fill'> & { geom?: PathGeom }; settings: ExtrudeSettings; iso?: IsoPlane } {
  switch (kind) {
    case 'cube':
      return { front: { kind: 'rect', w: 100, h: 100, fill: '#e0409b' }, settings: { depth: 50, angle: 45, shade: 0.6 } }
    case 'box':
      return { front: { kind: 'rect', w: 150, h: 90, fill: '#27b3c4' }, settings: { depth: 55, angle: 45, shade: 0.6 } }
    case 'cylinder':
      // seen from above: the ellipse is the top, and the depth goes down
      return { front: { kind: 'ellipse', w: 110, h: 56, fill: '#9b4fd0' }, settings: { depth: 90, angle: 270, shade: 0.6 } }
    case 'frame':
      return { front: { kind: 'path', w: 130, h: 130, fill: '#f5922f', geom: roundedFrameGeom(130, 130, DEFAULT_FRAME) }, settings: { depth: 55, angle: 45, shade: 0.6, frame: DEFAULT_FRAME } }
    // the outline given here is the footprint: it is turned into the top of the solid (isometricTop) and the depth goes down
    case 'isoCube':
      return { front: { kind: 'rect', w: 100, h: 100, fill: '#e0409b' }, settings: { depth: 70, angle: ISO_DEPTH_ANGLE.top, shade: 0.6, iso: 'top' }, iso: 'top' }
    case 'isoBox':
      return { front: { kind: 'rect', w: 150, h: 90, fill: '#27b3c4' }, settings: { depth: 60, angle: ISO_DEPTH_ANGLE.top, shade: 0.6, iso: 'top' }, iso: 'top' }
    case 'isoFrame':
      return { front: { kind: 'path', w: 130, h: 130, fill: '#f5922f', geom: roundedFrameGeom(130, 130, DEFAULT_FRAME) }, settings: { depth: 55, angle: ISO_DEPTH_ANGLE.top, shade: 0.6, iso: 'top' }, iso: 'top' }
    // standing: the front is the face seen straight on in the drawing, laid on the left wall plane, the depth goes back to the right
    case 'isoBoxStanding':
      return { front: { kind: 'rect', w: 130, h: 90, fill: '#27b3c4' }, settings: { depth: 70, angle: ISO_DEPTH_ANGLE.left, shade: 0.6, iso: 'left' }, iso: 'left' }
    case 'isoFrameStanding':
      return { front: { kind: 'path', w: 130, h: 130, fill: '#e0409b', geom: roundedFrameGeom(130, 130, DEFAULT_FRAME) }, settings: { depth: 60, angle: ISO_DEPTH_ANGLE.left, shade: 0.6, iso: 'left' }, iso: 'left' }
  }
}

// ── isometric ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type IsoPlane = NonNullable<ExtrudeSettings['iso']>

/** how much the isometric plane is squashed from top to bottom after it is turned a quarter of a right angle: tan 30° */
export const ISO_SQUASH = Math.tan((30 * Math.PI) / 180)

/** the way the depth goes for every plane (degrees, as in the settings): down for a top, up and to the right (or left) for a wall that stands */
export const ISO_DEPTH_ANGLE: Record<IsoPlane, number> = { top: 270, left: 30, right: 150 }

/**
 * The shape laid on a plane of an isometric solid. `top`: the outline is turned 45° and squashed (a square becomes the rhombus of a
 * cube's top, a circle the ellipse of a cylinder's), and the depth goes straight down. `left` and `right`: the shape stands up - its
 * width runs along the 30° line down to the right (or to the left), its height stays upright - and the depth goes back along the
 * other 30° line. The shape becomes a path with that outline; null for a shape that has no closed outline.
 */
export function isometricShape(front: ShapeFrame, plane: IsoPlane | 'flat', from?: IsoPlane): ShapeFrame | null {
  const baseRings = worldRings(front)
  if (!baseRings) return null
  const c = Math.SQRT1_2
  const cos30 = Math.cos((30 * Math.PI) / 180)
  const sin30 = Math.sin((30 * Math.PI) / 180)
  let rings = baseRings
  if (from) {
    // the shape is on a plane of a solid already: it is brought back to the flat outline first (the turn above, undone), about its own centre
    let bx0 = Infinity
    let by0 = Infinity
    let bx1 = -Infinity
    let by1 = -Infinity
    for (const ring of baseRings) {
      for (const [x, y] of ring) {
        if (x < bx0) bx0 = x
        if (x > bx1) bx1 = x
        if (y < by0) by0 = y
        if (y > by1) by1 = y
      }
    }
    const ox = (bx0 + bx1) / 2
    const oy = (by0 + by1) / 2
    const lean0 = from === 'left' ? 1 : -1
    rings = baseRings.map((ring) => ring.map(([x, y]): Pt => {
      const dx = x - ox
      const dy = y - oy
      if (from === 'top') {
        const a = dx / c
        const b = dy / (c * ISO_SQUASH)
        return [ox + (a + b) / 2, oy + (b - a) / 2]
      }
      const flatX = dx / cos30
      return [ox + flatX, oy + dy - lean0 * flatX * sin30]
    }))
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const lean = plane === 'left' ? 1 : -1
  const turned = rings.map((ring) => ring.map(([x, y]): Pt => {
    const dx = x - cx
    const dy = y - cy
    if (plane === 'flat') return [x, y]
    if (plane === 'top') return [cx + (dx - dy) * c, cy + (dx + dy) * c * ISO_SQUASH]
    // standing: the width is drawn shorter and runs on a slant, the height is as it was
    return [cx + dx * cos30, cy + dy + lean * dx * sin30]
  }))
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const ring of turned) {
    for (const [x, y] of ring) {
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  const w = Math.max(0.01, x1 - x0)
  const h = Math.max(0.01, y1 - y0)
  const round = (v: number) => Math.round(v * 1e5) / 1e5
  const shape: ShapeFrame = {
    ...front,
    kind: 'path',
    x: x0,
    y: y0,
    w,
    h,
    geom: [turned.map((ring) => ring.map(([x, y]): [number, number] => [round((x - x0) / w), round((y - y0) / h)]))],
  }
  delete shape.rotation
  delete shape.radii
  delete shape.sides
  delete shape.closed
  delete shape.curveMode
  return shape
}

// ── the lean of the front ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** the lean a plane of an isometric solid has: the left wall slopes down to the right, the right wall up to the right (degrees) */
export const ISO_LEAN: Record<IsoPlane, number> = { top: 0, left: 30, right: -30 }

/** the lean the front of a shape has now: what its settings say, or what its isometric plane gives it */
export function currentLean(extrude: ExtrudeSettings | undefined): number {
  if (!extrude) return 0
  return extrude.lean ?? (extrude.iso ? ISO_LEAN[extrude.iso] : 0)
}

/**
 * The shape with its outline leaned from one angle to another (degrees; 0 is a front that stands straight): every point goes up or
 * down in proportion to how far it is from the middle of the shape, sideways (`widen`: and its width is given back, for a shape that was
 * drawn on a wall of an isometric solid). The shape becomes a path; null when it has no closed outline.
 */
export function leanShape(front: ShapeFrame, fromLean: number, toLean: number, widen = false): ShapeFrame | null {
  const rings = worldRings(front)
  if (!rings) return null
  let minX = Infinity
  let maxX = -Infinity
  for (const ring of rings) {
    for (const [x] of ring) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
    }
  }
  const cx = (minX + maxX) / 2
  const change = Math.tan((toLean * Math.PI) / 180) - Math.tan((fromLean * Math.PI) / 180)
  // an outline that was drawn narrower for a wall of an isometric solid gets its width back (what the wall's plane took from it)
  const stretch = widen ? 1 / Math.cos((30 * Math.PI) / 180) : 1
  const moved = rings.map((ring) => ring.map(([x, y]): Pt => [cx + (x - cx) * stretch, y + (x - cx) * change]))
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const ring of moved) {
    for (const [x, y] of ring) {
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  const w = Math.max(0.01, x1 - x0)
  const h = Math.max(0.01, y1 - y0)
  const round = (v: number) => Math.round(v * 1e5) / 1e5
  const shape: ShapeFrame = {
    ...front,
    kind: 'path',
    x: x0,
    y: y0,
    w,
    h,
    geom: [moved.map((ring) => ring.map(([x, y]): [number, number] => [round((x - x0) / w), round((y - y0) / h)]))],
  }
  delete shape.rotation
  delete shape.radii
  delete shape.sides
  delete shape.closed
  delete shape.curveMode
  return shape
}

// ── a real box, seen from a point of view ───────────────────────────────────────────────────────────────────────────────────────

export type ViewSettings = NonNullable<ExtrudeSettings['view']>

/** the view a solid gets when it is first turned: from the upper left, the way the frames in a picture of shelves are seen */
export const DEFAULT_VIEW: ViewSettings = { yaw: -25, pitch: 30 }
export const MAX_YAW = 80
export const MAX_PITCH = 80

export const clampView = (view: ViewSettings): ViewSettings => ({
  yaw: Math.max(-MAX_YAW, Math.min(MAX_YAW, view.yaw)),
  pitch: Math.max(0, Math.min(MAX_PITCH, view.pitch)),
})

/** where the back of the solid lies from its front, on the page (x right, y down), for a depth in the solid's own units */
export function viewVector(depth: number, view: ViewSettings): Pt {
  const yaw = (view.yaw * Math.PI) / 180
  const pitch = (view.pitch * Math.PI) / 180
  return [-depth * Math.sin(yaw), -depth * Math.cos(yaw) * Math.sin(pitch)]
}

/**
 * The outline of a shape seen from a view. `from` is the view it is in now (its outline is brought back to the flat one first, which is
 * what it was drawn as), `to` the view it is to be in; null `to` leaves the flat outline. The width is drawn narrower as the solid turns,
 * the height shorter as it is looked at from above, and the horizontal edges slope. The middle of the outline stays where it was.
 */
export function viewShape(front: ShapeFrame, from: ViewSettings | undefined, to: ViewSettings | null): ShapeFrame | null {
  const rings = worldRings(front)
  if (!rings) return null
  const centreOf = (list: Pt[][]) => {
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const ring of list) {
      for (const [x, y] of ring) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
    return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }
  }
  const here = centreOf(rings)
  let flat = rings
  if (from) {
    const f = clampView(from)
    const cos = Math.cos((f.yaw * Math.PI) / 180)
    const sinYaw = Math.sin((f.yaw * Math.PI) / 180)
    const cosP = Math.cos((f.pitch * Math.PI) / 180)
    const sinP = Math.sin((f.pitch * Math.PI) / 180)
    flat = rings.map((ring) => ring.map(([x, y]): Pt => {
      const dx = (x - here.cx) / cos
      const dy = (y - here.cy + dx * sinYaw * sinP) / cosP
      return [here.cx + dx, here.cy + dy]
    }))
  }
  let result = flat
  if (to) {
    const t = clampView(to)
    const cos = Math.cos((t.yaw * Math.PI) / 180)
    const sinYaw = Math.sin((t.yaw * Math.PI) / 180)
    const cosP = Math.cos((t.pitch * Math.PI) / 180)
    const sinP = Math.sin((t.pitch * Math.PI) / 180)
    const c = centreOf(flat)
    result = flat.map((ring) => ring.map(([x, y]): Pt => {
      const dx = x - c.cx
      const dy = y - c.cy
      return [c.cx + dx * cos, c.cy + dy * cosP - dx * sinYaw * sinP]
    }))
  }
  // the middle stays where it was, so that turning does not move the solid about
  const after = centreOf(result)
  const shiftX = here.cx - after.cx
  const shiftY = here.cy - after.cy
  const moved = result.map((ring) => ring.map(([x, y]): Pt => [x + shiftX, y + shiftY]))
  const b = centreOf(moved)
  const w = Math.max(0.01, b.x1 - b.x0)
  const h = Math.max(0.01, b.y1 - b.y0)
  const round = (v: number) => Math.round(v * 1e5) / 1e5
  const shape: ShapeFrame = {
    ...front,
    kind: 'path',
    x: b.x0,
    y: b.y0,
    w,
    h,
    geom: [moved.map((ring) => ring.map(([x, y]): [number, number] => [round((x - b.x0) / w), round((y - b.y0) / h)]))],
  }
  delete shape.rotation
  delete shape.radii
  delete shape.sides
  delete shape.closed
  delete shape.curveMode
  return shape
}

// ── turning a whole solid on the page ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * The settings of a solid whose picture is turned on the page by `delta` degrees (clockwise, as the rotate handle turns): the depth
 * goes back in the turned direction. What was drawn for a plane or a view stays as it was drawn, so those are not settings any more.
 */
export function turnedSettings(settings: ExtrudeSettings, delta: number): ExtrudeSettings {
  let angle = settings.angle
  if (settings.view) {
    const [vx, vy] = viewVector(1, settings.view)
    angle = (Math.atan2(-vy, vx) * 180) / Math.PI
  } else if (settings.iso) {
    angle = ISO_DEPTH_ANGLE[settings.iso]
  }
  // the page's angles run clockwise on the screen, and the depth's counter-clockwise
  const turned = (((angle - delta) % 360) + 360) % 360
  const next: ExtrudeSettings = { ...settings, angle: Math.round(turned * 10) / 10 }
  delete next.view
  delete next.iso
  delete next.lean
  delete next.frame
  return next
}

// ── painting a solid ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * `patch` (a colour, a line, an opacity) given to the shapes in `selected`. A solid gets it on its front, and its sides are made again
 * from the front - shaded from its new colour, as they were when the solid was made - instead of getting the same colour as the front.
 * The sides of a solid that is in the selection are not painted by themselves; a side that is selected alone (picked out from its
 * group) is painted as any shape.
 */
export function paintShapes(shapes: ShapeFrame[], selected: ReadonlySet<string>, patch: Partial<ShapeFrame>, newId: () => string): ShapeFrame[] {
  const fronts = new Set(shapes.filter((shape) => selected.has(shape.id) && shape.extrude).map((shape) => shape.id))
  if (fronts.size === 0) return shapes.map((shape) => (selected.has(shape.id) ? { ...shape, ...patch } : shape))
  const sidesOf = new Map<string, ShapeFrame[]>()
  for (const shape of shapes) {
    if (shape.extrudeOf && fronts.has(shape.extrudeOf)) sidesOf.set(shape.extrudeOf, [...(sidesOf.get(shape.extrudeOf) ?? []), shape])
  }
  const kept: ShapeFrame[] = []
  const made: ShapeFrame[] = []
  for (const shape of shapes) {
    if (shape.extrudeOf && fronts.has(shape.extrudeOf)) continue
    if (!selected.has(shape.id)) {
      kept.push(shape)
      continue
    }
    const painted: ShapeFrame = { ...shape, ...patch }
    kept.push(painted)
    if (!fronts.has(shape.id) || !painted.extrude) continue
    const old = sidesOf.get(shape.id) ?? []
    const pool = old.map((side) => side.id)
    const result = extrudeSides(painted, painted.extrude, () => pool.shift() ?? newId(), shape.groupId)
    // a front that cannot be drawn out again keeps the sides it had
    made.push(...('sides' in result ? result.sides : old))
  }
  return [...kept, ...made]
}

// ── keeping a solid whole ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The solid whose front is `frontId` made whole again after its front was moved, resized or turned: a frame has its outline made
 * again from its wall and its roundness for the size it has now (they are points, they do not stretch with the box), and the sides
 * are made again from the front, with the depth the solid has - the same shapes as far as they go. A shape that is not a solid is
 * left as it is.
 */
export function syncSolid(shapes: ShapeFrame[], frontId: string, newId: () => string): ShapeFrame[] {
  const front = shapes.find((shape) => shape.id === frontId)
  if (!front?.extrude) return shapes
  // a frame has its outline made again from its wall and roundness for the box it has now, in the mode it is in
  const current = frameOutline(front) ?? front
  const old = shapes.filter((shape) => shape.extrudeOf === frontId)
  const pool = old.map((side) => side.id)
  const result = extrudeSides(current, current.extrude!, () => pool.shift() ?? newId(), current.groupId)
  const others = shapes.filter((shape) => shape.extrudeOf !== frontId).map((shape) => (shape.id === frontId ? current : shape))
  // a front that cannot be drawn out again keeps the sides it had
  return [...others, ...('sides' in result ? result.sides : old)]
}

// ── a frame in every mode ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** the map from the flat frame to the page: x' = x·mx, y' = y·my + x·sk, about the middle of the frame */
export interface FrameMap {
  mx: number
  sk: number
  my: number
}

/**
 * How the outline of a frame is drawn on the page in the mode it is in: a straight front (no change), leaned, on a wall of an isometric
 * solid, or seen from a view. Null for the top plane of an isometric solid, which is not made from a wall and a roundness.
 */
export function frameMapOf(extrude: ExtrudeSettings | undefined): FrameMap | null {
  if (!extrude?.frame) return null
  if (extrude.view) {
    const view = clampView(extrude.view)
    const yaw = (view.yaw * Math.PI) / 180
    const pitch = (view.pitch * Math.PI) / 180
    return { mx: Math.cos(yaw), sk: -Math.sin(yaw) * Math.sin(pitch), my: Math.cos(pitch) }
  }
  if (extrude.iso === 'top') return null
  if (extrude.iso === 'left' || extrude.iso === 'right') {
    return { mx: Math.cos((30 * Math.PI) / 180), sk: (extrude.iso === 'left' ? 1 : -1) * Math.sin((30 * Math.PI) / 180), my: 1 }
  }
  return { mx: 1, sk: Math.tan(((extrude.lean ?? 0) * Math.PI) / 180), my: 1 }
}

export interface FrameLayout {
  /** the flat frame (before the lean or the view), centred where the front is */
  flat: { x: number; y: number; w: number; h: number }
  /** a point of the flat frame on the page, and a point of the page in the flat frame */
  toPage: (x: number, y: number) => Pt
  toFlat: (x: number, y: number) => Pt
}

/** where the flat frame is, and how it maps to the page; null for a front that is not a frame or is not made from a wall and a roundness */
export function frameLayout(front: ShapeFrame): FrameLayout | null {
  if (!front.extrude?.frame) return null
  const map = front.rotation ? { mx: 1, sk: 0, my: 1 } : frameMapOf(front.extrude)
  if (!map) return null
  const w = front.w / map.mx
  // the height of the box is the flat height carried by the map; the rounded corners of the outside make it a little less than a
  // sharp-cornered frame's would be (the highest and the lowest points of the outline are on their arcs), which is allowed for
  const reach = Math.hypot(map.sk, map.my)
  const radius = Math.max(0, Math.min(front.extrude.frame.outer, w / 2))
  let h = (front.h - Math.abs(map.sk) * (w - 2 * radius) - 2 * radius * reach) / map.my + 2 * radius
  // a roundness that fills the height (the corners meet) has no straight sides: its height comes from that alone
  if (radius > h / 2) h = (front.h - Math.abs(map.sk) * w) / Math.max(1e-6, reach - Math.abs(map.sk))
  if (!(w >= 1 && h >= 1)) return null
  const cx = front.x + front.w / 2
  const cy = front.y + front.h / 2
  return {
    flat: { x: cx - w / 2, y: cy - h / 2, w, h },
    toPage: (x, y) => [cx + map.mx * (x - cx), cy + map.sk * (x - cx) + map.my * (y - cy)],
    toFlat: (px, py) => {
      const qx = (px - cx) / map.mx
      return [cx + qx, cy + (py - cy - map.sk * qx) / map.my]
    },
  }
}

/** the front with its outline made again from its frame (wall and roundness) in the mode it is in; null when it is not such a frame */
export function frameOutline(front: ShapeFrame): ShapeFrame | null {
  const spec = front.extrude?.frame
  const layout = frameLayout(front)
  if (!spec || !layout) return null
  const { flat } = layout
  const flatShape: ShapeFrame = { ...front, kind: 'path', x: flat.x, y: flat.y, w: flat.w, h: flat.h, geom: roundedFrameGeom(flat.w, flat.h, spec) }
  delete flatShape.radii
  delete flatShape.sides
  const map = front.rotation ? null : frameMapOf(front.extrude)
  if (!map || (Math.abs(map.mx - 1) < 1e-9 && Math.abs(map.sk) < 1e-9 && Math.abs(map.my - 1) < 1e-9)) return flatShape
  // the flat outline on the page: every point moved by the map
  const flatRings = worldRings({ ...flatShape, rotation: undefined })
  if (!flatRings) return null
  const rings = flatRings.map((ring) => ring.map(([x, y]): Pt => layout.toPage(x, y)))
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  const w = Math.max(0.01, x1 - x0)
  const h = Math.max(0.01, y1 - y0)
  const round = (v: number) => Math.round(v * 1e5) / 1e5
  const shape: ShapeFrame = {
    ...flatShape,
    x: x0,
    y: y0,
    w,
    h,
    geom: [rings.map((ring) => ring.map(([x, y]): [number, number] => [round((x - x0) / w), round((y - y0) / h)]))],
  }
  delete shape.closed
  delete shape.curveMode
  return shape
}
