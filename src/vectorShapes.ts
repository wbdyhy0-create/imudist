import { lineProfileShape } from './lineProfile'
import { GState, type jsPDF } from 'jspdf'
import type { ShapeFrame } from './document'
import { rgbToInks } from './cmykPage'
import { shapePath } from './shapes'
import { t } from './i18n'

/**
 * Shapes and lines for a PDF as shapes and lines, not as a part of the page picture: sharp at any size, in the colour they were
 * given. Only a plain shape is done this way (a colour fill and/or an outline); a shape with a gradient, a shadow, a picture in it,
 * a soft edge, or a table stays a part of the page picture: `shapeToVector` says why not.
 */

/** One step of an outline, in points from the page's top-left. Curves are cubic (a quadratic one and an arc are turned into those). */
export type PathOp = ['M', number, number] | ['L', number, number] | ['C', number, number, number, number, number, number] | ['Z']

export interface VectorShape {
  ops: PathOp[]
  /** #rrggbb, null for none */
  fill: string | null
  stroke: string | null
  strokeWidth: number
  /** on/off lengths, null for a solid line */
  dash: number[] | null
  cap: 'butt' | 'round' | 'square'
  /** the corners of the line: sharp for a path with flat ends, round otherwise */
  join: 'miter' | 'round'
  opacity: number
}

export type ShapePictureReason = 'table' | 'feather' | 'gradient' | 'shadow' | 'blur' | 'image' | 'color'

export const SHAPE_PICTURE_REASONS: Record<ShapePictureReason, string> = {
  get table() { return t('טבלה') },
  get feather() { return t('טשטוש קצוות') },
  get gradient() { return t('מילוי מעבר צבעים') },
  get shadow() { return t('צל') },
  get blur() { return t('טשטוש') },
  get image() { return t('תמונה בתוך צורה') },
  get color() { return t('צבע שאינו מספר') },
}

/** The SVG arc from (x1, y1) to (x2, y2) as cubic curves (the SVG specification's conversion to a centre and angles, then a curve for every quarter turn or less). */
export function arcToCubics(x1: number, y1: number, rxIn: number, ryIn: number, rotationDeg: number, large: boolean, sweep: boolean, x2: number, y2: number): PathOp[] {
  if (x1 === x2 && y1 === y2) return []
  let rx = Math.abs(rxIn)
  let ry = Math.abs(ryIn)
  if (rx === 0 || ry === 0) return [['L', x2, y2]]
  const phi = (rotationDeg * Math.PI) / 180
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)
  const dx = (x1 - x2) / 2
  const dy = (y1 - y2) / 2
  const x1p = cosPhi * dx + sinPhi * dy
  const y1p = -sinPhi * dx + cosPhi * dy
  // an arc whose radii are too small to reach is made bigger, as the specification says
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lambda > 1) {
    const k = Math.sqrt(lambda)
    rx *= k
    ry *= k
  }
  const sign = large === sweep ? -1 : 1
  const numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  const factor = sign * Math.sqrt(Math.max(0, numerator / denominator))
  const cxp = (factor * rx * y1p) / ry
  const cyp = (-factor * ry * x1p) / rx
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy
    const length = Math.hypot(ux, uy) * Math.hypot(vx, vy)
    const a = Math.acos(Math.max(-1, Math.min(1, dot / length)))
    return ux * vy - uy * vx < 0 ? -a : a
  }
  const start = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
  let sweepAngle = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
  if (!sweep && sweepAngle > 0) sweepAngle -= 2 * Math.PI
  else if (sweep && sweepAngle < 0) sweepAngle += 2 * Math.PI
  const parts = Math.max(1, Math.ceil(Math.abs(sweepAngle) / (Math.PI / 2) - 1e-9))
  const step = sweepAngle / parts
  const t = (4 / 3) * Math.tan(step / 4)
  const ops: PathOp[] = []
  let from = start
  for (let i = 0; i < parts; i++) {
    const to = from + step
    const point = (a: number): [number, number] => [cx + rx * Math.cos(a) * cosPhi - ry * Math.sin(a) * sinPhi, cy + rx * Math.cos(a) * sinPhi + ry * Math.sin(a) * cosPhi]
    const slope = (a: number): [number, number] => [-rx * Math.sin(a) * cosPhi - ry * Math.cos(a) * sinPhi, -rx * Math.sin(a) * sinPhi + ry * Math.cos(a) * cosPhi]
    const [px, py] = point(from)
    const [qx, qy] = i === parts - 1 ? [x2, y2] : point(to)
    const [sx, sy] = slope(from)
    const [ex, ey] = slope(to)
    ops.push(['C', px + t * sx, py + t * sy, qx - t * ex, qy - t * ey, qx, qy])
    from = to
  }
  return ops
}

/** The path commands `shapePath` writes (M L H V C Q A Z, capital letters) as steps of an outline. Null for any other command. */
export function parseSvgPath(d: string): PathOp[] | null {
  const tokens = d.match(/[MLHVCQAZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi)
  if (!tokens) return []
  const ops: PathOp[] = []
  let i = 0
  let x = 0
  let y = 0
  let startX = 0
  let startY = 0
  const number = () => Number(tokens[i++])
  const flag = () => Number(tokens[i++]) !== 0
  while (i < tokens.length) {
    const command = tokens[i++]
    if (!/^[MLHVCQAZ]$/.test(command)) return null
    if (command === 'Z') {
      ops.push(['Z'])
      x = startX
      y = startY
      continue
    }
    // a command may be followed by several sets of numbers
    do {
      if (command === 'M') {
        x = number()
        y = number()
        startX = x
        startY = y
        ops.push(['M', x, y])
      } else if (command === 'L') {
        x = number()
        y = number()
        ops.push(['L', x, y])
      } else if (command === 'H') {
        x = number()
        ops.push(['L', x, y])
      } else if (command === 'V') {
        y = number()
        ops.push(['L', x, y])
      } else if (command === 'C') {
        const [x1, y1, x2, y2, x3, y3] = [number(), number(), number(), number(), number(), number()]
        ops.push(['C', x1, y1, x2, y2, x3, y3])
        x = x3
        y = y3
      } else if (command === 'Q') {
        const [qx, qy, x2, y2] = [number(), number(), number(), number()]
        // a quadratic curve as the cubic with the same shape
        ops.push(['C', x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), x2 + (2 / 3) * (qx - x2), y2 + (2 / 3) * (qy - y2), x2, y2])
        x = x2
        y = y2
      } else {
        const [rx, ry, rotation] = [number(), number(), number()]
        const large = flag()
        const sweep = flag()
        const x2 = number()
        const y2 = number()
        ops.push(...arcToCubics(x, y, rx, ry, rotation, large, sweep, x2, y2))
        x = x2
        y = y2
      }
    } while (i < tokens.length && !/^[MLHVCQAZ]$/i.test(tokens[i]))
  }
  return ops
}

const HEX = /^#([0-9a-f]{6})$/i
const SHORT_HEX = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i

/** A colour written as #rrggbb (or #rgb), in the long form; null for anything else. */
export function longHex(color: string | null | undefined): string | null {
  if (!color) return null
  if (HEX.test(color)) return color.toLowerCase()
  const short = SHORT_HEX.exec(color)
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase() : null
}

/** The shape as an outline on the page (`pageX`, `pageY` is the page's own top-left on the world), or the reason it stays a picture. */
export function shapeToVector(original: ShapeFrame, pageX: number, pageY: number): VectorShape | { reason: ShapePictureReason } {
  // a line thicker in some places than others is written as the shape it covers
  const shape = lineProfileShape(original) ?? original
  if (shape.kind === 'table') return { reason: 'table' }
  if (shape.feather) return { reason: 'feather' }
  if (shape.fillGradient && !shape.frame) return { reason: 'gradient' }
  if ((shape.shadowOpacity ?? 0) > 0) return { reason: 'shadow' }
  if ((shape.blur ?? 0) > 0) return { reason: 'blur' }
  if (shape.image) return { reason: 'image' }
  const fill = shape.frame ? null : longHex(shape.fill)
  const stroke = shape.stroke && shape.strokeWidth > 0 ? longHex(shape.stroke) : null
  if ((shape.fill && !shape.frame && !fill) || (shape.stroke && shape.strokeWidth > 0 && !stroke)) return { reason: 'color' }
  const local = parseSvgPath(shapePath(shape, 1))
  if (!local) return { reason: 'color' }
  const turn = ((shape.rotation ?? 0) * Math.PI) / 180
  const cos = Math.cos(turn)
  const sin = Math.sin(turn)
  const move = (px: number, py: number): [number, number] => {
    // from the shape's own box to the page: turned about the centre of the box, clockwise
    const dx = px - shape.w / 2
    const dy = py - shape.h / 2
    return [shape.x - pageX + shape.w / 2 + dx * cos - dy * sin, shape.y - pageY + shape.h / 2 + dx * sin + dy * cos]
  }
  const ops: PathOp[] = local.map((op): PathOp => {
    if (op[0] === 'Z') return op
    if (op[0] === 'C') {
      const a = move(op[1], op[2])
      const b = move(op[3], op[4])
      const c = move(op[5], op[6])
      return ['C', a[0], a[1], b[0], b[1], c[0], c[1]]
    }
    const p = move(op[1], op[2])
    return [op[0], p[0], p[1]]
  })
  const width = shape.strokeWidth
  const line = shape.kind === 'line'
  const path = shape.kind === 'path'
  return {
    ops,
    fill,
    stroke,
    strokeWidth: width,
    dash: line && shape.strokeDash === 'dashed' ? [width * 3, width * 2] : null,
    cap: line || path ? (shape.strokeCap ?? (path ? 'round' : 'butt')) : 'butt',
    join: path && shape.strokeCap === 'butt' ? 'miter' : 'round',
    opacity: shape.opacity ?? 1,
  }
}

const rgbOf = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]

/** Draws the shapes on the current page. `x`, `y` is where the page's own top-left is on the sheet. In CMYK the colours are written in the four inks. */
export function writeShapes(pdf: jsPDF, shapes: VectorShape[], x: number, y: number, cmyk = false) {
  for (const shape of shapes) {
    if (!shape.fill && !shape.stroke) continue
    pdf.saveGraphicsState()
    if (shape.opacity < 1) pdf.setGState(new GState({ opacity: shape.opacity, 'stroke-opacity': shape.opacity }))
    if (shape.fill) {
      const [r, g, b] = rgbOf(shape.fill)
      if (cmyk) pdf.setFillColor(...rgbToInks(r, g, b))
      else pdf.setFillColor(r, g, b)
    }
    if (shape.stroke) {
      const [r, g, b] = rgbOf(shape.stroke)
      if (cmyk) pdf.setDrawColor(...rgbToInks(r, g, b))
      else pdf.setDrawColor(r, g, b)
      pdf.setLineWidth(shape.strokeWidth)
      pdf.setLineCap(shape.cap)
      pdf.setLineJoin(shape.join)
      if (shape.dash) pdf.setLineDashPattern(shape.dash, 0)
    }
    for (const op of shape.ops) {
      if (op[0] === 'M') pdf.moveTo(x + op[1], y + op[2])
      else if (op[0] === 'L') pdf.lineTo(x + op[1], y + op[2])
      else if (op[0] === 'C') pdf.curveTo(x + op[1], y + op[2], x + op[3], y + op[4], x + op[5], y + op[6])
      else pdf.close()
    }
    if (shape.fill && shape.stroke) pdf.fillStrokeEvenOdd()
    else if (shape.fill) pdf.fillEvenOdd()
    else pdf.stroke()
    pdf.restoreGraphicsState()
  }
}
