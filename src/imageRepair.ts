export interface ImagePixelPoint {
  x: number
  y: number
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function repairImageStroke(source: HTMLCanvasElement, points: ImagePixelPoint[], radius: number): HTMLCanvasElement {
  const output = document.createElement('canvas')
  output.width = source.width
  output.height = source.height
  const context = output.getContext('2d')
  const sourceContext = source.getContext('2d')
  if (!context || !sourceContext || points.length === 0) return output
  context.drawImage(source, 0, 0)
  const original = sourceContext.getImageData(0, 0, source.width, source.height)
  const result = context.getImageData(0, 0, source.width, source.height)
  const { width, height, data } = original
  const appliedEdge = new Float32Array(width * height)
  const brushRadius = Math.max(1, Math.min(radius, 64))
  const readPixel = (x: number, y: number) => {
    const ix = clamp(Math.round(x), 0, width - 1)
    const iy = clamp(Math.round(y), 0, height - 1)
    return (iy * width + ix) * 4
  }
  const dab = (center: ImagePixelPoint, tangent: ImagePixelPoint) => {
    const length = Math.hypot(tangent.x, tangent.y) || 1
    const nx = -tangent.y / length
    const ny = tangent.x / length
    const halfWidth = brushRadius
    const sampleOffset = halfWidth + 1
    const first = readPixel(center.x - nx * sampleOffset, center.y - ny * sampleOffset)
    const second = readPixel(center.x + nx * sampleOffset, center.y + ny * sampleOffset)
    const minX = Math.max(0, Math.floor(center.x - halfWidth))
    const maxX = Math.min(width - 1, Math.ceil(center.x + halfWidth))
    const minY = Math.max(0, Math.floor(center.y - halfWidth))
    const maxY = Math.min(height - 1, Math.ceil(center.y + halfWidth))
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x - center.x
        const dy = y - center.y
        const distance = Math.hypot(dx, dy)
        if (distance > halfWidth) continue
        const across = clamp(0.5 + (dx * nx + dy * ny) / (2 * sampleOffset), 0, 1)
        const edge = clamp(halfWidth + 0.5 - distance, 0, 1)
        const pixel = (y * width + x) * 4
        const weightIndex = y * width + x
        if (edge <= appliedEdge[weightIndex]) continue
        appliedEdge[weightIndex] = edge
        for (let channel = 0; channel < 3; channel++) {
          const fill = data[first + channel] * (1 - across) + data[second + channel] * across
          result.data[pixel + channel] = data[pixel + channel] * (1 - edge) + fill * edge
        }
        const fillAlpha = data[first + 3] * (1 - across) + data[second + 3] * across
        result.data[pixel + 3] = Math.max(result.data[pixel + 3], data[pixel + 3] * (1 - edge) + fillAlpha * edge)
      }
    }
  }
  if (points.length === 1) {
    dab(points[0], { x: 1, y: 0 })
  } else {
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i]
      const end = points[i + 1]
      const dx = end.x - start.x
      const dy = end.y - start.y
      const distance = Math.hypot(dx, dy)
      const steps = Math.max(1, Math.ceil(distance / Math.max(1, brushRadius / 3)))
      for (let step = i === 0 ? 0 : 1; step <= steps; step++) {
        const t = step / steps
        dab({ x: start.x + dx * t, y: start.y + dy * t }, { x: dx, y: dy })
      }
    }
  }
  context.putImageData(result, 0, 0)
  return output
}
