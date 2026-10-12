import {
  DEFAULT_PARAGRAPH_STYLES,
  DEFAULT_FOOTNOTE_CONFIG,
  DEFAULT_TEXT_STYLE,
  DEFAULT_WRAP_OFFSET,
  DEFAULT_SHAPE_FILL,
  DEFAULT_SHAPE_STROKE,
  FOOTNOTE_MARKER,
  type FootnoteHeadingDecoration,
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
  TOC_PAGE_MARKER,
  defaultDocSettings,
  normalizeSizes,
  validateDoc,
  type Asset,
  type AnchoredObject,
  type ObjectStyleRecord,
  type ObjectStyleSettings,
  type ParagraphDecoration,
  type AssetLink,
  type BlendMode,
  type Assets,
  type ColorSample,
  type CharacterStyleRecord,
  type CharacterStyleSettings,
  type NestedStyleRule,
  type CharStyle,
  type DocSettings,
  type ExtrudeSettings,
  type Feather,
  type FootnoteItem,
  type FootnoteLayoutConfig,
  type GradientFill,
  type Guide,
  type LayerInfo,
  type ImageFit,
  type ImageFrame,
  type NumberFormat,
  type PageSection,
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
  type BrushStroke,
  type ShapeKind,
  type Run,
  type Sides,
  type TextAlign,
  type TextFrame,
  type TextStyle,
  type TocFootnoteReference,
  type TocConfig,
  type TocPageReference,
  type WrapMode,
} from './document'
import { footnoteTextStyle } from './footnoteLayout'
import { ORNAMENT_STYLES, usableOrnamentImage } from './footnoteOrnaments'
import { cleanLineArrow, cleanLineWidthEdges, cleanLineWidthPos, cleanLineWidths } from './lineProfile'
import { normalizeDeg } from './frames'
import { isSharpness, MAX_BLUR } from './sharpness'
import type { DocContent, ParentOverride } from './pages'
import { repairBasedOn } from './characterStyleTree'
import { sanitizeTable } from './table'
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
  layerOrder?: string[]
  /** names, colours, hidden and locked of the layers, by id (absent in files from before they were saved) */
  layers?: Record<string, LayerInfo>
  frames: TextFrame[]
  /** version 2+: pictures on the pages, and the data of the pictures they use */
  images: ImageFrame[]
  /** a linked picture is saved as its small preview plus where its file is (see AssetLink) */
  assets: Record<string, Omit<Asset, 'link'> & { link?: Omit<AssetLink, 'preview'> }>
  guides: Guide[]
  shapes: ShapeFrame[]
  /** version 2+ (this field only from a later Imudist build): the document's named paragraph styles */
  paragraphStyles: ParagraphStyleRecord[]
  /** the document's named character styles (absent in files from before they existed) */
  characterStyles?: CharacterStyleRecord[]
  /** version 2+ (this field only from a later Imudist build): the document's parent (master) pages */
  parents: ParentPage[]
  /** which parent page applies to each document page, by index */
  pageParents: (string | null)[]
  /** version 2+ (this field only from a later Imudist build): independently-numbered runs of pages */
  sections: PageSection[]
  parentOverrides?: ParentOverride[]
  colorSamples?: ColorSample[]
  /** the document's named object styles (absent in files from before they existed) */
  objectStyles?: ObjectStyleRecord[]
}

/** The file's text for a document. Only the pictures that are still in use are stored. */
export function serializeDocument(c: DocContent): string {
  // a parent page's own pictures need their assets kept too, not just the document pages' own
  const used = new Set([...c.images, ...c.parents.flatMap((p) => p.images)].map((i) => i.assetId))
  // the pictures of the objects that sit in a line of text (anchored) are kept too: removing the anchor gives them back
  for (const frame of [...c.frames, ...c.parents.flatMap((p) => p.frames)]) {
    for (const run of frame.runs ?? []) {
      const source = run.style.anchor?.source
      if (!source) continue
      for (const image of source.images) used.add(image.assetId)
      for (const shape of source.shapes) if (shape.image) used.add(shape.image.assetId)
    }
  }
  const assets: DocumentFile['assets'] = {}
  for (const id of used) {
    const asset = c.assets[id]
    if (!asset) continue
    if (asset.link) {
      const { preview, ...link } = asset.link
      assets[id] = { ...asset, dataUrl: preview, link }
    } else assets[id] = asset
  }
  const file: DocumentFile = {
    format: FORMAT,
    version: VERSION,
    savedAt: new Date().toISOString(),
    settings: c.doc,
    layerOrder: c.layerOrder ?? ['layer-1'],
    layers: c.layers ?? {},
    frames: c.frames,
    images: c.images,
    assets,
    guides: c.guides,
    shapes: c.shapes,
    paragraphStyles: c.paragraphStyles,
    characterStyles: c.characterStyles ?? [],
    parents: c.parents,
    pageParents: c.pageParents,
    sections: c.sections,
    parentOverrides: c.parentOverrides ?? [],
    colorSamples: c.colorSamples ?? [],
    objectStyles: c.objectStyles ?? [],
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

function parseTocConfig(value: unknown): TocConfig | undefined {
  if (!isObj(value) || !Array.isArray(value.levels)) return undefined
  const levels = value.levels.flatMap((raw) => isObj(raw) && typeof raw.sourceStyleId === 'string' && raw.sourceStyleId
    ? [{ sourceStyleId: raw.sourceStyleId, outputStyleId: str(raw.outputStyleId, 'body'), indent: num(raw.indent, 0, 0, MAX_SIDE_PT) }]
    : [])
  return levels.length > 0 ? { levels, leader: typeof value.leader === 'string' ? value.leader.slice(0, 4) : '.' } : undefined
}

function parseTocPageReferences(value: unknown, text: string): TocPageReference[] | undefined {
  if (!Array.isArray(value)) return undefined
  const refs = value.flatMap((raw) => {
    if (!isObj(raw) || typeof raw.sourceFrameId !== 'string' || typeof raw.sourceStyleId !== 'string' || typeof raw.sourceText !== 'string') return []
    if (typeof raw.offset !== 'number' || !Number.isInteger(raw.offset) || typeof raw.sourceParagraphIndex !== 'number' || !Number.isInteger(raw.sourceParagraphIndex)) return []
    const offset = raw.offset
    const sourceParagraphIndex = raw.sourceParagraphIndex
    if (offset < 0 || offset >= text.length || text[offset] !== TOC_PAGE_MARKER || sourceParagraphIndex < 0) return []
    return [{ offset, sourceFrameId: raw.sourceFrameId, sourceParagraphIndex, sourceStyleId: raw.sourceStyleId, sourceText: raw.sourceText, occurrence: int(raw.occurrence, 0, 0, MAX_PAGES * 100) }]
  })
  return refs.length > 0 ? refs : undefined
}

function parseTocFootnoteReferences(value: unknown, text: string): TocFootnoteReference[] | undefined {
  if (!Array.isArray(value)) return undefined
  const refs = value.flatMap((raw) => {
    if (!isObj(raw) || typeof raw.offset !== 'number' || !Number.isInteger(raw.offset) || typeof raw.sourceNoteId !== 'string' || !raw.sourceNoteId) return []
    return raw.offset >= 0 && raw.offset < text.length && text[raw.offset] === FOOTNOTE_MARKER
      ? [{ offset: raw.offset, sourceNoteId: raw.sourceNoteId }]
      : []
  })
  return refs.length > 0 ? refs : undefined
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
    footnotes: parseFootnoteConfig(v.footnotes),
    toc: parseTocConfig(v.toc),
    parentItemsAbovePageContent: bool(v.parentItemsAbovePageContent, d.parentItemsAbovePageContent ?? false),
  }
  const clean = normalizeSizes(settings)
  if (validateDoc(clean)) throw new FileFormatError('הגדרות העמוד בקובץ אינן תקינות (השוליים גדולים מהעמוד).')
  return clean
}

function parseFootnoteConfig(value: unknown): FootnoteLayoutConfig {
  const raw = isObj(value) ? value : {}
  return {
    placement: oneOf(raw.placement, ['footnotes', 'endnotes'], DEFAULT_FOOTNOTE_CONFIG.placement),
    mode: oneOf(raw.mode, ['vertical', 'horizontal'], DEFAULT_FOOTNOTE_CONFIG.mode),
    columns: raw.columns === 2 ? 2 : 1,
    referenceScale: num(raw.referenceScale, DEFAULT_FOOTNOTE_CONFIG.referenceScale, 0.25, 1),
    referenceGap: num(raw.referenceGap, DEFAULT_FOOTNOTE_CONFIG.referenceGap, 0, 72),
    referenceVerticalOffset: num(raw.referenceVerticalOffset, DEFAULT_FOOTNOTE_CONFIG.referenceVerticalOffset, -20, 20),
    numberTextGap: num(raw.numberTextGap, DEFAULT_FOOTNOTE_CONFIG.numberTextGap, 0, 100),
    columnGap: num(raw.columnGap, DEFAULT_FOOTNOTE_CONFIG.columnGap, 0, 100),
    widthScale: num(raw.widthScale, DEFAULT_FOOTNOTE_CONFIG.widthScale, 0.2, 1),
    minSpacingBetweenInline: num(raw.minSpacingBetweenInline, DEFAULT_FOOTNOTE_CONFIG.minSpacingBetweenInline, 0, 100),
    maxFootnoteHeight: num(raw.maxFootnoteHeight, DEFAULT_FOOTNOTE_CONFIG.maxFootnoteHeight, 12, MAX_PAGE_PT),
    dividerGap: num(raw.dividerGap, DEFAULT_FOOTNOTE_CONFIG.dividerGap, 0, MAX_PAGE_PT),
    dividerWidth: num(raw.dividerWidth, DEFAULT_FOOTNOTE_CONFIG.dividerWidth, 1, 100),
    dividerThickness: num(raw.dividerThickness, DEFAULT_FOOTNOTE_CONFIG.dividerThickness, 0.1, 10),
    dividerAlignment: oneOf(raw.dividerAlignment, ['right', 'center', 'left'], DEFAULT_FOOTNOTE_CONFIG.dividerAlignment),
    dividerMode: oneOf(raw.dividerMode, ['line', 'heading'], DEFAULT_FOOTNOTE_CONFIG.dividerMode),
    dividerText: str(raw.dividerText, DEFAULT_FOOTNOTE_CONFIG.dividerText).slice(0, 200),
    dividerHeadingLines: bool(raw.dividerHeadingLines, DEFAULT_FOOTNOTE_CONFIG.dividerHeadingLines),
    dividerHeadingDecoration: oneOf(raw.dividerHeadingDecoration, ['none', 'outer', 'both', 'curl', 'needle', 'custom', ...ORNAMENT_STYLES.map((style) => style.id)] as FootnoteHeadingDecoration[], DEFAULT_FOOTNOTE_CONFIG.dividerHeadingDecoration),
    ...(typeof raw.dividerHeadingGap === 'number' && Number.isFinite(raw.dividerHeadingGap) ? { dividerHeadingGap: num(raw.dividerHeadingGap, 0, 0, 200) } : {}),
    ...(typeof raw.dividerOrnamentOffset === 'number' && Number.isFinite(raw.dividerOrnamentOffset) && raw.dividerOrnamentOffset !== 0 ? { dividerOrnamentOffset: num(raw.dividerOrnamentOffset, 0, -100, 100) } : {}),
    ...(typeof raw.dividerOrnamentScale === 'number' && Number.isFinite(raw.dividerOrnamentScale) && Math.round(raw.dividerOrnamentScale) !== 100 ? { dividerOrnamentScale: num(raw.dividerOrnamentScale, 100, 20, 500) } : {}),
    ...(usableOrnamentImage(raw.dividerOrnament) ? { dividerOrnament: { name: raw.dividerOrnament.name.slice(0, 100), dataUrl: raw.dividerOrnament.dataUrl, width: raw.dividerOrnament.width, height: raw.dividerOrnament.height } } : {}),
    ...(typeof raw.dividerHeadingStyleId === 'string' && raw.dividerHeadingStyleId ? { dividerHeadingStyleId: raw.dividerHeadingStyleId.slice(0, 100) } : {}),
    ...(typeof raw.referenceStyleId === 'string' && raw.referenceStyleId ? { referenceStyleId: raw.referenceStyleId.slice(0, 100) } : {}),
    spaceBefore: num(raw.spaceBefore, DEFAULT_FOOTNOTE_CONFIG.spaceBefore, 0, MAX_PAGE_PT),
    startAt: int(raw.startAt, DEFAULT_FOOTNOTE_CONFIG.startAt, 1, 9999),
    restart: oneOf(raw.restart, ['continuous', 'page', 'spread'], DEFAULT_FOOTNOTE_CONFIG.restart),
    markerPrefix: str(raw.markerPrefix, DEFAULT_FOOTNOTE_CONFIG.markerPrefix).slice(0, 12),
    markerSuffix: str(raw.markerSuffix, DEFAULT_FOOTNOTE_CONFIG.markerSuffix).slice(0, 12),
    numberStyle: oneOf(raw.numberStyle, ['arabic', 'hebrew', 'roman'], DEFAULT_FOOTNOTE_CONFIG.numberStyle),
    noteFormat: oneOf(raw.noteFormat, ['plain', 'dot', 'dotBefore', 'rightParen', 'doubleRightParen', 'leftParen', 'doubleLeftParen', 'round', 'square'], DEFAULT_FOOTNOTE_CONFIG.noteFormat),
    alignment: oneOf(raw.alignment, ['right', 'center'], DEFAULT_FOOTNOTE_CONFIG.alignment),
    ...(typeof raw.fontFamily === 'string' && raw.fontFamily ? { fontFamily: raw.fontFamily.slice(0, 100) } : {}),
    ...(typeof raw.paragraphStyleId === 'string' && raw.paragraphStyleId ? { paragraphStyleId: raw.paragraphStyleId.slice(0, 100) } : {}),
  }
}

/** the assets of the file being read: the pictures an anchored object keeps are read against them (set by parseDocument) */
let anchorAssets: Assets = {}
const ANCHOR_SRC = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/

/** an object sitting in the text as one character; nothing in it is trusted: a picture that is not a data: URL of an image is dropped */
function parseAnchor(v: unknown): AnchoredObject | undefined {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id || v.id.length > 100) return undefined
  if (typeof v.src !== 'string' || v.src.length > 24_000_000 || !ANCHOR_SRC.test(v.src)) return undefined
  const w = num(v.w, 0, 0, 5000)
  const h = num(v.h, 0, 0, 5000)
  if (w <= 0 || h <= 0) return undefined
  let source: AnchoredObject['source']
  if (isObj(v.source)) {
    const images = parseImages(v.source.images, anchorAssets)
    const shapes = parseShapes(v.source.shapes, anchorAssets)
    if (images.length + shapes.length > 0) source = { images, shapes }
  }
  const offset = typeof v.offset === 'number' && Number.isFinite(v.offset) && v.offset !== 0 ? num(v.offset, 0, -5000, 5000) : 0
  return { id: v.id, src: v.src, w, h, ...(offset ? { offset } : {}), ...(source ? { source } : {}) }
}

function parseCharStyle(v: unknown, fallback: CharStyle): CharStyle {
  const s = isObj(v) ? v : {}
  const anchor = parseAnchor(s.anchor)
  const color = typeof s.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.color) ? s.color : fallback.color
  const outlineColor = typeof s.outlineColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.outlineColor) ? s.outlineColor : fallback.outlineColor
  return {
    fontFamily: str(s.fontFamily, fallback.fontFamily),
    fontSize: num(s.fontSize, fallback.fontSize, 1, 999),
    weight: num(s.weight, fallback.weight, 1, 1000),
    italic: bool(s.italic, fallback.italic),
    tracking: num(s.tracking, fallback.tracking, -1000, 1000),
    ...(color ? { color } : {}),
    ...(outlineColor ? { outlineColor } : {}),
    ...(typeof s.charStyleId === 'string' && s.charStyleId && s.charStyleId.length <= 100 ? { charStyleId: s.charStyleId } : {}),
    ...(s.charStyleManual === true && typeof s.charStyleId === 'string' && s.charStyleId ? { charStyleManual: true } : {}),
    ...(anchor ? { anchor } : {}),
    ...(typeof s.baselineShift === 'number' && Number.isFinite(s.baselineShift) && s.baselineShift !== 0 ? { baselineShift: num(s.baselineShift, 0, -999, 999) } : {}),
    ...(typeof s.outlineWidth === 'number' && Number.isFinite(s.outlineWidth) ? { outlineWidth: num(s.outlineWidth, 0, 0, 100) } : fallback.outlineWidth !== undefined ? { outlineWidth: fallback.outlineWidth } : {}),
    ...(typeof s.shadowOffsetX === 'number' && Number.isFinite(s.shadowOffsetX) ? { shadowOffsetX: num(s.shadowOffsetX, 0, -100, 100) } : fallback.shadowOffsetX !== undefined ? { shadowOffsetX: fallback.shadowOffsetX } : {}),
    ...(typeof s.shadowOffsetY === 'number' && Number.isFinite(s.shadowOffsetY) ? { shadowOffsetY: num(s.shadowOffsetY, 6, -100, 100) } : typeof s.shadowOffset === 'number' && Number.isFinite(s.shadowOffset) ? { shadowOffsetY: num(s.shadowOffset, 6, -100, 100) } : fallback.shadowOffsetY !== undefined ? { shadowOffsetY: fallback.shadowOffsetY } : fallback.shadowOffset !== undefined ? { shadowOffsetY: fallback.shadowOffset } : {}),
    ...(typeof s.shadowColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.shadowColor) ? { shadowColor: s.shadowColor } : fallback.shadowColor ? { shadowColor: fallback.shadowColor } : {}),
    ...(typeof s.shadowOffset === 'number' && Number.isFinite(s.shadowOffset) ? { shadowOffset: num(s.shadowOffset, 6, 0, 100) } : fallback.shadowOffset !== undefined ? { shadowOffset: fallback.shadowOffset } : {}),
    ...(typeof s.shadowOpacity === 'number' && Number.isFinite(s.shadowOpacity) ? { shadowOpacity: num(s.shadowOpacity, 0, 0, 1) } : fallback.shadowOpacity !== undefined ? { shadowOpacity: fallback.shadowOpacity } : {}),
  }
}

/** the optional stacking order of an object */
const zOf = (raw: Record<string, unknown>): { z?: number } => (typeof raw.z === 'number' && Number.isFinite(raw.z) ? { z: int(raw.z, 0, -1e9, 1e9) } : {})
const rotationOf = (raw: Record<string, unknown>): { rotation?: number } =>
  typeof raw.rotation === 'number' && Number.isFinite(raw.rotation) && raw.rotation !== 0 ? { rotation: normalizeDeg(raw.rotation) } : {}
const groupOf = (raw: Record<string, unknown>): { groupId?: string } => typeof raw.groupId === 'string' && raw.groupId ? { groupId: raw.groupId } : {}
const layerIdOf = (raw: Record<string, unknown>): { layerId?: string } => typeof raw.layerId === 'string' && raw.layerId.length > 0 && raw.layerId.length <= 64 ? { layerId: raw.layerId } : {}
/** leading, word-spacing bounds and paragraph spacing/indents: optional, belong to the whole story, not per-run */
type ParagraphFields = Pick<TextStyle, 'leading' | 'wordSpacingMin' | 'wordSpacingMax' | 'wordSpacing' | 'spaceBefore' | 'spaceAfter' | 'indentLeft' | 'indentRight' | 'firstLineIndent' | 'secondLineIndent'>
/** hidden or locked in the Layers panel, and the name given there: the same for every kind of object */
const itemFlagsOf = (raw: Record<string, unknown>): { hidden?: true; locked?: true } => ({
  ...(raw.hidden === true ? { hidden: true as const } : {}),
  ...(raw.locked === true ? { locked: true as const } : {}),
})
/** the object style an object follows (a reference: a style that is not in the file is dropped later, with the file's own list) */
const objectStyleIdOf = (raw: Record<string, unknown>): { objectStyleId?: string } => (typeof raw.objectStyleId === 'string' && raw.objectStyleId && raw.objectStyleId.length <= 120 ? { objectStyleId: raw.objectStyleId } : {})
const itemLabelOf = (raw: Record<string, unknown>): { label?: string } => (typeof raw.label === 'string' && raw.label.trim() ? { label: raw.label.trim().slice(0, 120) } : {})

/** the layers' names, colours, hidden and locked: only for layers that exist, and only what is valid */
function parseLayers(v: unknown, layerOrder: string[]): Record<string, LayerInfo> {
  if (!isObj(v)) return {}
  const out: Record<string, LayerInfo> = {}
  for (const id of layerOrder) {
    const raw = v[id]
    if (!isObj(raw)) continue
    const info: LayerInfo = {
      ...(typeof raw.name === 'string' && raw.name.trim() ? { name: raw.name.trim().slice(0, 120) } : {}),
      ...(typeof raw.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.color) ? { color: raw.color } : {}),
      ...(raw.hidden === true ? { hidden: true as const } : {}),
      ...(raw.locked === true ? { locked: true as const } : {}),
    }
    if (Object.keys(info).length) out[id] = info
  }
  return out
}

const paragraphStyleOf = (raw: Record<string, unknown>): Partial<ParagraphFields> => ({
  ...(typeof raw.leading === 'number' && Number.isFinite(raw.leading) ? { leading: num(raw.leading, 0, 0, MAX_PAGE_PT) } : {}),
  ...(typeof raw.wordSpacingMin === 'number' && Number.isFinite(raw.wordSpacingMin) ? { wordSpacingMin: num(raw.wordSpacingMin, 90, 10, 100) } : {}),
  ...(typeof raw.wordSpacingMax === 'number' && Number.isFinite(raw.wordSpacingMax) ? { wordSpacingMax: num(raw.wordSpacingMax, 120, 100, 500) } : {}),
  ...(typeof raw.wordSpacing === 'number' && Number.isFinite(raw.wordSpacing) ? { wordSpacing: num(raw.wordSpacing, 100, 0, 500) } : {}),
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
type ParaOverrides = Pick<TextFrame, 'paraSpaceBefore' | 'paraSpaceAfter' | 'paraKeepFirstLines' | 'paraKeepLastLines' | 'paraKeepWithNext'>
const paraOverridesOf = (raw: Record<string, unknown>): ParaOverrides => ({
  ...(parseParaOverrides(raw.paraSpaceBefore) ? { paraSpaceBefore: parseParaOverrides(raw.paraSpaceBefore) } : {}),
  ...(parseParaOverrides(raw.paraSpaceAfter) ? { paraSpaceAfter: parseParaOverrides(raw.paraSpaceAfter) } : {}),
  // keep lines together / keep with next: saved with the frame, so they have to be read back too
  ...(parseParaOverrides(raw.paraKeepFirstLines) ? { paraKeepFirstLines: parseParaOverrides(raw.paraKeepFirstLines) } : {}),
  ...(parseParaOverrides(raw.paraKeepLastLines) ? { paraKeepLastLines: parseParaOverrides(raw.paraKeepLastLines) } : {}),
  ...(parseParaOverrides(raw.paraKeepWithNext) ? { paraKeepWithNext: parseParaOverrides(raw.paraKeepWithNext) } : {}),
})
const paragraphStyleIdsOf = (raw: Record<string, unknown>): { paragraphStyleIds?: string[] } => ({
  ...(Array.isArray(raw.paragraphStyleIds) ? { paragraphStyleIds: raw.paragraphStyleIds.filter((id): id is string => typeof id === 'string').slice(0, 100000) } : {}),
})
const paragraphStyleNamesOf = (raw: Record<string, unknown>): { paragraphStyleNames?: string[] } => ({
  ...(Array.isArray(raw.paragraphStyleNames) ? { paragraphStyleNames: raw.paragraphStyleNames.filter((name): name is string => typeof name === 'string').slice(0, 100000) } : {}),
})
/** a paragraph's fill and line (see ParagraphBox): the same checks for a paragraph's own patch and for a paragraph style's */
const parseDecoration = (v: unknown): ParagraphDecoration | undefined => {
  if (!isObj(v) || typeof v.objectStyleId !== 'string' || !v.objectStyleId || v.objectStyleId.length > 120) return undefined
  return {
    objectStyleId: v.objectStyleId,
    position: v.position === 'below' ? 'below' : v.position === 'behind' ? 'behind' : 'above',
    height: num(v.height, 2, 0.25, 500),
    gap: num(v.gap, 4, 0, 500),
    length: num(v.length, 0, 0, 5000),
    align: v.align === 'center' || v.align === 'end' ? v.align : 'start',
  }
}
const parseParagraphBox = (s: Record<string, unknown>): { background?: string; borderColor?: string; borderWidth?: number; decoration?: ParagraphDecoration } => ({
  ...(parseDecoration(s.decoration) ? { decoration: parseDecoration(s.decoration)! } : {}),
  ...(typeof s.background === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.background) ? { background: s.background } : {}),
  ...(typeof s.borderWidth === 'number' && Number.isFinite(s.borderWidth) && s.borderWidth > 0
    ? { borderWidth: num(s.borderWidth, 1, 0, 100), ...(typeof s.borderColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.borderColor) ? { borderColor: s.borderColor } : {}) }
    : {}),
})

const paragraphStylePatchesOf = (raw: Record<string, unknown>): { paragraphStylePatches?: TextFrame['paragraphStylePatches'] } => ({
  ...(Array.isArray(raw.paragraphStylePatches)
    ? {
        paragraphStylePatches: raw.paragraphStylePatches.map((value) =>
          isObj(value)
            ? {
                ...paragraphStyleOf(value),
                ...(['right', 'center', 'left', 'justify', 'justifyCenter'].includes(value.align as string) ? { align: value.align as TextAlign } : {}),
                ...(value.listKind === 'bullet' || value.listKind === 'number' ? { listKind: value.listKind } : {}),
                ...(typeof value.listGap === 'number' && Number.isFinite(value.listGap) ? { listGap: num(value.listGap, 4, 0, 100) } : {}),
                ...parseParagraphBox(value),
                ...(typeof value.windowIndent === 'number' && Number.isFinite(value.windowIndent) && value.windowIndent > 0
                  ? { windowIndent: num(value.windowIndent, 0, 0, MAX_PAGE_PT), ...(typeof value.windowWords === 'number' && Number.isFinite(value.windowWords) ? { windowWords: int(value.windowWords, 1, 1, 4) } : {}) }
                  : {}),
              }
            : {},
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
    ...(typeof s.outlineColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.outlineColor) ? { outlineColor: s.outlineColor } : {}),
    ...(typeof s.outlineWidth === 'number' && Number.isFinite(s.outlineWidth) ? { outlineWidth: num(s.outlineWidth, 0, 0, 100) } : {}),
    ...(typeof s.weight === 'number' && Number.isFinite(s.weight) ? { weight: num(s.weight, 400, 1, 1000) } : {}),
    ...(typeof s.italic === 'boolean' ? { italic: s.italic } : {}),
    ...(typeof s.fontSize === 'number' && Number.isFinite(s.fontSize) ? { fontSize: num(s.fontSize, 14, 1, 999) } : {}),
    ...(typeof s.leading === 'number' && Number.isFinite(s.leading) ? { leading: num(s.leading, 17, 0, MAX_PAGE_PT) } : {}),
    ...(typeof s.tracking === 'number' && Number.isFinite(s.tracking) ? { tracking: num(s.tracking, 0, -1000, 1000) } : {}),
    ...((['right', 'center', 'left', 'justify', 'justifyCenter'] as const).includes(s.align as TextAlign) ? { align: s.align as TextAlign } : {}),
    ...(typeof s.spaceBefore === 'number' && Number.isFinite(s.spaceBefore) ? { spaceBefore: num(s.spaceBefore, 0, 0, MAX_PAGE_PT) } : {}),
    ...(typeof s.spaceAfter === 'number' && Number.isFinite(s.spaceAfter) ? { spaceAfter: num(s.spaceAfter, 0, 0, MAX_PAGE_PT) } : {}),
    ...(typeof s.indentLeft === 'number' && Number.isFinite(s.indentLeft) ? { indentLeft: num(s.indentLeft, 0, 0, MAX_PAGE_PT) } : {}),
    ...(typeof s.indentRight === 'number' && Number.isFinite(s.indentRight) ? { indentRight: num(s.indentRight, 0, 0, MAX_PAGE_PT) } : {}),
    ...(typeof s.firstLineIndent === 'number' && Number.isFinite(s.firstLineIndent) ? { firstLineIndent: num(s.firstLineIndent, 0, 0, MAX_PAGE_PT) } : {}),
    ...(typeof s.tint === 'number' && Number.isFinite(s.tint) ? { tint: num(s.tint, 100, 0, 100) } : {}),
    ...(typeof s.keepLinesTogether === 'boolean' ? { keepLinesTogether: s.keepLinesTogether } : {}),
    ...(typeof s.keepWithNext === 'boolean' ? { keepWithNext: s.keepWithNext } : {}),
    ...(s.listKind === 'bullet' || s.listKind === 'number' ? { listKind: s.listKind } : {}),
    ...(typeof s.listGap === 'number' && Number.isFinite(s.listGap) ? { listGap: num(s.listGap, 4, 0, 100) } : {}),
    ...parseParagraphBox(s),
    ...(typeof s.overprintFill === 'boolean' ? { overprintFill: s.overprintFill } : {}),
    ...(typeof s.overprintStroke === 'boolean' ? { overprintStroke: s.overprintStroke } : {}),
    ...(typeof s.strokeWidth === 'number' && Number.isFinite(s.strokeWidth) ? { strokeWidth: num(s.strokeWidth, 0, 0, 200) } : {}),
  }
}

/** The document's named paragraph styles (Paragraph Styles panel). Missing (an older file) or empty falls back to the built-in two. */
/** a paragraph style's nested style rules: at most 20, each pointing at a style by id (a style that is gone is skipped when they are applied) */
function parseNestedRules(v: unknown): { nested?: NestedStyleRule[] } {
  if (!Array.isArray(v)) return {}
  const rules: NestedStyleRule[] = []
  for (const raw of v) {
    if (!isObj(raw) || rules.length >= 20) continue
    const styleId = str(raw.styleId, '').slice(0, 100)
    if (!styleId) continue
    const unit = oneOf<NestedStyleRule['unit']>(raw.unit, ['words', 'letters', 'sentences', 'delimiter'], 'words')
    rules.push({
      styleId,
      unit,
      count: int(raw.count, 1, 1, 1000),
      ...(unit === 'delimiter' && typeof raw.delimiter === 'string' && raw.delimiter ? { delimiter: raw.delimiter.slice(0, 10) } : {}),
      inclusive: bool(raw.inclusive, false),
    })
  }
  return rules.length ? { nested: rules } : {}
}

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
      ...parseNestedRules(raw.nested),
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

/** the settings of a character style: every one optional, and only the ones that make sense */
function parseCharacterStyleSettings(v: unknown): CharacterStyleSettings {
  const s = isObj(v) ? v : {}
  return {
    ...(typeof s.fontFamily === 'string' && s.fontFamily ? { fontFamily: s.fontFamily.slice(0, 100) } : {}),
    ...(typeof s.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.color) ? { color: s.color } : {}),
    ...(typeof s.outlineColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.outlineColor) ? { outlineColor: s.outlineColor } : {}),
    ...(typeof s.outlineWidth === 'number' && Number.isFinite(s.outlineWidth) ? { outlineWidth: num(s.outlineWidth, 0, 0, 100) } : {}),
    ...(typeof s.fontSize === 'number' && Number.isFinite(s.fontSize) ? { fontSize: num(s.fontSize, 14, 1, 999) } : {}),
    ...(typeof s.weight === 'number' && Number.isFinite(s.weight) ? { weight: num(s.weight, 400, 1, 1000) } : {}),
    ...(typeof s.italic === 'boolean' ? { italic: s.italic } : {}),
    ...(typeof s.tracking === 'number' && Number.isFinite(s.tracking) ? { tracking: num(s.tracking, 0, -1000, 1000) } : {}),
    ...(typeof s.baselineShift === 'number' && Number.isFinite(s.baselineShift) ? { baselineShift: num(s.baselineShift, 0, -999, 999) } : {}),
  }
}

function parseCharacterStyles(v: unknown): CharacterStyleRecord[] {
  if (!Array.isArray(v)) return []
  const used = new Set<string>()
  const styles: CharacterStyleRecord[] = []
  for (const raw of v) {
    if (!isObj(raw) || styles.length >= 500) continue
    let id = str(raw.id, '').slice(0, 100)
    if (!id || used.has(id)) id = `character-style-${styles.length}-${Math.random().toString(36).slice(2, 8)}`
    used.add(id)
    styles.push({ id, name: str(raw.name, id).slice(0, 200), ...(typeof raw.basedOnId === 'string' && raw.basedOnId ? { basedOnId: raw.basedOnId.slice(0, 100) } : {}), patch: parseCharacterStyleSettings(raw.patch) })
  }
  return repairBasedOn(styles)
}

function parseFrames(v: unknown, footnoteConfig: FootnoteLayoutConfig = DEFAULT_FOOTNOTE_CONFIG, paragraphStyles: ParagraphStyleRecord[] = DEFAULT_PARAGRAPH_STYLES): TextFrame[] {
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
    const footnotes: FootnoteItem[] | undefined = Array.isArray(raw.footnotes)
      ? raw.footnotes.filter(isObj).flatMap((note) => {
          const anchor = int(note.anchor, -1, 0, Math.max(0, text.length - 1))
          const content = typeof note.content === 'string' ? note.content.slice(0, 1_000_000) : ''
          if (!content || text[anchor] !== FOOTNOTE_MARKER) return []
          const noteStyleRaw = isObj(note.style) ? note.style : null
          const paragraphStyleId = typeof note.paragraphStyleId === 'string' ? note.paragraphStyleId : undefined
          const fallbackNoteStyle = footnoteTextStyle(footnoteConfig, paragraphStyles, paragraphStyleId)
          const noteBase: TextStyle = noteStyleRaw
            ? { ...fallbackNoteStyle, ...parseCharStyle(noteStyleRaw, fallbackNoteStyle), ...paragraphStyleOf(noteStyleRaw) }
            : fallbackNoteStyle
          const noteRuns = Array.isArray(note.runs)
            ? note.runs.filter(isObj).map((run) => ({ len: int(run.len, 0, 0, 1e9), style: parseCharStyle(run.style, noteBase) }))
            : undefined
          return [{ id: str(note.id, `footnote-${anchor}`), anchor, content, runs: normalizeRuns(content, noteRuns, noteBase), ...(noteStyleRaw ? { style: noteBase } : {}), ...(paragraphStyleId ? { paragraphStyleId } : {}) }]
        })
      : undefined

    frames.push({
      ...base,
      ...groupOf(raw),
      ...layerIdOf(raw),
      ...itemFlagsOf(raw),
      ...itemLabelOf(raw),
      ...(raw.rasterized === true ? { rasterized: true } : {}),
      ...opacityOf(raw),
      ...blendModeOf(raw),
      ...(isObj(raw.textScale) && typeof raw.textScale.x === 'number' && typeof raw.textScale.y === 'number' ? { textScale: { x: raw.textScale.x, y: raw.textScale.y } } : {}),
      ...(typeof raw.runningHeaderStyleId === 'string' && raw.runningHeaderStyleId ? { runningHeaderStyleId: raw.runningHeaderStyleId } : {}),
      ...(raw.runningHeaderStrategy === 'first' || raw.runningHeaderStrategy === 'last' ? { runningHeaderStrategy: raw.runningHeaderStrategy } : {}),
      align: oneOf<TextAlign>(raw.align, ['right', 'center', 'left', 'justify', 'justifyCenter'], D.align),
      id,
      x: num(raw.x, 0, -1e6, 1e6),
      y: num(raw.y, 0, -1e6, 1e6),
      w: num(raw.w, 100, MIN_FRAME_PT, MAX_PAGE_PT),
      h: num(raw.h, 50, MIN_FRAME_PT, MAX_PAGE_PT),
      text,
      runs: normalizeRuns(text, runs, base),
      ...(footnotes?.length ? { footnotes } : {}),
      ...(parseTocPageReferences(raw.tocPageReferences, text) ? { tocPageReferences: parseTocPageReferences(raw.tocPageReferences, text) } : {}),
      ...(parseTocFootnoteReferences(raw.tocFootnoteReferences, text) ? { tocFootnoteReferences: parseTocFootnoteReferences(raw.tocFootnoteReferences, text) } : {}),
      next: typeof raw.next === 'string' ? raw.next : null,
      ...zOf(raw),
      ...rotationOf(raw),
      ...parseFeather(raw.feather),
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
const IMAGE_MIME = /^image\/(png|jpeg|gif|webp|svg\+xml|bmp|avif)$/
const ABSOLUTE_PATH = /^([a-zA-Z]:[\\/]|\\\\)/

/** A linked picture's file location, if the saved asset has a usable one (the preview is the asset's own data URL). */
function parseLink(raw: unknown, preview: string): AssetLink | undefined {
  if (!isObj(raw) || typeof raw.path !== 'string' || !ABSOLUTE_PATH.test(raw.path)) return undefined
  return { path: raw.path, size: num(raw.size, 0, 0), mtime: num(raw.mtime, 0, 0), preview }
}

function parseAssets(v: unknown): Assets {
  const out: Assets = Object.create(null) // no prototype: an id like "__proto__" must stay an ordinary key
  if (!isObj(v)) return out
  for (const [id, raw] of Object.entries(v)) {
    if (!isObj(raw) || typeof raw.dataUrl !== 'string') continue
    const m = DATA_URL.exec(raw.dataUrl)
    if (!m) continue // anything that is not a picture data URL is refused
    const link = parseLink(raw.link, raw.dataUrl)
    const asset: Asset = {
      name: str(raw.name, 'תמונה'),
      // a linked picture's preview is smaller than - and may be a different type from - the file it stands for
      mime: link && typeof raw.mime === 'string' && IMAGE_MIME.test(raw.mime) ? raw.mime : 'image/' + m[1],
      dataUrl: raw.dataUrl,
      width: int(raw.width, 300, 1, 1e6),
      height: int(raw.height, 300, 1, 1e6),
      ...(link ? { link } : {}),
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
      ...groupOf(raw),
      ...layerIdOf(raw),
      ...itemFlagsOf(raw),
      ...objectStyleIdOf(raw),
      ...(typeof raw.label === 'string' && raw.label ? { label: raw.label.slice(0, 120) } : {}),
      assetId,
      x: num(raw.x, 0, -1e6, 1e6),
      y: num(raw.y, 0, -1e6, 1e6),
      w: num(raw.w, 100, MIN_FRAME_PT, MAX_PAGE_PT),
      h: num(raw.h, 100, MIN_FRAME_PT, MAX_PAGE_PT),
      fit: oneOf<ImageFit>(raw.fit, ['fill', 'fit', 'stretch'], 'fill'),
      ...zOf(raw),
      ...rotationOf(raw),
      ...opacityOf(raw),
      ...blendModeOf(raw),
      ...(typeof raw.whitePoint === 'number' && Number.isFinite(raw.whitePoint) && raw.whitePoint >= 128 && raw.whitePoint < 255 ? { whitePoint: Math.round(raw.whitePoint) } : {}),
      ...shadowOf(raw),
      ...parseFeather(raw.feather),
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
function parseColorSamples(value: unknown): ColorSample[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  return value.flatMap((raw) => {
    if (!isObj(raw) || typeof raw.id !== 'string' || !raw.id || typeof raw.color !== 'string' || !HEX.test(raw.color)) return []
    const id = raw.id.slice(0, 120)
    if (ids.has(id)) return []
    ids.add(id)
    return [{ id, color: raw.color.toUpperCase(), label: typeof raw.label === 'string' ? raw.label.slice(0, 120) : raw.color.toUpperCase() }]
  })
}
/** the settings of one object style: each is checked on its own, and what is not understood is left out */
function parseObjectStyleSettings(v: unknown): ObjectStyleSettings {
  const s = isObj(v) ? v : {}
  const out: ObjectStyleSettings = {}
  if ('fill' in s && (s.fill === null || (typeof s.fill === 'string' && HEX.test(s.fill)))) out.fill = s.fill as string | null
  if ('stroke' in s && (s.stroke === null || (typeof s.stroke === 'string' && HEX.test(s.stroke)))) out.stroke = s.stroke as string | null
  if (s.fillGradient === null) out.fillGradient = null
  else if (isObj(s.fillGradient)) {
    const gradient = parseGradient({ fillGradient: s.fillGradient }).fillGradient
    if (gradient) out.fillGradient = gradient
  }
  if (typeof s.strokeWidth === 'number' && Number.isFinite(s.strokeWidth)) out.strokeWidth = num(s.strokeWidth, 1, 0, 500)
  if (s.strokeDash === 'solid' || s.strokeDash === 'dashed') out.strokeDash = s.strokeDash
  if (s.strokeCap === 'butt' || s.strokeCap === 'round' || s.strokeCap === 'square') out.strokeCap = s.strokeCap
  if (typeof s.radius === 'number' && Number.isFinite(s.radius)) out.radius = num(s.radius, 0, 0, 5000)
  if (typeof s.opacity === 'number' && Number.isFinite(s.opacity)) out.opacity = num(s.opacity, 1, 0, 1)
  if (s.blendMode === null) out.blendMode = null
  else {
    const blend = blendModeOf({ blendMode: s.blendMode }).blendMode
    if (blend) out.blendMode = blend
  }
  if (s.shadow === null) out.shadow = null
  else if (isObj(s.shadow) && typeof s.shadow.opacity === 'number') {
    out.shadow = {
      offsetX: num(s.shadow.offsetX, 0, -500, 500),
      offsetY: num(s.shadow.offsetY, 6, -500, 500),
      color: typeof s.shadow.color === 'string' && HEX.test(s.shadow.color) ? s.shadow.color : '#000000',
      opacity: num(s.shadow.opacity, 0, 0, 1),
    }
  }
  if (s.feather === null) out.feather = null
  else if (isObj(s.feather)) {
    const feather = parseFeather(s.feather).feather
    if (feather) out.feather = feather
  }
  for (const key of ['arrowStart', 'arrowEnd'] as const) {
    if (s[key] === null) out[key] = null
    else if (cleanLineArrow(s[key])) out[key] = cleanLineArrow(s[key])!
  }
  if (s.lineWidths === null) out.lineWidths = null
  else if (cleanLineWidths(s.lineWidths)) out.lineWidths = cleanLineWidths(s.lineWidths)!
  return out
}

function parseObjectStyles(value: unknown): ObjectStyleRecord[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  return value.flatMap((raw) => {
    if (!isObj(raw) || typeof raw.id !== 'string' || !raw.id || raw.id.length > 120 || ids.has(raw.id)) return []
    ids.add(raw.id)
    const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 120) : 'סגנון אובייקט'
    const graphic = isObj(raw.graphic) && typeof raw.graphic.svg === 'string' && raw.graphic.svg.length <= 4_000_000 && /^(?:<\?xml[^>]*\?>\s*)?<svg[\s>]/.test(raw.graphic.svg)
      ? { svg: raw.graphic.svg, w: num(raw.graphic.w, 0, 0, 20000), h: num(raw.graphic.h, 0, 0, 20000) }
      : undefined
    const size = isObj(raw.size) && typeof raw.size.w === 'number' && typeof raw.size.h === 'number' && raw.size.w > 0 && raw.size.h > 0
      ? { w: num(raw.size.w, 1, 0.1, 20000), h: num(raw.size.h, 1, 0.1, 20000) }
      : undefined
    return [{ id: raw.id, name, settings: parseObjectStyleSettings(raw.settings), ...(graphic && graphic.w > 0 && graphic.h > 0 ? { graphic } : {}), ...(size ? { size } : {}) }]
  })
}

/** how an object is mixed with what is under it: only the modes this version knows are kept */
const blendModeOf = (raw: Record<string, unknown>): { blendMode?: BlendMode } =>
  raw.blendMode === 'multiply' || raw.blendMode === 'screen' ? { blendMode: raw.blendMode } : {}

/** object opacity, 0…1: only written when the object is not fully opaque */
const opacityOf = (raw: Record<string, unknown>): { opacity?: number } =>
  typeof raw.opacity === 'number' && Number.isFinite(raw.opacity) && raw.opacity < 1 ? { opacity: num(raw.opacity, 1, 0, 1) } : {}
const shadowOf = (raw: Record<string, unknown>): Pick<ImageFrame, 'shadowOffsetX' | 'shadowOffsetY' | 'shadowColor' | 'shadowOpacity'> => ({
  ...(typeof raw.shadowOffsetX === 'number' && Number.isFinite(raw.shadowOffsetX) ? { shadowOffsetX: num(raw.shadowOffsetX, 0, -100, 100) } : {}),
  ...(typeof raw.shadowOffsetY === 'number' && Number.isFinite(raw.shadowOffsetY) ? { shadowOffsetY: num(raw.shadowOffsetY, 6, -100, 100) } : typeof raw.shadowOffset === 'number' && Number.isFinite(raw.shadowOffset) ? { shadowOffsetY: num(raw.shadowOffset, 6, -100, 100) } : {}),
  ...(typeof raw.shadowColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.shadowColor) ? { shadowColor: raw.shadowColor } : {}),
  ...(typeof raw.shadowOpacity === 'number' && Number.isFinite(raw.shadowOpacity) ? { shadowOpacity: num(raw.shadowOpacity, 0, 0, 1) } : {}),
})

function parseFeather(raw: unknown): { feather?: Feather } {
  if (!isObj(raw)) return {}
  const radiusOf = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? num(value, 0, 0, 100) : 0
  if (raw.type === 'basic') {
    const radius = radiusOf(raw.radius)
    return radius > 0 ? { feather: { type: 'basic', radius } } : {}
  }
  if (raw.type === 'directional') {
    const feather = {
      type: 'directional' as const,
      top: radiusOf(raw.top),
      right: radiusOf(raw.right),
      bottom: radiusOf(raw.bottom),
      left: radiusOf(raw.left),
    }
    return feather.top || feather.right || feather.bottom || feather.left ? { feather } : {}
  }
  if (raw.type !== undefined && raw.type !== 'gradient') return {}
  const { x0, y0, x1, y1 } = raw
  const coordinates = [x0, y0, x1, y1]
  if (!coordinates.every((value) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e4)) return {}
  if (Math.hypot((x1 as number) - (x0 as number), (y1 as number) - (y0 as number)) < 1e-6 || !Array.isArray(raw.points)) return {}
  const points = raw.points
    .filter(isObj)
    .filter((point) => typeof point.offset === 'number' && Number.isFinite(point.offset) && point.offset >= 0 && point.offset <= 1 && typeof point.opacity === 'number' && Number.isFinite(point.opacity) && point.opacity >= 0 && point.opacity <= 1)
    .map((point) => ({ offset: point.offset as number, opacity: point.opacity as number }))
    .sort((a, b) => a.offset - b.offset)
    .slice(0, 8)
  if (points.length < 2) return {}
  return { feather: { type: 'gradient', x0: x0 as number, y0: y0 as number, x1: x1 as number, y1: y1 as number, points } }
}

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
      ...(typeof v.angle === 'number' ? { angle: Math.max(-360, Math.min(360, v.angle)) } : {}),
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
/** the most points one ring of a shape's outline, and the most in the whole shape, that a file may hold (a file with more is not read as that shape) */
export const MAX_RING_POINTS = 200_000
export const MAX_SHAPE_POINTS = 1_000_000

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
        .slice(0, MAX_RING_POINTS)
        .map(parseVertex)
        .filter((p): p is PathVertex => p !== undefined)
      points += pts.length
      // an open path (a pencil/pen line) needs no area: two points, even one (a dot with round caps), are a real shape
      if (pts.length >= (open ? 1 : 3)) rings.push(pts)
    }
    if (rings.length) out.push(rings)
  }
  return out.length > 0 && points <= MAX_SHAPE_POINTS ? out : undefined
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

/** the depth of a shape: numbers within range, or nothing */
function parseExtrude(v: unknown): { extrude?: ExtrudeSettings } {
  if (!isObj(v)) return {}
  const depth = typeof v.depth === 'number' && Number.isFinite(v.depth) ? v.depth : NaN
  const angle = typeof v.angle === 'number' && Number.isFinite(v.angle) ? v.angle : NaN
  if (!(depth > 0) || Number.isNaN(angle)) return {}
  const sideColor = typeof v.sideColor === 'string' && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v.sideColor) ? v.sideColor : undefined
  const frame = isObj(v.frame) && typeof v.frame.wall === 'number' && v.frame.wall > 0
    ? {
        wall: num(v.frame.wall, 20, 0.1, 2000),
        outer: num(v.frame.outer, 0, 0, 2000),
        inner: num(v.frame.inner, 0, 0, 2000),
        ...Object.fromEntries((['top', 'right', 'bottom', 'left'] as const).flatMap((side) => {
          const value = (v.frame as Record<string, unknown>)[side]
          return typeof value === 'number' && Number.isFinite(value) && value > 0 ? [[side, num(value, 20, 0.1, 2000)]] : []
        })),
      }
    : undefined
  return { extrude: { depth: Math.min(2000, depth), angle: ((angle % 360) + 360) % 360, shade: num(v.shade, 0.6, 0, 1), ...(sideColor ? { sideColor } : {}), ...(v.iso === true || v.iso === 'top' ? { iso: 'top' as const } : v.iso === 'left' || v.iso === 'right' ? { iso: v.iso } : {}), ...(frame ? { frame } : {}), ...(typeof v.lean === 'number' && Number.isFinite(v.lean) && Math.abs(v.lean) > 0.01 ? { lean: Math.max(-75, Math.min(75, v.lean)) } : {}), ...(isObj(v.view) && typeof v.view.yaw === 'number' && typeof v.view.pitch === 'number' ? { view: { yaw: num(v.view.yaw, 0, -80, 80), pitch: num(v.view.pitch, 30, 0, 80) } } : {}) } }
}

/** the blur of a shape: a number of points within range, or nothing */
function parseBlur(v: unknown): { blur?: number } {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? { blur: num(v, 0, 0, MAX_BLUR) } : {}
}

/** the most points of a brush stroke that are kept (a longer stroke is not read as one that can be drawn again) */
const MAX_STROKE_POINTS = 20000

/** what a brush stroke was drawn with: a style, a size and the points, within range, or nothing */
function parseBrushStroke(v: unknown): { brush?: BrushStroke } {
  if (!isObj(v) || typeof v.style !== 'string' || !v.style || v.style.length > 80 || !Array.isArray(v.points)) return {}
  if (v.points.length < 1 || v.points.length > MAX_STROKE_POINTS) return {}
  const points: [number, number][] = []
  for (const p of v.points) {
    if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== 'number' || typeof p[1] !== 'number' || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return {}
    points.push([Math.round(Math.max(-50, Math.min(51, p[0])) * 1e4) / 1e4, Math.round(Math.max(-50, Math.min(51, p[1])) * 1e4) / 1e4])
  }
  return { brush: { style: v.style, size: num(v.size, 10, 1, 120), sharpness: isSharpness(v.sharpness) ? v.sharpness : 'medium', points } }
}

function parseShapes(v: unknown, assets: Assets): ShapeFrame[] {
  if (!Array.isArray(v)) return []
  const out: ShapeFrame[] = []
  const used = new Set<string>()
  for (const raw of v) {
    if (!isObj(raw)) continue
    const geom = raw.kind === 'path' ? parseGeom(raw.geom, raw.closed === false) : undefined
    const table = raw.kind === 'table' ? sanitizeTable(raw.table) : null
    const wanted = oneOf<ShapeKind>(raw.kind, ['rect', 'ellipse', 'polygon', 'path', 'line', 'table'], 'rect')
    const kind: ShapeKind = (wanted === 'path' && !geom) || (wanted === 'table' && !table) ? 'rect' : wanted
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
      ...groupOf(raw),
      ...layerIdOf(raw),
      ...itemFlagsOf(raw),
      ...itemLabelOf(raw),
      ...objectStyleIdOf(raw),
      kind,
      x: num(raw.x, 0, -1e6, 1e6),
      y: num(raw.y, 0, -1e6, 1e6),
      w: num(raw.w, 100, minWH, MAX_PAGE_PT),
      h: num(raw.h, 100, minWH, MAX_PAGE_PT),
      ...(kind === 'polygon' ? { sides: int(raw.sides, 6, MIN_SIDES, MAX_SIDES) } : {}),
      ...(kind === 'path' && geom ? { geom } : {}),
      ...(kind !== 'table' && kind !== 'line' ? parseExtrude(raw.extrude) : {}),
      ...(typeof raw.extrudeOf === 'string' && raw.extrudeOf ? { extrudeOf: raw.extrudeOf.slice(0, 120) } : {}),
      ...(kind === 'table' && table ? { table } : {}),
      ...(kind === 'line' && raw.flip === true ? { flip: true as const } : {}),
      ...(kind === 'line' && raw.strokeDash === 'dashed' ? { strokeDash: 'dashed' as const } : {}),
      ...(kind === 'line' && cleanLineWidths(raw.lineWidths) ? { lineWidths: cleanLineWidths(raw.lineWidths)! } : {}),
      ...(kind === 'line' && cleanLineWidths(raw.lineWidths) && cleanLineWidthPos(raw.lineWidthPos) !== null ? { lineWidthPos: cleanLineWidthPos(raw.lineWidthPos)! } : {}),
      ...(kind === 'line' && cleanLineWidths(raw.lineWidths) && cleanLineWidthEdges(raw.lineWidthEdges) ? { lineWidthEdges: cleanLineWidthEdges(raw.lineWidthEdges)! } : {}),
      ...(kind === 'line' && cleanLineArrow(raw.arrowStart) ? { arrowStart: cleanLineArrow(raw.arrowStart)! } : {}),
      ...(kind === 'line' && cleanLineArrow(raw.arrowEnd) ? { arrowEnd: cleanLineArrow(raw.arrowEnd)! } : {}),
      ...(kind === 'line' && (raw.strokeCap === 'round' || raw.strokeCap === 'square') ? { strokeCap: raw.strokeCap as LineCap } : {}),
      ...(kind === 'path' && (raw.strokeCap === 'butt' || raw.strokeCap === 'round' || raw.strokeCap === 'square') ? { strokeCap: raw.strokeCap as LineCap } : {}),
      ...(kind === 'path' && raw.closed === false ? { closed: false as const } : {}),
      ...(kind === 'path' && raw.curveMode === 'quadratic' ? { curveMode: 'quadratic' as const } : {}),
      ...parsePathText(raw.pathText),
      ...(kind === 'rect' && r.length === 4 ? { radii: [0, 1, 2, 3].map((i) => num(r[i], 0, 0, MAX_PAGE_PT)) as [number, number, number, number] } : {}),
      ...(image ? { image } : {}),
      ...(raw.frame === true ? { frame: true as const } : {}),
      fill: kind === 'line' ? null : colorOrNull(raw.fill, kind === 'table' ? null : DEFAULT_SHAPE_FILL),
      ...(kind === 'line' ? {} : parseGradient(raw.fillGradient)),
      stroke: kind === 'table' ? null : colorOrNull(raw.stroke, DEFAULT_SHAPE_STROKE),
      strokeWidth: kind === 'table' ? 0 : num(raw.strokeWidth, 1, 0, 200),
      ...zOf(raw),
      ...(kind === 'table' ? {} : rotationOf(raw)),
      ...opacityOf(raw),
      ...blendModeOf(raw),
      ...shadowOf(raw),
      ...parseFeather(raw.feather),
      ...(kind === 'table' ? {} : parseBlur(raw.blur)),
      ...(kind === 'path' ? parseBrushStroke(raw.brush) : {}),
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
      guides: parseGuides(raw.guides, 2),
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

const NUMBER_FORMATS: NumberFormat[] = ['decimal', 'hebrew', 'roman-upper', 'roman-lower', 'latin-upper', 'latin-lower']

/** Independently-numbered runs of pages (Section Options) - one out of range, or with a startPage that no longer exists, is dropped. */
function parseSections(v: unknown, pages: number): PageSection[] {
  if (!Array.isArray(v)) return []
  const used = new Set<string>()
  const sections: PageSection[] = []
  for (const raw of v) {
    if (!isObj(raw)) continue
    const startPage = Math.round(num(raw.startPage, -1, -1, pages - 1))
    if (startPage < 0) continue
    let id = str(raw.id, '')
    if (!id || used.has(id)) id = `section-${sections.length}-${Math.random().toString(36).slice(2, 8)}`
    used.add(id)
    const format = NUMBER_FORMATS.includes(raw.format as NumberFormat) ? (raw.format as NumberFormat) : 'decimal'
    sections.push({ id, startPage, format, prefix: str(raw.prefix, '').slice(0, 40) })
  }
  return sections
}

function parseParentOverrides(
  value: unknown,
  doc: DocSettings,
  parents: ParentPage[],
  frames: TextFrame[],
  images: ImageFrame[],
  shapes: ShapeFrame[],
): ParentOverride[] {
  if (!Array.isArray(value)) return []
  const localIds = {
    frame: new Set(frames.map((frame) => frame.id)),
    image: new Set(images.map((image) => image.id)),
    shape: new Set(shapes.map((shape) => shape.id)),
  }
  const seen = new Set<string>()
  return value.flatMap((raw) => {
    if (!isObj(raw)) return []
    if (raw.kind !== 'frame' && raw.kind !== 'image' && raw.kind !== 'shape') return []
    if (typeof raw.pageIndex !== 'number' || !Number.isInteger(raw.pageIndex)) return []
    const parentId = str(raw.parentId, '')
    const sourceId = str(raw.sourceId, '')
    const localId = str(raw.localId, '')
    const kind = raw.kind
    const pageIndex = Math.min(MAX_PAGES, Math.max(0, raw.pageIndex))
    const parent = parents.find((candidate) => candidate.id === parentId)
    const sourceExists = kind === 'frame'
      ? parent?.frames.some((item) => item.id === sourceId)
      : kind === 'image'
        ? parent?.images.some((item) => item.id === sourceId)
        : parent?.shapes.some((item) => item.id === sourceId)
    const key = `${pageIndex}:${parentId}:${kind}:${sourceId}`
    if (!parent || pageIndex >= doc.pages || !sourceExists || !localIds[kind].has(localId) || seen.has(key)) return []
    seen.add(key)
    return [{ parentId, pageIndex, sourceId, localId, kind }]
  })
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
  anchorAssets = assets
  const doc = parseSettings(data.settings, name)
  const parents = parseParents(data.parents, assets)
  const paragraphStyles = parseParagraphStyles(data.paragraphStyles)
  const characterStyles = parseCharacterStyles(data.characterStyles)
  const objectStyles = parseObjectStyles(data.objectStyles)
  const frames = parseFrames(data.frames, doc.footnotes ?? DEFAULT_FOOTNOTE_CONFIG, paragraphStyles)
  const images = parseImages(data.images, assets)
  const shapes = parseShapes(data.shapes, assets)
  const scoreByLayer = new Map<string, number>()
  for (const frame of frames) scoreByLayer.set(frame.layerId ?? 'layer-1', Math.max(scoreByLayer.get(frame.layerId ?? 'layer-1') ?? -Infinity, frame.z ?? 1))
  for (const image of images) scoreByLayer.set(image.layerId ?? 'layer-1', Math.max(scoreByLayer.get(image.layerId ?? 'layer-1') ?? -Infinity, image.z ?? 0))
  for (const shape of shapes) scoreByLayer.set(shape.layerId ?? 'layer-1', Math.max(scoreByLayer.get(shape.layerId ?? 'layer-1') ?? -Infinity, shape.z ?? 1))
  if (!scoreByLayer.has('layer-1')) scoreByLayer.set('layer-1', -Infinity)
  const inferredLayerOrder = [...scoreByLayer].sort((a, b) => b[1] - a[1]).map(([id]) => id)
  const savedLayerOrder = Array.isArray(data.layerOrder)
    ? [...new Set(data.layerOrder.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 64))]
    : []
  const layerOrder = savedLayerOrder.length
    ? [...savedLayerOrder, ...inferredLayerOrder.filter((id) => !savedLayerOrder.includes(id))]
    : inferredLayerOrder
  return {
    doc,
    layerOrder,
    layers: parseLayers(data.layers, layerOrder),
    frames,
    images,
    assets,
    guides: parseGuides(data.guides, doc.pages),
    shapes,
    paragraphStyles,
    characterStyles,
    parents,
    pageParents: parsePageParents(data.pageParents, parents, doc.pages),
    sections: parseSections(data.sections, doc.pages),
    parentOverrides: parseParentOverrides(data.parentOverrides, doc, parents, frames, images, shapes),
    colorSamples: parseColorSamples(data.colorSamples),
    ...(objectStyles.length > 0 ? { objectStyles } : {}),
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
