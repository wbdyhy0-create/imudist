import type { GradientFeather } from './document'

/** CSS alpha mask for a normalized drag vector and its opacity stops. */
export function featherCss(feather: GradientFeather, width: number, height: number): string {
  const x0 = feather.x0 * width
  const y0 = feather.y0 * height
  const x1 = feather.x1 * width
  const y1 = feather.y1 * height
  const dx = x1 - x0
  const dy = y1 - y0
  const length = Math.hypot(dx, dy)
  if (!Number.isFinite(length) || length < 1e-6) return 'linear-gradient(0deg, rgba(0,0,0,1) 0px, rgba(0,0,0,1) 0px)'

  const angle = (Math.atan2(dx, -dy) * 180) / Math.PI
  const radians = (angle * Math.PI) / 180
  const lineLength = Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians))
  const ux = dx / length
  const uy = dy / length
  const centerX = width / 2
  const centerY = height / 2
  const startPosition = (x0 - centerX) * ux + (y0 - centerY) * uy + lineLength / 2
  const stops = feather.points.map((point) => {
    const position = startPosition + point.offset * length
    return `rgba(0,0,0,${point.opacity}) ${position}px`
  })

  return `linear-gradient(${angle}deg, ${stops.join(', ')})`
}

export function applyFeatherCanvasMask(context: CanvasRenderingContext2D, feather: GradientFeather, width: number, height: number): void {
  const x0 = feather.x0 * width
  const y0 = feather.y0 * height
  const x1 = feather.x1 * width
  const y1 = feather.y1 * height
  const dx = x1 - x0
  const dy = y1 - y0
  const length = Math.hypot(dx, dy)
  if (!Number.isFinite(length) || length < 1e-6 || width <= 0 || height <= 0) return

  const radians = Math.atan2(dx, -dy)
  const lineLength = Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians))
  if (lineLength <= 0) return
  const ux = dx / length
  const uy = dy / length
  const centerX = width / 2
  const centerY = height / 2
  const startPosition = (x0 - centerX) * ux + (y0 - centerY) * uy + lineLength / 2
  const points = [...feather.points].sort((a, b) => a.offset - b.offset).map((point) => ({ ...point, position: startPosition + point.offset * length }))
  const gradientStart = Math.min(0, ...points.map((point) => point.position))
  const gradientEnd = Math.max(lineLength, ...points.map((point) => point.position))
  const gradientLength = gradientEnd - gradientStart
  if (gradientLength <= 0) return
  const gradient = context.createLinearGradient(
    centerX + ux * (gradientStart - lineLength / 2),
    centerY + uy * (gradientStart - lineLength / 2),
    centerX + ux * (gradientEnd - lineLength / 2),
    centerY + uy * (gradientEnd - lineLength / 2),
  )
  for (const point of points) {
    gradient.addColorStop((point.position - gradientStart) / gradientLength, `rgba(0,0,0,${point.opacity})`)
  }
  context.save()
  context.globalCompositeOperation = 'destination-in'
  context.fillStyle = gradient
  context.fillRect(0, 0, width, height)
  context.restore()
}
