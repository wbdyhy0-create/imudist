import { PAGE_PRESETS, toPt, type Unit } from './units'
import type { TableData } from './table'

export type Binding = 'ltr' | 'rtl'

export interface Sides {
  top: number
  bottom: number
  /** "Inside" when facing pages are on */
  left: number
  /** "Outside" when facing pages are on */
  right: number
}

export type FootnoteLayoutMode = 'vertical' | 'horizontal'
export type FootnoteRestart = 'continuous' | 'page' | 'spread'
export type FootnoteNumberStyle = 'arabic' | 'hebrew' | 'roman'
export type FootnoteMarkerFormat = 'plain' | 'dot' | 'dotBefore' | 'rightParen' | 'doubleRightParen' | 'leftParen' | 'doubleLeftParen' | 'round' | 'square'
export type FootnoteAlignment = 'right' | 'center'
export type FootnotePlacementMode = 'footnotes' | 'endnotes'
export type FootnoteDividerAlignment = 'right' | 'center' | 'left'
export type FootnoteDividerMode = 'line' | 'heading'
export type FootnoteHeadingDecoration = 'none' | 'outer' | 'both' | 'curl' | 'needle'
export const FOOTNOTE_REFERENCE_SCALE = 0.6

export interface FootnoteLayoutConfig {
  placement: FootnotePlacementMode
  mode: FootnoteLayoutMode
  columns: 1 | 2
  /** main-story reference size relative to its current run font size, 0.25–1 */
  referenceScale: number
  /** gap between a footnote's number and its text, in points */
  numberTextGap: number
  /** gap between columns in vertical footnote mode, points */
  columnGap: number
  /** available width of the footnote block relative to its text frame, 0.2–1 */
  widthScale: number
  minSpacingBetweenInline: number
  maxFootnoteHeight: number
  dividerGap: number
  dividerWidth: number
  dividerThickness: number
  dividerAlignment: FootnoteDividerAlignment
  dividerMode: FootnoteDividerMode
  dividerText: string
  dividerHeadingLines: boolean
  dividerHeadingDecoration: FootnoteHeadingDecoration
  dividerHeadingStyleId?: string
  spaceBefore: number
  startAt: number
  restart: FootnoteRestart
  markerPrefix: string
  markerSuffix: string
  numberStyle: FootnoteNumberStyle
  noteFormat: FootnoteMarkerFormat
  alignment: FootnoteAlignment
  fontFamily?: string
  paragraphStyleId?: string
}

export interface FootnoteItem {
  id: string
  anchor: number
  content: string
  runs?: Run[]
  style?: TextStyle
  paragraphStyleId?: string
}

export interface TocLevelConfig {
  sourceStyleId: string
  outputStyleId: string
  indent: number
}

export interface TocConfig {
  levels: TocLevelConfig[]
  leader: string
}

export interface TocPageReference {
  offset: number
  sourceFrameId: string
  sourceParagraphIndex: number
  sourceStyleId: string
  sourceText: string
  occurrence: number
}

export interface TocFootnoteReference {
  offset: number
  sourceNoteId: string
}

export const FOOTNOTE_MARKER = '\uE006'
export const TOC_PAGE_MARKER = '\uE010'
export const TOC_LEADER_MARKER = '\uE011'

export const DEFAULT_FOOTNOTE_CONFIG: FootnoteLayoutConfig = {
  placement: 'footnotes',
  mode: 'vertical',
  columns: 1,
  referenceScale: FOOTNOTE_REFERENCE_SCALE,
  numberTextGap: 5,
  columnGap: 10,
  widthScale: 1,
  minSpacingBetweenInline: 8,
  maxFootnoteHeight: 1000,
  dividerGap: 8,
  dividerWidth: 35,
  dividerThickness: 1,
  dividerAlignment: 'right',
  dividerMode: 'line',
  dividerText: 'הערות שוליים',
  dividerHeadingLines: true,
  dividerHeadingDecoration: 'none',
  spaceBefore: 8,
  startAt: 1,
  restart: 'continuous',
  markerPrefix: '',
  markerSuffix: '',
  numberStyle: 'arabic',
  noteFormat: 'dot',
  alignment: 'right',
  fontFamily: '',
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
  footnotes?: FootnoteLayoutConfig
  toc?: TocConfig
  /** show parent-page objects above document-page objects, matching a higher shared layer, as in professional layout tools */
  parentItemsAbovePageContent?: boolean
}

/** `justifyCenter`: justified like `justify`, except its last line is centered instead of run to the story's own side */
export type TextAlign = 'right' | 'center' | 'left' | 'justify' | 'justifyCenter'

/** The CSS for an align value: `justifyCenter` isn't a real `text-align` keyword, so it becomes `justify` plus `text-align-last`. */
export function cssTextAlign(align: TextAlign): { textAlign: 'right' | 'center' | 'left' | 'justify'; textAlignLast?: 'center' } {
  return align === 'justifyCenter' ? { textAlign: 'justify', textAlignLast: 'center' } : { textAlign: align }
}

/** Character formatting: can differ from one piece of text to the next. */
export interface CharStyle {
  fontFamily: string
  color?: string
  outlineColor?: string
  /** points; 0 or missing means no outline */
  outlineWidth?: number
  /** points; horizontal offset, negative is left */
  shadowOffsetX?: number
  /** points; vertical offset, negative is up */
  shadowOffsetY?: number
  /** legacy vertical offset, read only for older documents */
  /** points; vertical drop distance for the text shadow */
  shadowOffset?: number
  /** 0…1 */
  shadowColor?: string
  shadowOpacity?: number
  /** points */
  fontSize: number
  /** CSS weight, 100 (thin) … 900 (black) */
  weight: number
  italic: boolean
  /** letter-spacing (tracking), 1/1000 em: 0 = normal; negative tightens (typical for headlines, about -5 to -15) */
  tracking: number
  /** points; raises the text above its line (negative lowers it) without changing the line's height: small raised letters, hanging letters */
  baselineShift?: number
  /**
   * The character style (`CharacterStyleRecord`) this text was given. Its settings are written into the fields above
   * - the way a paragraph style's are - and this id is the link that lets a change of the style reach the text again.
   */
  charStyleId?: string
}

/** The settings a character style can hold; one that is missing is not set by the style, and the text keeps the look it already has. */
export type CharacterStyleSettings = Partial<Pick<CharStyle, 'fontFamily' | 'color' | 'outlineColor' | 'outlineWidth' | 'fontSize' | 'weight' | 'italic' | 'tracking' | 'baselineShift'>>

/** A named, reusable character style (Character Styles panel): a set of character settings for pieces of text inside a paragraph. */
export interface CharacterStyleRecord {
  id: string
  name: string
  patch: CharacterStyleSettings
}

/** Default character formatting of a story plus its paragraph-level settings (which apply to the whole story). */
export interface TextStyle extends CharStyle {
  /** physical alignment; Hebrew text normally sits on the right */
  align: TextAlign
  /** line spacing (leading), points; missing = automatic, `fontSize × LINE_HEIGHT` */
  leading?: number
  /** word spacing while `align` is 'justify', % of the normal space width the line may be stretched or squeezed to
   * (missing = 90–120, the usual range); ordinary (non-justified) text always keeps the normal 100% */
  wordSpacingMin?: number
  wordSpacingMax?: number
  /**
   * Paragraph spacing and indents: these belong to the whole story (like `align`/`leading`), not to an individual
   * paragraph within it — a story with several paragraphs (separated by "\n") applies one shared setting to all of
   * them, the same simplification `leading`/`wordSpacing` already make. `spaceBefore` only adds space above the
   * story's very first line (of its first frame); `spaceAfter` only adds space below its very last line (of its
   * last frame) — not between every internal paragraph break.
   */
  spaceBefore?: number
  /** missing = `DEFAULT_SPACE_AFTER`, so a new story always has some breathing room without the user setting it */
  spaceAfter?: number
  /** indent from the frame's own left/right edges (points); physical sides, not logical/RTL-relative */
  indentLeft?: number
  indentRight?: number
  /** indents only the story's first line; missing/0 = none */
  firstLineIndent?: number
  /** Not a standard feature of professional layout tools: indents ONLY the story's second line (from the right, its normal reading-start
   * side); the first line and every line from the third on stay at indentLeft/indentRight. Missing/0 = off. */
  secondLineIndent?: number
}

/** `spaceAfter` when a story doesn't set its own (~2.5mm): every new story gets some paragraph spacing for free. */
export const DEFAULT_SPACE_AFTER = 7

export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: 'Segoe UI',
  fontSize: 14,
  weight: 400,
  italic: false,
  tracking: 0,
  align: 'right',
  spaceAfter: DEFAULT_SPACE_AFTER,
}

/** Fonts with Hebrew glyphs that ship with Windows: used until the real system fonts are loaded. */
export const FONT_FAMILIES = [
  'Segoe UI', 'Arial', 'Tahoma', 'Calibri', 'Gisha', 'David', 'Miriam', 'FrankRuehl', 'Narkisim', 'Times New Roman', 'Courier New',
]

export const LINE_HEIGHT = 1.25
export const DEFAULT_SHADOW_OFFSET = 6

/** The automatic leading when none is set on the story: a whole point value, ~125% of the font size. */
export const defaultLeading = (style: { fontSize: number }): number => Math.round(style.fontSize * LINE_HEIGHT)

/**
 * The height of the `.para-gap` spacer every "\n" gets so `spaceAfter` shows up as real space between paragraphs,
 * not just once at the edges of a frame (see richtext.ts's `buildRunNodes`). `undefined` means no spacer at all,
 * so callers can tell "no gap" apart from "a gap of zero" (not that it visibly matters, but it avoids inserting a
 * pointless zero-height element into the DOM on every "\n"). This is the UNIFORM version — every paragraph gets
 * the same story-wide gap; used only by the rough autoflow estimate in placeText.ts (via `fitStoryEnd`), which
 * doesn't have per-paragraph overrides in scope. The real, authoritative layout (`flowFrames`) uses `paraGaps`
 * below instead, which can vary the gap per paragraph.
 */
export function paraLineHeightOf(style: TextStyle): number | undefined {
  const gap = style.spaceAfter ?? DEFAULT_SPACE_AFTER
  return gap > 0 ? (style.leading ?? defaultLeading(style)) + gap : undefined
}

/**
 * Extra space (points, unscaled) to add between words while a paragraph is justified, so it can lean on
 * `wordSpacingMin` / `wordSpacingMax` a little instead of only on the browser's own (unbounded) stretching. Plain
 * (non-justified) text never gets this: it always keeps the normal 100% spacing. Shared by TextFrameView.tsx (the
 * real render's CSS `word-spacing`) and textLayout.ts (the hidden measurer) — they MUST agree, or the measurer
 * wraps lines shorter/longer than the real render actually can, silently mis-measuring a frame's fit.
 */
export function wordSpacingPt(style: TextStyle): number {
  if (style.align !== 'justify' && style.align !== 'justifyCenter') return 0
  const min = style.wordSpacingMin ?? 90
  const max = style.wordSpacingMax ?? 120
  const percent = (min + max) / 2
  // a typical space is about a quarter of an em; word-spacing is an amount ADDED to it, not a multiplier
  return ((percent - 100) / 100) * 0.25 * style.fontSize
}

/**
 * The gap after the "\n" ending each paragraph of `text` (one entry per paragraph, so `paraGaps(...)[i]` is the
 * gap after paragraph `i` — the last paragraph has no entry, since there's nothing after it to gap from; its own
 * trailing space, if any, is the frame's own padding-bottom, same as the story-wide spaceAfter always was).
 * Resolves, per paragraph boundary: when only one side of the break asks for space - that paragraph's own
 * `spaceAfter` override, or else the NEXT paragraph's own `spaceBefore` override - that is the gap, so setting a
 * paragraph's spaceAfter pushes the paragraph after it away, and setting a paragraph's spaceBefore pushes it away
 * from the one before it, the two independent controls asked for. When BOTH sides ask for space (e.g. a paragraph
 * style bakes a spaceAfter into every paragraph it's applied to, and the next paragraph's own style also has a
 * spaceBefore), the two demands collapse into one gap the way professional layout tools and CSS margins both do: the LARGER of the
 * two, not whichever happens to come first - otherwise a paragraph's own spaceAfter (however it got set) would
 * permanently drown out any spaceBefore the paragraph after it is ever given. Else the story's own `spaceAfter`.
 * (Paragraph 0's own spaceBefore, if set, has nowhere "before" it to attach to within this per-"\n" mechanism —
 * same as the story-wide spaceBefore, it becomes the first frame's own padding-top instead; see frames.ts's
 * `insetBox` / TextFrameView.tsx.)
 */
export function paraGaps(style: TextStyle, frame: { paraSpaceBefore?: (number | null)[]; paraSpaceAfter?: (number | null)[] }, text: string): (number | undefined)[] {
  const count = (text.match(/\n/g) ?? []).length + 1
  const out: (number | undefined)[] = []
  for (let i = 0; i < count - 1; i++) {
    const after = frame.paraSpaceAfter?.[i]
    const before = frame.paraSpaceBefore?.[i + 1]
    const gap = after != null && before != null ? Math.max(after, before) : (after ?? before ?? (style.spaceAfter ?? DEFAULT_SPACE_AFTER))
    out.push(gap > 0 ? (style.leading ?? defaultLeading(style)) + gap : undefined)
  }
  return out
}

/** The story's own leading space: paragraph 0's own `spaceBefore` override if set, else the story-wide one. This
 *  is the first frame's padding-top (see frames.ts's `insetBox` / TextFrameView.tsx) — paragraph 0 has no
 *  paragraph before it for `paraGaps`' per-"\n" mechanism to attach a gap to. */
export function frameSpaceBefore(style: TextStyle, frame: { paraSpaceBefore?: (number | null)[] }): number {
  return frame.paraSpaceBefore?.[0] ?? style.spaceBefore ?? 0
}

/** The story's own trailing space: the LAST paragraph's own `spaceAfter` override if set, else the story-wide one.
 *  This is the last frame's padding-bottom, same reasoning as `frameSpaceBefore` but at the other end. */
export function frameSpaceAfter(style: TextStyle, frame: { paraSpaceAfter?: (number | null)[] }, text: string): number {
  const lastPara = (text.match(/\n/g) ?? []).length
  return frame.paraSpaceAfter?.[lastPara] ?? style.spaceAfter ?? DEFAULT_SPACE_AFTER
}

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
  feather?: GradientFeather
  /** the text remains in its thread as an invisible flow carrier after a marquee cut is rasterized */
  rasterized?: boolean
  /** Objects sharing this id form an editable group. */
  groupId?: string
  /** frozen flow box and visual content scale used by Alt-resize of a text frame */
  textFlowBox?: { w: number; h: number }
  textScale?: { x: number; y: number }
  runningHeaderStyleId?: string
  runningHeaderStrategy?: RunningHeaderStrategy
  paragraphStyleId?: string
  /** Imported paragraph-style ids, one entry per paragraph in the story head. */
  paragraphStyleIds?: string[]
  /** Imported paragraph-style names, parallel to paragraphStyleIds. */
  paragraphStyleNames?: string[]
  /**
   * Resolved paragraph-level overrides, parallel to paragraphStyleIds. `windowIndent` (points) is the "window in the
   * text" of טיפוגרפיה > יצירת חלון בטקסט: how far the paragraph's second line is set in under its opening word(s).
   */
  paragraphStylePatches?: (Partial<Pick<TextStyle, 'leading' | 'wordSpacingMin' | 'wordSpacingMax' | 'spaceBefore' | 'spaceAfter' | 'indentLeft' | 'indentRight' | 'firstLineIndent' | 'secondLineIndent' | 'align'>> & { windowIndent?: number; windowWords?: number })[]
  /** top-level Layers panel membership; missing means the default Layer 1 */
  layerId?: string
  x: number
  y: number
  w: number
  h: number
  text: string
  runs: Run[]
  /** footnotes belong to the head of a threaded story; each anchor is a character offset in `text` */
  footnotes?: FootnoteItem[]
  /** dynamic page references for a generated table-of-contents story */
  tocPageReferences?: TocPageReference[]
  /** copied footnote markers in a TOC story, linked to their original footnotes */
  tocFootnoteReferences?: TocFootnoteReference[]
  next: string | null
  /** stacking order (higher = in front). Missing = the default layer: text frames in front of pictures */
  z?: number
  /** turned around its own centre, clockwise degrees; missing = 0. `x`, `y`, `w`, `h` stay as if it were not turned. */
  rotation?: number
  /**
   * Per-paragraph overrides of spaceBefore/spaceAfter, one entry per paragraph (paragraphs are "\n"-separated
   * pieces of `text`; index 0 is the first paragraph), `null` = no override for that paragraph (falls back to the
   * neighbouring paragraph's override, else the story's own spaceBefore/spaceAfter — see `paraGapOf`). Only
   * meaningful on the story's head frame, like `text`/`runs`; kept in sync with edits by story.ts's
   * `spliceParaOverrides`, called wherever the story's text changes.
   */
  paraSpaceBefore?: (number | null)[]
  paraSpaceAfter?: (number | null)[]
  /**
   * "Keep lines together" (avoids a widow/orphan): the minimum number of the paragraph's own first/last lines that
   * must stay in the same frame as the rest, instead of splitting off alone into the next one - `null`/0/missing
   * means no constraint. Same shape and lifecycle as `paraSpaceBefore`/`paraSpaceAfter` (kept in sync by
   * `spliceParaOverrides`); read by textLayout.ts's `flowFrames`, which is the only thing that ever acts on it.
   */
  paraKeepFirstLines?: (number | null)[]
  paraKeepLastLines?: (number | null)[]
  /**
   * "Keep with next": 1 = the paragraph never ends a frame without the first lines of the paragraph after it - it moves on
   * to the next frame together with it (a verse or a heading is never left alone at the bottom of a page). Same shape and
   * lifecycle as `paraKeepFirstLines`; read by textLayout.ts's `flowFrames`.
   */
  paraKeepWithNext?: (number | null)[]
}

/** A named, reusable paragraph style (Paragraph Styles panel): a patch of the properties it sets, applied over `basedOnId`'s own resolved ones. */
/** The value of `TextFrame.paraKeepFirstLines` / `paraKeepLastLines` that means "all of the paragraph's lines": a paragraph set to keep its lines together never splits between frames. */
export const KEEP_ALL_LINES = 999

/** one rule of a paragraph style's nested styles: the first `count` words / characters / sentences, or everything up to the `count`th `delimiter`, get a character style */
export interface NestedStyleRule {
  /** the character style to give */
  styleId: string
  unit: 'words' | 'letters' | 'sentences' | 'delimiter'
  count: number
  /** unit 'delimiter': the character (or text) that ends the piece; missing = ':' */
  delimiter?: string
  /** whether the delimiter, or a sentence's closing mark, is part of the styled piece */
  inclusive: boolean
}

export interface ParagraphStyleRecord {
  id: string
  name: string
  /** nested styles: character styles given automatically to the opening of every paragraph in this style */
  nested?: NestedStyleRule[]
  basedOnId?: string
  /** the style a NEW paragraph gets when Enter splits one on this style; missing (or equal to this style's own id) means "the same style", the usual default in professional layout tools */
  nextStyleId?: string
  patch: Partial<Pick<TextStyle, 'fontFamily' | 'color' | 'outlineColor' | 'outlineWidth' | 'weight' | 'italic' | 'fontSize' | 'leading' | 'tracking' | 'align' | 'wordSpacingMin' | 'wordSpacingMax' | 'spaceBefore' | 'spaceAfter' | 'indentLeft' | 'indentRight' | 'firstLineIndent'>> & { tint?: number; overprintFill?: boolean; overprintStroke?: boolean; strokeWidth?: number; keepLinesTogether?: boolean; keepWithNext?: boolean }
}

/** Every document starts with these two (and keeps them if the user never adds more); part of `DocContent`, saved with the file. */
export const DEFAULT_PARAGRAPH_STYLES: ParagraphStyleRecord[] = [
  { id: 'body', name: 'גוף הטקסט', patch: { fontFamily: 'Segoe UI', fontSize: 14, leading: 17, align: 'right', tracking: 0 } },
  { id: 'heading', name: 'כותרת', basedOnId: 'body', patch: { fontSize: 24, weight: 700, leading: 30, spaceAfter: 10 } },
]

/** How a picture sits in its frame: fill = cover the frame (may crop), fit = whole picture (may leave margins), stretch = distort to the frame. */
export type ImageFit = 'fill' | 'fit' | 'stretch'

export interface GradientFill {
  type: 'linear' | 'radial'
  start: string
  end: string
  stops?: { offset: number; color: string }[]
  /** direction in degrees; 0 = left to right, 90 = bottom to top */
  angle?: number
  reverse?: boolean
}

export interface GradientFeather {
  /** Endpoints are fractions of the object's unrotated, unflipped box. */
  x0: number
  y0: number
  x1: number
  y1: number
  points: { offset: number; opacity: number }[]
}

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
  feather?: GradientFeather
  /** optional label shown in the Layers panel */
  label?: string
  groupId?: string
  /** top-level Layers panel membership; missing means the default Layer 1 */
  layerId?: string
  x: number
  y: number
  w: number
  h: number
  assetId: string
  fit: ImageFit
  opacity?: number
  shadowOffsetX?: number
  shadowOffsetY?: number
  shadowOffset?: number
  shadowColor?: string
  shadowOpacity?: number
  flipX?: boolean
  flipY?: boolean
  /** stacking order (higher = in front). Missing = the default layer: pictures behind text frames */
  z?: number
  /** text wrap (missing = none) */
  wrap?: WrapMode
  /** distance kept between the picture and wrapped text (missing = DEFAULT_WRAP_OFFSET) */
  wrapOffset?: number
  /** turned around its own centre, clockwise degrees; missing = 0. `x`, `y`, `w`, `h` stay as if it were not turned. */
  rotation?: number
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
export const DEFAULT_GUIDE_COLOR = GUIDE_COLORS[1].value
/** No document may hold more guides than this. */
export const MAX_GUIDES = 5000

/** The drawn shapes: a rectangle (with optionally rounded corners), an ellipse, a regular polygon of 3 to 6 corners, or a line. */
export type ShapeKind = 'rect' | 'ellipse' | 'polygon' | 'path' | 'line' | 'table'
/** The kinds a shape tool draws (a 'path' only comes out of combining shapes). */
export type DrawKind = 'rect' | 'ellipse' | 'polygon' | 'line'
/** A line's end cap. */
export type LineCap = 'butt' | 'round' | 'square'
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

/** A picture placed inside a shape, clipped to its outline (a graphic frame). */
export interface ShapeImage {
  assetId: string
  fit: ImageFit
  /** the picture's own position inside the shape's box, world points from the shape's own top-left corner — set once the
   * picture is moved or resized by hand; missing = centred automatically according to `fit` */
  offset?: { x: number; y: number }
  /** a uniform scale on top of the picture's natural size — set once it is resized by hand */
  scale?: number
}

/** A shape on a page. Position and size are in world points, like text frames. */
export interface ShapeFrame {
  id: string
  feather?: GradientFeather
  groupId?: string
  /** top-level Layers panel membership; missing means the default Layer 1 */
  layerId?: string
  kind: ShapeKind
  x: number
  y: number
  w: number
  h: number
  /** polygon: number of corners (MIN_SIDES … MAX_SIDES) */
  sides?: number
  /** path: the outline, relative to the box, so it scales with the shape */
  geom?: PathGeom
  /** freehand paths can remain open; ordinary paths are closed when this is missing */
  closed?: boolean
  /** Pencil paths can use midpoint quadratic smoothing when this is set. */
  curveMode?: 'quadratic'
  /** text along the outline */
  pathText?: PathText
  /** a picture placed inside the shape, clipped to its outline */
  image?: ShapeImage
  /** kind 'table': the grid; the shape's `w` is the table's width and its `h` follows from the text (see tableLayout.ts) */
  table?: TableData
  /** made with a graphic-frame tool: an empty one shows a placeholder icon, and only this kind of shape takes a placed
   * picture into itself — an ordinary shape stays a plain shape even when a picture is placed on top of it */
  frame?: true
  /** rectangle: the radius of each corner, points — top-left, top-right, bottom-right, bottom-left */
  radii?: [number, number, number, number]
  /** line: true if it runs from the box's bottom-left to its top-right corner, instead of top-left to bottom-right
   *  (the box alone can't tell these two apart, unlike every other shape, which is symmetric either way) */
  flip?: true
  /** line: dashed instead of solid */
  strokeDash?: 'dashed'
  /** line: the shape of its two ends; missing = 'butt' (a flat cut, flush with the end point) */
  strokeCap?: LineCap
  /** #rrggbb, or null for no fill */
  fill: string | null
  /** object opacity, 0…1; missing = fully opaque */
  opacity?: number
  shadowOffsetX?: number
  shadowOffsetY?: number
  shadowOffset?: number
  shadowColor?: string
  shadowOpacity?: number
  /** optional two-color fill used by the gradient tool */
  fillGradient?: GradientFill
  /** #rrggbb, or null for no line */
  stroke: string | null
  /** line thickness, points */
  strokeWidth: number
  /** stacking order (see stacking.ts) */
  z?: number
  /** turned around its own centre, clockwise degrees; missing = 0. `x`, `y`, `w`, `h` stay as if it were not turned. */
  rotation?: number
}

/**
 * A reusable page template (Pages panel's "עמודי אב"): its own small set of objects, in the same coordinate space a
 * page of `w` × `h` would use (0,0 at the page's own top-left) - not the document's shared world space, since one
 * parent can apply to pages anywhere in the document. A document page that has one applied (`DocContent.pageParents`)
 * shows every one of these objects automatically, translated onto its own position, behind its own objects and not
 * selectable - editing the parent page itself is what everyone using it then shows.
 */
export interface ParentPage {
  id: string
  /** up to ~4 characters, shown next to a document page that uses it */
  prefix: string
  name: string
  w: number
  h: number
  frames: TextFrame[]
  images: ImageFrame[]
  shapes: ShapeFrame[]
  guides?: Guide[]
}

/**
 * A private-use character standing in, inside a text frame's `text`, for "whatever page this ends up on" - typed
 * (via טיפוגרפיה > הוספת מספר עמוד אוטומטי) into a parent page's own text, same as the auto-page-number
 * special character. It flows through editing, selection and wrapping exactly like any other character (it *is*
 * one); only rendering treats it specially, replacing it with the real page's number where the parent is actually
 * applied (see numbering.ts's substituteMarker, called from pages.ts's parentShadowContent).
 */
export const PAGE_NUMBER_MARKER = ''
/** Marker for an internal numeric page number (1, 2, 3…) in a parent page. */
export const INTERNAL_PAGE_NUMBER_MARKER = ''
/** Marker for an outer letter page number (A, B, C…) in a parent page. */
export const LETTER_PAGE_NUMBER_MARKER = ''
/** Marker for an outer numeric page number. */
export const EXTERNAL_PAGE_NUMBER_MARKER = ''
/** Marker for an inner letter page number. */
export const INTERNAL_LETTER_PAGE_NUMBER_MARKER = ''
/** Marker inserted into a parent-page frame for a style-driven running header. */
export const RUNNING_HEADER_MARKER = ''
export type RunningHeaderStrategy = 'first' | 'last'

/** How a page's number is written. */
export type NumberFormat = 'decimal' | 'hebrew' | 'roman-upper' | 'roman-lower' | 'latin-upper' | 'latin-lower'

export const NUMBER_FORMAT_LABELS: Record<NumberFormat, string> = {
  decimal: '1, 2, 3…',
  hebrew: 'א, ב, ג…',
  'roman-upper': 'I, II, III…',
  'roman-lower': 'i, ii, iii…',
  'latin-upper': 'A, B, C…',
  'latin-lower': 'a, b, c…',
}

/**
 * A run of the document's pages that numbers itself independently - its own format, its own count starting back
 * at 1, an optional prefix (e.g. "נספח "). A document with none defined just numbers every page 1, 2, 3… from
 * doc.startPage, the same as before this existed.
 */
export interface PageSection {
  id: string
  /** the physical page index (0-based) where this section begins */
  startPage: number
  format: NumberFormat
  /** written immediately before the number, e.g. "נספח " - empty for none */
  prefix: string
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

export interface ColorSample {
  id: string
  color: string
  label: string
}

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
    parentItemsAbovePageContent: false,
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
