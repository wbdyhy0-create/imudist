import type { LineArrow, ShapeFrame } from './document'
import { t } from './i18n'

/**
 * A width profile for a line: how thick the line is along its length. Three widths (at the start, the middle and the end, each a
 * multiple of the line's own thickness) are joined by a smooth curve, so a line can be thick at one end and thin at the other, thick
 * only in the middle, pinched in the middle, or pointed at one end or both.
 *
 * Such a line is drawn (on the screen and in every export) as the filled outline of what it covers, in the colour of the line.
 */

/** the widths at the start, the middle and the end of the line, as multiples of its thickness */
export type LineWidths = [number, number, number]

export const MAX_LINE_WIDTH_MULTIPLE = 4
/** how far from the ends the middle of the profile can be put (0…1 along the line) */
export const MIN_LINE_WIDTH_POS = 0.1
export const MAX_LINE_WIDTH_POS = 0.9
export const MAX_LINE_WIDTH_EDGE = 0.4

export const LINE_PROFILES: { id: string; label: string; widths: LineWidths }[] = [
  { id: 'even', get label() { return t('אחיד') }, widths: [1, 1, 1] },
  { id: 'thickToThin', get label() { return t('עבה בהתחלה ודק בסוף') }, widths: [1, 0.55, 0.12] },
  { id: 'thinToThick', get label() { return t('דק בהתחלה ועבה בסוף') }, widths: [0.12, 0.55, 1] },
  { id: 'pointEnd', get label() { return t('מחודד בסוף') }, widths: [1, 0.5, 0] },
  { id: 'pointStart', get label() { return t('מחודד בהתחלה') }, widths: [0, 0.5, 1] },
  { id: 'lens', get label() { return t('מחודד בשני הקצוות') }, widths: [0, 1, 0] },
  { id: 'thickMiddle', get label() { return t('עבה באמצע') }, widths: [0.15, 1, 0.15] },
  { id: 'pinched', get label() { return t('דק באמצע') }, widths: [1, 0.18, 1] },
]

const EVEN: LineWidths = [1, 1, 1]
const near = (a: number, b: number) => Math.abs(a - b) < 0.005

/** the widths as a valid triple (each between 0 and the largest multiple), or null when they are not one */
export function cleanLineWidths(value: unknown): LineWidths | null {
  if (!Array.isArray(value) || value.length !== 3) return null
  const out = value.map((v) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(MAX_LINE_WIDTH_MULTIPLE, Math.max(0, v)) : NaN))
  if (out.some((v) => Number.isNaN(v))) return null
  return out as LineWidths
}

/** the place of the profile's middle along the line (between 0.1 and 0.9, not the centre), or null when it is not one */
export function cleanLineWidthPos(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const pos = Math.min(MAX_LINE_WIDTH_POS, Math.max(MIN_LINE_WIDTH_POS, value))
  return near(pos, 0.5) ? null : pos
}

/** the distances from the two ends where the thickness of the ends starts to change, or null when not set */
export function cleanLineWidthEdges(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) return null
  const [a, b] = value
  if (typeof a !== 'number' || typeof b !== 'number' || !Number.isFinite(a) || !Number.isFinite(b)) return null
  const clamp = (v: number) => Math.min(MAX_LINE_WIDTH_EDGE, Math.max(0, v))
  return [clamp(a), clamp(b)]
}

export const LINE_ARROWS: { id: LineArrow; label: string }[] = [
  { id: 'triangle', get label() { return t('משולש') } },
  { id: 'stealth', get label() { return t('חץ חד') } },
  { id: 'diamond', get label() { return t('מעוין') } },
  { id: 'circle', get label() { return t('עיגול') } },
  { id: 'square', get label() { return t('ריבוע') } },
]

/** the head kind when it is a valid one, else null */
export function cleanLineArrow(value: unknown): LineArrow | null {
  return LINE_ARROWS.some((arrow) => arrow.id === value) ? (value as LineArrow) : null
}

/** does the line have a profile that is not the plain even one, or a head on an end (both are drawn as the filled outline) */
export function isProfiledLine(shape: Pick<ShapeFrame, 'kind' | 'lineWidths' | 'arrowStart' | 'arrowEnd'>): boolean {
  if (shape.kind !== 'line') return false
  if (cleanLineArrow(shape.arrowStart) || cleanLineArrow(shape.arrowEnd)) return true
  if (!shape.lineWidths) return false
  const widths = cleanLineWidths(shape.lineWidths)
  return !!widths && !widths.every((width, i) => near(width, EVEN[i]!))
}

/** the full width of a head for a line of this thickness: the room the head takes beside the line */
export const lineArrowWidth = (strokeWidth: number) => Math.max(6, strokeWidth * 3.2)

type Pt = [number, number]

/**
 * A head, in its own frame: (depth behind its tip, lateral place) pairs. `junction` is how far behind the tip the line's shaft ends (the
 * shaft's half width there is `hw`); `front` goes from the left side of the head round its tip to the right side.
 */
function arrowHead(kind: LineArrow, width: number, hw: number): { junction: number; front: Pt[] } {
  const half = width / 2
  const shaft = Math.min(hw, half * 0.9)
  if (kind === 'stealth') {
    const length = width * 1.2
    return { junction: length * 0.7, front: [[length, half], [0, 0], [length, -half]] }
  }
  if (kind === 'square') {
    const length = width * 0.8
    return { junction: length, front: [[length, half], [0, half], [0, -half], [length, -half]] }
  }
  if (kind === 'diamond') {
    const length = width * 1.3
    return { junction: length - (shaft * length) / width, front: [[length / 2, half], [0, 0], [length / 2, -half]] }
  }
  if (kind === 'circle') {
    const reach = Math.acos(-Math.sqrt(half * half - shaft * shaft) / half)
    const front: Pt[] = []
    const steps = 24
    for (let i = 0; i <= steps; i += 1) {
      const angle = reach - (2 * reach * i) / steps
      front.push([half - half * Math.cos(angle), half * Math.sin(angle)])
    }
    return { junction: half + Math.sqrt(half * half - shaft * shaft), front }
  }
  return { junction: width, front: [[width, half], [0, 0], [width, -half]] }
}
/** the width (a multiple of the line's thickness) at a place along it, 0 at the start to 1 at the end: a curve through the three widths */
export function widthAt(widths: LineWidths, t: number, pos = 0.5, edges?: [number, number]): number {
  const [start, middle, end] = widths
  const p = Math.min(MAX_LINE_WIDTH_POS, Math.max(MIN_LINE_WIDTH_POS, pos))
  if (edges) {
    // each end keeps its width up to its handle, then eases to the middle width
    const smooth = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c) }
    if (t <= p) {
      const from = Math.min(edges[0], p - 0.02)
      return Math.max(0, start + (middle - start) * smooth((t - from) / (p - from)))
    }
    const from = Math.min(edges[1], 0.98 - p)
    return Math.max(0, end + (middle - end) * smooth(((1 - t) - from) / (1 - p - from)))
  }
  // the parabola through (0, start), (p, middle) and (1, end); at p = 0.5 it is the one of the centred profile
  const value = (start * (t - p) * (t - 1)) / p + (middle * t * (t - 1)) / (p * (p - 1)) + (end * t * (t - p)) / (1 - p)
  return Math.max(0, value)
}

/**
 * The outline of the line as a polygon, in the line's own box (points from its top-left corner): along one side of the line, round
 * the end, back along the other side, round the start. The ends follow the line's `strokeCap`.
 */
export function lineOutline(shape: Pick<ShapeFrame, 'w' | 'h' | 'flip' | 'strokeWidth' | 'strokeCap' | 'lineWidths' | 'lineWidthPos' | 'lineWidthEdges' | 'arrowStart' | 'arrowEnd'>): Pt[] {
  const widths = cleanLineWidths(shape.lineWidths) ?? EVEN
  const pos = shape.lineWidthPos ?? 0.5
  const edges = shape.lineWidthEdges
  const [x0, y0, x1, y1] = shape.flip ? [0, shape.h, shape.w, 0] : [0, 0, shape.w, shape.h]
  const length = Math.hypot(x1 - x0, y1 - y0)
  if (length < 1e-6 || shape.strokeWidth <= 0) return []
  const dx = (x1 - x0) / length
  const dy = (y1 - y0) / length
  // the unit normal: to the left of the way the line goes
  const nx = dy
  const ny = -dx
  const at = (s: number, lateral: number): Pt => [x0 + dx * s + nx * lateral, y0 + dy * s + ny * lateral]
  const halfAt = (s: number) => (shape.strokeWidth * widthAt(widths, Math.min(1, Math.max(0, s / length)), pos, edges)) / 2

  // a head takes the end of the line: the shaft stops where the head begins, and the head is drawn as part of the same outline
  const startKind = cleanLineArrow(shape.arrowStart)
  const endKind = cleanLineArrow(shape.arrowEnd)
  const room = length * (startKind && endKind ? 0.45 : 0.9)
  const headOf = (kind: LineArrow, fromEnd: boolean) => {
    const full = lineArrowWidth(shape.strokeWidth)
    const probe = arrowHead(kind, full, 0)
    const width = full * Math.min(1, room / Math.max(probe.junction, 1e-6))
    const guess = arrowHead(kind, width, 0).junction
    const junctionHalf = halfAt(fromEnd ? length - guess : guess)
    const head = arrowHead(kind, width, junctionHalf)
    return head
  }
  const start = startKind ? headOf(startKind, false) : null
  const end = endKind ? headOf(endKind, true) : null
  const s0 = start ? start.junction : 0
  const s1 = end ? length - end.junction : length

  const steps = Math.max(16, Math.min(120, Math.round((s1 - s0) / 3)))
  const left: Pt[] = []
  const right: Pt[] = []
  for (let i = 0; i <= steps; i += 1) {
    const s = s0 + ((s1 - s0) * i) / steps
    const half = halfAt(s)
    left.push(at(s, half))
    right.push(at(s, -half))
  }
  const ring: Pt[] = [...left]
  const cap = shape.strokeCap ?? 'butt'
  const endHalf = halfAt(length)
  const startHalf = halfAt(0)
  const arc = (centre: Pt, radius: number, from: Pt, towards: Pt, quarters: number): Pt[] => {
    // a half circle from the direction `from` through `towards` to the opposite of `from`
    const points: Pt[] = []
    for (let j = 1; j < quarters * 2; j += 1) {
      const angle = (Math.PI * j) / (quarters * 2)
      points.push([centre[0] + radius * (from[0] * Math.cos(angle) + towards[0] * Math.sin(angle)), centre[1] + radius * (from[1] * Math.cos(angle) + towards[1] * Math.sin(angle))])
    }
    return points
  }
  if (end) ring.push(...end.front.map(([depth, lateral]) => at(length - depth, lateral)))
  else if (cap === 'round' && endHalf > 0.05) ring.push(...arc([x1, y1], endHalf, [nx, ny], [dx, dy], 5))
  else if (cap === 'square' && endHalf > 0.05) ring.push([left[steps]![0] + dx * endHalf, left[steps]![1] + dy * endHalf], [right[steps]![0] + dx * endHalf, right[steps]![1] + dy * endHalf])
  ring.push(...right.reverse())
  if (start) ring.push(...start.front.map(([depth, lateral]) => at(depth, -lateral)))
  else if (cap === 'round' && startHalf > 0.05) ring.push(...arc([x0, y0], startHalf, [-nx, -ny], [-dx, -dy], 5))
  else if (cap === 'square' && startHalf > 0.05) ring.push([right[0]![0] - dx * startHalf, right[0]![1] - dy * startHalf], [left[0]![0] - dx * startHalf, left[0]![1] - dy * startHalf])
  return ring
}
const round3 = (value: number) => Math.round(value * 1000) / 1000

/** the outline as an SVG path in the line's own box, scaled by `k` (the zoom of the screen, or the scale of an export) */
export function lineOutlinePath(shape: Parameters<typeof lineOutline>[0], k = 1): string {
  const ring = lineOutline(shape)
  if (ring.length < 3) return ''
  return `M${ring.map(([x, y]) => `${round3(x * k)} ${round3(y * k)}`).join('L')}Z`
}

/**
 * The profiled line as an ordinary filled shape (a path) that covers what the line covers, so that every export draws it with the
 * code that draws shapes. Null when the line has no profile.
 */
export function lineProfileShape(shape: ShapeFrame): ShapeFrame | null {
  if (!isProfiledLine(shape)) return null
  const ring = lineOutline(shape)
  if (ring.length < 3) return null
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
  const w = Math.max(0.01, maxX - minX)
  const h = Math.max(0.01, maxY - minY)
  // the box of the outline sits where it was in the line's box; when the line is turned the box is turned about the line's centre
  const turn = ((shape.rotation ?? 0) * Math.PI) / 180
  const cos = Math.cos(turn)
  const sin = Math.sin(turn)
  const offsetX = minX + w / 2 - shape.w / 2
  const offsetY = minY + h / 2 - shape.h / 2
  const centreX = shape.x + shape.w / 2 + offsetX * cos - offsetY * sin
  const centreY = shape.y + shape.h / 2 + offsetX * sin + offsetY * cos
  const { flip: _flip, strokeDash: _dash, strokeCap: _cap, lineWidths: _widths, lineWidthPos: _pos, lineWidthEdges: _edges, arrowStart: _arrowStart, arrowEnd: _arrowEnd, ...rest } = shape
  return {
    ...rest,
    kind: 'path',
    x: centreX - w / 2,
    y: centreY - h / 2,
    w,
    h,
    geom: [[ring.map(([x, y]): [number, number] => [(x - minX) / w, (y - minY) / h])]],
    fill: shape.stroke,
    stroke: null,
    strokeWidth: 0,
  }
}
