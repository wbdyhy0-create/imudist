import { hexToRgb } from './colorModels'

export function shadowBlurRadius(offsetX: number, offsetY: number, opacity: number, scale = 1): number {
  const alpha = Math.max(0, Math.min(1, opacity))
  return Math.hypot(offsetX * scale, offsetY * scale) * 0.35 * (1 - alpha)
}

export function canvasShadowBlur(offsetX: number, offsetY: number, opacity: number, scale = 1): number {
  return shadowBlurRadius(offsetX, offsetY, opacity, scale) * 2
}

export function dropShadowFilter(offsetX = 0, offsetY = 6, opacity = 0, scale = 1, color = '#000000'): string | undefined {
  const alpha = Math.max(0, Math.min(1, opacity))
  if (alpha === 0) return undefined
  const x = offsetX * scale
  const y = offsetY * scale
  const blur = shadowBlurRadius(offsetX, offsetY, alpha, scale)
  const rgb = hexToRgb(color)
  return `drop-shadow(${x}px ${y}px ${blur}px rgba(${rgb.red}, ${rgb.green}, ${rgb.blue}, ${alpha}))`
}