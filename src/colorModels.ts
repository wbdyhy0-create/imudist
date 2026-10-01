export type ColorModel = 'CMYK' | 'RGB' | 'LAB'

export interface RgbColor { red: number; green: number; blue: number }
export interface CmykColor { cyan: number; magenta: number; yellow: number; black: number }
export interface LabColor { lightness: number; a: number; b: number }

export function linearGradientLine(angle: number, width: number, height: number) {
  const radians = (angle * Math.PI) / 180
  const dx = Math.cos(radians)
  const dy = -Math.sin(radians)
  const halfLength = (Math.abs(dx) * width + Math.abs(dy) * height) / 2
  return {
    x1: width / 2 - dx * halfLength,
    y1: height / 2 - dy * halfLength,
    x2: width / 2 + dx * halfLength,
    y2: height / 2 + dy * halfLength,
  }
}

export const hexToRgb = (hex: string): RgbColor => {
  const clean = hex.replace('#', '')
  const value = clean.length === 3 ? clean.split('').map((part) => part + part).join('') : clean.padEnd(6, '0')
  return { red: parseInt(value.slice(0, 2), 16), green: parseInt(value.slice(2, 4), 16), blue: parseInt(value.slice(4, 6), 16) }
}

export const rgbToHex = ({ red, green, blue }: RgbColor) =>
  `#${[red, green, blue].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('')}`

export const rgbToCmyk = ({ red, green, blue }: RgbColor): CmykColor => {
  const r = red / 255
  const g = green / 255
  const b = blue / 255
  const black = 1 - Math.max(r, g, b)
  if (black >= 1) return { cyan: 0, magenta: 0, yellow: 0, black: 100 }
  return { cyan: ((1 - r - black) / (1 - black)) * 100, magenta: ((1 - g - black) / (1 - black)) * 100, yellow: ((1 - b - black) / (1 - black)) * 100, black: black * 100 }
}

export const cmykToRgb = ({ cyan, magenta, yellow, black }: CmykColor): RgbColor => ({
  red: 255 * (1 - cyan / 100) * (1 - black / 100),
  green: 255 * (1 - magenta / 100) * (1 - black / 100),
  blue: 255 * (1 - yellow / 100) * (1 - black / 100),
})

const pivotRgb = (value: number) => {
  const normalized = value / 255
  return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4)
}

const pivotLab = (value: number) => (value > 0.008856 ? Math.pow(value, 1 / 3) : 7.787 * value + 16 / 116)

export const rgbToLab = ({ red, green, blue }: RgbColor): LabColor => {
  // XYZ relative to the D65 white point — the same one labToRgb multiplies back in, so the two are true inverses
  const r = pivotLab((0.4124 * pivotRgb(red) + 0.3576 * pivotRgb(green) + 0.1805 * pivotRgb(blue)) / 0.95047)
  const g = pivotLab(0.2126 * pivotRgb(red) + 0.7152 * pivotRgb(green) + 0.0722 * pivotRgb(blue))
  const b = pivotLab((0.0193 * pivotRgb(red) + 0.1192 * pivotRgb(green) + 0.9505 * pivotRgb(blue)) / 1.08883)
  return { lightness: 116 * g - 16, a: 500 * (r - g), b: 200 * (g - b) }
}

const pivotLabInverse = (value: number) => {
  const cube = value ** 3
  return cube > 0.008856 ? cube : (value - 16 / 116) / 7.787
}

export const labToRgb = ({ lightness, a, b }: LabColor): RgbColor => {
  const fy = (lightness + 16) / 116
  const x = pivotLabInverse(fy + a / 500) * 0.95047
  const y = pivotLabInverse(fy)
  const z = pivotLabInverse(fy - b / 200) * 1.08883
  const red = 3.2406 * x - 1.5372 * y - 0.4986 * z
  const green = -0.9689 * x + 1.8758 * y + 0.0415 * z
  const blue = 0.0557 * x - 0.204 * y + 1.057 * z
  const convert = (value: number) => 255 * (value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055)
  return { red: convert(red), green: convert(green), blue: convert(blue) }
}

export const labToHex = (value: LabColor) => rgbToHex(labToRgb(value))
export const tintHex = (hex: string, tint: number) => {
  const rgb = hexToRgb(hex)
  const factor = Math.max(0, Math.min(100, tint)) / 100
  return rgbToHex({ red: rgb.red * factor + 255 * (1 - factor), green: rgb.green * factor + 255 * (1 - factor), blue: rgb.blue * factor + 255 * (1 - factor) })
}
