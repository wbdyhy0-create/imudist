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
  /** rows are arranged page by page (a page added beside another one) instead of `perRow` pages in every row */
  rowsCustom: boolean
  /** with custom rows: the pages (by index) that stand in the same row as the page before them */
  pageJoins: (true | null)[]
  /** sizes of the pages that differ from width × height, by page index (null / missing = the document's size) */
  pageSizes: (PageSize | null)[]
  /** margins of the pages that differ from `margins`, by page index (null / missing = the document's margins) */
  pageMargins: (Sides | null)[]
  unit: Unit
  binding: Binding
  pages: number
  /** the pages of a row touch and form a spread, with inside / outside margins (needs `perRow` ≥ 2) */
  facingPages: boolean
  startPage: number
  /** every page gets a text frame on its margins (new pages too) */
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

/** The drawn shapes: a rectangle (with optionally rounded corners), an ellipse, or a regular polygon of 3 to 6 corners. */
export type ShapeKind = 'rect' | 'ellipse' | 'polygon' | 'path'
/** The kinds a shape tool draws (a 'path' only comes out of combining shapes). */
export type DrawKind = 'rect' | 'ellipse' | 'polygon'
/**
 * One point of a path's own outline, 0…1 of the shape's box: a plain corner (just its position, straight lines on both
 * sides), or a smooth point with direction handles that curve the segments on either side of it. `hi` / `ho` are the
 * handles toward the previous / next point, as an offset from the point itself (missing on one side: that side stays
 * straight).
 */
export interface PathSmoothPoint {
  p: [number, number]
  hi?: [number, number]
  ho?: [number, number]
}
export type PathVertex = [number, number] | PathSmoothPoint
/** The outline of a combined shape: polygons, each an outer ring followed by holes. */
export type PathGeom = PathVertex[][][]
export const MIN_SIDES = 3
export const MAX_SIDES = 6
export const DEFAULT_SHAPE_FILL = '#c8d6ea'
export const DEFAULT_SHAPE_STROKE = '#33415c'

/** Which side of the outline text on a path sits: outside the shape, or inside it. */
export type PathSide = 'outside' | 'inside'

/** Text that runs along the outline of a shape. It belongs to the shape: it moves, scales and is deleted with it. */
export interface PathText {
  text: string
  runs: Run[]
  /** the default character style of the text */
  style: CharStyle
  /** where the text starts: a position on the outline, 0 … 1 of its length (clockwise from its first point) */
  anchor: number
  /** how much of the outline the text may use, 0.02 … 1; what does not fit is not shown */
  span: number
  side: PathSide
  /** #rrggbb */
  color: string
}

/** A shape on a page. Position and size are in world points, like text frames. */
export interface ShapeFrame {
  id: string
  kind: ShapeKind
  x: number
  y: number
  w: number
  h: number
  /** polygon: number of corners (MIN_SIDES … MAX_SIDES) */
  sides?: number
  /** path: the outline, relative to the box, so it scales with the shape */
  geom?: PathGeom
  /** text along the outline */
  pathText?: PathText
  /** rectangle: the radius of each corner, points — top-left, top-right, bottom-right, bottom-left */
  radii?: [number, number, number, number]
  /** #rrggbb, or null for no fill */
  fill: string | null
  /** #rrggbb, or null for no line */
  stroke: string | null
  /** line thickness, points */
  strokeWidth: number
  /** stacking order (see stacking.ts) */
  z?: number
}

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
    rowsCustom: false,
    pageJoins: [],
    pageSizes: [],
    pageMargins: [],
    unit: 'mm',
    binding: 'rtl',
    pages: 1,
    facingPages: false,
    startPage: 1,
    primaryTextFrame: true,
    columns: 1,
    gutter: toPt(5, 'mm'),
    margins: sides(toPt(15, 'mm')),
    bleed: sides(0),
    slug: sides(0),
  }
}

/** Do the pages of a row touch each other (a spread with inside / outside margins)? */
export const isFacing = (d: DocSettings) => d.facingPages && (d.rowsCustom || d.perRow >= 2)

/** The size of a page: its own if it has one, otherwise the document's. */
export function pageSize(d: DocSettings, index: number): PageSize {
  return d.pageSizes[index] ?? { w: d.width, h: d.height }
}

const sameSides = (a: Sides, b: Sides) => a.top === b.top && a.bottom === b.bottom && a.left === b.left && a.right === b.right

/** The margins of a page as stored (left = inside, right = outside when facing pages are on): its own if it has some. */
export function marginsOf(d: DocSettings, index: number): Sides {
  return d.pageMargins[index] ?? d.margins
}

/**
 * Drops the sizes and margins of pages that do not exist and the ones equal to the document's, so equal settings look
 * equal. Returns the same object when nothing had to change.
 */
export function normalizeSizes(d: DocSettings): DocSettings {
  const sizes: (PageSize | null)[] = d.pageSizes
    .slice(0, d.pages)
    .map((z) => (z && (Math.abs(z.w - d.width) > 0.001 || Math.abs(z.h - d.height) > 0.001) ? z : null))
  while (sizes.length > 0 && sizes[sizes.length - 1] === null) sizes.pop()
  const margins: (Sides | null)[] = d.pageMargins.slice(0, d.pages).map((m) => (m && !sameSides(m, d.margins) ? m : null))
  while (margins.length > 0 && margins[margins.length - 1] === null) margins.pop()
  const joins: (true | null)[] = d.pageJoins.slice(0, d.pages).map((j, i) => (j && i > 0 ? true : null))
  while (joins.length > 0 && joins[joins.length - 1] === null) joins.pop()
  const sameSizes = sizes.length === d.pageSizes.length && sizes.every((z, i) => z === d.pageSizes[i])
  const sameMargins = margins.length === d.pageMargins.length && margins.every((m, i) => m === d.pageMargins[i])
  const sameJoins = joins.length === d.pageJoins.length && joins.every((j, i) => j === d.pageJoins[i])
  return sameSizes && sameMargins && sameJoins ? d : { ...d, pageSizes: sizes, pageMargins: margins, pageJoins: joins }
}

/** The settings with one page (`index`) or every page (`'all'`) set to a new size. */
export function withPageSize(d: DocSettings, index: number | 'all', w: number, h: number): DocSettings {
  if (index === 'all') return { ...d, width: w, height: h, pageSizes: [] }
  const sizes = [...d.pageSizes]
  while (sizes.length <= index) sizes.push(null)
  sizes[index] = { w, h }
  return normalizeSizes({ ...d, pageSizes: sizes })
}

/** The settings with one page (`index`) or every page (`'all'`) given new margins. */
export function withPageMargins(d: DocSettings, index: number | 'all', margins: Sides): DocSettings {
  if (index === 'all') return { ...d, margins, pageMargins: [] }
  const list = [...d.pageMargins]
  while (list.length <= index) list.push(null)
  list[index] = margins
  return normalizeSizes({ ...d, pageMargins: list })
}

/** How many pages have a size / margins of their own. */
export const customSizeCount = (d: DocSettings) => d.pageSizes.filter((z, i) => z && i < d.pages).length
export const customMarginCount = (d: DocSettings) => d.pageMargins.filter((m, i) => m && i < d.pages).length

/**
 * The smallest a page can be and still hold its margins and the columns (with a little room for text).
 * `index`: one page; `'all'`: every page gets the document's margins.
 */
export function minPageSize(d: DocSettings, index: number | 'all' = 'all'): { w: number; h: number } {
  const m = index === 'all' ? d.margins : marginsOf(d, index)
  return {
    w: Math.max(MIN_PAGE_PT, m.left + m.right + d.gutter * (d.columns - 1) + 12),
    h: Math.max(MIN_PAGE_PT, m.top + m.bottom + 12),
  }
}

/**
 * The largest a margin may be: the page must still hold the other margins and the columns.
 * `index`: that page's margins and size; `'all'`: the smallest page with the document's margins.
 */
export function maxMargin(d: DocSettings, key: keyof Sides, index: number | 'all' = 'all'): number {
  const pages = index === 'all' ? Array.from({ length: d.pages }, (_, i) => i) : [index]
  let best = Infinity
  for (const i of pages) {
    const z = pageSize(d, i)
    const m = index === 'all' ? d.margins : marginsOf(d, i)
    const room =
      key === 'top' || key === 'bottom'
        ? z.h - (m.top + m.bottom - m[key]) - 12
        : z.w - (m.left + m.right - m[key]) - d.gutter * (d.columns - 1) - 12
    best = Math.min(best, room)
  }
  return Math.max(0, Math.min(best, MAX_SIDE_PT))
}

export function validateDoc(d: DocSettings): string | null {
  for (let i = 0; i < d.pages; i++) {
    const z = pageSize(d, i)
    const m = marginsOf(d, i)
    const own = !!d.pageSizes[i] || !!d.pageMargins[i]
    if (m.left + m.right >= z.w || m.top + m.bottom >= z.h) {
      return own ? `השוליים גדולים מעמוד ${d.startPage + i}.` : 'השוליים גדולים מהעמוד.'
    }
    if (d.gutter * (d.columns - 1) >= z.w - m.left - m.right) {
      return own ? `העמודות לא נכנסות בין השוליים של עמוד ${d.startPage + i}.` : 'העמודות לא נכנסות בין השוליים.'
    }
  }
  return null
}
