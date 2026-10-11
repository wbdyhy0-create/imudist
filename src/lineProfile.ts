import type { ShapeFrame } from './document'

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

export const LINE_PROFILES: { id: string; label: string; widths: LineWidths }[] = [
  { id: 'even', label: 'אחיד', widths: [1, 1, 1] },
  { id: 'thickToThin', label: 'עבה בהתחלה ודק בסוף', widths: [1, 0.55, 0.12] },
  { id: 'thinToThick', label: 'דק בהתחלה ועבה בסוף', widths: [0.12, 0.55, 1] },
  { id: 'pointEnd', label: 'מחודד בסוף', widths: [1, 0.5, 0] },
  { id: 'pointStart', label: 'מחודד בהתחלה', widths: [0, 0.5, 1] },
  { id: 'lens', label: 'מחודד בשני הקצוות', widths: [0, 1, 0] },
  { id: 'thickMiddle', label: 'עבה באמצע', widths: [0.15, 1, 0.15] },
  { id: 'pinched', label: 'דק באמצע', widths: [1, 0.18, 1] },
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

/** does the line have a profile that is not the plain even one */
export function isProfiledLine(shape: Pick<ShapeFrame, 'kind' | 'lineWidths'>): boolean {
  if (shape.kind !== 'line' || !shape.lineWidths) return false
  const widths = cleanLineWidths(shape.lineWidths)
  return !!widths && !widths.every((width, i) => near(width, EVEN[i]!))
}

/** the width (a multiple of the line's thickness) at a place along it, 0 at the start to 1 at the end: a curve through the three widths */
export function widthAt(widths: LineWidths, t: number): number {
  const [start, middle, end] = widths
  const value = start * (1 - t) * (1 - 2 * t) + middle * 4 * t * (1 - t) + end * t * (2 * t - 1)
  return Math.max(0, value)
}

type Pt = [number, number]

/**
 * The outline of the line as a polygon, in the line's own box (points from its top-left corner): along one side of the line, round
 * the end, back along the other side, round the start. The ends follow the line's `strokeCap`.
 */
export function lineOutline(shape: Pick<ShapeFrame, 'w' | 'h' | 'flip' | 'strokeWidth' | 'strokeCap' | 'lineWidths'>): Pt[] {
  const widths = cleanLineWidths(shape.lineWidths) ?? EVEN
  const [x0, y0, x1, y1] = shape.flip ? [0, shape.h, shape.w, 0] : [0, 0, shape.w, shape.h]
  const length = Math.hypot(x1 - x0, y1 - y0)
  if (length < 1e-6 || shape.strokeWidth <= 0) return []
  const dx = (x1 - x0) / length
  const dy = (y1 - y0) / length
  // the unit normal: to the left of the way the line goes
  const nx = dy
  const ny = -dx
  const steps = Math.max(16, Math.min(120, Math.round(length / 3)))
  const left: Pt[] = []
  const right: Pt[] = []
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const half = (shape.strokeWidth * widthAt(widths, t)) / 2
    const cx = x0 + (x1 - x0) * t
    const cy = y0 + (y1 - y0) * t
    left.push([cx + nx * half, cy + ny * half])
    right.push([cx - nx * half, cy - ny * half])
  }
  const ring: Pt[] = [...left]
  const cap = shape.strokeCap ?? 'butt'
  const endHalf = (shape.strokeWidth * widthAt(widths, 1)) / 2
  const startHalf = (shape.strokeWidth * widthAt(widths, 0)) / 2
  const arc = (centre: Pt, radius: number, from: Pt, towards: Pt, quarters: number): Pt[] => {
    // a half circle from the direction `from` through `towards` to the opposite of `from`
    const points: Pt[] = []
    for (let j = 1; j < quarters * 2; j += 1) {
      const angle = (Math.PI * j) / (quarters * 2)
      points.push([centre[0] + radius * (from[0] * Math.cos(angle) + towards[0] * Math.sin(angle)), centre[1] + radius * (from[1] * Math.cos(angle) + towards[1] * Math.sin(angle))])
    }
    return points
  }
  if (cap === 'round' && endHalf > 0.05) ring.push(...arc([x1, y1], endHalf, [nx, ny], [dx, dy], 5))
  else if (cap === 'square' && endHalf > 0.05) ring.push([left[steps]![0] + dx * endHalf, left[steps]![1] + dy * endHalf], [right[steps]![0] + dx * endHalf, right[steps]![1] + dy * endHalf])
  ring.push(...right.reverse())
  if (cap === 'round' && startHalf > 0.05) ring.push(...arc([x0, y0], startHalf, [-nx, -ny], [-dx, -dy], 5))
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
  const { flip: _flip, strokeDash: _dash, strokeCap: _cap, lineWidths: _widths, ...rest } = shape
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
