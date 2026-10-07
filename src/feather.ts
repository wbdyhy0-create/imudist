import type { CSSProperties } from 'react'
import type { Feather, GradientFeather } from './document'

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

function edgeRadius(feather: Feather, side: 'top' | 'right' | 'bottom' | 'left'): number {
  if (feather.type === 'basic') return feather.radius
  if (feather.type === 'directional') return feather[side]
  return 0
}

function fadeMask(direction: string, radius: number): string {
  return `linear-gradient(${direction}, rgba(0,0,0,0) 0px, rgba(0,0,0,1) ${radius}px)`
}

/** CSS mask styles shared by the editor's image, shape, and text-frame renderers. */
export function featherMaskStyles(feather: Feather, width: number, height: number, scale = 1): CSSProperties {
  if (feather.type !== 'basic' && feather.type !== 'directional') {
    const image = featherCss(feather, width, height)
    return { maskImage: image, WebkitMaskImage: image }
  }

  const sides = [
    { side: 'top' as const, direction: 'to bottom', limit: height },
    { side: 'right' as const, direction: 'to left', limit: width },
    { side: 'bottom' as const, direction: 'to top', limit: height },
    { side: 'left' as const, direction: 'to right', limit: width },
  ]
  const masks = sides.flatMap(({ side, direction, limit }) => {
    const radius = Math.min(Math.max(0, edgeRadius(feather, side) * scale), limit)
    return radius > 0 ? [fadeMask(direction, radius)] : []
  })
  if (masks.length === 0) return {}
  const image = masks.join(', ')
  return {
    maskImage: image,
    WebkitMaskImage: image,
    maskComposite: masks.length > 1 ? 'intersect' : 'add',
    WebkitMaskComposite: masks.length > 1 ? 'source-in' : 'source-over',
  }
}

function applyEdgeFeather(context: CanvasRenderingContext2D, feather: Feather, width: number, height: number, scale: number): void {
  const edges = [
    { side: 'top' as const, x0: width / 2, y0: 0, x1: width / 2, y1: 1, limit: height },
    { side: 'right' as const, x0: width, y0: height / 2, x1: width - 1, y1: height / 2, limit: width },
    { side: 'bottom' as const, x0: width / 2, y0: height, x1: width / 2, y1: height - 1, limit: height },
    { side: 'left' as const, x0: 0, y0: height / 2, x1: 1, y1: height / 2, limit: width },
  ]
  context.save()
  context.globalCompositeOperation = 'destination-in'
  for (const edge of edges) {
    const radius = Math.min(Math.max(0, edgeRadius(feather, edge.side) * scale), edge.limit)
    if (radius <= 0) continue
    const dx = edge.x1 - edge.x0
    const dy = edge.y1 - edge.y0
    const length = Math.hypot(dx, dy)
    const gradient = context.createLinearGradient(edge.x0, edge.y0, edge.x0 + (dx / length) * radius, edge.y0 + (dy / length) * radius)
    gradient.addColorStop(0, 'rgba(0,0,0,0)')
    gradient.addColorStop(1, 'rgba(0,0,0,1)')
    context.fillStyle = gradient
    context.fillRect(0, 0, width, height)
  }
  context.restore()
}

export function applyFeatherCanvasMask(context: CanvasRenderingContext2D, feather: Feather, width: number, height: number, scale = 1): void {
  if (feather.type === 'basic' || feather.type === 'directional') {
    applyEdgeFeather(context, feather, width, height, scale)
    return
  }
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
