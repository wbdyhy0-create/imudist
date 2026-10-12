import type { ShapeFrame } from './document'
import { isProfiledLine, lineOutline, lineOutlinePath } from './lineProfile'
import { shapePath } from './shapes'

/**
 * A line has no thickness in its own box (a horizontal or a vertical one has no height or no width at all), so what it
 * paints cannot be read from the box on the screen: this is the box (page points, upright) it covers - the thickness of
 * the stroke, the arrow heads and the widths of a profile - turned with the line when it is turned.
 */
export function lineVisualBox(shape: Pick<ShapeFrame, 'x' | 'y' | 'w' | 'h' | 'rotation' | 'strokeWidth' | 'flip' | 'strokeCap' | 'lineWidths' | 'lineWidthPos' | 'lineWidthEdges' | 'arrowStart' | 'arrowEnd' | 'kind'>): { x: number; y: number; w: number; h: number } {
  const half = Math.max(0, shape.strokeWidth) / 2
  let minX = -half
  let minY = -half
  let maxX = shape.w + half
  let maxY = shape.h + half
  if (isProfiledLine(shape)) {
    const ring = lineOutline(shape)
    if (ring.length >= 3) {
      minX = Math.min(...ring.map((point) => point[0]))
      maxX = Math.max(...ring.map((point) => point[0]))
      minY = Math.min(...ring.map((point) => point[1]))
      maxY = Math.max(...ring.map((point) => point[1]))
    }
  }
  const turn = ((shape.rotation ?? 0) * Math.PI) / 180
  const cx = shape.w / 2
  const cy = shape.h / 2
  const cos = Math.cos(turn)
  const sin = Math.sin(turn)
  const corners = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]].map(([x, y]) => [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos])
  const xs = corners.map((corner) => corner[0])
  const ys = corners.map((corner) => corner[1])
  return { x: shape.x + Math.min(...xs), y: shape.y + Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

/**
 * Lines drawn straight into a picture (a canvas), from their geometry - not from what is on the screen, where a line
 * with no height is nothing to capture. `density` is pixels to a point. Returns the picture and its size in points.
 */
export function drawLines(shapes: ShapeFrame[], density = 3): { canvas: HTMLCanvasElement; w: number; h: number } | null {
  if (shapes.length === 0) return null
  const boxes = shapes.map((shape) => lineVisualBox(shape))
  const x0 = Math.min(...boxes.map((box) => box.x))
  const y0 = Math.min(...boxes.map((box) => box.y))
  const w = Math.max(...boxes.map((box) => box.x + box.w)) - x0
  const h = Math.max(...boxes.map((box) => box.y + box.h)) - y0
  if (!(w > 0 && h > 0)) return null
  const k = Math.min(density, 4000 / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(w * k))
  canvas.height = Math.max(1, Math.ceil(h * k))
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  for (const shape of shapes) {
    if (!shape.stroke) continue
    const profiled = isProfiledLine(shape)
    const path = new Path2D(profiled ? lineOutlinePath(shape) : shapePath(shape))
    ctx.save()
    ctx.scale(k, k)
    ctx.translate(shape.x - x0, shape.y - y0)
    if (shape.rotation) {
      ctx.translate(shape.w / 2, shape.h / 2)
      ctx.rotate((shape.rotation * Math.PI) / 180)
      ctx.translate(-shape.w / 2, -shape.h / 2)
    }
    ctx.globalAlpha = shape.opacity ?? 1
    if (profiled) {
      // a profile or an arrow is drawn as the filled outline of what it covers, in the colour of the line
      ctx.fillStyle = shape.stroke
      ctx.fill(path, 'evenodd')
    } else {
      ctx.strokeStyle = shape.stroke
      ctx.lineWidth = shape.strokeWidth
      ctx.lineCap = shape.strokeCap ?? 'butt'
      ctx.lineJoin = 'round'
      if (shape.strokeDash === 'dashed') ctx.setLineDash([shape.strokeWidth * 3, shape.strokeWidth * 2])
      ctx.stroke(path)
    }
    ctx.restore()
  }
  return { canvas, w, h }
}
