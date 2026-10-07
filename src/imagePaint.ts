import type { ImagePixelPoint } from './imageRepair'

export function paintImageStroke(source: HTMLCanvasElement, points: ImagePixelPoint[], radius: number, color: string): HTMLCanvasElement {
  if (points.length === 0) throw new Error('cannot paint an empty image stroke')
  const output = document.createElement('canvas')
  output.width = source.width
  output.height = source.height
  const context = output.getContext('2d')
  if (!context) throw new Error('canvas context unavailable')
  context.drawImage(source, 0, 0)
  context.beginPath()
  if (points.length === 1) {
    context.arc(points[0].x, points[0].y, Math.max(1, radius), 0, Math.PI * 2)
    context.fillStyle = color
    context.fill()
  } else {
    context.moveTo(points[0].x, points[0].y)
    for (const point of points.slice(1)) context.lineTo(point.x, point.y)
    context.lineWidth = Math.max(1, radius * 2)
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.strokeStyle = color
    context.stroke()
  }
  return output
}
