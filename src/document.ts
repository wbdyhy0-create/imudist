import { PAGE_PRESETS, toPt, type Unit } from './units'

export type Binding = 'ltr' | 'rtl'

export interface Sides {
  top: number
  bottom: number
  /** "Inside" when facing pages are on */
  left: number
  /** "Outside" when facing pages are on */
  right: number
}

/** Every length is in points. */
export interface DocSettings {
  name: string
  width: number
  height: number
  unit: Unit
  binding: Binding
  pages: number
  facingPages: boolean
  startPage: number
  primaryTextFrame: boolean
  columns: number
  gutter: number
  margins: Sides
  bleed: Sides
  slug: Sides
}

export type TextAlign = 'right' | 'center' | 'left' | 'justify'

/** Character/paragraph formatting. It applies to a whole story (all frames linked together). */
export interface TextStyle {
  fontFamily: string
  /** points */
  fontSize: number
  /** physical alignment; Hebrew text normally sits on the right */
  align: TextAlign
  bold: boolean
  italic: boolean
}

export const DEFAULT_TEXT_STYLE: TextStyle = { fontFamily: 'Segoe UI', fontSize: 14, align: 'right', bold: false, italic: false }

/** Fonts with Hebrew glyphs that ship with Windows; a missing one silently falls back to the default. */
export const FONT_FAMILIES = [
  'Segoe UI', 'Arial', 'Tahoma', 'Calibri', 'Gisha', 'David', 'Miriam', 'FrankRuehl', 'Narkisim', 'Times New Roman', 'Courier New',
]

export const LINE_HEIGHT = 1.25

/**
 * A text frame. Position and size are in world points (see layout.ts), so frames may also sit on the pasteboard.
 * Frames can be threaded: `next` is the frame the text continues into. The whole story's text (and style)
 * lives in the first frame of the chain; the other frames only display their share of it.
 */
export interface TextFrame extends TextStyle {
  id: string
  x: number
  y: number
  w: number
  h: number
  text: string
  next: string | null
}

export const MIN_PAGE_PT = 1
export const MAX_PAGE_PT = 16384
export const MAX_SIDE_PT = 2000
export const MAX_PAGES = 9999
export const MAX_COLUMNS = 100

const sides = (v: number): Sides => ({ top: v, bottom: v, left: v, right: v })

export function defaultDocSettings(name: string): DocSettings {
  return {
    name,
    width: PAGE_PRESETS[0].width,
    height: PAGE_PRESETS[0].height,
    unit: 'mm',
    binding: 'rtl',
    pages: 1,
    facingPages: false,
    startPage: 1,
    primaryTextFrame: false,
    columns: 1,
    gutter: toPt(5, 'mm'),
    margins: sides(toPt(15, 'mm')),
    bleed: sides(0),
    slug: sides(0),
  }
}

export function validateDoc(d: DocSettings): string | null {
  if (d.margins.left + d.margins.right >= d.width || d.margins.top + d.margins.bottom >= d.height) {
    return 'השוליים גדולים מהעמוד.'
  }
  if (d.gutter * (d.columns - 1) >= d.width - d.margins.left - d.margins.right) {
    return 'העמודות לא נכנסות בין השוליים.'
  }
  return null
}
