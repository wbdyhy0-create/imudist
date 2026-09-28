import {
  DEFAULT_PARAGRAPH_STYLES,
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
  type GradientFill,
  type Guide,
  type ImageFit,
  type ImageFrame,
  type PageSize,
  type ParagraphStyleRecord,
  type ParentPage,
  type PathGeom,
  type PathSide,
  type PathSmoothPoint,
  type PathText,
  type PathVertex,
  type ShapeFrame,
  type ShapeImage,
  type LineCap,
  type ShapeKind,
  type Run,
  type Sides,
  type TextAlign,
  type TextFrame,
  type TextStyle,
  type WrapMode,
} from './document'
import { normalizeDeg } from './frames'
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
  /** version 2+ (this field only from a later Imudist build): the document's named paragraph styles */
  paragraphStyles: ParagraphStyleRecord[]
  /** version 2+ (this field only from a later Imudist build): the document's parent (master) pages */
  parents: ParentPage[]
  /** which parent page applies to each document page, by index */
  pageParents: (string | null)[]
}

/** The file's text for a document. Only the pictures that are still in use are stored. */
export function serializeDocument(c: DocContent): string {
  // a parent page's own pictures need their assets kept too, not just the document pages' own
  const used = new Set([...c.images, ...c.parents.flatMap((p) => p.images)].map((i) => i.assetId))
  const assets: Assets = {}
  for (const id of used) if (c.assets[id]) assets[id] = c.assets[id]
  const file: DocumentFile = {
    format: FORMAT,
    version: VERSION,
    savedAt: new Date().toISOString(),
    settings: c.doc,
    frames: c.frames,
    images: c.images,
    assets,
    guides: c.guides,
    shapes: c.shapes,
    paragraphStyles: c.paragraphStyles,
    parents: c.parents,
    pageParents: c.pageParents,
  }
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
  const color = typeof s.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.color) ? s.color : fallback.color
  return {
    fontFamily: str(s.fontFamily, fallback.fontFamily),
    fontSize: num(s.fontSize, fallback.fontSize, 1, 999),
    weight: num(s.weight, fallback.weight, 1, 1000),
    italic: bool(s.italic, fallback.italic),
    tracking: num(s.tracking, fallback.tracking, -1000, 1000),
    ...(color ? { color } : {}),
  }
}

/** the optional stacking order of an object */
const zOf = (raw: Record<string, unknown>): { z?: number } => (typeof raw.z === 'number' && Number.isFinite(raw.z) ? { z: int(raw.z, 0, -1e9, 1e9) } : {})
const rotationOf = (raw: Record<string, unknown>): { rotation?: number } =>
  typeof raw.rotation === 'number' && Number.isFinite(raw.rotation) && raw.rotation !== 0 ? { rotation: normalizeDeg(raw.rotation) } : {}
/** leading, word-spacing bounds and paragraph spacing/indents: optional, belong to the whole story, not per-run */
type ParagraphFields = Pick<TextStyle, 'leading' | 'wordSpacingMin' | 'wordSpacingMax' | 'spaceBefore' | 'spaceAfter' | 'indentLeft' | 'indentRight' | 'firstLineIndent' | 'secondLineIndent'>
const paragraphStyleOf = (raw: Record<string, unknown>): Partial<ParagraphFields> => ({
  ...(typeof raw.leading === 'number' && Number.isFinite(raw.leading) ? { leading: num(raw.leading, 0, 1, MAX_PAGE_PT) } : {}),
  ...(typeof raw.wordSpacingMin === 'number' && Number.isFinite(raw.wordSpacingMin) ? { wordSpacingMin: num(raw.wordSpacingMin, 90, 10, 100) } : {}),
  ...(typeof raw.wordSpacingMax === 'number' && Number.isFinite(raw.wordSpacingMax) ? { wordSpacingMax: num(raw.wordSpacingMax, 120, 100, 500) } : {}),
  ...(typeof raw.spaceBefore === 'number' && Number.isFinite(raw.spaceBefore) ? { spaceBefore: num(raw.spaceBefore, 0, 0, MAX_PAGE_PT) } : {}),
  ...(typeof raw.spaceAfter === 'number' && Number.isFinite(raw.spaceAfter) ? { spaceAfter: num(raw.spaceAfter, 0, 0, MAX_PAGE_PT) } : {}),
  ...(typeof raw.indentLeft === 'number' && Number.isFinite(raw.indentLeft) ? { indentLeft: num(raw.indentLeft, 0, 0, MAX_PAGE_PT) } : {}),
  ...(typeof raw.indentRight === 'number' && Number.isFinite(raw.indentRight) ? { indentRight: num(raw.indentRight, 0, 0, MAX_PAGE_PT) } : {}),
  ...(typeof raw.firstLineIndent === 'number' && Number.isFinite(raw.firstLineIndent) ? { firstLineIndent: num(raw.firstLineIndent, 0, 0, MAX_PAGE_PT) } : {}),
  ...(typeof raw.secondLineIndent === 'number' && Number.isFinite(raw.secondLineIndent) ? { secondLineIndent: num(raw.secondLineIndent, 0, 0, MAX_PAGE_PT) } : {}),
})

/** per-paragraph spaceBefore/spaceAfter overrides: each entry is a clamped number or null ("no override") */
const parseParaOverrides = (v: unknown): (number | null)[] | undefined =>
  Array.isArray(v) ? v.map((e) => (typeof e === 'number' && Number.isFinite(e) ? num(e, 0, 0, MAX_PAGE_PT) : null)) : undefined
const paraOverridesOf = (raw: Record<string, unknown>): { paraSpaceBefore?: (number | null)[]; paraSpaceAfter?: (number | null)[] } => ({
  ...(parseParaOverrides(raw.paraSpaceBefore) ? { paraSpaceBefore: parseParaOverrides(raw.paraSpaceBefore) } : {}),
  ...(parseParaOverrides(raw.paraSpaceAfter) ? { paraSpaceAfter: parseParaOverrides(raw.paraSpaceAfter) } : {}),
})
const paragraphStyleIdsOf = (raw: Record<string, unknown>): { paragraphStyleIds?: string[] } => ({
  ...(Array.isArray(raw.paragraphStyleIds) ? { paragraphStyleIds: raw.paragraphStyleIds.filter((id): id is string => typeof id === 'string').slice(0, 100000) } : {}),
})
const paragraphStyleNamesOf = (raw: Record<string, unknown>): { paragraphStyleNames?: string[] } => ({
  ...(Array.isArray(raw.paragraphStyleNames) ? { paragraphStyleNames: raw.paragraphStyleNames.filter((name): name is string => typeof name === 'string').slice(0, 100000) } : {}),
})
const paragraphStylePatchesOf = (raw: Record<string, unknown>): { paragraphStylePatches?: TextFrame['paragraphStylePatches'] } => ({
  ...(Array.isArray(raw.paragraphStylePatches)
    ? {
        paragraphStylePatches: raw.paragraphStylePatches.map((value) =>
          isObj(value) ? { ...paragraphStyleOf(value), ...(['right', 'center', 'left', 'justify', 'justifyCenter'].includes(value.align as string) ? { align: value.align as TextAlign } : {}) } : {},
        ),
      }
    : {}),
})

/** a paragraph style's own patch: the same properties parseCharStyle/paragraphStyleOf validate, but every one optional (a style may leave anything unset, to inherit it from `basedOnId`) */
function parseParagraphStylePatch(v: unknown): ParagraphStyleRecord['patch'] {
  const s = isObj(v) ? v : {}
  return {
    ...(typeof s.fontFamily === 'string' && s.fontFamily ? { fontFamily: s.fontFamily } : {}),
    ...(typeof s.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.color) ? { color: s.color } : {}),
    ...(typeof s.weight === 'number' && Number.isFinite(s.weight) ? { weight: num(s.weight, 400, 1, 1000) } : {}),
    ...(typeof s.italic === 'boolean' ? { italic: s.italic } : {}),
    ...(typeof s.fontSize === 'number' && Number.isFinite(s.fontSize) ? { fontSize: num(s.fontSize, 14, 1, 999) } : {}),
    ...(typeof s.leading === 'number' && Number.isFinite(s.leading) ? { leading: num(s.leading, 17, 1, MAX_PAGE_PT) } : {}),
    ...(typeof s.tracking === 'number' && Number.isFinite(s.tracking) ? { tracking: num(s.tracking, 0, -1000, 1000) } : {}),
    ...((['right', 'center', 'left', 'justify', 'justifyCenter'] as const).includes(s.align as TextAlign) ? { align: s.align as TextAlign } : {}),
    ...(typeof s.spaceBefore === 'number' && Number.isFinite(s.spaceBefore) ? { spaceBefore: num(s.spaceBefore, 0, 0, MAX_PAGE_PT) } : {}),
    ...(typeof s.spaceAfter === 'number' && Number.isFinite(s.spaceAfter) ? { spaceAfter: num(s.spaceAfter, 0, 0, MAX_PAGE_PT) } : {}),
    ...(typeof s.indentLeft === 'number' && Number.isFinite(s.indentLeft) ? { indentLeft: num(s.indentLeft, 0, 0, MAX_PAGE_PT) } : {}),
    ...(typeof s.indentRight === 'number' && Number.isFinite(s.indentRight) ? { indentRight: num(s.indentRight, 0, 0, MAX_PAGE_PT) } : {}),
    ...(typeof s.firstLineIndent === 'number' && Number.isFinite(s.firstLineIndent) ? { firstLineIndent: num(s.firstLineIndent, 0, 0, MAX_PAGE_PT) } : {}),
    ...(typeof s.tint === 'number' && Number.isFinite(s.tint) ? { tint: num(s.tint, 100, 0, 100) } : {}),
    ...(typeof s.overprintFill === 'boolean' ? { overprintFill: s.overprintFill } : {}),
    ...(typeof s.overprintStroke === 'boolean' ? { overprintStroke: s.overprintStroke } : {}),
    ...(typeof s.strokeWidth === 'number' && Number.isFinite(s.strokeWidth) ? { strokeWidth: num(s.strokeWidth, 0, 0, 200) } : {}),
  }
}

/** The document's named paragraph styles (Paragraph Styles panel). Missing (an older file) or empty falls back to the built-in two. */
function parseParagraphStyles(v: unknown): ParagraphStyleRecord[] {
  if (!Array.isArray(v)) return DEFAULT_PARAGRAPH_STYLES
  const used = new Set<string>()
  const styles: ParagraphStyleRecord[] = []
  for (const raw of v) {
    if (!isObj(raw)) continue
    let id = str(raw.id, '')
    if (!id || used.has(id)) id = `paragraph-style-${styles.length}-${Math.random().toString(36).slice(2, 8)}`
    used.add(id)
    styles.push({
      id,
      name: str(raw.name, id),
      ...(typeof raw.basedOnId === 'string' && raw.basedOnId ? { basedOnId: raw.basedOnId } : {}),
      ...(typeof raw.nextStyleId === 'string' && raw.nextStyleId ? { nextStyleId: raw.nextStyleId } : {}),
      patch: parseParagraphStylePatch(raw.patch),
    })
  }
  if (styles.length === 0) return DEFAULT_PARAGRAPH_STYLES
  // a basedOnId/nextStyleId pointing at a style that isn't (or is no longer) in the list: drop it rather than dangle
  const ids = new Set(styles.map((s) => s.id))
  return styles.map((s) => ({
    ...s,
    ...(s.basedOnId && !ids.has(s.basedOnId) ? { basedOnId: undefined } : {}),
    ...(s.nextStyleId && !ids.has(s.nextStyleId) ? { nextStyleId: undefined } : {}),
  }))
}

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
      align: oneOf<TextAlign>(raw.align, ['right', 'center', 'left', 'justify', 'justifyCenter'], D.align),
      id,
      x: num(raw.x, 0, -1e6, 1e6),
      y: num(raw.y, 0, -1e6, 1e6),
      w: num(raw.w, 100, MIN_FRAME_PT, MAX_PAGE_PT),
      h: num(raw.h, 50, MIN_FRAME_PT, MAX_PAGE_PT),
      text,
      runs: normalizeRuns(text, runs, base),
      next: typeof raw.next === 'string' ? raw.next : null,
      ...zOf(raw),
      ...rotationOf(raw),
      ...paragraphStyleOf(raw),
      ...paragraphStyleIdsOf(raw),
      ...paragraphStyleNamesOf(raw),
      ...paragraphStylePatchesOf(raw),
      ...paraOverridesOf(raw),
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
      ...rotationOf(raw),
      ...opacityOf(raw),
      ...(raw.flipX === true ? { flipX: true as const } : {}),
      ...(raw.flipY === true ? { flipY: true as const } : {}),
      ...(raw.wrap === 'around' || raw.wrap === 'jump' ? { wrap: raw.wrap as WrapMode } : {}),
      ...(typeof raw.wrapOffset === 'number' ? { wrapOffset: num(raw.wrapOffset, DEFAULT_WRAP_OFFSET, 0, 500) } : {}),
    })
  }
  return out
}

const HEX = /^#[0-9a-fA-F]{6}$/
const colorOrNull = (v: unknown, fallback: string | null) => (v === null ? null : typeof v === 'string' && HEX.test(v) ? v : fallback)
/** object opacity, 0…1: only written when the object is not fully opaque */
const opacityOf = (raw: Record<string, unknown>): { opacity?: number } =>
  typeof raw.opacity === 'number' && Number.isFinite(raw.opacity) && raw.opacity < 1 ? { opacity: num(raw.opacity, 1, 0, 1) } : {}

/** the optional two-colour (or multi-stop) fill of a shape */
function parseGradient(v: unknown): { fillGradient?: GradientFill } {
  if (!isObj(v)) return {}
  const start = colorOrNull(v.start, null)
  const end = colorOrNull(v.end, null)
  if (!start || !end) return {}
  const stops = Array.isArray(v.stops)
    ? v.stops
        .filter(isObj)
        .map((stop) => ({ offset: num(stop.offset, 0, 0, 1), color: colorOrNull(stop.color, null) }))
        .filter((stop): stop is { offset: number; color: string } => !!stop.color)
        .slice(0, 16)
    : []
  return {
    fillGradient: {
      type: v.type === 'radial' ? 'radial' : 'linear',
      start,
      end,
      ...(stops.length >= 2 ? { stops } : {}),
      ...(v.reverse === true ? { reverse: true } : {}),
    },
  }
}

/** the optional text on a shape's outline */
function parsePathText(v: unknown): { pathText?: PathText } {
  if (!isObj(v)) return {}
  const text = typeof v.text === 'string' ? v.text.slice(0, 20000) : ''
  const style = parseCharStyle(v.style, { fontFamily: 'Segoe UI', fontSize: 18, weight: 400, italic: false, tracking: 0 })
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
function parseGeom(v: unknown, open = false): PathGeom | undefined {
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
      // an open path (a pencil/pen line) needs no area: two points, even one (a dot with round caps), are a real shape
      if (pts.length >= (open ? 1 : 3)) rings.push(pts)
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
    const geom = raw.kind === 'path' ? parseGeom(raw.geom, raw.closed === false) : undefined
    const kind =
      oneOf<ShapeKind>(raw.kind, ['rect', 'ellipse', 'polygon', 'path', 'line'], 'rect') === 'path' && !geom
        ? 'rect'
        : oneOf<ShapeKind>(raw.kind, ['rect', 'ellipse', 'polygon', 'path', 'line'], 'rect')
    let id = str(raw.id, '')
    if (!id || used.has(id)) id = `s${out.length}-${Math.random().toString(36).slice(2, 8)}`
    used.add(id)
    const r = Array.isArray(raw.radii) ? raw.radii : []
    const image = parseShapeImage(raw.image, assets)
    // a line can be purely horizontal or vertical (one side exactly 0) — every other shape still needs both sides real
    // a near-flat freehand path is only a fraction of a point thick (see Workspace's pathShapeFromPoints); clamping it
    // up to MIN_FRAME_PT on load would stretch its wobble vertically
    const minWH = kind === 'line' ? 0 : kind === 'path' ? MIN_FRAME_PT / 20 : MIN_FRAME_PT
    out.push({
      id,
      kind,
      x: num(raw.x, 0, -1e6, 1e6),
      y: num(raw.y, 0, -1e6, 1e6),
      w: num(raw.w, 100, minWH, MAX_PAGE_PT),
      h: num(raw.h, 100, minWH, MAX_PAGE_PT),
      ...(kind === 'polygon' ? { sides: int(raw.sides, 6, MIN_SIDES, MAX_SIDES) } : {}),
      ...(kind === 'path' && geom ? { geom } : {}),
      ...(kind === 'line' && raw.flip === true ? { flip: true as const } : {}),
      ...(kind === 'line' && raw.strokeDash === 'dashed' ? { strokeDash: 'dashed' as const } : {}),
      ...(kind === 'line' && (raw.strokeCap === 'round' || raw.strokeCap === 'square') ? { strokeCap: raw.strokeCap as LineCap } : {}),
      ...(kind === 'path' && (raw.strokeCap === 'butt' || raw.strokeCap === 'round' || raw.strokeCap === 'square') ? { strokeCap: raw.strokeCap as LineCap } : {}),
      ...(kind === 'path' && raw.closed === false ? { closed: false as const } : {}),
      ...(kind === 'path' && raw.curveMode === 'quadratic' ? { curveMode: 'quadratic' as const } : {}),
      ...parsePathText(raw.pathText),
      ...(kind === 'rect' && r.length === 4 ? { radii: [0, 1, 2, 3].map((i) => num(r[i], 0, 0, MAX_PAGE_PT)) as [number, number, number, number] } : {}),
      ...(image ? { image } : {}),
      ...(raw.frame === true ? { frame: true as const } : {}),
      fill: kind === 'line' ? null : colorOrNull(raw.fill, DEFAULT_SHAPE_FILL),
      ...(kind === 'line' ? {} : parseGradient(raw.fillGradient)),
      stroke: colorOrNull(raw.stroke, DEFAULT_SHAPE_STROKE),
      strokeWidth: num(raw.strokeWidth, 1, 0, 200),
      ...zOf(raw),
      ...rotationOf(raw),
      ...opacityOf(raw),
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

/** A parent (master) page: its own small set of objects, own id/prefix/name/size. */
function parseParents(v: unknown, assets: Assets): ParentPage[] {
  if (!Array.isArray(v)) return []
  const used = new Set<string>()
  const parents: ParentPage[] = []
  for (const raw of v) {
    if (!isObj(raw)) continue
    let id = str(raw.id, '')
    if (!id || used.has(id)) id = `parent-${parents.length}-${Math.random().toString(36).slice(2, 8)}`
    used.add(id)
    parents.push({
      id,
      prefix: str(raw.prefix, 'A').slice(0, 4),
      name: str(raw.name, id),
      w: num(raw.w, 595, MIN_PAGE_PT, MAX_PAGE_PT),
      h: num(raw.h, 842, MIN_PAGE_PT, MAX_PAGE_PT),
      frames: parseFrames(raw.frames),
      images: parseImages(raw.images, assets),
      shapes: parseShapes(raw.shapes, assets),
    })
  }
  return parents
}

/** Which parent applies to each page, by index - a reference to a parent that no longer exists (or isn't a string) drops to none. */
function parsePageParents(v: unknown, parents: ParentPage[], pages: number): (string | null)[] {
  const ids = new Set(parents.map((p) => p.id))
  const raw = Array.isArray(v) ? v : []
  return Array.from({ length: pages }, (_, i) => (typeof raw[i] === 'string' && ids.has(raw[i] as string) ? (raw[i] as string) : null))
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
  const parents = parseParents(data.parents, assets)
  return {
    doc,
    frames: parseFrames(data.frames),
    images: parseImages(data.images, assets),
    assets,
    guides: parseGuides(data.guides, doc.pages),
    shapes: parseShapes(data.shapes, assets),
    paragraphStyles: parseParagraphStyles(data.paragraphStyles),
    parents,
    pageParents: parsePageParents(data.pageParents, parents, doc.pages),
  }
}

/**
 * The Paragraph Styles panel's "Load Paragraph Styles…" (ייבוא סגנונות): merge styles read from another
 * Imudist file into the current document's list.
 * - a name that doesn't collide with an existing style is added as-is; a name that does collide gets a
 *   numeric suffix ("טקסט רץ" → "טקסט רץ 2", counting up until it's free)
 * - every imported style gets a brand-new id, regardless of its name, so it can never collide with one
 *   already in use (two documents both starting from the built-in defaults would otherwise both use 'body')
 * - `basedOnId` / `nextStyleId` pointing at another style that was imported alongside it follow that style
 *   to its new id; a reference to anything outside the imported batch is dropped rather than left dangling
 *   (parseDocument already guarantees every such reference in a single file's list resolves inside it)
 */
export function mergeParagraphStyles(current: ParagraphStyleRecord[], imported: ParagraphStyleRecord[]): ParagraphStyleRecord[] {
  if (!imported.length) return current
  const usedNames = new Set(current.map((style) => style.name))
  const usedIds = new Set(current.map((style) => style.id))
  const uniqueName = (name: string) => {
    if (!usedNames.has(name)) return name
    let n = 2
    while (usedNames.has(`${name} ${n}`)) n++
    return `${name} ${n}`
  }
  const stamp = Date.now()
  const idMap = new Map<string, string>()
  const renamed = imported.map((style, index) => {
    const name = uniqueName(style.name)
    usedNames.add(name)
    let id = `paragraph-style-import-${stamp}-${index}`
    while (usedIds.has(id)) id += 'x'
    usedIds.add(id)
    idMap.set(style.id, id)
    return { ...style, id, name }
  })
  const remapped = renamed.map(({ basedOnId, nextStyleId, ...style }) => ({
    ...style,
    ...(basedOnId && idMap.has(basedOnId) ? { basedOnId: idMap.get(basedOnId) } : {}),
    ...(nextStyleId && idMap.has(nextStyleId) ? { nextStyleId: idMap.get(nextStyleId) } : {}),
  }))
  return [...current, ...remapped]
}
