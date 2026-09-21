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

/** The size of one page, points. */
export interface PageSize {
  w: number
  h: number
}

/** Every length is in points. */
export interface DocSettings {
  name: string
  /** the size of the pages (a page listed in `pageSizes` has its own) */
  width: number
  height: number
  /** pages next to each other in one row (1 = every page has its own row) */
  perRow: number
  /** sizes of the pages that differ from width × height, by page index (null / missing = the document's size) */
  pageSizes: (PageSize | null)[]
  unit: Unit
  binding: Binding
  pages: number
  /** the pages of a row touch and form a spread, with inside / outside margins (needs `perRow` ≥ 2) */
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
  /** stacking order (higher = in front). Missing = the default layer: text frames in front of pictures */
  z?: number
}
/** How a picture sits in its frame: fill = cover the frame (may crop), fit = whole picture (may leave margins), stretch = distort to the frame. */
export type ImageFit = 'fill' | 'fit' | 'stretch'

/**
 * How text flows around a picture. none: text ignores it (they may overlap). around: text runs beside it, on the
 * wider side, and above and below. jump: text stops above it and continues below (nothing beside it).
 */
export type WrapMode = 'none' | 'around' | 'jump'

/** Space kept free around a wrapped picture, points. */
export const DEFAULT_WRAP_OFFSET = 8

/** A picture placed on the pasteboard / a page. Position and size are in world points, like text frames. */
export interface ImageFrame {
  id: string
  x: number
  y: number
  w: number
  h: number
  assetId: string
  fit: ImageFit
  /** stacking order (higher = in front). Missing = the default layer: pictures behind text frames */
  z?: number
  /** text wrap (missing = none) */
  wrap?: WrapMode
  /** distance kept between the picture and wrapped text (missing = DEFAULT_WRAP_OFFSET) */
  wrapOffset?: number
}

/** Ruler guides: horizontal ('h') lines run across a page, vertical ('v') ones from top to bottom. */
export type GuideAxis = 'h' | 'v'

/** A guide line. It belongs to one page and is placed by its distance from that page's top (h) or left (v) edge. */
export interface Guide {
  id: string
  page: number
  axis: GuideAxis
  /** points from the page's top edge (h) or left edge (v) */
  pos: number
  /** #rrggbb; missing = the default guide color */
  color?: string
}

export const GUIDE_COLORS: { value: string; label: string }[] = [
  { value: '#00d1b2', label: 'טורקיז' },
  { value: '#3d8bff', label: 'כחול' },
  { value: '#f5b800', label: 'צהוב' },
  { value: '#ff8a3d', label: 'כתום' },
  { value: '#ff5c5c', label: 'אדום' },
  { value: '#ff7ac6', label: 'ורוד' },
  { value: '#a78bfa', label: 'סגול' },
  { value: '#8a8f98', label: 'אפור' },
]
export const DEFAULT_GUIDE_COLOR = GUIDE_COLORS[0].value
/** No document may hold more guides than this. */
export const MAX_GUIDES = 5000

/** The data of an imported picture. Several frames can show the same asset. */
export interface Asset {
  /** the file's name, for the user */
  name: string
  mime: string
  /** the whole file as a data: URL, so it travels inside the .imudist file */
  dataUrl: string
  /** size in pixels */
  width: number
  height: number
}

export type Assets = Record<string, Asset>

/** Largest picture file we import. */
export const MAX_IMAGE_BYTES = 50 * 1024 * 1024
/** Smallest text frame (points): a smaller drag creates nothing, and frames can't be resized below it. */
export const MIN_FRAME_PT = 6
export const MIN_PAGE_PT = 1
export const MAX_PAGE_PT = 16384
export const MAX_SIDE_PT = 2000
export const MAX_PAGES = 9999
export const MAX_COLUMNS = 100
/** Most pages that can sit side by side in one row. */
export const MAX_PER_ROW = 10

const sides = (v: number): Sides => ({ top: v, bottom: v, left: v, right: v })

export function defaultDocSettings(name: string): DocSettings {
  return {
    name,
    width: PAGE_PRESETS[0].width,
    height: PAGE_PRESETS[0].height,
    perRow: 1,
    pageSizes: [],
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

/** The smallest page that still holds the margins and the columns (with a little room for text). */
export function minPageSize(d: DocSettings): { w: number; h: number } {
  return {
    w: Math.max(MIN_PAGE_PT, d.margins.left + d.margins.right + d.gutter * (d.columns - 1) + 12),
    h: Math.max(MIN_PAGE_PT, d.margins.top + d.margins.bottom + 12),
  }
}

/** The size of a page: its own if it has one, otherwise the document's. */
export function pageSize(d: DocSettings, index: number): PageSize {
  return d.pageSizes[index] ?? { w: d.width, h: d.height }
}

/** Drops sizes of pages that do not exist and the ones equal to the document's size, so equal settings look equal. */
export function normalizeSizes(d: DocSettings): DocSettings {
  const sizes: (PageSize | null)[] = d.pageSizes
    .slice(0, d.pages)
    .map((z) => (z && (Math.abs(z.w - d.width) > 0.001 || Math.abs(z.h - d.height) > 0.001) ? z : null))
  while (sizes.length > 0 && sizes[sizes.length - 1] === null) sizes.pop()
  return sizes.length === d.pageSizes.length && sizes.every((z, i) => z === d.pageSizes[i]) ? d : { ...d, pageSizes: sizes }
}

/** The settings with one page (`index`) or every page (`'all'`) set to a new size. */
export function withPageSize(d: DocSettings, index: number | 'all', w: number, h: number): DocSettings {
  if (index === 'all') return { ...d, width: w, height: h, pageSizes: [] }
  const sizes = [...d.pageSizes]
  while (sizes.length <= index) sizes.push(null)
  sizes[index] = { w, h }
  return normalizeSizes({ ...d, pageSizes: sizes })
}

/** How many pages have a size of their own. */
export const customSizeCount = (d: DocSettings) => d.pageSizes.filter((z, i) => z && i < d.pages).length

/** The largest a margin may be: the smallest page must still hold the other margins and the columns. */
export function maxMargin(d: DocSettings, key: keyof Sides): number {
  let best = Infinity
  for (let i = 0; i < d.pages; i++) {
    const z = pageSize(d, i)
    const room =
      key === 'top' || key === 'bottom'
        ? z.h - (d.margins.top + d.margins.bottom - d.margins[key]) - 12
        : z.w - (d.margins.left + d.margins.right - d.margins[key]) - d.gutter * (d.columns - 1) - 12
    best = Math.min(best, room)
  }
  return Math.max(0, Math.min(best, MAX_SIDE_PT))
}

export function validateDoc(d: DocSettings): string | null {
  for (let i = 0; i < d.pages; i++) {
    const z = pageSize(d, i)
    if (d.margins.left + d.margins.right >= z.w || d.margins.top + d.margins.bottom >= z.h) {
      return d.pageSizes[i] ? `השוליים גדולים מעמוד ${d.startPage + i}.` : 'השוליים גדולים מהעמוד.'
    }
    if (d.gutter * (d.columns - 1) >= z.w - d.margins.left - d.margins.right) {
      return d.pageSizes[i] ? `העמודות לא נכנסות בין השוליים של עמוד ${d.startPage + i}.` : 'העמודות לא נכנסות בין השוליים.'
    }
  }
  return null
}
