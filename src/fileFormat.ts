import {
  DEFAULT_TEXT_STYLE,
  DEFAULT_WRAP_OFFSET,
  DEFAULT_SHAPE_FILL,
  DEFAULT_SHAPE_STROKE,
  MAX_GUIDES,
  MAX_SIDES,
  MIN_SIDES,
  MAX_PER_ROW,
  MAX_COLUMNS,
  MAX_PAGES,
  MAX_PAGE_PT,
  MAX_SIDE_PT,
  MIN_FRAME_PT,
  MIN_PAGE_PT,
  defaultDocSettings,
  normalizeSizes,
  validateDoc,
  type Asset,
  type Assets,
  type CharStyle,
  type DocSettings,
  type Guide,
  type ImageFit,
  type ImageFrame,
  type PageSize,
  type PathGeom,
  type PathSide,
  type PathSmoothPoint,
  type PathText,
  type PathVertex,
  type ShapeFrame,
  type ShapeImage,
  type ShapeKind,
  type Run,
  type Sides,
  type TextAlign,
  type TextFrame,
  type WrapMode,
} from './document'
import type { DocContent } from './pages'
import { normalizeRuns } from './story'
import type { Unit } from './units'

/** Extension of Imudist files. The content is plain JSON (UTF-8). */
export const FILE_EXT = '.imudist'
const FORMAT = 'imudist'
/** Bump when the file layout changes in a way older readers can't understand. */
const VERSION = 2

export interface DocumentFile {
  format: typeof FORMAT
  version: number
  savedAt: string
  settings: DocSettings
  frames: TextFrame[]
  /** version 2+: pictures on the pages, and the data of the pictures they use */
  images: ImageFrame[]
  assets: Assets
  guides: Guide[]
  shapes: ShapeFrame[]
}

/** The file's text for a document. Only the pictures that are still in use are stored. */
export function serializeDocument(c: DocContent): string {
  const used = new Set(c.images.map((i) => i.assetId))
  const assets: Assets = {}
  for (const id of used) if (c.assets[id]) assets[id] = c.assets[id]
  const file: DocumentFile = { format: FORMAT, version: VERSION, savedAt: new Date().toISOString(), settings: c.doc, frames: c.frames, images: c.images, assets, guides: c.guides, shapes: c.shapes }
  return JSON.stringify(file)
}

/** Thrown for files that can't be opened; the message is shown to the user. */
export class FileFormatError extends Error {}

// ── validation helpers: a file may come from anywhere, so nothing in it is trusted ──────────────
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown, fallback: number, min = -Infinity, max = Infinity) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
const int = (v: unknown, fallback: number, min: number, max: number) => Math.round(num(v, fallback, min, max))
const str = (v: unknown, fallback: string) => (typeof v === 'string' && v.length > 0 ? v : fallback)
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : fallback

const sidesOf = (v: unknown, fallback: Sides): Sides =>
  isObj(v)
    ? {
        top: num(v.top, fallback.top, 0, MAX_SIDE_PT),
        bottom: num(v.bottom, fallback.bottom, 0, MAX_SIDE_PT),
        left: num(v.left, fallback.left, 0, MAX_SIDE_PT),
        right: num(v.right, fallback.right, 0, MAX_SIDE_PT),
      }
    : fallback

function parsePageSizes(v: unknown): (PageSize | null)[] {
  if (!Array.isArray(v)) return []
  return v.slice(0, MAX_PAGES).map((z) =>
    isObj(z) ? { w: num(z.w, 0, MIN_PAGE_PT, MAX_PAGE_PT), h: num(z.h, 0, MIN_PAGE_PT, MAX_PAGE_PT) } : null,
  ).map((z) => (z && z.w > 0 && z.h > 0 ? z : null))
}

function parseSettings(v: unknown, name: string): DocSettings {
  const d = defaultDocSettings(name)
  if (!isObj(v)) return d
  const settings: DocSettings = {
    name,
    width: num(v.width, d.width, MIN_PAGE_PT, MAX_PAGE_PT),
    height: num(v.height, d.height, MIN_PAGE_PT, MAX_PAGE_PT),
    // files from before "pages per row": facing pages meant two per row
    perRow: int(v.perRow, bool(v.facingPages, false) ? 2 : 1, 1, MAX_PER_ROW),
    rowsCustom: bool(v.rowsCustom, false),
    pageJoins: Array.isArray(v.pageJoins) ? v.pageJoins.slice(0, MAX_PAGES).map((j) => (j === true ? (true as const) : null)) : [],
    pageSizes: parsePageSizes(v.pageSizes),
    pageMargins: Array.isArray(v.pageMargins) ? v.pageMargins.slice(0, MAX_PAGES).map((m) => (isObj(m) ? sidesOf(m, d.margins) : null)) : [],
    unit: oneOf<Unit>(v.unit, ['px', 'cm', 'mm', 'in'], d.unit),
    binding: oneOf(v.binding, ['ltr', 'rtl'], d.binding),
    pages: int(v.pages, 1, 1, MAX_PAGES),
    facingPages: bool(v.facingPages, false),
    startPage: int(v.startPage, 1, 1, MAX_PAGES),
    primaryTextFrame: bool(v.primaryTextFrame, false),
    columns: int(v.columns, 1, 1, MAX_COLUMNS),
    gutter: num(v.gutter, d.gutter, 0, MAX_SIDE_PT),
    margins: sidesOf(v.margins, d.margins),
    bleed: sidesOf(v.bleed, d.bleed),
    slug: sidesOf(v.slug, d.slug),
  }
  const clean = normalizeSizes(settings)
  if (validateDoc(clean)) throw new FileFormatError('הגדרות העמוד בקובץ אינן תקינות (השוליים גדולים מהעמוד).')
  return clean
}

function parseCharStyle(v: unknown, fallback: CharStyle): CharStyle {
  const s = isObj(v) ? v : {}
  return {
    fontFamily: str(s.fontFamily, fallback.fontFamily),
    fontSize: num(s.fontSize, fallback.fontSize, 1, 999),
    weight: num(s.weight, fallback.weight, 1, 1000),
    italic: bool(s.italic, fallback.italic),
  }
}

/** the optional stacking order of an object */
const zOf = (raw: Record<string, unknown>): { z?: number } => (typeof raw.z === 'number' && Number.isFinite(raw.z) ? { z: int(raw.z, 0, -1e9, 1e9) } : {})

function parseFrames(v: unknown): TextFrame[] {
  if (!Array.isArray(v)) return []
  const D = DEFAULT_TEXT_STYLE
  const frames: TextFrame[] = []
  const used = new Set<string>()

  for (const raw of v) {
    if (!isObj(raw)) continue
    let id = str(raw.id, '')
    if (!id || used.has(id)) id = `f${frames.length}-${Math.random().toString(36).slice(2, 8)}`
    used.add(id)

    const base = parseCharStyle(raw, D)
    const text = typeof raw.text === 'string' ? raw.text : ''
    const runs: Run[] | undefined = Array.isArray(raw.runs)
      ? raw.runs.filter(isObj).map((r) => ({ len: int(r.len, 0, 0, 1e9), style: parseCharStyle(r.style, base) }))
      : undefined

    frames.push({
      ...base,
      align: oneOf<TextAlign>(raw.align, ['right', 'center', 'left', 'justify'], D.align),
      id,
      x: num(raw.x, 0, -1e6, 1e6),
      y: num(raw.y, 0, -1e6, 1e6),
      w: num(raw.w, 100, MIN_FRAME_PT, MAX_PAGE_PT),
      h: num(raw.h, 50, MIN_FRAME_PT, MAX_PAGE_PT),
      text,
      runs: normalizeRuns(text, runs, base),
      next: typeof raw.next === 'string' ? raw.next : null,
      ...zOf(raw),
    })
  }

  // repair the threads: a frame may continue only into an existing frame that has no other predecessor, and never in a loop
  const byId = new Map(frames.map((f) => [f.id, f]))
  const hasPrev = new Set<string>()
  for (const f of frames) {
    if (!f.next) continue
    if (!byId.has(f.next) || f.next === f.id || hasPrev.has(f.next)) f.next = null
    else hasPrev.add(f.next)
  }
  for (const f of frames) {
    const seen = new Set([f.id])
    for (let cur: TextFrame | undefined = f; cur?.next; cur = byId.get(cur.next)) {
      if (seen.has(cur.next)) {
        cur.next = null
        break
      }
      seen.add(cur.next)
    }
  }
  return frames
}

const DATA_URL = /^data:image\/(png|jpeg|gif|webp|svg\+xml|bmp|avif);base64,/

function parseAssets(v: unknown): Assets {
  const out: Assets = Object.create(null) // no prototype: an id like "__proto__" must stay an ordinary key
  if (!isObj(v)) return out
  for (const [id, raw] of Object.entries(v)) {
    if (!isObj(raw) || typeof raw.dataUrl !== 'string') continue
    const m = DATA_URL.exec(raw.dataUrl)
    if (!m) continue // anything that is not a picture data URL is refused
    const asset: Asset = {
      name: str(raw.name, 'תמונה'),
      mime: 'image/' + m[1],
      dataUrl: raw.dataUrl,
      width: int(raw.width, 300, 1, 1e6),
      height: int(raw.height, 300, 1, 1e6),
    }
    out[id] = asset
  }
  return out
}

function parseImages(v: unknown, assets: Assets): ImageFrame[] {
  if (!Array.isArray(v)) return []
  const out: ImageFrame[] = []
  const used = new Set<string>()
  for (const raw of v) {
    if (!isObj(raw)) continue
    const assetId = str(raw.assetId, '')
    if (!assets[assetId]) continue // its picture is missing from the file
    let id = str(raw.id, '')
    if (!id || used.has(id)) id = `i${out.length}-${Math.random().toString(36).slice(2, 8)}`
    used.add(id)
    out.push({
      id,
      assetId,
      x: num(raw.x, 0, -1e6, 1e6),
      y: num(raw.y, 0, -1e6, 1e6),
      w: num(raw.w, 100, MIN_FRAME_PT, MAX_PAGE_PT),
      h: num(raw.h, 100, MIN_FRAME_PT, MAX_PAGE_PT),
      fit: oneOf<ImageFit>(raw.fit, ['fill', 'fit', 'stretch'], 'fill'),
      ...zOf(raw),
      ...(raw.wrap === 'around' || raw.wrap === 'jump' ? { wrap: raw.wrap as WrapMode } : {}),
      ...(typeof raw.wrapOffset === 'number' ? { wrapOffset: num(raw.wrapOffset, DEFAULT_WRAP_OFFSET, 0, 500) } : {}),
    })
  }
  return out
}

const HEX = /^#[0-9a-fA-F]{6}$/
const colorOrNull = (v: unknown, fallback: string | null) => (v === null ? null : typeof v === 'string' && HEX.test(v) ? v : fallback)

/** the optional text on a shape's outline */
function parsePathText(v: unknown): { pathText?: PathText } {
  if (!isObj(v)) return {}
  const text = typeof v.text === 'string' ? v.text.slice(0, 20000) : ''
  const style = parseCharStyle(v.style, { fontFamily: 'Segoe UI', fontSize: 18, weight: 400, italic: false })
  const runs: Run[] | undefined = Array.isArray(v.runs) ? v.runs.filter(isObj).map((r) => ({ len: int(r.len, 0, 0, 1e9), style: parseCharStyle(r.style, style) })) : undefined
  return {
    pathText: {
      text,
      runs: normalizeRuns(text, runs, style),
      style,
      anchor: num(v.anchor, 0, 0, 1),
      span: num(v.span, 0.98, 0.02, 1),
      side: oneOf<PathSide>(v.side, ['outside', 'inside'], 'outside'),
      color: typeof v.color === 'string' && HEX.test(v.color) ? v.color : '#111111',
    },
  }
}

/** a number clamped like a path point (or a handle offset — the same range works for both) */
const pathNum = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.min(10, Math.max(-10, v)) : undefined)
const pathPoint = (v: unknown): [number, number] | undefined => {
  if (!Array.isArray(v)) return undefined
  const x = pathNum(v[0])
  const y = pathNum(v[1])
  return x !== undefined && y !== undefined ? [x, y] : undefined
}
/** one point of a path's outline: a plain corner, or (an object with a curve handle) a smooth point */
function parseVertex(v: unknown): PathVertex | undefined {
  const p = pathPoint(v)
  if (p) return p
  if (!isObj(v)) return undefined
  const pp = pathPoint(v.p)
  if (!pp) return undefined
  const hi = pathPoint(v.hi)
  const ho = pathPoint(v.ho)
  if (!hi && !ho) return pp
  const smooth: PathSmoothPoint = { p: pp, hi, ho }
  return smooth
}
/** the outline of a combined shape: polygons of rings of points, all numbers checked and the amount limited */
function parseGeom(v: unknown): PathGeom | undefined {
  if (!Array.isArray(v)) return undefined
  const out: PathGeom = []
  let points = 0
  for (const poly of v.slice(0, 500)) {
    if (!Array.isArray(poly)) continue
    const rings: PathVertex[][] = []
    for (const ring of poly.slice(0, 500)) {
      if (!Array.isArray(ring)) continue
      const pts = ring
        .slice(0, 20000)
        .map(parseVertex)
        .filter((p): p is PathVertex => p !== undefined)
      points += pts.length
      if (pts.length >= 3) rings.push(pts)
    }
    if (rings.length) out.push(rings)
  }
  return out.length > 0 && points <= 100000 ? out : undefined
}

/** a picture placed inside a shape: dropped if its asset is missing from the file */
function parseShapeImage(v: unknown, assets: Assets): ShapeImage | undefined {
  if (!isObj(v)) return undefined
  const assetId = str(v.assetId, '')
  if (!assetId || !assets[assetId]) return undefined
  const offset = isObj(v.offset) && typeof v.offset.x === 'number' && typeof v.offset.y === 'number' ? { x: num(v.offset.x, 0, -1e6, 1e6), y: num(v.offset.y, 0, -1e6, 1e6) } : undefined
  const scale = typeof v.scale === 'number' && Number.isFinite(v.scale) && v.scale > 0 ? Math.min(1000, v.scale) : undefined
  return { assetId, fit: oneOf<ImageFit>(v.fit, ['fill', 'fit', 'stretch'], 'fill'), ...(offset ? { offset } : {}), ...(scale ? { scale } : {}) }
}

function parseShapes(v: unknown, assets: Assets): ShapeFrame[] {
  if (!Array.isArray(v)) return []
  const out: ShapeFrame[] = []
  const used = new Set<string>()
  for (const raw of v) {
    if (!isObj(raw)) continue
    const geom = raw.kind === 'path' ? parseGeom(raw.geom) : undefined
    const kind = oneOf<ShapeKind>(raw.kind, ['rect', 'ellipse', 'polygon', 'path'], 'rect') === 'path' && !geom ? 'rect' : oneOf<ShapeKind>(raw.kind, ['rect', 'ellipse', 'polygon', 'path'], 'rect')
    let id = str(raw.id, '')
    if (!id || used.has(id)) id = `s${out.length}-${Math.random().toString(36).slice(2, 8)}`
    used.add(id)
    const r = Array.isArray(raw.radii) ? raw.radii : []
    const image = parseShapeImage(raw.image, assets)
    out.push({
      id,
      kind,
      x: num(raw.x, 0, -1e6, 1e6),
      y: num(raw.y, 0, -1e6, 1e6),
      w: num(raw.w, 100, MIN_FRAME_PT, MAX_PAGE_PT),
      h: num(raw.h, 100, MIN_FRAME_PT, MAX_PAGE_PT),
      ...(kind === 'polygon' ? { sides: int(raw.sides, 6, MIN_SIDES, MAX_SIDES) } : {}),
      ...(kind === 'path' && geom ? { geom } : {}),
      ...parsePathText(raw.pathText),
      ...(kind === 'rect' && r.length === 4 ? { radii: [0, 1, 2, 3].map((i) => num(r[i], 0, 0, MAX_PAGE_PT)) as [number, number, number, number] } : {}),
      ...(image ? { image } : {}),
      ...(raw.frame === true ? { frame: true as const } : {}),
      fill: colorOrNull(raw.fill, DEFAULT_SHAPE_FILL),
      stroke: colorOrNull(raw.stroke, DEFAULT_SHAPE_STROKE),
      strokeWidth: num(raw.strokeWidth, 1, 0, 200),
      ...zOf(raw),
    })
  }
  return out
}

function parseGuides(v: unknown, pages: number): Guide[] {
  if (!Array.isArray(v)) return []
  const out: Guide[] = []
  const used = new Set<string>()
  for (const raw of v) {
    if (!isObj(raw) || out.length >= MAX_GUIDES) continue
    if (raw.axis !== 'h' && raw.axis !== 'v') continue
    const page = int(raw.page, -1, -1, 1e6)
    if (page < 0 || page >= pages) continue
    let id = str(raw.id, '')
    if (!id || used.has(id)) id = `g${out.length}-${Math.random().toString(36).slice(2, 8)}`
    used.add(id)
    out.push({
      id,
      page,
      axis: raw.axis,
      pos: num(raw.pos, 0, -1e6, 1e6),
      ...(typeof raw.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.color) ? { color: raw.color } : {}),
    })
  }
  return out
}

/**
 * Read the text of a file. The document takes its name from the file (like other desktop programs),
 * so `name` is the file's name without the extension.
 */
export function parseDocument(text: string, name: string): DocContent {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new FileFormatError('הקובץ פגום או שאינו מסמך של Imudist.')
  }
  if (!isObj(data) || data.format !== FORMAT) throw new FileFormatError('זה לא קובץ של Imudist.')
  if (typeof data.version === 'number' && data.version > VERSION) {
    throw new FileFormatError('הקובץ נשמר בגרסה חדשה יותר של Imudist. עדכן את התוכנה כדי לפתוח אותו.')
  }
  const assets = parseAssets(data.assets)
  const doc = parseSettings(data.settings, name)
  return { doc, frames: parseFrames(data.frames), images: parseImages(data.images, assets), assets, guides: parseGuides(data.guides, doc.pages), shapes: parseShapes(data.shapes, assets) }
}
