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

/** Character formatting: can differ from one piece of text to the next. */
export interface CharStyle {
  fontFamily: string
  /** points */
  fontSize: number
  /** CSS weight, 100 (thin) … 900 (black) */
  weight: number
  italic: boolean
}

/** Default character formatting of a story plus its paragraph alignment (which applies to the whole story). */
export interface TextStyle extends CharStyle {
  /** physical alignment; Hebrew text normally sits on the right */
  align: TextAlign
}

export const DEFAULT_TEXT_STYLE: TextStyle = { fontFamily: 'Segoe UI', fontSize: 14, weight: 400, italic: false, align: 'right' }

/** Fonts with Hebrew glyphs that ship with Windows: used until the real system fonts are loaded. */
export const FONT_FAMILIES = [
  'Segoe UI', 'Arial', 'Tahoma', 'Calibri', 'Gisha', 'David', 'Miriam', 'FrankRuehl', 'Narkisim', 'Times New Roman', 'Courier New',
]

export const LINE_HEIGHT = 1.25

/** `len` consecutive characters of a story that share one character style. */
export interface Run {
  len: number
  style: CharStyle
}

/**
 * A text frame. Position and size are in world points (see layout.ts), so frames may also sit on the pasteboard.
 * Frames can be threaded: `next` is the frame the text continues into. The whole story (`text`, `runs`) lives in
 * the first frame of the chain; the other frames only display their share of it.
 * `runs` cover `text` exactly; the style fields of the frame are the story's defaults (used for empty text
 * and as the base when a run list is missing).
 */
export interface TextFrame extends TextStyle {
  id: string
  x: number
  y: number
  w: number
  h: number
  text: string
  runs: Run[]
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
