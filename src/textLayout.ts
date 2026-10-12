import {
  cssTextAlign,
  effectiveLeading,
  DEFAULT_FOOTNOTE_CONFIG,
  frameSpaceAfter,
  frameSpaceBefore,
  LINE_HEIGHT,
  paraGaps as paraGapsOf,
  paraLineHeightOf,
  textFlowBoxOf,
  wordSpacingPt,
  type ImageFrame,
  type FootnoteLayoutConfig,
  type FootnoteItem,
  type ParagraphStyleRecord,
  type Run,
  type TextFrame,
  type TextStyle,
} from './document'
import { chainOf, insetBox, styleOf } from './frames'
import { buildParagraphNodes, buildRunNodes, buildWrapFloats, type ParagraphPatch, type RunNodeOpts } from './richtext'
import { openingRange } from './windowText'
import { firstLineLift } from './firstLine'
import { atParaStart, normalizeRuns, paraIndexAt, sliceRuns } from './story'
import { floatsFor, floatsKey, type WrapFloat } from './wrap'
import { footnoteBlockWidth, footnoteDividerHeight, footnoteLabelParts, footnoteReferenceLook, footnoteTextStyle, formatFootnoteNumber, layoutFootnotes, type FootnotePlacement, type FootnoteLayoutItem } from './footnoteLayout'

/** What one frame shows of its story. */
export interface FrameFlow {
  headId: string
  prevId: string | null
  /** default style + alignment of the whole story (taken from its first frame) */
  style: TextStyle
  story: string
  /** [start, end) of this frame's share of `story`; the shares of a chain are contiguous */
  start: number
  end: number
  slice: string
  /** style runs of the slice (they cover exactly `slice`) */
  runs: Run[]
  /** true on the last frame of a story when some text does not fit anywhere */
  overflow: boolean
  /** the gap after each "\n" of the WHOLE story (document.ts's `paraGaps`); `startParaIndex` is where `slice` begins in it */
  paraGaps: (number | undefined)[]
  startParaIndex: number
  /** true when `slice`'s first character is itself the first character of a paragraph (the story's own start, or
   *  right after a "\n") — as opposed to a wrapped continuation of the previous frame's last (unfinished) paragraph */
  atParaStart: boolean
  /** resolved space above the story's first line / below its last (document.ts's frameSpaceBefore/frameSpaceAfter);
   *  the same for every frame of the chain — TextFrameView only actually applies whichever one is itself first/last */
  spaceBeforeFirst: number
  spaceAfterLast: number
  /** how far this frame's first line is moved down so that its letters are inside the frame (a leading tighter than the letters would put them above it); 0 for the frames of a thread */
  firstLineLift: number
  footnotes: FootnotePlacement[]
  footnoteReferences: { id: string; anchor: number; referenceNumber: number | string }[]
  footnoteHeight: number
  footnoteOverflowItems: FootnoteLayoutItem[]
  footnoteAreaX?: number
  footnoteAreaWidth?: number
}

export interface SharedFootnotePageGroup {
  frameIds: string[]
  x: number
  width: number
}

export function mergeSharedPageFootnotes(
  flows: Map<string, FrameFlow>,
  frames: TextFrame[],
  groups: SharedFootnotePageGroup[],
  config: FootnoteLayoutConfig,
  paragraphStyles: ParagraphStyleRecord[],
): Map<string, FrameFlow> {
  const merged = new Map(flows)
  const frameById = new Map(frames.map((frame) => [frame.id, frame]))
  const dividerHeight = footnoteDividerHeight(config, paragraphStyles)
  const baseY = config.dividerGap + config.spaceBefore + dividerHeight
  for (const group of groups) {
    const pageFlows = group.frameIds.map((id) => flows.get(id))
    if (pageFlows.some((flow) => !flow) || new Set(pageFlows.map((flow) => flow!.headId)).size !== 1) continue
    const hostId = group.frameIds[0]
    const host = frameById.get(hostId)
    if (!host) continue
    const notes = group.frameIds.flatMap((id) => flows.get(id)?.footnotes ?? [])
    if (!notes.length) continue
    let cursorX = 0
    let rowY = 0
    let rowHeight = 0
    let rowHasItems = false
    let usedHeight = 0
    const placements: FootnotePlacement[] = []
    for (const note of notes) {
      const width = Math.min(group.width, note.naturalWidth ?? note.width)
      let x = cursorX
      if (rowHasItems) {
        x += config.minSpacingBetweenInline
        if (x + width > group.width) {
          rowY += rowHeight
          x = 0
          rowHeight = 0
          rowHasItems = false
        }
      }
      placements.push({ ...note, x, y: baseY + rowY, width })
      cursorX = x + width
      rowHeight = Math.max(rowHeight, note.height)
      rowHasItems = true
      usedHeight = Math.max(usedHeight, rowY + rowHeight)
    }
    if (config.alignment === 'center') {
      const rows = new Map<number, FootnotePlacement[]>()
      for (const placement of placements) rows.set(placement.y, [...(rows.get(placement.y) ?? []), placement])
      for (const row of rows.values()) {
        const left = Math.min(...row.map((placement) => placement.x))
        const right = Math.max(...row.map((placement) => placement.x + placement.width))
        const shift = Math.max(0, (group.width - (right - left)) / 2)
        for (const placement of row) placement.x += shift
      }
    }
    const reservedHeight = Math.max(baseY + usedHeight, ...pageFlows.map((flow) => flow!.footnoteHeight))
    for (const id of group.frameIds) {
      const flow = flows.get(id)!
      merged.set(id, {
        ...flow,
        footnotes: id === hostId ? placements : [],
        footnoteHeight: reservedHeight,
        footnoteAreaX: id === hostId ? group.x - host.x : undefined,
        footnoteAreaWidth: id === hostId ? group.width : undefined,
      })
    }
  }
  return merged
}

let measurer: HTMLDivElement | null = null

/**
 * A hidden element laid out exactly like a frame's text, used to find how much text fits. The text goes into a plain
 * block inside it: the outer element (absolutely positioned) would grow to contain wrap floats, the inner one only
 * ends where the last line ends.
 */
function getMeasurer(): HTMLDivElement {
  if (!measurer) {
    const m = document.createElement('div')
    m.dir = 'rtl'
    m.setAttribute('aria-hidden', 'true')
    Object.assign(m.style, {
      position: 'absolute',
      left: '-100000px',
      top: '0',
      visibility: 'hidden',
      pointerEvents: 'none',
      boxSizing: 'border-box',
      margin: '0',
      padding: '0',
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere',
      // matches .rich-editor / .text-frame-body: base direction is always RTL (dir='rtl' above), not guessed per-text
      textRendering: 'geometricPrecision',
    })
    m.appendChild(document.createElement('div'))
    document.body.appendChild(m)
    measurer = m
  }
  return measurer
}

function configure(m: HTMLDivElement, style: TextStyle) {
  m.style.fontFamily = `"${style.fontFamily}", "Segoe UI", Arial, sans-serif`
  m.style.fontSize = `${style.fontSize}px`
  m.style.lineHeight = `${effectiveLeading(style)}px`
  // must match TextFrameView.tsx's real render exactly: word-spacing changes where lines wrap, not just how they
  // look, so a justified paragraph whose extra spacing this measurer ignored would wrap shorter than it truly can,
  // under-reporting height and letting text quietly overflow the frame it was "measured" to fit
  m.style.wordSpacing = wordSpacingPt(style) ? `${wordSpacingPt(style)}px` : ''
}

const isSpace = (c: string) => /\s/.test(c)

/** Rough number of characters a box holds (an average glyph is about half an em wide). */
const capacityOf = (box: { w: number; h: number }, fontSize: number) =>
  Math.max(8, Math.floor((box.w * box.h) / (fontSize * fontSize * 0.55 * LINE_HEIGHT)))

/** The text nodes of a rendered slice with where each begins, so a character's box can be asked for by its index. */
interface TextIndex {
  nodes: { node: Text; from: number }[]
  total: number
}

function indexText(root: HTMLElement): TextIndex {
  const nodes: { node: Text; from: number }[] = []
  let total = 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    nodes.push({ node, from: total })
    total += node.data.length
  }
  return { nodes, total }
}

/** The box of the character at `index` - null where it has none (a paragraph break, a collapsed space). */
function charBox(text: TextIndex, index: number): { rect: DOMRect; element: Element | null } | null {
  let lo = 0
  let hi = text.nodes.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (text.nodes[mid].from <= index) lo = mid
    else hi = mid - 1
  }
  const entry = text.nodes[lo]
  if (!entry || index - entry.from >= entry.node.data.length) return null
  const range = document.createRange()
  range.setStart(entry.node, index - entry.from)
  range.setEnd(entry.node, index - entry.from + 1)
  for (const rect of range.getClientRects()) if (rect.width > 0 && rect.height > 0) return { rect, element: entry.node.parentElement }
  return null
}

/** The first character at or after `index` (within a short distance) that has a box. */
function nextCharBox(text: TextIndex, index: number): { index: number; rect: DOMRect; element: Element | null } | null {
  for (let i = index; i < Math.min(text.total, index + 64); i++) {
    const box = charBox(text, i)
    if (box) return { index: i, ...box }
  }
  return null
}

/** Where the line box of a character ends, from its glyph box and the line height it is set in (the glyph box is not the line box). */
function lineBottomOf(box: { rect: DOMRect; element: Element | null }): number {
  const lineHeight = box.element ? parseFloat(getComputedStyle(box.element).lineHeight) : NaN
  return box.rect.top + (box.rect.height + (Number.isFinite(lineHeight) ? lineHeight : box.rect.height)) / 2
}

/**
 * The index (in `text`) of the first character on the line that the character at `index` is on, found from where the
 * characters sit on screen: the line's characters share one top. A paragraph break right before it is not part of it.
 */
function lineFirstChar(text: TextIndex, index: number): number | null {
  // the character itself, or else the closest one before it that has a box (a space or a break at the end of its line)
  let here: { index: number; rect: DOMRect } | null = null
  for (let i = Math.min(index, text.total - 1); i >= Math.max(0, index - 64); i--) {
    const box = charBox(text, i)
    if (box) {
      here = { index: i, rect: box.rect }
      break
    }
  }
  if (!here) return null
  let first = here.index
  for (let i = here.index - 1; i >= 0; i--) {
    const box = charBox(text, i)
    if (!box) continue
    if (Math.abs(box.rect.top - here.rect.top) > 1) break
    first = i
  }
  return first
}

/**
 * End index of the largest part of `story` starting at `start` that fits into the box.
 * `hint` is a guess for how many characters fit (e.g. from the last layout). The search starts there and widens,
 * so only text about the size of one frame is ever laid out — not the rest of a long story.
 */
function fitEnd(
  m: HTMLDivElement,
  story: string,
  runs: Run[],
  start: number,
  box: { w: number; h: number },
  fontSize: number,
  floats: WrapFloat[],
  hint?: number,
  paraOpts?: Pick<RunNodeOpts, 'paraLineHeight' | 'paraGaps' | 'startParaIndex' | 'firstLineIndent' | 'atParaStart' | 'footnoteMarkers' | 'footnoteReferenceScale' | 'footnoteReferenceGap' | 'footnoteReferenceVerticalOffset' | 'footnoteReferenceLook'>,
  /** per-paragraph layout (a paragraph style's leading / indents / alignment): measured the way TextFrameView draws it */
  patches?: ParagraphPatch[],
  /** the frame is the last of its thread: a line has no next frame to go to, so it is shown when it fits to the frame's edge */
  lastFrame = false,
): number {
  const len = story.length
  if (start >= len) return len
  m.style.width = `${box.w}px`
  const inner = m.firstElementChild as HTMLElement
  // Leave a small line-box tolerance: the live renderer includes paragraph blocks and font metrics
  // that can be a fraction taller than the hidden measurer. A borderline line must flow whole into
  // the next frame instead of being clipped at the bottom edge. In the last frame there is no next frame: a line that fits
  // is shown (at worst a sliver of it is clipped) instead of being hidden with free room left under it.
  const safety = lastFrame ? 1 : Math.min(Math.max(1, fontSize * 0.15), Math.max(1, box.h / 6))
  const fits = (end: number) => {
    inner.replaceChildren(...buildWrapFloats(floats, 1), buildParagraphNodes(story.slice(start, end), sliceRuns(runs, start, end), 1, paraOpts, patches))
    return inner.getBoundingClientRect().height <= box.h - safety
  }

  let lo = start // fits (empty)
  let hi = len + 1 // known not to fit (nothing beyond the end can)
  const probe = (end: number) => {
    const ok = fits(end)
    if (ok) lo = end
    else hi = end
    return ok
  }

  const guess = Math.min(len, start + Math.max(1, hint ?? Math.round(capacityOf(box, fontSize) * 1.05)))

  /**
   * A guess for the answer from ONE render of somewhat more text than should fit: the answer is where the first line that
   * does not fit begins, and every character's place on screen says which line that is. Only a guess - the exact check below
   * (the same `fits` the search uses) decides - so anything unusual (the rendered text not matching the slice, a character
   * without a box where one is needed) just gives up and leaves the search to do it the long way.
   */
  const candidate = (): number | null => {
    const limit = box.h - safety
    let upTo = Math.min(len, start + Math.max(16, Math.round((guess - start) * 1.2)))
    for (let attempt = 0; attempt < 5; attempt++) {
      inner.replaceChildren(...buildWrapFloats(floats, 1), buildParagraphNodes(story.slice(start, upTo), sliceRuns(runs, start, upTo), 1, paraOpts, patches))
      const bounds = inner.getBoundingClientRect()
      if (bounds.height <= limit) {
        // all of this fits: either it is the end of the story, or more has to be shown
        if (upTo >= len) return len
        upTo = Math.min(len, start + Math.round((upTo - start) * 1.6) + 16)
        continue
      }
      const text = indexText(inner)
      if (text.total !== upTo - start) return null
      // the first character whose line ends below the limit
      let low = 0
      let high = text.total - 1
      let found: number | null = null
      while (low <= high) {
        const mid = (low + high) >> 1
        const charAt = nextCharBox(text, mid)
        if (!charAt) {
          // nothing with a box from here on to the end of the slice: look earlier
          high = mid - 1
          continue
        }
        if (lineBottomOf(charAt) - bounds.top > limit) {
          found = charAt.index
          high = mid - 1
        } else low = charAt.index + 1
      }
      if (found === null) return null
      const first = lineFirstChar(text, found)
      return first === null ? null : start + first
    }
    return null
  }

  const seed = candidate()
  if (seed !== null) {
    if (seed >= len) return len
    // the exact check: the largest end that fits is the one where the next character does not
    if (seed <= start || probe(seed)) probe(Math.max(seed, start) + 1)
    else hi = seed
  }
  if (hi > len) {
    // no upper bound yet: widen from what fits (or from the guess) until something does not
    let step = Math.max(8, seed !== null ? 48 : guess - start)
    let next = seed !== null && lo > start ? Math.min(len, lo + step) : guess
    while (lo < len) {
      if (!probe(next)) break
      step *= 2
      next = Math.min(len, lo + step)
    }
    if (lo >= len) return len
  }
  while (hi - lo > 1) probe((lo + hi) >> 1)

  let end = lo
  if (end > start) {
    if (isSpace(story[end])) {
      // a space or paragraph break right past the fitting boundary: leave it for the next frame rather than absorbing
      // it here. `fits(end+1)` already tested false for this exact boundary (that's how the search above ended), so
      // adding it WOULD make the content taller: a space when the fitting line ends exactly at the box edge, and a
      // "\n" when it is an empty paragraph (a line of its own) - forcing either in pushed content past the frame's own
      // height, where the PDF export (which clips at the frame's edge) cut it off. (A "\n" that ends a paragraph of
      // text adds no height, so it never ends the search here: it simply fits.)
    } else if (!isSpace(story[end - 1])) {
      // avoid splitting a word: go back to the last space, unless the word is longer than the whole part
      for (let k = end - 1; k > start; k--) {
        if (isSpace(story[k])) {
          end = k + 1
          break
        }
      }
    }
  }
  return end
}

/**
 * How many visual lines `text` wraps into at the measurer's current width/style - by asking the browser (a Range
 * spanning everything rendered reports one client rect per line it covers), the same way this file already trusts
 * the browser for height in `fitEnd`, instead of a hand-rolled line-breaker.
 */
function countWrappedLines(m: HTMLDivElement, text: string, runs: Run[], paraOpts?: Pick<RunNodeOpts, 'paraLineHeight' | 'paraGaps' | 'startParaIndex' | 'firstLineIndent' | 'atParaStart' | 'footnoteMarkers' | 'footnoteReferenceScale' | 'footnoteReferenceGap' | 'footnoteReferenceVerticalOffset' | 'footnoteReferenceLook'>, patches?: ParagraphPatch[], floats: WrapFloat[] = []): number {
  if (!text) return 0
  const inner = m.firstElementChild as HTMLElement
  inner.replaceChildren(...buildWrapFloats(floats, 1), buildParagraphNodes(text, runs, 1, paraOpts, patches))
  const range = document.createRange()
  range.selectNodeContents(inner)
  const tops = [...range.getClientRects()].map((rect) => rect.top).sort((a, b) => a - b)
  let lines = 0
  let previousTop = Number.NEGATIVE_INFINITY
  for (const top of tops) {
    if (top - previousTop > 1) {
      lines++
      previousTop = top
    }
  }
  return Math.max(1, lines)
}

function lineStartAtOffset(
  m: HTMLDivElement,
  story: string,
  runs: Run[],
  start: number,
  end: number,
  offset: number,
  paraOpts: Pick<RunNodeOpts, 'paraLineHeight' | 'paraGaps' | 'startParaIndex' | 'firstLineIndent' | 'atParaStart' | 'footnoteMarkers' | 'footnoteReferenceScale' | 'footnoteReferenceGap' | 'footnoteReferenceVerticalOffset' | 'footnoteReferenceLook'>,
  patches?: ParagraphPatch[],
  floats: WrapFloat[] = [],
): number {
  const prefixEnd = Math.min(end, offset + 1)
  const prefix = story.slice(start, prefixEnd)
  const prefixRuns = sliceRuns(runs, start, prefixEnd)
  // the character the line holds, and where that line begins, from where the characters sit on one render of the text
  let lineStart: number
  const inner = m.firstElementChild as HTMLElement
  inner.replaceChildren(...buildWrapFloats(floats, 1), buildParagraphNodes(prefix, prefixRuns, 1, paraOpts, patches))
  const text = indexText(inner)
  const first = text.total === prefix.length && prefix.length > 0 ? lineFirstChar(text, prefix.length - 1) : null
  if (first !== null) {
    if (first <= 0) return start
    lineStart = start + first
  } else {
    const lines = countWrappedLines(m, prefix, prefixRuns, paraOpts, patches, floats)
    if (lines <= 1) return start

    let low = start + 1
    let high = prefixEnd
    while (low < high) {
      const middle = (low + high) >> 1
      const count = countWrappedLines(m, story.slice(start, middle), sliceRuns(runs, start, middle), paraOpts, patches, floats)
      if (count >= lines) high = middle
      else low = middle + 1
    }
    lineStart = low - 1
  }
  while (lineStart > start && !isSpace(story[lineStart - 1])) lineStart--
  while (lineStart > start && isSpace(story[lineStart - 1])) lineStart--
  if (lineStart >= offset) {
    const paragraphStart = Math.max(start, story.lastIndexOf('\n', offset - 1) + 1)
    lineStart = offset
    while (lineStart > paragraphStart && !isSpace(story[lineStart - 1])) lineStart--
    while (lineStart > paragraphStart && isSpace(story[lineStart - 1])) lineStart--
  }
  return lineStart
}

/**
 * Keeps a paragraph's own first/last lines (`TextFrame.paraKeepFirstLines`/`paraKeepLastLines`) from splitting off
 * alone into the next frame (a widow/orphan): `end`, as `fitEnd` found it, may fall inside a paragraph that asked
 * for this. With too few of its FIRST lines before the cut (an orphan) the whole paragraph moves to the next frame:
 * lines cannot be pulled forward from there. With too few of its LAST lines after the cut (a widow) only the missing
 * lines are taken back from the end of this frame, as many as it takes for the next one to open with enough of them,
 * as long as the part that stays still has its own minimum; only when it would not, the whole paragraph moves. Never
 * moves `end` before `start`: a paragraph that's the very first thing in its frame has nowhere earlier to go as a
 * whole (it can still give back lines), and is otherwise left as `fitEnd` found it rather than emptying the frame.
 */
function adjustForKeepLines(
  m: HTMLDivElement,
  story: string,
  runs: Run[],
  start: number,
  end: number,
  box: { w: number; h: number },
  floats: WrapFloat[],
  paraOpts: Pick<RunNodeOpts, 'paraLineHeight' | 'paraGaps' | 'startParaIndex' | 'firstLineIndent' | 'atParaStart' | 'footnoteMarkers' | 'footnoteReferenceScale' | 'footnoteReferenceGap' | 'footnoteReferenceVerticalOffset' | 'footnoteReferenceLook'>,
  patches: ParagraphPatch[] | undefined,
  paraKeepFirstLines: (number | null)[] | undefined,
  paraKeepLastLines: (number | null)[] | undefined,
): number {
  if ((!paraKeepFirstLines?.length && !paraKeepLastLines?.length) || end >= story.length) return end
  const paraStart = story.lastIndexOf('\n', end - 1) + 1
  const nextBreak = story.indexOf('\n', end)
  const paraEnd = nextBreak < 0 ? story.length : nextBreak
  if (end <= paraStart || end >= paraEnd) return end // the cut already falls on a paragraph boundary
  const paraIndex = paraIndexAt(story, paraStart)
  const keepFirst = paraKeepFirstLines?.[paraIndex] ?? 0
  const keepLast = paraKeepLastLines?.[paraIndex] ?? 0
  if (keepFirst <= 0 && keepLast <= 0) return end
  m.style.width = `${box.w}px`
  const linesThrough = (stop: number) => countWrappedLines(m, story.slice(start, stop), sliceRuns(runs, start, stop), paraOpts, patches, floats)
  const linesBeforeParagraph = paraStart > start ? linesThrough(paraStart) : 0
  const totalLines = linesThrough(paraEnd) - linesBeforeParagraph
  if (totalLines <= 1) return end
  const linesBefore = linesThrough(end) - linesBeforeParagraph
  const linesAfter = totalLines - linesBefore
  const violatesFirst = keepFirst > 0 && linesBefore < Math.min(keepFirst, totalLines)
  const violatesLast = keepLast > 0 && linesAfter > 0 && linesAfter < keepLast
  if (!violatesFirst && !violatesLast) return end
  if (violatesLast && !violatesFirst) {
    // the next frame would open with too few of the paragraph's last lines: give it the missing ones from here, if what
    // stays keeps at least its own minimum
    const missing = keepLast - linesAfter
    if (linesBefore - missing >= Math.max(1, Math.min(keepFirst, totalLines))) {
      let cut = end
      const floor = Math.max(start, paraStart)
      for (let line = 0; line < missing && cut > floor; line++) cut = lineStartAtOffset(m, story, runs, start, cut, cut - 1, paraOpts, patches, floats)
      if (cut > floor) return cut
    }
  }
  return paraStart > start ? paraStart : end
}

/** how many lines of the paragraph after a "keep with next" one must be in the same frame (a single line would be an orphan) */
const KEEP_NEXT_MIN_LINES = 2

/** the offset where paragraph `index` of `story` begins */
function paragraphOffset(story: string, index: number): number {
  let pos = 0
  for (let k = 0; k < index; k++) pos = story.indexOf('\n', pos) + 1
  return pos
}

/**
 * "Keep with next" (`TextFrame.paraKeepWithNext`): a paragraph so marked - a verse, a heading - never ends a frame without
 * the first lines of the paragraph after it. If the cut at `end` would leave it that way, either with nothing of the next
 * paragraph in this frame or with a single orphan line of it, the cut moves back to the start of the marked paragraph, and
 * of any marked paragraphs right before it (a chain of them goes together): they open the next frame with the paragraph
 * they belong to. Never moves `end` to `start` or before: a frame is not emptied for this, the paragraph that is first in
 * its frame has nowhere earlier to go.
 */
/**
 * "Keep with next" is for a paragraph that belongs to the one after it (a verse before its text, a heading): when the next
 * paragraph has the same style (running text after running text) the mark is not chained, or a whole page of body text would
 * be pulled along. A paragraph without a style id stays as marked.
 */
function keepWithNextToOtherStyle(keepWithNext: (number | null)[] | undefined, styleIds: string[] | undefined): (number | null)[] | undefined {
  if (!keepWithNext?.some(Boolean) || !styleIds?.length) return keepWithNext
  return keepWithNext.map((flag, index) => (flag && styleIds[index] && styleIds[index] === styleIds[index + 1] ? null : flag))
}

function adjustForKeepWithNext(
  m: HTMLDivElement,
  story: string,
  runs: Run[],
  start: number,
  end: number,
  box: { w: number; h: number },
  floats: WrapFloat[],
  paraOpts: Pick<RunNodeOpts, 'paraLineHeight' | 'paraGaps' | 'startParaIndex' | 'firstLineIndent' | 'atParaStart' | 'footnoteMarkers' | 'footnoteReferenceScale' | 'footnoteReferenceGap' | 'footnoteReferenceVerticalOffset' | 'footnoteReferenceLook'>,
  patches: ParagraphPatch[] | undefined,
  keepWithNext: (number | null)[] | undefined,
  paraKeepFirstLines: (number | null)[] | undefined,
): number {
  if (!keepWithNext?.some(Boolean) || end >= story.length || end <= start) return end
  // the paragraph the last character of this frame belongs to, and the one that wants to stay with the next
  const lastPara = paraIndexAt(story, end - 1)
  const endsAtBreak = story[end - 1] === '\n'
  const holder = endsAtBreak ? lastPara : lastPara - 1
  if (holder < 0 || !keepWithNext[holder]) return end
  if (!endsAtBreak) {
    // the paragraph after it is cut here: is enough of it in this frame?
    const paraStart = paragraphOffset(story, lastPara)
    if (paraStart <= start) return end // it begins in an earlier frame: the marked one is not in this frame any more
    const nextBreak = story.indexOf('\n', end)
    const paraEnd = nextBreak < 0 ? story.length : nextBreak
    m.style.width = `${box.w}px`
    const linesThrough = (stop: number) => countWrappedLines(m, story.slice(start, stop), sliceRuns(runs, start, stop), paraOpts, patches, floats)
    const before = linesThrough(paraStart)
    const here = linesThrough(end) - before
    const total = linesThrough(paraEnd) - before
    if (here >= Math.min(Math.max(KEEP_NEXT_MIN_LINES, paraKeepFirstLines?.[lastPara] ?? 0), total)) return end
  }
  let first = holder
  while (first > 0 && keepWithNext[first - 1] && paragraphOffset(story, first - 1) > start) first--
  const cut = paragraphOffset(story, first)
  return cut > start ? cut : end
}

/**
 * Avoids ending a (non-last) frame on a loose last line: when a paragraph continues past `end` (not a real paragraph
 * break), TextFrameView's `continues` / richtext.ts's `continuesAtEnd` stretch that line edge-to-edge with
 * `text-align-last: justify` instead of leaving it ragged (see those). A line of only one or two words has at most
 * one gap to carry that whole stretch, which widens into one glaring gap instead of an evenly-justified line - and
 * the word(s) that didn't fit on it then open the next frame alone, looking like a stranded scrap. Pushing the whole
 * short line into the next frame instead costs a little room here, but the next frame now opens with that line AND
 * its own first line together, reading like any ordinary pair of justified lines - no stretch, no stray word.
 */
function avoidLooseLastLine(
  m: HTMLDivElement,
  story: string,
  runs: Run[],
  start: number,
  end: number,
  baseAlign: TextStyle['align'],
  paraOpts: Pick<RunNodeOpts, 'paraLineHeight' | 'paraGaps' | 'startParaIndex' | 'firstLineIndent' | 'atParaStart' | 'footnoteMarkers' | 'footnoteReferenceScale' | 'footnoteReferenceGap' | 'footnoteReferenceVerticalOffset' | 'footnoteReferenceLook'>,
  patches?: ParagraphPatch[],
): number {
  if (end <= start || end >= story.length || story[end - 1] === '\n') return end
  const paraStart = story.lastIndexOf('\n', end - 1) + 1
  const resolvedAlign = patches?.[paraIndexAt(story, paraStart)]?.align ?? baseAlign
  if (resolvedAlign !== 'justify') return end
  const lineStart = lineStartAtOffset(m, story, runs, start, end, end - 1, paraOpts, patches)
  if (lineStart <= start) return end
  // a footnote anchor on this line moves right along with it - assignFootnotes (called fresh on whatever range this
  // returns) places every footnote by its anchor's actual frame, so there is nothing stale left behind to reconcile.
  const words = story.slice(lineStart, end).trim().split(/\s+/).filter(Boolean).length
  return words < 3 ? lineStart : end
}

/**
 * How many words sit on the last wrapped line of `paragraph`, at the given box width - used by the "smart tracking"
 * tool (טיפוגרפיה) to decide whether a paragraph's last line is short enough to be worth tightening. Finds the line
 * by growing the suffix word by word from the end until it no longer fits on one line (a paragraph is rarely more
 * than a few dozen words, and this only ever runs once per paragraph, on demand - not during ordinary layout).
 * Uses the paragraph's actual character runs and paragraph-level layout patch, with the story style as fallback.
 */
export function lastLineWordCount(paragraph: string, style: TextStyle, width: number, runsIn?: Run[], patch?: ParagraphPatch & Pick<TextStyle, 'wordSpacingMin' | 'wordSpacingMax' | 'wordSpacing'>): number {
  const words = [...paragraph.matchAll(/\S+/g)]
  if (words.length <= 1) return words.length
  const m = getMeasurer()
  const measureStyle = {
    ...style,
    ...(patch?.align ? { align: patch.align } : {}),
    ...(patch?.leading !== undefined ? { leading: patch.leading } : {}),
    ...(patch?.wordSpacingMin !== undefined ? { wordSpacingMin: patch.wordSpacingMin } : {}),
    ...(patch?.wordSpacingMax !== undefined ? { wordSpacingMax: patch.wordSpacingMax } : {}),
    ...(patch?.wordSpacing !== undefined ? { wordSpacing: patch.wordSpacing } : {}),
  }
  configure(m, measureStyle)
  m.style.width = `${Math.max(1, width - (patch?.indentLeft ?? 0) - (patch?.indentRight ?? 0))}px`
  const sourceRuns = normalizeRuns(paragraph, runsIn, style)
  const paraOpts = { firstLineIndent: patch?.firstLineIndent ?? style.firstLineIndent, startParaIndex: 0, atParaStart: false }
  const patches = patch ? [patch] : undefined
  for (let count = 1; count <= words.length; count++) {
    const start = words[words.length - count].index ?? 0
    const suffix = paragraph.slice(start)
    const runs = sliceRuns(sourceRuns, start, paragraph.length)
    if (countWrappedLines(m, suffix, runs, { ...paraOpts, firstLineIndent: start === 0 ? paraOpts.firstLineIndent : 0, atParaStart: start === 0 }, patches) > 1) return Math.max(1, count - 1)
  }
  return words.length
}

/**
 * The measurer set up like one paragraph of the story: its style and its own layout patch. `width` is the frame's text
 * width after the story's own side indents; the paragraph's own indents (`patch.indentLeft/Right`) are the padding of
 * its block (see buildParagraphNodes), so they are not taken off here as well.
 */
function measurerForParagraph(style: TextStyle, width: number, patch?: ParagraphPatch & Pick<TextStyle, 'wordSpacingMin' | 'wordSpacingMax' | 'wordSpacing'>) {
  const m = getMeasurer()
  configure(m, {
    ...style,
    ...(patch?.align ? { align: patch.align } : {}),
    ...(patch?.leading !== undefined ? { leading: patch.leading } : {}),
    ...(patch?.wordSpacingMin !== undefined ? { wordSpacingMin: patch.wordSpacingMin } : {}),
    ...(patch?.wordSpacingMax !== undefined ? { wordSpacingMax: patch.wordSpacingMax } : {}),
    ...(patch?.wordSpacing !== undefined ? { wordSpacing: patch.wordSpacing } : {}),
  })
  m.style.width = `${Math.max(1, width)}px`
  return m
}

/** a paragraph's own layout patch without its window: what the paragraph looks like before (or without) one */
const withoutWindowOf = <P extends ParagraphPatch>(patch: P | undefined) => (patch ? { ...patch, windowIndent: undefined, windowWords: undefined } : undefined)

/**
 * How many lines one paragraph wraps into in a text area `width` wide (טיפוגרפיה > יצירת חלון בטקסט uses it to leave
 * short paragraphs alone). The paragraph's own window, if it has one, is left out: the count is for the paragraph as it
 * reads without it.
 */
export function countParagraphLines(paragraph: string, runs: Run[], style: TextStyle, width: number, patch?: ParagraphPatch & Pick<TextStyle, 'wordSpacingMin' | 'wordSpacingMax' | 'wordSpacing'>): number {
  if (!paragraph) return 0
  const plain = withoutWindowOf(patch)
  const m = measurerForParagraph(style, width, plain)
  return countWrappedLines(m, paragraph, runs, { firstLineIndent: patch?.firstLineIndent ?? style.firstLineIndent, startParaIndex: 0, atParaStart: true }, plain ? [plain] : undefined)
}

/** How wide the first `end` characters of a paragraph are on one line, in points (the width a window under them has to match). */
export function openingWidth(paragraph: string, runs: Run[], style: TextStyle, end: number): number {
  if (end <= 0) return 0
  const m = measurerForParagraph(style, 1e6)
  const probe = document.createElement('span')
  probe.style.display = 'inline-block'
  probe.style.whiteSpace = 'pre'
  probe.appendChild(buildRunNodes(paragraph.slice(0, end), sliceRuns(runs, 0, end), 1, {}))
  const inner = m.firstElementChild as HTMLElement
  inner.replaceChildren(probe)
  const width = probe.getBoundingClientRect().width
  inner.replaceChildren()
  return width
}

/**
 * The window of a paragraph, measured the way it has to be: the distance, from the side the text starts on, to where
 * the word after the first `words` words begins ON THE FIRST LINE as it is really laid out (justified or not, with its
 * first-line indent, spacing and fonts) - so the second line, indented by exactly that, starts right under that word.
 * `width` is the frame's text width after the story's own side indents. Null when there is no word after the opening
 * ones, or that word does not even fit on the first line.
 */
export function windowOffset(paragraph: string, runs: Run[], style: TextStyle, width: number, patch: (ParagraphPatch & Pick<TextStyle, 'wordSpacingMin' | 'wordSpacingMax' | 'wordSpacing'>) | undefined, words: number): number | null {
  const range = openingRange(paragraph, 0, paragraph.length, words)
  if (!range || range.next < 0) return null
  const natural = openingWidth(paragraph, runs, style, range.next)
  const plain = withoutWindowOf(patch)
  const m = measurerForParagraph(style, width, plain)
  const align = cssTextAlign(plain?.align ?? style.align)
  m.style.textAlign = align.textAlign
  m.style.textAlignLast = align.textAlignLast ?? ''
  const inner = m.firstElementChild as HTMLElement
  try {
    inner.replaceChildren(buildParagraphNodes(paragraph, runs, 1, { firstLineIndent: patch?.firstLineIndent ?? style.firstLineIndent, startParaIndex: 0, atParaStart: true }, plain ? [plain] : undefined))
    // the text node (and the place in it) of the first character of the next word
    const walker = document.createTreeWalker(inner, NodeFilter.SHOW_TEXT)
    let seen = 0
    let target: [Text, number] | null = null
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      if (range.next < seen + node.data.length) {
        target = [node, range.next - seen]
        break
      }
      seen += node.data.length
    }
    if (!target) return null
    const probe = document.createRange()
    probe.setStart(target[0], target[1])
    probe.setEnd(target[0], target[1] + 1)
    const rect = [...probe.getClientRects()].find((r) => r.width > 0)
    if (!rect) return null
    const block = inner.firstElementChild instanceof HTMLDivElement ? inner.firstElementChild : inner
    const edge = block.getBoundingClientRect().right - (parseFloat(getComputedStyle(block).paddingRight) || 0)
    const offset = edge - rect.right
    // nearer than the words themselves are wide: the word did not fit and began the second line
    return offset < natural - 0.75 ? null : Math.max(0, offset)
  } finally {
    inner.replaceChildren()
    m.style.textAlign = ''
    m.style.textAlignLast = ''
  }
}

/** How much of `story` (from `start`) fits into a box of the given size, with the story's default style. */
export function fitStoryEnd(
  story: string,
  runs: Run[],
  style: TextStyle,
  start: number,
  box: { w: number; h: number },
  floats: WrapFloat[] = [],
  hint?: number,
): number {
  const m = getMeasurer()
  configure(m, style)
  // width-only inset (indentLeft/indentRight): this single-box helper doesn't know its place in a chain, so it
  // never applies spaceBefore — flowFrames (the authoritative, always-recomputed layout) does that. spaceAfter's
  // between-paragraph gaps are already baked into every "\n" via paraLineHeight below, so those come through fine.
  const inset = insetBox(box, style, 0, 0)
  return fitEnd(m, story, runs, start, inset, style.fontSize, floats, hint, {
    paraLineHeight: paraLineHeightOf(style),
    firstLineIndent: style.firstLineIndent,
    startParaIndex: paraIndexAt(story, start),
    atParaStart: atParaStart(story, start),
  })
}

/** Results per story, so an unchanged story is not measured again (e.g. while another frame is being dragged). */
const cache = new Map<
  string,
  {
    text: string
    runs: Run[]
    sig: string
    reuseSig: string
    flows: FrameFlow[]
    /** the story's runs as the layout used them, the footnotes it placed and the notes carried into each frame: what the frames after an edit are compared with */
    normalizedRuns: Run[]
    notes: FootnoteLayoutItem[]
    carried: string
  }
>()
const footnoteMeasurementCache = new Map<string, { width: number; height: number }>()
if (typeof document !== 'undefined' && 'fonts' in document) document.fonts.addEventListener('loadingdone', () => footnoteMeasurementCache.clear())
/** last number of characters per frame, the starting point of the next search */
const lengths = new Map<string, number>()

/** Distribute every story's text over its frames (keeping clear of wrapped pictures). Keyed by frame id. */
export function flowFrames(
  frames: TextFrame[],
  images: ImageFrame[] = [],
  footnoteConfig: FootnoteLayoutConfig = DEFAULT_FOOTNOTE_CONFIG,
  footnoteNumbers?: ReadonlyMap<string, number>,
  footnoteContinuations: ReadonlyMap<string, FootnoteLayoutItem[]> = new Map(),
  paragraphStyles: ParagraphStyleRecord[] = [],
  dirtyOffset?: number,
  footnoteReservationOverrides: ReadonlyMap<string, number> = new Map(),
): Map<string, FrameFlow> {
  const result = new Map<string, FrameFlow>()
  const seen = new Set<string>()
  const hasPrev = new Set(frames.map((f) => f.next).filter((n): n is string => !!n))

  for (const head of frames) {
    if (hasPrev.has(head.id)) continue
    // `provisionalFlow` (no footnote numbers yet - it exists only to find out which page each anchor lands on) and
    // the real, numbered `flow` computed from it run back-to-back on every edit, for the same head.id, with a
    // different sig each time (footnoteNumbers is part of it) - sharing one cache slot, they'd only ever evict each
    // other, so dirtyOffset below would never find a same-sig entry to reuse a prefix from. Separate slots fix that.
    const cacheKey = `${head.id}:${footnoteNumbers ? 'numbered' : 'provisional'}`
    seen.add(cacheKey)
    const chain = chainOf(frames, head.id)
    const style = styleOf(head)
    const noteStyle = footnoteTextStyle(footnoteConfig, paragraphStyles)
    const dividerHeight = footnoteDividerHeight(footnoteConfig, paragraphStyles)
    const referenceLook = footnoteReferenceLook(footnoteConfig, paragraphStyles)
    const story = head.text
    const floats = chain.map((f, i) => floatsFor(f, images, style, i === 0))
    // everything the layout depends on: default style (incl. paragraph spacing/indents), per-paragraph overrides,
    // and the id, size and wrap areas of every frame in the thread
    const reuseSig =
      `${style.fontFamily}|${style.fontSize}|${style.weight}|${style.italic}|${style.tracking}|${style.align}|${style.leading}|` +
      `${style.wordSpacingMin}|${style.wordSpacingMax}|${style.wordSpacing}|` +
      `${style.spaceBefore}|${style.spaceAfter}|${style.indentLeft}|${style.indentRight}|${style.firstLineIndent}|${style.secondLineIndent}|` +
      `${JSON.stringify(head.paraSpaceBefore)}|${JSON.stringify(head.paraSpaceAfter)}|` +
      `${JSON.stringify(head.paraKeepFirstLines)}|${JSON.stringify(head.paraKeepLastLines)}|${JSON.stringify(head.paraKeepWithNext)}|${JSON.stringify(head.paragraphStyleIds)}|` +
      `${JSON.stringify(head.paragraphStylePatches)}|${JSON.stringify(paragraphStyles)}|${JSON.stringify(footnoteConfig)}|${JSON.stringify([...footnoteReservationOverrides])}|` +
      chain.map((f, i) => `${f.id}:${f.w}:${f.h}:${JSON.stringify(f.textScale)}:${floatsKey(floats[i])}`).join(',')
    const sig = `${reuseSig}|${JSON.stringify(head.footnotes)}|${JSON.stringify(footnoteNumbers ? [...footnoteNumbers] : [])}|${JSON.stringify(chain.map((frame) => [frame.id, footnoteContinuations.get(frame.id)]))}`

    const hit = cache.get(cacheKey)
    let flows: FrameFlow[]
    if (hit && hit.text === story && hit.runs === head.runs && hit.sig === sig) {
      flows = hit.flows
    } else {
      const runs = normalizeRuns(story, head.runs, style)
      const reusablePrefix: FrameFlow[] = []
      if (hit && hit.reuseSig === reuseSig && dirtyOffset !== undefined) {
        for (const previous of hit.flows) {
          if (previous.end >= dirtyOffset) break
          const currentRuns = sliceRuns(runs, previous.start, previous.end)
          if (hit.text.slice(previous.start, previous.end) !== story.slice(previous.start, previous.end) || JSON.stringify(previous.runs) !== JSON.stringify(currentRuns)) break
          reusablePrefix.push(previous)
        }
      }
      // a reusable frame's footnotes were already laid out exactly this way last time (same sig: same config, same
      // continuations carried into it, same text) - assignFootnotes below skips it too, instead of re-measuring
      // every footnote in it (a DOM reflow each) on every one of the stabilization loop's attempts, for a frame the
      // edit never touched. Recover the local layout height from its placements; `footnoteHeight` may include a
      // shared page reservation and is therefore not sufficient to reconstruct the local result.
      const reusableLayouts = new Map<string, ReturnType<typeof layoutFootnotes>>(
        reusablePrefix.flatMap((previous, i): [string, ReturnType<typeof layoutFootnotes>][] => {
          if (!previous.footnotes.length && !previous.footnoteOverflowItems.length) return []
          const height = previous.footnotes.length
            ? Math.max(...previous.footnotes.map((placement) => placement.y + placement.height)) - footnoteConfig.spaceBefore - footnoteConfig.dividerGap - dividerHeight
            : 0
          return [[chain[i].id, { placements: previous.footnotes, overflowItems: previous.footnoteOverflowItems, height, overflow: previous.footnoteOverflowItems.length > 0 }]]
        }),
      )
      const m = getMeasurer()
      configure(m, style)
      const gaps = paraGapsOf(style, head, story)
      const spaceBeforeFirst = frameSpaceBefore(style, head)
      const spaceAfterLast = frameSpaceAfter(style, head, story)
      // a text box of its own has its first line moved down when the leading is tighter than the letters; the frames of a thread are left
      // as they are (a book is laid out for the way they have always been)
      const liftAt = (offset: number) => {
        if (chain.length !== 1 || offset >= story.length) return 0
        const leading = head.paragraphStylePatches?.[paraIndexAt(story, offset)]?.leading
        const first = sliceRuns(runs, offset, Math.min(story.length, offset + 90)).map((run) => run.style)
        return firstLineLift(style, first, leading && leading > 0 ? leading : effectiveLeading(style))
      }
      const storyFootnoteItems: FootnoteLayoutItem[] = [...(head.footnotes ?? [])]
        .sort((a, b) => a.anchor - b.anchor)
        .map((note: FootnoteItem, index) => ({ id: note.id, anchor: note.anchor, referenceNumber: footnoteNumbers?.get(note.id) ?? footnoteConfig.startAt + index, content: note.content, runs: note.runs, style: note.style ?? footnoteTextStyle(footnoteConfig, paragraphStyles, note.paragraphStyleId) }))
      const footnoteItems = footnoteConfig.placement === 'endnotes' ? [] : storyFootnoteItems
      const footnoteMarkersFrom = (start: number) => Object.fromEntries(
        storyFootnoteItems.filter((item) => item.anchor >= start).map((item) => [
          item.anchor - start,
          formatFootnoteNumber(Number(item.referenceNumber), footnoteConfig.numberStyle, 'plain'),
        ]),
      )
      const measureFootnote = (item: FootnoteLayoutItem, width: number) => {
        const label = item.continued ? '' : formatFootnoteNumber(Number(item.referenceNumber), footnoteConfig.numberStyle, footnoteConfig.noteFormat, footnoteConfig.markerPrefix, footnoteConfig.markerSuffix)
        const textStyle = item.style ?? noteStyle
        const previousWidth = m.style.width
        const inner = m.firstElementChild as HTMLElement
        const previousInnerWidth = inner.style.width
        configure(m, textStyle)
        m.style.width = Number.isFinite(width) ? `${width}px` : 'max-content'
        inner.style.width = ''
        inner.style.textAlign = cssTextAlign(textStyle.align).textAlign
        inner.style.textAlignLast = cssTextAlign(textStyle.align).textAlignLast ?? ''
        inner.style.paddingLeft = textStyle.indentLeft ? `${textStyle.indentLeft}px` : ''
        inner.style.paddingRight = textStyle.indentRight ? `${textStyle.indentRight}px` : ''
        inner.style.display = 'flex'
        inner.style.alignItems = 'flex-start'
        inner.style.gap = `${footnoteConfig.numberTextGap}px`
        const labelNode = document.createElement('span')
        labelNode.className = 'footnote-number'
        labelNode.dir = 'rtl'
        labelNode.style.fontSize = `${textStyle.fontSize}px`
        for (const part of footnoteLabelParts(label)) {
          const labelPart = document.createElement('span')
          labelPart.dir = part.direction
          labelPart.textContent = part.text
          labelNode.appendChild(labelPart)
        }
        const contentNode = document.createElement('div')
        contentNode.style.flex = '1'
        contentNode.style.minWidth = '0'
        const bodyRuns = normalizeRuns(item.content, item.runs ?? [], textStyle)
        contentNode.appendChild(buildParagraphNodes(item.content, bodyRuns, 1))
        inner.replaceChildren(...(label ? [labelNode] : []), contentNode)
        const rect = inner.getBoundingClientRect()
        configure(m, style)
        m.style.width = previousWidth
        inner.style.width = previousInnerWidth
        inner.style.textAlign = ''
        inner.style.textAlignLast = ''
        inner.style.paddingLeft = ''
        inner.style.paddingRight = ''
        inner.style.display = ''
        inner.style.alignItems = ''
        inner.style.gap = ''
        return { width: Number.isFinite(width) ? width : rect.width, height: rect.height }
      }
      const fittedEnds = new Map<string, number>()
      // the same note, at the same width, is measured again and again (each footnote budget tried below, and
      // fitPrefix's own search): a DOM measurement per call, but always the same answer
      const noteMeasurements = new Map<string, { width: number; height: number }>()
      const measureNote = (item: FootnoteLayoutItem, width: number) => {
        const key = JSON.stringify([item.id, item.offset ?? 0, !!item.continued, String(item.referenceNumber), item.content, item.runs, item.style, Number.isFinite(width) ? width : null, footnoteConfig.numberStyle, footnoteConfig.noteFormat, footnoteConfig.markerPrefix, footnoteConfig.markerSuffix, footnoteConfig.numberTextGap])
        let measured = noteMeasurements.get(key)
        if (!measured) {
          measured = footnoteMeasurementCache.get(key)
          if (measured) {
            footnoteMeasurementCache.delete(key)
            footnoteMeasurementCache.set(key, measured)
          } else {
            measured = measureFootnote(item, width)
            if (footnoteMeasurementCache.size >= 2000) footnoteMeasurementCache.delete(footnoteMeasurementCache.keys().next().value!)
            footnoteMeasurementCache.set(key, measured)
          }
          noteMeasurements.set(key, measured)
        }
        return measured
      }
      const layoutNotesForFrame = (frame: TextFrame, items: FootnoteLayoutItem[]) => layoutFootnotes(items, {
        mode: footnoteConfig.mode,
        columns: footnoteConfig.columns,
        columnGap: footnoteConfig.columnGap * footnoteConfig.widthScale,
        alignment: footnoteConfig.alignment,
        columnWidth: footnoteBlockWidth(frame.w, footnoteConfig.widthScale),
        maxFootnoteHeight: Math.min(footnoteConfig.maxFootnoteHeight, frame.h * 0.95),
        minSpacingBetweenInline: footnoteConfig.minSpacingBetweenInline,
      }, measureNote)
      const reservationOf = (layout: { height: number } | null, frameId?: string) => {
        const layoutHeight = layout && layout.height > 0 ? layout.height + footnoteConfig.spaceBefore + footnoteConfig.dividerGap + dividerHeight : 0
        return Math.max(layoutHeight, frameId ? footnoteReservationOverrides.get(frameId) ?? 0 : 0)
      }
      /**
       * Where each frame's text ends, frame by frame. A frame's body text and its footnote area share one height, and
       * how much footnote area is needed depends on how much body text there is (every reference brings its note
       * along) - so no fixed reservation can be right up front. The old approach (reserve from the previous guess,
       * re-fit, repeat) swings between "too much text, so too much reserved" and "too little reserved, so too much
       * text" and never settles, ending on a half-empty page - and its "pull the line back for good" ratchet only ever
       * shrank. Instead: the notes budgeted for the frame (the first `budget` references from `start`) fix the
       * reservation, the reservation fixes how much text fits, and the number of references in that text can never
       * exceed the budget it was fitted with: that holds from some smallest budget on, and a bigger budget only ever
       * means less text, so that smallest budget is found by bisection. It is the fullest page there is - except that
       * the line holding the first reference beyond it may still fit WITHOUT that note's own height being reserved
       * for the lines above it, so that cut (a whole line, back to before the reference) is tried too.
       */
      const lengthChange = hit ? story.length - hit.text.length : 0
      const carriedKey = JSON.stringify(chain.map((frame) => footnoteContinuations.get(frame.id) ?? null))
      const sameNote = (a: FootnoteLayoutItem, b: FootnoteLayoutItem) =>
        a.id === b.id && String(a.referenceNumber) === String(b.referenceNumber) && a.content === b.content && JSON.stringify(a.runs) === JSON.stringify(b.runs) && JSON.stringify(a.style) === JSON.stringify(b.style)
      /**
       * After frame `i` was laid out and ends at `end`: can the frames after it be taken from the last layout, shifted by what the
       * edit added? Only when they would come out the same: that frame ends where it did (shifted), the text and the runs after it
       * are the same, so are the notes anchored after it (the same notes, the same numbers, the same distance from that point), and
       * what is carried into the frames is the same.
       */
      const canKeepRest = (i: number, end: number): boolean => {
        if (!hit || hit.reuseSig !== reuseSig || dirtyOffset === undefined || hit.flows.length !== chain.length || i + 1 >= chain.length) return false
        const before = hit.flows[i].end
        if (end !== before + lengthChange || end <= dirtyOffset) return false
        if (hit.carried !== carriedKey) return false
        if (hit.text.slice(before) !== story.slice(end)) return false
        if (JSON.stringify(sliceRuns(hit.normalizedRuns, before, hit.text.length)) !== JSON.stringify(sliceRuns(runs, end, story.length))) return false
        const oldNotes = hit.notes.filter((item) => item.anchor >= before)
        const newNotes = footnoteItems.filter((item) => item.anchor >= end)
        return oldNotes.length === newNotes.length && oldNotes.every((item, k) => sameNote(item, newNotes[k]) && item.anchor - before === newNotes[k].anchor - end)
      }
      const calculateRanges = () => {
        const ranges: { start: number; end: number }[] = reusablePrefix.map(({ start, end }) => ({ start, end }))
        let start = ranges.length ? ranges[ranges.length - 1].end : 0
        for (let i = reusablePrefix.length; i < chain.length; i++) {
          const f = chain[i]
          const isFirst = i === 0
          const isLast = i === chain.length - 1
          const flowFrame = f.textScale ? { ...f, ...textFlowBoxOf(f) } : f
          // Keep trailing paragraph spacing below the final line; it must not make that line overflow while resizing.
          const fullBox = insetBox(flowFrame, style, (isFirst ? spaceBeforeFirst : 0) + liftAt(start), 0)
          const paraOpts = {
            paraGaps: gaps,
            startParaIndex: paraIndexAt(story, start),
            firstLineIndent: style.firstLineIndent,
            atParaStart: atParaStart(story, start),
            footnoteMarkers: footnoteMarkersFrom(start),
            footnoteReferenceScale: footnoteConfig.referenceScale,
            footnoteReferenceGap: footnoteConfig.referenceGap,
            footnoteReferenceVerticalOffset: footnoteConfig.referenceVerticalOffset,
            footnoteReferenceLook: referenceLook,
          }
          const carried = footnoteContinuations.get(f.id) ?? []
          const pending = footnoteItems.filter((item) => item.anchor >= start)
          const countIn = (end: number) => pending.filter((item) => item.anchor < end).length
          const probe = (budget: number) => {
            const items = [...carried, ...pending.slice(0, budget)]
            const layout = items.length ? layoutNotesForFrame(f, items) : null
            const box = { ...fullBox, h: Math.max(1, fullBox.h - reservationOf(layout, f.id)) }
            const fitKey = JSON.stringify([f.id, isLast, start, box.w, box.h, floatsKey(floats[i]), paraOpts.startParaIndex, paraOpts.atParaStart, paraOpts.firstLineIndent, paraOpts.footnoteMarkers, paraOpts.footnoteReferenceScale, paraOpts.footnoteReferenceGap, paraOpts.footnoteReferenceVerticalOffset, paraOpts.footnoteReferenceLook])
            let fitted = fittedEnds.get(fitKey)
            if (fitted === undefined) {
              fitted = fitEnd(m, story, runs, start, box, style.fontSize, floats[i], lengths.get(f.id), paraOpts, head.paragraphStylePatches, isLast)
              fittedEnds.set(fitKey, fitted)
            }
            const deWidowed = isLast ? fitted : avoidLooseLastLine(m, story, runs, start, fitted, style.align, paraOpts, head.paragraphStylePatches)
            return { budget, layout, box, end: Math.max(start, deWidowed) }
          }
          type Probe = ReturnType<typeof probe>
          const placed = (p: Probe, count: number) => pending.slice(0, count).every((item) => p.layout?.placements.some((placement) => placement.id === item.id && (placement.offset ?? 0) === 0 && !placement.continued))
          const holds = (p: Probe) => {
            const count = countIn(p.end)
            return count <= p.budget && placed(p, count)
          }
          let chosen = probe(0)
          if (!holds(chosen)) {
            const widest = probe(countIn(chosen.end))
            if (holds(widest)) {
              let low = 0
              let high = widest.budget
              let best = widest
              while (high - low > 1) {
                const mid = (low + high) >> 1
                const attempt = probe(mid)
                if (holds(attempt)) {
                  high = mid
                  best = attempt
                } else low = mid
              }
              chosen = best
              const below = probe(chosen.budget - 1)
              const excess = pending[chosen.budget - 1]
              if (excess && excess.anchor < below.end) {
                m.style.width = `${fullBox.w}px`
                const cut = lineStartAtOffset(m, story, runs, start, below.end, excess.anchor, paraOpts, head.paragraphStylePatches)
                if (cut > start && cut > chosen.end && placed(below, countIn(cut))) chosen = { ...below, end: cut }
              }
            } else if (pending.length) {
              // not even every budgeted note can be placed (notes carried in from the previous frame fill the area):
              // keep the references out of this frame, back to the start of the line the first one is on
              m.style.width = `${fullBox.w}px`
              const cut = lineStartAtOffset(m, story, runs, start, chosen.end, pending[0].anchor, paraOpts, head.paragraphStylePatches)
              if (cut > start) chosen = { ...chosen, end: cut }
            }
          }
          // a frame must still make progress: if keeping every reference together with its note leaves no room for even
          // one line (a note taller than the frame can give), let the text flow on without them rather than stall here
          if (chosen.end <= start && start < story.length) chosen = probe(0)
          // "keep lines together" and "keep with next" settle last, on the range the footnotes have chosen: they only ever
          // pull the cut back (to a paragraph's start), and the notes of what leaves are simply not in this frame any more.
          // Inside probe they made the end jump back and forth with the budget, which broke the search above (an end that is
          // not steady in the budget cannot be bisected) and cut whole pages short.
          if (!isLast && chosen.end > start) {
            const kept = adjustForKeepLines(m, story, runs, start, chosen.end, chosen.box, floats[i], paraOpts, head.paragraphStylePatches, head.paraKeepFirstLines, head.paraKeepLastLines)
            const settled = adjustForKeepWithNext(m, story, runs, start, kept, chosen.box, floats[i], paraOpts, head.paragraphStylePatches, keepWithNextToOtherStyle(head.paraKeepWithNext, head.paragraphStyleIds), head.paraKeepFirstLines)
            if (settled > start) chosen = { ...chosen, end: settled }
          }
          ranges.push({ start, end: chosen.end })
          start = chosen.end
          if (canKeepRest(i, chosen.end)) {
            // this frame ends exactly where it did before, shifted by what the edit added, and nothing after it changed: every
            // frame after it is laid out just as it was (shifted the same way) - measuring them all again would give the same
            for (let k = i + 1; k < chain.length; k++) ranges.push({ start: hit!.flows[k].start + lengthChange, end: hit!.flows[k].end + lengthChange })
            break
          }
        }
        return ranges
      }
      const assignFootnotes = (ranges: { start: number; end: number }[]) => {
        const layouts = new Map<string, ReturnType<typeof layoutFootnotes>>(reusableLayouts)
        chain.forEach((frame, index) => {
          if (index < reusablePrefix.length) return
          const { start, end } = ranges[index]
          const localItems = footnoteItems.filter((item) => item.anchor >= start && item.anchor < end)
          const inFrame = [...(footnoteContinuations.get(frame.id) ?? []), ...localItems]
          if (inFrame.length) {
            const layout = layoutNotesForFrame(frame, inFrame)
            layouts.set(frame.id, {
              ...layout,
              placements: layout.placements.map((placement) => ({
                ...placement,
                referenceNumber: formatFootnoteNumber(Number(placement.referenceNumber), footnoteConfig.numberStyle, footnoteConfig.noteFormat, footnoteConfig.markerPrefix, footnoteConfig.markerSuffix),
                y: placement.y + footnoteConfig.dividerGap + footnoteConfig.spaceBefore + dividerHeight,
              })),
            })
          }
        })
        return layouts
      }
      const reserveFor = (layouts: Map<string, ReturnType<typeof layoutFootnotes>>) => new Map(
        [...layouts].map(([id, layout]) => [id, reservationOf(layout, id)]),
      )
      const ranges = calculateRanges()
      const noteLayouts = assignFootnotes(ranges)
      const reserved = reserveFor(noteLayouts)
      flows = []
      chain.forEach((f, i) => {
        const { start, end } = ranges[i]
        const startParaIndex = paraIndexAt(story, start)
        const atStart = atParaStart(story, start)
        lengths.set(f.id, Math.max(1, end - start))
        flows.push({
          headId: head.id,
          prevId: i > 0 ? chain[i - 1].id : null,
          style,
          story,
          start,
          end,
          slice: story.slice(start, end),
          runs: sliceRuns(runs, start, end),
          overflow: i === chain.length - 1 && end < story.length,
          paraGaps: gaps,
          startParaIndex,
          atParaStart: atStart,
          spaceBeforeFirst,
          spaceAfterLast,
          firstLineLift: liftAt(start),
          footnotes: noteLayouts.get(f.id)?.placements ?? [],
          footnoteReferences: storyFootnoteItems.filter((item) => item.anchor >= start && item.anchor < end).map(({ id, anchor, referenceNumber }) => ({ id, anchor, referenceNumber: formatFootnoteNumber(Number(referenceNumber), footnoteConfig.numberStyle, 'plain') })),
          footnoteHeight: reserved.get(f.id) ?? 0,
          footnoteOverflowItems: noteLayouts.get(f.id)?.overflowItems ?? [],
        })
      })
      cache.set(cacheKey, { text: story, runs: head.runs, sig, reuseSig, flows, normalizedRuns: runs, notes: footnoteItems, carried: carriedKey })
    }
    chain.forEach((f, i) => result.set(f.id, flows[i]))
  }

  for (const id of [...cache.keys()]) if (!seen.has(id)) cache.delete(id)
  return result
}

export function flowFramesWithFootnoteContinuation(
  frames: TextFrame[],
  images: ImageFrame[],
  config: FootnoteLayoutConfig,
  numbers: ReadonlyMap<string, number>,
  primaryFrameOrder: string[],
  paragraphStyles: ParagraphStyleRecord[] = [],
  dirtyOffset?: number,
  sharedFootnoteGroups: SharedFootnotePageGroup[] = [],
): Map<string, FrameFlow> {
  const order = new Map(primaryFrameOrder.map((id, index) => [id, index]))
  const runFlow = (reservationOverrides: ReadonlyMap<string, number>) => {
    let continuations = new Map<string, FootnoteLayoutItem[]>()
    let result = flowFrames(frames, images, config, numbers, continuations, paragraphStyles, dirtyOffset, reservationOverrides)
    for (let attempt = 0; attempt < frames.length + primaryFrameOrder.length; attempt++) {
      const next = new Map<string, FootnoteLayoutItem[]>()
      const anchorIndex = new Map<string, number>()
      for (const [frameId, frameFlow] of result) {
        const index = order.get(frameId)
        if (index === undefined) continue
        for (const reference of frameFlow.footnoteReferences) anchorIndex.set(reference.id, index)
      }
      for (const [frameId, frameFlow] of result) {
        const index = order.get(frameId)
        const sourceFrame = frames.find((frame) => frame.id === frameId)
        const target = sourceFrame?.next ?? (index === undefined ? undefined : primaryFrameOrder[index + 1])
        if (!target || frameFlow.footnoteOverflowItems.length === 0) continue
        const spills = frameFlow.footnoteOverflowItems.filter((item) => {
          const referencePage = anchorIndex.get(item.id)
          return referencePage === undefined || index === undefined || referencePage <= index
        })
        if (spills.length) next.set(target, [...(next.get(target) ?? []), ...spills.map((item) => (item.offset ?? 0) === 0 ? { ...item, continued: false } : item)])
      }
      if (next.size === 0) break
      continuations = next
      result = flowFrames(frames, images, config, numbers, continuations, paragraphStyles, dirtyOffset, reservationOverrides)
    }
    return result
  }

  let reservationOverrides = new Map<string, number>()
  let result = runFlow(reservationOverrides)
  if (!sharedFootnoteGroups.length) return result
  for (let attempt = 0; attempt < 6; attempt++) {
    const merged = mergeSharedPageFootnotes(result, frames, sharedFootnoteGroups, config, paragraphStyles)
    let increased = false
    for (const group of sharedFootnoteGroups) {
      const hostFlow = merged.get(group.frameIds[0])
      if (!hostFlow?.footnoteAreaWidth) continue
      for (const id of group.frameIds) {
        const frameFlow = result.get(id)
        const current = reservationOverrides.get(id) ?? 0
        if (frameFlow && frameFlow.footnoteHeight + 0.5 < hostFlow.footnoteHeight && current + 0.5 < hostFlow.footnoteHeight) {
          reservationOverrides.set(id, hostFlow.footnoteHeight)
          increased = true
        }
      }
    }
    if (!increased) return merged
    result = runFlow(reservationOverrides)
  }
  return mergeSharedPageFootnotes(result, frames, sharedFootnoteGroups, config, paragraphStyles)
}
