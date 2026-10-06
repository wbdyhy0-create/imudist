export type Unit = 'px' | 'cm' | 'mm' | 'in'

/** Internally every length is stored in points. As in professional layout tools, 1 px = 1 pt. */
export const PT_PER_UNIT: Record<Unit, number> = {
  px: 1,
  mm: 72 / 25.4,
  cm: 72 / 2.54,
  in: 72,
}

export const toPt = (value: number, unit: Unit) => value * PT_PER_UNIT[unit]
export const fromPt = (pt: number, unit: Unit) => pt / PT_PER_UNIT[unit]

export const UNIT_OPTIONS: { value: Unit; label: string }[] = [
  { value: 'px', label: 'פיקסלים' },
  { value: 'cm', label: 'סנטימטרים' },
  { value: 'mm', label: 'מילימטרים' },
  { value: 'in', label: 'אינצ׳ים' },
]

/** Short form shown next to numbers in fields. */
export const UNIT_SUFFIX: Record<Unit, string> = { px: 'px', cm: 'ס״מ', mm: 'מ״מ', in: 'אינץ׳' }

export const formatNumber = (n: number) => String(parseFloat(n.toFixed(3)))

export const formatLength = (pt: number, unit: Unit) => `${formatNumber(fromPt(pt, unit))} ${UNIT_SUFFIX[unit]}`

const LENGTH_RE = /^\s*([+-]?(?:\d+[.,]?\d*|[.,]\d+))\s*(\S*)\s*$/

// keys are lower-cased with quotes / geresh / gershayim / dots removed
const SUFFIXES: Record<string, Unit | 'pt'> = {
  px: 'px', 'פיקסל': 'px', 'פיקסלים': 'px',
  pt: 'pt',
  cm: 'cm', 'סמ': 'cm',
  mm: 'mm', 'ממ': 'mm',
  in: 'in', inch: 'in', 'אינץ': 'in', 'אינצ': 'in', 'אינצים': 'in',
}

/** Parses "12", "12.5 mm", "1,5 ס״מ", `2"` … into points. A missing suffix means `fallbackUnit`. */
export function parseLength(text: string, fallbackUnit: Unit): number | null {
  const m = LENGTH_RE.exec(text)
  if (!m) return null
  const value = parseFloat(m[1].replace(',', '.'))
  const raw = m[2]
  if (raw === '"' || raw === '״' || raw === '”') return toPt(value, 'in')
  const key = raw.toLowerCase().replace(/["'״׳”“’‘.]/g, '')
  if (key === '') return toPt(value, fallbackUnit)
  const unit = SUFFIXES[key]
  if (!unit) return null
  return unit === 'pt' ? value : toPt(value, unit)
}

export interface PagePreset {
  id: string
  label: string
  /** Page dimensions, in points. */
  width: number
  height: number
  unit?: Unit
  /** By default, page presets follow the orientation of the last document. */
  rotateWithDocument?: boolean
}

const mm = (v: number) => toPt(v, 'mm')

export const PAGE_PRESETS: PagePreset[] = [
  { id: 'A4', label: 'A4', width: mm(210), height: mm(297) },
  { id: 'A3', label: 'A3', width: mm(297), height: mm(420) },
  { id: 'A5', label: 'A5', width: mm(148), height: mm(210) },
  { id: 'B5', label: 'B5', width: mm(176), height: mm(250) },
]

const px = (v: number) => toPt(v, 'px')

export const DIGITAL_PRESETS: PagePreset[] = [
  { id: 'story', label: 'סטורי / סטטוס', width: px(1080), height: px(1920), unit: 'px', rotateWithDocument: false },
  { id: 'square-post', label: 'פוסט ריבועי', width: px(1080), height: px(1080), unit: 'px', rotateWithDocument: false },
  { id: 'wide-post', label: 'פוסט לרוחב', width: px(1200), height: px(630), unit: 'px', rotateWithDocument: false },
  { id: 'facebook-cover', label: 'קאבר פייסבוק', width: px(851), height: px(315), unit: 'px', rotateWithDocument: false },
  { id: 'full-hd', label: 'Full HD', width: px(1920), height: px(1080), unit: 'px', rotateWithDocument: false },
]

/** The preset whose size matches (in either orientation), or null for a custom size. */
export function matchPreset(width: number, height: number): PagePreset | null {
  const [a, b] = width <= height ? [width, height] : [height, width]
  return PAGE_PRESETS.find((p) => Math.abs(p.width - a) < 0.05 && Math.abs(p.height - b) < 0.05) ?? null
}
