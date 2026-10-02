import { hexToRgb } from './colorModels'

export function dropShadowFilter(offsetX = 0, offsetY = 6, opacity = 0, scale = 1, color = '#000000'): string | undefined {
  const alpha = Math.max(0, Math.min(1, opacity))
  if (alpha === 0) return undefined
  const x = offsetX * scale
  const y = offsetY * scale
  const distance = Math.hypot(x, y)
  const blur = distance * 0.35 * (1 - alpha)
  const rgb = hexToRgb(color)
  return `drop-shadow(${x}px ${y}px ${blur}px rgba(${rgb.red}, ${rgb.green}, ${rgb.blue}, ${alpha}))`
}