import type { LineCap, Sharpness } from './document'
import { t } from './i18n'

/**
 * How sharp a free-drawn line or brush stroke is. Sharp: straight, crisp ends (a flat cut, with sharp corners). Medium: rounded ends. Soft: rounded ends with the edge
 * softened by a slight blur (a Gaussian blur of the shape: an SVG filter in an SVG file, a picture of just that shape in a PDF).
 */

export type { Sharpness } from './document'

export const SHARPNESS_LEVELS: { id: Sharpness; label: string; hint: string }[] = [
  { id: 'sharp', get label() { return t('חד') }, get hint() { return t('קצוות ישרים וחדים, בלי ריכוך. מתאים לקווים מדויקים ולגרפיקה נקייה') } },
  { id: 'medium', get label() { return t('בינוני') }, get hint() { return t('קצוות מעוגלים מעט, בין קו חד לזרימה רכה') } },
  { id: 'soft', get label() { return t('רגיל / רך') }, get hint() { return t('קצוות מרוככים בטשטוש עדין, כמו משיכת מכחול רכה') } },
]

export const DEFAULT_SHARPNESS: Sharpness = 'medium'

/** the most a shape may be blurred (points) */
export const MAX_BLUR = 60

export const isSharpness = (value: unknown): value is Sharpness => value === 'sharp' || value === 'medium' || value === 'soft'

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))
const tenths = (value: number) => Math.round(value * 10) / 10

/** the blur (points) of a soft free-drawn line that is `width` thick */
export const softLineBlur = (width: number): number => tenths(clamp(width * 0.5, 0.6, 8))

/** the blur (points) of a soft brush stroke of `size` */
export const softBrushBlur = (size: number): number => tenths(clamp(size * 0.07, 0.4, 6))

/**
 * The ends and the blur a free-drawn line of `width` gets at `level`. At the medium level the ends are `mediumCap` (round unless the
 * pencil's own settings say otherwise).
 */
export function lineLook(level: Sharpness, width: number, mediumCap: LineCap = 'round'): { strokeCap: LineCap; blur?: number } {
  if (level === 'sharp') return { strokeCap: 'butt' }
  if (level === 'soft') return { strokeCap: 'round', blur: softLineBlur(width) }
  return { strokeCap: mediumCap }
}
