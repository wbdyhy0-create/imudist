export type Unit = 'px' | 'cm' | 'mm' | 'in'

/** Internally every length is stored in points. As in InDesign, 1 px = 1 pt. */
export const PT_PER_UNIT: Record<Unit, number> = {
  px: 1,
  mm: 72 / 25.4,
  cm: 72 / 2.54,
  in: 72,
}

export const toPt = (value: number, unit: Unit) => value * PT_PER_UNIT[unit]
export const fromPt = (pt: number, unit: Unit) => pt / PT_PER_UNIT[unit]

export const UNIT_OPTIONS: { value: Unit; label: string }[] = [
  { value: 'px', label: 'Pixels' },
  { value: 'cm', label: 'Centimeters' },
  { value: 'mm', label: 'Millimeters' },
  { value: 'in', label: 'Inches' },
]

export const formatNumber = (n: number) => String(parseFloat(n.toFixed(3)))

export const formatLength = (pt: number, unit: Unit) => `${formatNumber(fromPt(pt, unit))} ${unit}`

const LENGTH_RE = /^\s*([+-]?(?:\d+[.,]?\d*|[.,]\d+))\s*(px|pt|cm|mm|in|")?\s*$/i

/** Parses "12", "12.5 mm", "1,5cm", `2"` … into points. A missing suffix means `fallbackUnit`. */
export function parseLength(text: string, fallbackUnit: Unit): number | null {
  const m = LENGTH_RE.exec(text)
  if (!m) return null
  const value = parseFloat(m[1].replace(',', '.'))
  const suffix = (m[2] ?? '').toLowerCase()
  if (suffix === 'pt') return value
  const unit: Unit = suffix === '"' ? 'in' : suffix === '' ? fallbackUnit : (suffix as Unit)
  return toPt(value, unit)
}

export interface PagePreset {
  id: string
  label: string
  /** portrait size, points */
  width: number
  height: number
}

const mm = (v: number) => toPt(v, 'mm')

export const PAGE_PRESETS: PagePreset[] = [
  { id: 'A4', label: 'A4', width: mm(210), height: mm(297) },
  { id: 'A3', label: 'A3', width: mm(297), height: mm(420) },
  { id: 'A5', label: 'A5', width: mm(148), height: mm(210) },
]

/** The preset whose size matches (in either orientation), or null for a custom size. */
export function matchPreset(width: number, height: number): PagePreset | null {
  const [a, b] = width <= height ? [width, height] : [height, width]
  return PAGE_PRESETS.find((p) => Math.abs(p.width - a) < 0.05 && Math.abs(p.height - b) < 0.05) ?? null
}
