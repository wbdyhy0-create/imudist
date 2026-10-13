import type { DesignRecord } from './designs'
import { PAGE_PRESETS, toPt, type Unit } from './units'
import type { TableData } from './table'
import { getLastUsedFontFamily } from './fontPreference'
import type { DividerOrnamentImage } from './footnoteOrnaments'

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
/** the look of the lines on both sides of the footnote heading: the older five are drawn by the stylesheet, the rest by footnoteOrnaments.ts, and 'custom' is the picture the user imported */
export type FootnoteHeadingDecoration =
  | 'none' | 'outer' | 'both' | 'curl' | 'needle' | 'custom'
  | 'dots' | 'dashes' | 'double' | 'thickThin' | 'triple' | 'taper' | 'fade' | 'wave'
  | 'circleEnd' | 'starEnd' | 'leafEnd' | 'arrowEnd' | 'trioEnd' | 'scrollEnd' | 'scrollFade' | 'scrollBoth'
export const FOOTNOTE_REFERENCE_SCALE = 0.6

export interface FootnoteLayoutConfig {
  placement: FootnotePlacementMode
  mode: FootnoteLayoutMode
  columns: 1 | 2
  /** main-story reference size relative to its current run font size, 0.25–1 */
  referenceScale: number
  /** gap between a main-story footnote reference and the preceding word, in points */
  referenceGap: number
  /** vertical adjustment from the default superscript position, in points; positive moves down */
  referenceVerticalOffset: number
  /**
   * the paragraph style that sets the look of the reference numbers in the running text: font, weight, italic, colour and size.
   * What the style does not set is taken from the text before the number; a size it sets replaces the per-cent `referenceScale`.
   */
  referenceStyleId?: string
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
  /** the picture used at the ends of the lines when the decoration is 'custom' */
  dividerOrnament?: DividerOrnamentImage
  /** the size of the ornaments of the heading lines, in per cent of the size they have by default (the size of the heading's font); missing = 100 */
  dividerOrnamentScale?: number
  /** how far (points) the ornaments are raised above the place where they are level with the middle of the heading's letters; negative lowers them; missing = 0 */
  dividerOrnamentOffset?: number
  /** the space (points) between the lines or ornaments and the heading text; missing = automatic, a little under half the heading's font size */
  dividerHeadingGap?: number
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

/** The look a footnote reference number in the running text is set in, as the style chosen for it gives it; a field that is missing is not set by the style. */
export interface FootnoteReferenceLook {
  fontFamily?: string
  weight?: number
  italic?: boolean
  /** points: when set, the number has exactly this size and `referenceScale` is not used */
  fontSize?: number
  color?: string
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
/** the one character of a story that stands for an anchored object (a picture, a shape in the line): its `CharStyle.anchor` says which */
export const ANCHOR_MARKER = '\uFFFC'

export const DEFAULT_FOOTNOTE_CONFIG: FootnoteLayoutConfig = {
  placement: 'footnotes',
  mode: 'vertical',
  columns: 1,
  referenceScale: FOOTNOTE_REFERENCE_SCALE,
  referenceGap: 0,
  referenceVerticalOffset: 0,
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
  /** paragraph sequences: which paragraph style each paragraph of a story gets by its place (see `ParagraphSequence`) */
  sequences?: ParagraphSequence[]
  /** the library of designs by example: the look of an object, a text and a table kept under a name (see `DesignRecord`) */
  designs?: DesignRecord[]
  /** show parent-page objects above document-page objects, matching a higher shared layer, as in professional layout tools */
  parentItemsAbovePageContent?: boolean
}

/**
 * A paragraph sequence (רצף פסקאות): the paragraph styles of a run of paragraphs by their place in it. The first paragraphs get the
 * styles of `start` in order, the last ones those of `end`, and the ones between them go through `middle` over and over.
 */
export interface ParagraphSequence {
  id: string
  name: string
  start: string[]
  middle: string[]
  end: string[]
  /** empty paragraphs are not counted and keep their style (missing = true) */
  skipEmpty?: boolean
}

/** `justifyCenter`: justified like `justify`, except its last line is centered instead of run to the story's own side */
export type TextAlign = 'right' | 'center' | 'left' | 'justify' | 'justifyCenter'

/** The CSS for an align value: `justifyCenter` isn't a real `text-align` keyword, so it becomes `justify` plus `text-align-last`. */
export function cssTextAlign(align: TextAlign): { textAlign: 'right' | 'center' | 'left' | 'justify'; textAlignLast?: 'center' } {
  return align === 'justifyCenter' ? { textAlign: 'justify', textAlignLast: 'center' } : { textAlign: align }
}

/** Character formatting: can differ from one piece of text to the next. */
/**
 * An object that sits in the line of text as one character. It is a picture of the object (so that every place that
 * draws text can draw it the same way), and the objects themselves, to give them back when the anchor is removed.
 */
export interface AnchoredObject {
  id: string
  /** what the object looks like: a PNG as a data: URL */
  src: string
  /** its size in points, as it stands in the line */
  w: number
  h: number
  /** points the object hangs below the baseline of its line (0 = it sits on it); the bottom handles change it */
  offset?: number
  /** the objects as they were on the page (their own positions): `removeAnchor` puts them back */
  source?: { images: ImageFrame[]; shapes: ShapeFrame[] }
}

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
  /** the character style was given by hand: the nested styles of a paragraph style do not take it off or give it again */
  charStyleManual?: boolean
  /** this character is an object sitting in the line (it is `ANCHOR_MARKER`); the run holds nothing else */
  anchor?: AnchoredObject
}

/** The settings a character style can hold; one that is missing is not set by the style, and the text keeps the look it already has. */
export type CharacterStyleSettings = Partial<Pick<CharStyle, 'fontFamily' | 'color' | 'outlineColor' | 'outlineWidth' | 'fontSize' | 'weight' | 'italic' | 'tracking' | 'baselineShift'>>

/** A named, reusable character style (Character Styles panel): a set of character settings for pieces of text inside a paragraph. */
export interface CharacterStyleRecord {
  id: string
  name: string
  /** the style this one is based on: what this one does not set itself it takes from there */
  basedOnId?: string
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
  /** the wanted space between words, per cent of the normal one (100 = normal); every alignment, and a justified paragraph adds its minimum / maximum on top of it */
  wordSpacing?: number
  /**
   * Paragraph spacing and indents: these belong to the whole story (like `align`/`leading`), not to an individual
   * paragraph within it — a story with several paragraphs (separated by "\n") applies one shared setting to all of
   * them, the same simplification `leading`/`wordSpacing` already make. `spaceBefore` only adds space above the
   * story's very first line (of its first frame); `spaceAfter` only adds space below its very last line (of its
   * last frame) — not between every internal paragraph break.
   */
  spaceBefore?: number
  /** missing = `DEFAULT_SPACE_AFTER`: none, the paragraphs of a new story stand next to each other like running text until a gap is asked for */
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
export const DEFAULT_SPACE_AFTER = 0

export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: getLastUsedFontFamily(),
  fontSize: 14,
  weight: 400,
  italic: false,
  tracking: 0,
  align: 'right',
  spaceAfter: DEFAULT_SPACE_AFTER,
}

export function defaultTextStyle(): TextStyle {
  return { ...DEFAULT_TEXT_STYLE, fontFamily: getLastUsedFontFamily() }
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
 * The leading a style really has: the one set on it, else the automatic one. A leading of 0 (a field that was cleared) or less
 * means "automatic" - lines set on top of each other, the text pushed up out of its frame, is never what is wanted.
 */
export const effectiveLeading = (style: { fontSize: number; leading?: number }): number => (style.leading !== undefined && style.leading > 0 ? style.leading : defaultLeading(style))

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
  return gap > 0 ? (effectiveLeading(style)) + gap : undefined
}

/**
 * Extra space (points, unscaled) to add between words while a paragraph is justified, so it can lean on
 * `wordSpacingMin` / `wordSpacingMax` a little instead of only on the browser's own (unbounded) stretching. Plain
 * (non-justified) text never gets this: it always keeps the normal 100% spacing. Shared by TextFrameView.tsx (the
 * real render's CSS `word-spacing`) and textLayout.ts (the hidden measurer) — they MUST agree, or the measurer
 * wraps lines shorter/longer than the real render actually can, silently mis-measuring a frame's fit.
 */
export function wordSpacingPt(style: TextStyle): number {
  const justified = style.align === 'justify' || style.align === 'justifyCenter'
  // the wanted spacing of any paragraph; a justified one has the middle of its minimum and maximum on top of it
  const percent = (style.wordSpacing ?? 100) - 100 + (justified ? ((style.wordSpacingMin ?? 90) + (style.wordSpacingMax ?? 120)) / 2 - 100 : 0)
  // a typical space is about a quarter of an em; word-spacing is an amount ADDED to it, not a multiplier
  return (percent / 100) * 0.25 * style.fontSize
}

/**
 * The gap after the "\n" ending each paragraph of `text` (one entry per paragraph, so `paraGaps(...)[i]` is the
 * gap after paragraph `i` — the last paragraph has no entry, since there's nothing after it to gap from; its own
 * trailing space, if any, is the frame's own padding-bottom, same as the story-wide spaceAfter always was).
 * Per paragraph boundary the two add up: the gap is the space AFTER of the paragraph above (its own override, else the story's
 * `spaceAfter`) plus the space BEFORE of the paragraph below (its own override), so setting a paragraph's spaceAfter pushes
 * the paragraph after it away, and setting a paragraph's spaceBefore pushes that paragraph down from the one above it, each
 * independently and on top of the other, as in the layout programs. (Paragraph 0's own spaceBefore has nothing "before" it:
 * the paragraph that opens a frame sits against the frame's edge - see `frameSpaceBefore`.)
 */
export function paraGaps(style: TextStyle, frame: { paraSpaceBefore?: (number | null)[]; paraSpaceAfter?: (number | null)[] }, text: string): (number | undefined)[] {
  const count = (text.match(/\n/g) ?? []).length + 1
  const out: (number | undefined)[] = []
  for (let i = 0; i < count - 1; i++) {
    const after = frame.paraSpaceAfter?.[i] ?? style.spaceAfter ?? DEFAULT_SPACE_AFTER
    const before = frame.paraSpaceBefore?.[i + 1] ?? 0
    const gap = after + before
    out.push(gap > 0 ? (effectiveLeading(style)) + gap : undefined)
  }
  return out
}

/** The space above the story's first line (the first frame's padding-top): none. A paragraph's "space before" is a gap between it
 *  and the paragraph above it, so the one that opens a frame - or a page - sits against the frame's own edge (its margins / grid). */
export function frameSpaceBefore(_style: TextStyle, _frame: { paraSpaceBefore?: (number | null)[] }): number {
  // "space before" is a gap between two paragraphs: the paragraph that opens a frame (or a page) sits against the frame's own edge
  // (its margins / grid) and does not get it, as in the layout programs. The same holds for a paragraph that starts a later frame.
  return 0
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
 * The box a text frame's text is laid out in. A text scale draws the text bigger or smaller than it is laid out, so the layout
 * box is the frame divided by the scale: what the frame shows is exactly what the layout filled, at any size of the frame (a
 * box stored beside the scale went stale as soon as the frame was resized again, and text lay outside the frame unnoticed).
 */
export function textFlowBoxOf(frame: Pick<TextFrame, 'w' | 'h' | 'textScale'>): { w: number; h: number } {
  const scale = frame.textScale
  if (!scale) return { w: frame.w, h: frame.h }
  return { w: frame.w / (scale.x > 0 ? scale.x : 1), h: frame.h / (scale.y > 0 ? scale.y : 1) }
}

/**
 * A text frame. Position and size are in world points (see layout.ts), so frames may also sit on the pasteboard.
 * Frames can be threaded: `next` is the frame the text continues into. The whole story (`text`, `runs`) lives in
 * the first frame of the chain; the other frames only display their share of it.
 * `runs` cover `text` exactly; the style fields of the frame are the story's defaults (used for empty text
 * and as the base when a run list is missing).
 */
/**
 * How an object is mixed with what is under it (a blend mode); missing = normal, the object simply covers what is under it.
 * multiply: the colours are multiplied, the result is always darker and white disappears; screen: the opposite, black disappears.
 */
export type BlendMode = 'multiply' | 'screen'

/** the blend modes, in the order they are offered, with the names the interface gives them */
export const BLEND_MODES: { id: BlendMode; label: string }[] = [
  { id: 'multiply', label: 'כפל (Multiply)' },
  { id: 'screen', label: 'מסך (Screen)' },
]

export interface TextFrame extends TextStyle {
  id: string
  /** opacity of the text drawn in this frame, 0…1; missing = fully opaque */
  opacity?: number
  /** how the frame is mixed with what is under it; missing = normal */
  blendMode?: BlendMode
  feather?: Feather
  /** the text remains in its thread as an invisible flow carrier after a marquee cut is rasterized */
  rasterized?: boolean
  /** Objects sharing this id form an editable group. */
  groupId?: string
  /** how much bigger (or smaller) than it is laid out the text is drawn: set by resizing with Shift or Alt and by the scale fields; see textFlowBoxOf */
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
  paragraphStylePatches?: (Partial<Pick<TextStyle, 'leading' | 'wordSpacingMin' | 'wordSpacingMax' | 'wordSpacing' | 'spaceBefore' | 'spaceAfter' | 'indentLeft' | 'indentRight' | 'firstLineIndent' | 'secondLineIndent' | 'align'>> & { windowIndent?: number; windowWords?: number; listKind?: 'bullet' | 'number'; listGap?: number } & ParagraphBox)[]
  /** top-level Layers panel membership; missing means the default Layer 1 */
  layerId?: string
  /** hidden in the Layers panel: not drawn, and not exported (its text still takes its place in the story) */
  hidden?: true
  /** locked in the Layers panel: cannot be selected or changed */
  locked?: true
  /** the name the Layers panel shows instead of the first words of the text */
  label?: string
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

/** what a style layer looks for in a paragraph: a script (language family), numbers, every character, or a pattern of the user's own */
export type StyleLayerWhen = 'latin' | 'hebrew' | 'arabic' | 'cyrillic' | 'greek' | 'digits' | 'all' | 'custom'

/**
 * One rule of a paragraph style's style layers (שכבות סגנון): whatever in the paragraph is of the kind `when` (Latin letters inside
 * Hebrew text, say) is given the character style `styleId` ON TOP of what it has - the settings the style names win, the rest stays.
 * It is worked out when the text is laid out and drawn, never written into the text, so it follows every edit and never collides
 * with the character styles the text has itself.
 */
export interface StyleLayerRule {
  /** the character style to give */
  styleId: string
  when: StyleLayerWhen
  /** when 'custom': a regular expression */
  pattern?: string
  /** only the part that already has this character style is given the new one ("what is bold also gets...") */
  onlyWithStyleId?: string
}

/** a paragraph's own box: a fill behind it and/or a line around it (the line exists only when borderWidth is above 0; its colour defaults to black) */
export interface ParagraphBox {
  background?: string
  borderColor?: string
  /** points */
  borderWidth?: number
  /** a decoration above or below the paragraph: in a paragraph style it is the setting, in the patches a text is drawn with it comes with its look */
  decoration?: ParagraphDecoration
}

/**
 * A decoration (עיטור) of a paragraph style: a bar, a rule or a line with arrow heads, drawn above or below every
 * paragraph in the style, in the look of an object style (the Object Styles panel). What a paragraph style saves is the
 * object style and the measures; the look itself is read from the object style when the text is drawn (`look`, never saved).
 */
export interface ParagraphDecoration {
  /** the object style (ObjectStyleRecord) it is drawn in */
  objectStyleId: string
  /** above or below the paragraph, or behind it: stretched over the box of its text, so each heading has its own size */
  position: 'above' | 'below' | 'behind'
  /** points: how thick a bar is (a line has the thickness of its own stroke and arrow heads) */
  height: number
  /** points: the room between the decoration and the text */
  gap: number
  /** points: how long it is; 0 = as wide as the column */
  length: number
  align: 'start' | 'center' | 'end'
  look?: ObjectStyleSettings
  /** the drawing of the object style, when it has one: it is what is drawn, `length` wide */
  graphic?: ObjectStyleGraphic
  /** the size of the object the object style was made from (see ObjectStyleRecord.size) */
  refSize?: { w: number; h: number }
}

export interface ParagraphStyleRecord {
  id: string
  name: string
  /** nested styles: character styles given automatically to the opening of every paragraph in this style */
  nested?: NestedStyleRule[]
  /** style layers: character styles given, on top, to what is of a kind in the paragraph (a style based on this one has them too, unless it has its own) */
  layers?: StyleLayerRule[]
  basedOnId?: string
  /** the style a NEW paragraph gets when Enter splits one on this style; missing (or equal to this style's own id) means "the same style", the usual default in professional layout tools */
  nextStyleId?: string
  patch: Partial<Pick<TextStyle, 'fontFamily' | 'color' | 'outlineColor' | 'outlineWidth' | 'weight' | 'italic' | 'fontSize' | 'leading' | 'tracking' | 'align' | 'wordSpacingMin' | 'wordSpacingMax' | 'wordSpacing' | 'spaceBefore' | 'spaceAfter' | 'indentLeft' | 'indentRight' | 'firstLineIndent'>> & { tint?: number; overprintFill?: boolean; overprintStroke?: boolean; strokeWidth?: number; keepLinesTogether?: boolean; keepWithNext?: boolean; listKind?: 'bullet' | 'number'; listGap?: number } & ParagraphBox
}

/** The only paragraph style every new document starts with; part of `DocContent`, saved with the file. */
export const DEFAULT_PARAGRAPH_STYLES: ParagraphStyleRecord[] = [
  { id: 'body', name: 'גוף הטקסט', patch: { fontFamily: getLastUsedFontFamily(), fontSize: 14, leading: 17, align: 'right', tracking: 0 } },
]

export function defaultParagraphStyles(): ParagraphStyleRecord[] {
  return DEFAULT_PARAGRAPH_STYLES.map((style) =>
    style.id === 'body'
      ? { ...style, patch: { ...style.patch, fontFamily: getLastUsedFontFamily() } }
      : style,
  )
}

/** How a picture sits in its frame: fit shows the whole picture; fill/stretch fill the frame (ordinary images cover-crop, graphic frames stretch). */
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
  type?: 'gradient'
  /** Endpoints are fractions of the object's unrotated, unflipped box. */
  x0: number
  y0: number
  x1: number
  y1: number
  points: { offset: number; opacity: number }[]
}

export interface BasicFeather {
  type: 'basic'
  /** Fade distance from every edge, in points. */
  radius: number
}

export interface DirectionalFeather {
  type: 'directional'
  /** Per-edge fade distances, in points. */
  top: number
  right: number
  bottom: number
  left: number
}

export type Feather = GradientFeather | BasicFeather | DirectionalFeather

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
  /** the object style (ObjectStyleRecord) this picture follows */
  objectStyleId?: string
  feather?: Feather
  /** optional label shown in the Layers panel */
  label?: string
  groupId?: string
  /** top-level Layers panel membership; missing means the default Layer 1 */
  layerId?: string
  hidden?: true
  locked?: true
  x: number
  y: number
  w: number
  h: number
  assetId: string
  fit: ImageFit
  opacity?: number
  /** how the picture is mixed with what is under it; missing = normal */
  blendMode?: BlendMode
  /** with "multiply": the level (128-254) taken as white, so that the not quite white paper of a logo disappears; missing = the picture as it is */
  whitePoint?: number
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

/**
 * What an object style can set on a picture or a shape. A key that is missing is left as the object has it; a key that is
 * there is set on every object that has the style, and followed when the style changes.
 */
export interface ObjectStyleSettings {
  /** #rrggbb, or null for no fill */
  fill?: string | null
  /** a gradient fill; null = none (the solid fill shows) */
  fillGradient?: GradientFill | null
  /** #rrggbb, or null for no line */
  stroke?: string | null
  strokeWidth?: number
  strokeDash?: 'solid' | 'dashed'
  strokeCap?: LineCap
  /** the radius of the four corners of a rectangle, points */
  radius?: number
  /** 0…1 */
  opacity?: number
  /** how it is mixed with what is under it; null = normal */
  blendMode?: BlendMode | null
  /** a drop shadow; null = none */
  shadow?: { offsetX: number; offsetY: number; color: string; opacity: number } | null
  /** soft edges, or a fade along the object (an opacity gradient); null = none */
  feather?: Feather | null
  /** a line's arrow heads and the way its thickness changes along it; null = none */
  arrowStart?: LineArrow | null
  arrowEnd?: LineArrow | null
  lineWidths?: [number, number, number] | null
}

/**
 * The drawing of the objects an object style was made from (an ornament, a picture, several shapes): an SVG, one unit a point.
 * A decoration in this style is that drawing.
 */
export interface ObjectStyleGraphic {
  svg: string
  /** its size in points */
  w: number
  h: number
}

/** A named look for objects (סגנון אובייקט): the Object Styles panel. */
export interface ObjectStyleRecord {
  id: string
  name: string
  settings: ObjectStyleSettings
  /** the drawing the style was made from, for the decoration of a paragraph style (missing for a style made from one line, which is drawn from its settings) */
  graphic?: ObjectStyleGraphic
  /** the size (points) of the object the style was made from: what an edge feather of the style is measured against when it is drawn at another size */
  size?: { w: number; h: number }
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
/** the head put on an end of a line */
export type LineArrow = 'triangle' | 'stealth' | 'diamond' | 'circle' | 'square'

/** how sharp a free-drawn line or a brush stroke is (see sharpness.ts) */
export type Sharpness = 'sharp' | 'medium' | 'soft'

/** What a stroke of the brush tool was drawn with, kept on its shape so that it can be drawn again in another style. */
export interface BrushStroke {
  /** a brush of the program, or an imported one (`custom:…`) */
  style: string
  /** points */
  size: number
  sharpness: Sharpness
  /** where the pointer went, as 0…1 of the box the stroke had when it was made (they move and scale with the shape) */
  points: [number, number][]
}
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
/** How a shape is drawn out into a solid (see extrude.ts): its sides are the shapes that have `extrudeOf` = the shape's id. */
export interface ExtrudeSettings {
  /** points: how far back the solid goes */
  depth: number
  /** degrees, counter-clockwise from the right as it looks on the page: the way the back lies from the front */
  angle: number
  /** the colour the sides are shaded from; missing = the front's colour, darker */
  sideColor?: string
  /** 0…1: how much the sides differ from each other by the way they face the light */
  shade: number
  /**
   * the shape's outline was turned into a plane of an isometric solid: `top` lies flat and the depth goes straight down, `left` and
   * `right` stand up (facing to the left, or to the right) and the depth goes back up and to the right, or up and to the left
   */
  iso?: 'top' | 'left' | 'right'
  /**
   * the front is a frame: a rectangle (the shape's box) with a rectangular hole that is `wall` points in from every side, the corners
   * of the outside rounded by `outer` points and those of the hole by `inner`. The outline is made from these when they are applied.
   */
  frame?: { wall: number; outer: number; inner: number; top?: number; right?: number; bottom?: number; left?: number }
  // (`top`, `right`, `bottom`, `left`: the thickness of one side of the frame when it is not `wall`)
  /**
   * degrees: how much the front's outline is leaned (its horizontal lines slope down to the right by this angle, up to the right for
   * a negative one) - 0 or missing is a front that stands straight on the page, with a flat bottom edge
   */
  lean?: number
  /**
   * the solid is a real box seen from a point of view (degrees): `yaw` turns it about its upright axis (positive: the right side
   * goes back), `pitch` is how far above it is looked at (0 level, up to 80). The front's outline is the flat one drawn on that
   * view and the depth goes back in the direction that follows; `lean`, `iso` and `angle` do not apply while this is set.
   */
  view?: { yaw: number; pitch: number }
}

export interface ShapeFrame {
  id: string
  /** the object style (ObjectStyleRecord) this shape follows */
  objectStyleId?: string
  feather?: Feather
  groupId?: string
  /** this shape has depth: what its sides were made from (they are kept up to date by "3D" in the Object menu) */
  extrude?: ExtrudeSettings
  /** this shape is a side of the solid whose front is the shape with this id */
  extrudeOf?: string
  /** top-level Layers panel membership; missing means the default Layer 1 */
  layerId?: string
  hidden?: true
  locked?: true
  label?: string
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
  /** line: its thickness along its length - at the start, the middle and the end, each a multiple of `strokeWidth` (missing = even); see lineProfile.ts */
  lineWidths?: [number, number, number]
  /** line: where along it (0…1 from its start) the middle of lineWidths sits; missing = the centre (0.5) */
  lineWidthPos?: number
  /** line: how far from each end (0…0.4 of its length) the thickness of that end starts to change; missing = a smooth curve from the end */
  lineWidthEdges?: [number, number]
  /** line: a head on its start / on its end */
  arrowStart?: LineArrow
  arrowEnd?: LineArrow
  /** line: the shape of its two ends; missing = 'butt' (a flat cut, flush with the end point) */
  strokeCap?: LineCap
  /** #rrggbb, or null for no fill */
  fill: string | null
  /** object opacity, 0…1; missing = fully opaque */
  opacity?: number
  /** how the shape is mixed with what is under it; missing = normal */
  blendMode?: BlendMode
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
  /** Gaussian blur of the whole shape, points (its standard deviation); missing = sharp */
  blur?: number
  /** a stroke of the brush tool: what it was drawn with (see BrushStroke) */
  brush?: BrushStroke
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
/**
 * What the Layers panel shows of a layer besides its place in the stack (`layerOrder`): its name and colour, and whether it is
 * hidden (not drawn, not exported) or locked (its objects cannot be selected or changed). A layer with no entry is shown with
 * the defaults of `layerViewsOf` (layers.ts).
 */
export interface LayerInfo {
  name?: string
  color?: string
  hidden?: true
  locked?: true
}

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

/** Where a linked picture lives: the document keeps this path and a small preview instead of the whole file. */
export interface AssetLink {
  /** absolute path of the original file */
  path: string
  /** the file's size and modification time (ms) when it was last read, to notice a change on disk */
  size: number
  mtime: number
  /** a small picture (data: URL) saved in the document, shown when the original can't be found */
  preview: string
}

/** The data of an imported picture. Several frames can show the same asset. */
export interface Asset {
  /** the file's name, for the user */
  name: string
  mime: string
  /** the whole file as a data: URL, so it travels inside the .imudist file. A linked picture's is a temporary blob: URL instead (never saved) */
  dataUrl: string
  /** size in pixels */
  width: number
  height: number
  /** set for a picture that is linked to its file instead of embedded */
  link?: AssetLink
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
