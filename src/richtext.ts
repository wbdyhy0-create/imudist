import { cssTextAlign, DEFAULT_TEXT_STYLE, FOOTNOTE_MARKER, FOOTNOTE_REFERENCE_SCALE, TOC_LEADER_MARKER, TOC_PAGE_MARKER, wordSpacingPt, type CharStyle, type Run, type TextAlign } from './document'
import { sliceRuns, styleAtChar } from './story'
import { shapeOf, type WrapFloat } from './wrap'
import { hexToRgb } from './colorModels'

export function textOutlineShadow(style: CharStyle, scale: number): string {
  const radius = (style.outlineWidth ?? 0) * scale
  if (radius <= 0) return ''
  const color = style.outlineColor ?? '#000000'
  return Array.from({ length: 16 }, (_, index) => {
    const angle = (index * Math.PI * 2) / 16
    return `${(Math.cos(angle) * radius).toFixed(2)}px ${(Math.sin(angle) * radius).toFixed(2)}px 0 ${color}`
  }).join(', ')
}

export function textDropShadow(style: CharStyle, scale: number): string {
  const opacity = Math.max(0, Math.min(1, style.shadowOpacity ?? 0))
  if (opacity === 0) return ''
  const x = (style.shadowOffsetX ?? 0) * scale
  const y = (style.shadowOffsetY ?? style.shadowOffset ?? 6) * scale
  const blur = Math.hypot(x, y) * 0.35 * (1 - opacity)
  const rgb = hexToRgb(style.shadowColor ?? '#000000')
  return `${x}px ${y}px ${blur}px rgba(${rgb.red}, ${rgb.green}, ${rgb.blue}, ${opacity})`
}

export function textShadow(style: CharStyle, scale: number): string {
  return [textOutlineShadow(style, scale), textDropShadow(style, scale)].filter(Boolean).join(', ')
}

/** CSS for one run. `scale` is the zoom (1 for measuring); font sizes are stored in points. */
export function applyRunStyle(el: HTMLElement, style: CharStyle, scale: number) {
  el.style.fontFamily = `"${style.fontFamily}", "Segoe UI", Arial, sans-serif`
  el.style.fontSize = `${style.fontSize * scale}px`
  el.style.fontWeight = String(style.weight)
  el.style.fontStyle = style.italic ? 'italic' : 'normal'
  el.style.color = style.color ?? ''
  el.style.textShadow = textShadow(style, scale)
  // tracking is 1/1000 em (the standard typographic unit)
  el.style.letterSpacing = style.tracking ? `${(style.tracking / 1000) * style.fontSize * scale}px` : ''
}

/** One piece of a run's text for formatting-mark rendering: a run of plain characters, or a single space / paragraph break. */
export interface MarkPiece {
  text: string
  kind: 'text' | 'space' | 'para'
}

/**
 * Splits a run's text at every space and paragraph break (the story's "\n") into plain-text pieces plus single
 * whitespace characters, so each one can carry its own formatting-mark overlay. The characters and their order are
 * untouched — only where they are grouped into DOM nodes changes — so this is safe to use anywhere the un-split text
 * would otherwise go (offsets, selection, `textContent` all read the same either way).
 */
export function splitMarks(text: string): MarkPiece[] {
  const pieces: MarkPiece[] = []
  let buf = ''
  const flush = () => {
    if (buf) pieces.push({ text: buf, kind: 'text' })
    buf = ''
  }
  for (const ch of text) {
    if (ch === ' ' || ch === '\n') {
      flush()
      pieces.push({ text: ch, kind: ch === ' ' ? 'space' : 'para' })
    } else buf += ch
  }
  flush()
  return pieces
}

export interface RunNodeOpts {
  footnoteMarkers?: Record<number, string>
  footnoteReferenceScale?: number
  tocPageMarkers?: Record<number, string>
  tocLeaderMarkers?: Record<number, string>
  /** shows a dot over spaces and a ¶ at paragraph breaks (View > תווים נסתרים) */
  showMarks?: boolean
  /**
   * points, unscaled, UNIFORM: every "\n" gets this same extra vertical space right after it. Ignored when
   * `paraGaps` is given. See the long comment on `buildRunNodes` below.
   */
  paraLineHeight?: number
  /**
   * points, unscaled, PER PARAGRAPH: `paraGaps[startParaIndex]` is the gap after the first "\n" this call
   * encounters, `paraGaps[startParaIndex + 1]` the next, and so on — `document.ts`'s `paraGaps()` builds this for
   * a whole story; `startParaIndex` (default 0) is which paragraph `text`'s first character belongs to, since a
   * call may cover only one frame's slice of a longer story. `undefined` at an index means no gap there.
   */
  paraGaps?: (number | undefined)[]
  startParaIndex?: number
  /**
   * points, unscaled: indents the first line of EVERY paragraph by this much (not just the story's very first
   * paragraph) — a `.para-indent` spacer, the width twin of `.para-gap`, placed right before each paragraph's own
   * first character. See the long comment on `buildRunNodes` below.
   */
  firstLineIndent?: number
  /** true when `text`'s first character is itself a paragraph's first character (`story.ts`'s `atParaStart`) —
   *  gates the leading `.para-indent` so a frame that only continues a wrapped (unfinished) paragraph doesn't get
   *  one of its own. */
  atParaStart?: boolean
}

/** A zero-width `display: inline-block` sibling right after a "\n", `height` tall — see `buildRunNodes`. */
function paraGap(heightPx: number): HTMLElement {
  const gap = document.createElement('span')
  gap.className = 'para-gap'
  gap.contentEditable = 'false'
  gap.style.height = `${heightPx}px`
  return gap
}

/** A zero-height `display: inline-block` sibling right before a paragraph's first character, `width` wide. */
function paraIndent(widthPx: number): HTMLElement {
  const indent = document.createElement('span')
  indent.className = 'para-indent'
  indent.contentEditable = 'false'
  indent.style.width = `${widthPx}px`
  return indent
}

/**
 * DOM for a formatted text: one <span> per run. The text keeps its "\n" characters (white-space: pre-wrap).
 *
 * `showMarks` wraps each space/paragraph-break character in its own inert span (`.mark-space` / `.mark-para`, a
 * pure CSS overlay via ::after — see styles.css) so hidden formatting characters can be shown without changing the
 * run's actual text content or character count.
 *
 * `paraLineHeight` is how `TextStyle.spaceAfter` becomes real space BETWEEN paragraphs, not just once at the edges
 * of a frame: a zero-width `.para-gap` spacer (`display: inline-block`, baseline-aligned like ordinary text) is
 * inserted right after every "\n", tall enough to push the following line down by the wanted amount. This needs no
 * separate "which frame is this" bookkeeping (unlike `spaceBefore`, still frame-edge-only — see frames.ts's
 * `insetBox`): the extra height is part of the text's own measured size, so the hidden measurer picks it up
 * automatically wherever the "\n" ends up, on any frame of a thread, without either place having to agree on
 * anything beyond calling this the same way. (An earlier version set the "\n" character's own `line-height`
 * instead — simpler, but `vertical-align: top`-style techniques measured inconsistently between the very first
 * line of a block and every line after it; a plain baseline-aligned sibling spacer measured consistently in every
 * position tested, so that's what this uses.)
 *
 * `firstLineIndent` is the width twin of `paraLineHeight`/`paraGaps`: a `.para-indent` spacer (zero HEIGHT this
 * time, so it never touches line height, only takes up width on the line it sits on) placed right before every
 * paragraph's own first character — the story's very first paragraph gets it at the very start of `text` (only
 * when `startParaIndex` is 0, i.e. this call covers the story's own beginning), every other paragraph gets it
 * right after its own "\n", the same insertion point `paraGap` already uses. Because it only ever sits on a
 * paragraph's first line, wrapping to a second line leaves it behind with no further effect — no `text-indent`
 * needed (which only indents a whole BLOCK's first line, not every paragraph's, without the rarely-supported
 * `each-line` keyword).
 *
 * Both spacers hold no text, so they are invisible to anything that counts characters (`textOffsetIn`, `locate`,
 * `el.textContent`) — the same reasoning `.wrap-float` already relies on. Marked `contentEditable="false"` so the
 * live editor treats them as atomic, unselectable units, like `.wrap-float`.
 */
export function buildRunNodes(text: string, runs: Run[], scale: number, opts: RunNodeOpts = {}): DocumentFragment {
  const frag = document.createDocumentFragment()
  let pos = 0
  let seen = 0
  let paraIndex = opts.startParaIndex ?? 0
  if (opts.firstLineIndent && opts.atParaStart) frag.appendChild(paraIndent(opts.firstLineIndent * scale))
  for (const r of runs) {
    const span = document.createElement('span')
    applyRunStyle(span, r.style, scale)
    const runText = text.slice(pos, pos + r.len)
    const appendText = (parent: HTMLElement, value: string, start: number) => {
      if (!opts.footnoteMarkers && !opts.tocPageMarkers && !opts.tocLeaderMarkers) {
        parent.appendChild(document.createTextNode(value))
        return
      }
      let plainStart = 0
      for (let index = 0; index < value.length; index++) {
        const absolute = start + index
        const character = value[index]
        const reference = character === FOOTNOTE_MARKER ? opts.footnoteMarkers?.[absolute] : undefined
        const pageNumber = character === TOC_PAGE_MARKER ? opts.tocPageMarkers?.[absolute] ?? '8888' : undefined
        const leader = character === TOC_LEADER_MARKER ? opts.tocLeaderMarkers?.[absolute] ?? '.'.repeat(128) : undefined
        if (!(character === FOOTNOTE_MARKER && reference) && pageNumber === undefined && leader === undefined) continue
        if (index > plainStart) parent.appendChild(document.createTextNode(value.slice(plainStart, index)))
        const marker = document.createElement('span')
        if (reference !== undefined) {
          const referenceStyle = styleAtChar(runs, Math.max(0, absolute - 1), r.style)
          marker.className = 'footnote-reference'
          marker.dataset.reference = reference
          marker.dir = /[\u0590-\u05ff]/.test(reference) ? 'rtl' : 'ltr'
          marker.style.fontFamily = `"${referenceStyle.fontFamily}", "Segoe UI", Arial, sans-serif`
          marker.style.fontWeight = String(referenceStyle.weight)
          marker.style.fontStyle = referenceStyle.italic ? 'italic' : 'normal'
          marker.style.setProperty('--footnote-marker-size', `${referenceStyle.fontSize * scale * (opts.footnoteReferenceScale ?? FOOTNOTE_REFERENCE_SCALE)}px`)
        } else if (pageNumber !== undefined) {
          marker.className = 'toc-page-reference'
          marker.dataset.reference = pageNumber
          marker.style.setProperty('--toc-reference-size', `${r.style.fontSize * scale}px`)
        } else {
          marker.className = 'toc-leader'
          marker.dataset.leader = leader
          marker.style.setProperty('--toc-reference-size', `${r.style.fontSize * scale}px`)
        }
        marker.textContent = character
        parent.appendChild(marker)
        plainStart = index + 1
      }
      if (plainStart < value.length) parent.appendChild(document.createTextNode(value.slice(plainStart)))
    }
    if (opts.showMarks || opts.paraLineHeight || opts.paraGaps || opts.firstLineIndent || opts.footnoteMarkers || opts.tocPageMarkers || opts.tocLeaderMarkers) {
      for (const piece of splitMarks(runText)) {
        if (piece.kind === 'text') {
          appendText(span, piece.text, seen)
        } else if (piece.kind === 'para') {
          if (opts.showMarks) {
            const mark = document.createElement('span')
            mark.className = 'mark-para'
            mark.textContent = piece.text
            span.appendChild(mark)
          } else {
            span.appendChild(document.createTextNode(piece.text))
          }
          // a paragraph break right at the end of `text` (a frame boundary) has no next paragraph in THIS call to
          // space away from or indent — that belongs to whichever frame actually shows the next paragraph, which
          // adds its own leading indent via `atParaStart` above and gets this same gap fresh next time it's its
          // turn. This isn't just a wasted node: an empty trailing line that contains so much as one inline-level
          // box — even a zero-height `.para-indent` — still gets the full line-height as its CSS line-box "strut",
          // so leaving it in was silently costing one whole extra line at every frame boundary.
          const atEnd = seen + piece.text.length === text.length
          const gap = opts.paraGaps ? opts.paraGaps[paraIndex] : opts.paraLineHeight
          if (gap && !atEnd) span.appendChild(paraGap(gap * scale))
          if (opts.firstLineIndent && !atEnd) span.appendChild(paraIndent(opts.firstLineIndent * scale))
          paraIndex++
        } else if (opts.showMarks) {
          const mark = document.createElement('span')
          mark.className = 'mark-space'
          mark.textContent = piece.text
          span.appendChild(mark)
        } else {
          span.appendChild(document.createTextNode(piece.text))
        }
        seen += piece.text.length
      }
    } else {
      appendText(span, runText, seen)
      seen += runText.length
    }
    frag.appendChild(span)
    pos += r.len
  }
  return frag
}

/** Layout a single paragraph may override on its own (a paragraph style applied to it, or settings changed for it). */
export interface ParagraphPatch {
  leading?: number
  wordSpacingMin?: number
  wordSpacingMax?: number
  indentLeft?: number
  indentRight?: number
  firstLineIndent?: number
  secondLineIndent?: number
  align?: TextAlign
  /**
   * points, unscaled: "a window in the text" (טיפוגרפיה > יצירת חלון בטקסט) - the paragraph's SECOND line starts this far
   * in from the side the text starts on, leaving room under the (larger) opening word(s) of the first line.
   */
  windowIndent?: number
  /** how many opening words that window was made as wide as - what lets it be measured again when the lines change */
  windowWords?: number
}

/** true when a patch changes something only a paragraph BLOCK can express (line height, side indents, alignment) */
const shapesBlock = (p: ParagraphPatch | undefined) => !!p && (p.leading !== undefined || p.wordSpacingMin !== undefined || p.wordSpacingMax !== undefined || !!p.indentLeft || !!p.indentRight || !!p.secondLineIndent || p.align !== undefined || !!p.windowIndent)

/**
 * The empty float that makes a paragraph's second line shorter on the right (the reading start side) by `width`:
 * its shape is blocked only in a band that lies inside the second line, so the first line and every line after the
 * second keep the full width. Heights are in `lh` (the paragraph's own line height, so a leading change needs no
 * update here).
 *
 * What the first line's real height depends on, and so where the second line starts, is not known up front:
 * - `gap` is the spacer that can sit on the first line of a paragraph that follows another (see `paraGap`): it sits on
 *   the baseline and reaches `gap` above it, so the line is `max(1lh, gap + below)` tall, where `below` - the part of
 *   the line under the baseline, a font-metrics matter - is somewhere around 0.15-0.35lh;
 * - an opening word set larger than the rest of the line (the point of a window) makes the line taller by about 0.3 of
 *   the size difference, up to the 0.65lh allowed for here.
 * The band therefore starts below the tallest the first line can be, and ends above the lowest the second one can
 * end - so it is always wholly inside the second line, whatever the font, and never touches the first or the third.
 */
export function windowFloatStyle(width: number, gap: number) {
  const first = `calc(max(1lh, ${gap}px + 0.35lh) + 0.65lh)`
  const both = windowBlockMinHeight(gap)
  return {
    float: 'right' as const,
    width: `${width}px`,
    height: both,
    shapeOutside: `polygon(${width}px 0, ${width}px ${first}, 0 ${first}, 0 ${both}, ${width}px ${both})`,
    pointerEvents: 'none' as const,
    userSelect: 'none' as const,
  }
}

/** a paragraph block that holds a window is at least as tall as the float, so the float never spills onto the next paragraph */
export const windowBlockMinHeight = (gap: number) => `calc(max(1lh, ${gap}px + 0.15lh) + 1lh)`

function windowFloat(width: number, gap: number): HTMLElement {
  const el = document.createElement('div')
  el.className = 'wrap-float'
  el.contentEditable = 'false'
  Object.assign(el.style, windowFloatStyle(width, gap))
  return el
}

/**
 * `buildRunNodes`, for a story some of whose paragraphs carry their own layout (`ParagraphPatch`): every paragraph
 * becomes a block with its own line height / side indents / alignment — the same structure the read-only view draws,
 * and the live editor too, so the frame-fitting measurer (textLayout.ts) and the PDF export lay text out exactly like
 * both. Text with no such paragraph goes through the flat `buildRunNodes` untouched, in every one of those three.
 *
 * The spacers that follow a paragraph's closing "
" (`.para-gap`, `.para-indent`) open the NEXT paragraph's block —
 * left at the end of the previous one they'd sit alone on an extra empty line.
 *
 * `continuesAtEnd` (with `baseAlign`, the frame's own default alignment): `text`'s last character is NOT a real
 * paragraph end, only where this frame's slice of a longer story happens to be cut — the read-only view (see
 * TextFrameView.tsx's `continues`) stretches that cut line to both margins instead of leaving it ragged like a
 * genuine paragraph end, so the live editor and the exported PDF need the exact same `text-align-last` override or
 * their last line jumps to a different width the moment editing stops / the document is printed.
 */
export function buildParagraphNodes(text: string, runs: Run[], scale: number, opts: RunNodeOpts = {}, patches?: ParagraphPatch[], baseAlign?: TextAlign, continuesAtEnd?: boolean): DocumentFragment {
  const first = opts.startParaIndex ?? 0
  const lastParagraphIndex = first + (text.match(/\n/g) ?? []).length
  const needsLastLineJustify = !!continuesAtEnd && (patches?.[lastParagraphIndex]?.align ?? baseAlign) === 'justify'
  const hasTocRows = text.includes(TOC_PAGE_MARKER)
  if ((!patches || !patches.some(shapesBlock)) && !needsLastLineJustify && !hasTocRows) return buildRunNodes(text, runs, scale, opts)
  const frag = document.createDocumentFragment()
  const indentOf = (paragraph: number) => patches?.[paragraph]?.firstLineIndent ?? opts.firstLineIndent ?? 0
  let pos = 0
  let paragraph = first
  while (pos < text.length) {
    const nl = text.indexOf('\n', pos)
    const end = nl < 0 ? text.length : nl + 1
    const block = document.createElement('div')
    const patch = patches?.[paragraph]
    if (patch?.align) {
      const css = cssTextAlign(patch.align)
      block.style.textAlign = css.textAlign
      if (css.textAlignLast) block.style.textAlignLast = css.textAlignLast
    }
    if (needsLastLineJustify && end === text.length) block.style.textAlignLast = 'justify'
    if (patch?.leading) block.style.lineHeight = `${patch.leading * scale}px`
    if (patch?.wordSpacingMin !== undefined || patch?.wordSpacingMax !== undefined) {
      const paragraphStyle = styleAtChar(runs, pos, DEFAULT_TEXT_STYLE)
      const spacing = wordSpacingPt({ ...DEFAULT_TEXT_STYLE, ...paragraphStyle, align: patch.align ?? baseAlign ?? DEFAULT_TEXT_STYLE.align, ...patch })
      if (spacing) block.style.wordSpacing = `${spacing * scale}px`
    }
    if (patch?.indentLeft) block.style.paddingLeft = `${patch.indentLeft * scale}px`
    const rightIndent = (patch?.indentRight ?? 0) + (patch?.secondLineIndent ?? 0)
    if (rightIndent) block.style.paddingRight = `${rightIndent * scale}px`
    if (patch?.secondLineIndent) block.style.textIndent = `${-patch.secondLineIndent * scale}px`
    block.style.boxSizing = 'border-box'
    const line = text.slice(pos, end)
    const pageMarkerAt = line.indexOf(TOC_PAGE_MARKER)
    const leaderMarkerAt = pageMarkerAt < 0 ? -1 : line.lastIndexOf(TOC_LEADER_MARKER, pageMarkerAt)
    if (pageMarkerAt >= 0 && leaderMarkerAt >= 0) {
      const row = document.createElement('div')
      row.className = 'toc-row'
      const title = document.createElement('span')
      title.className = 'toc-title'
      title.appendChild(buildRunNodes(line.slice(0, leaderMarkerAt).replace(/\t$/, ''), sliceRuns(runs, pos, pos + leaderMarkerAt - (line[leaderMarkerAt - 1] === '\t' ? 1 : 0)), scale, { showMarks: opts.showMarks }))
      const leader = document.createElement('span')
      leader.className = 'toc-leader'
      leader.dataset.leader = opts.tocLeaderMarkers?.[pos + leaderMarkerAt] ?? '.'.repeat(128)
      leader.textContent = TOC_LEADER_MARKER
      leader.style.setProperty('--toc-reference-size', `${sliceRuns(runs, pos + leaderMarkerAt, pos + leaderMarkerAt + 1)[0]?.style.fontSize ?? 12}px`)
      const pageNumber = document.createElement('span')
      pageNumber.className = 'toc-page-reference'
      pageNumber.dataset.reference = opts.tocPageMarkers?.[pos + pageMarkerAt] ?? '8888'
      pageNumber.textContent = TOC_PAGE_MARKER
      pageNumber.style.setProperty('--toc-reference-size', `${sliceRuns(runs, pos + pageMarkerAt, pos + pageMarkerAt + 1)[0]?.style.fontSize ?? 12}px`)
      row.append(title, leader, pageNumber)
      block.appendChild(row)
      if (pageMarkerAt + 1 < line.length) block.appendChild(document.createTextNode(line.slice(pageMarkerAt + 1)))
      frag.appendChild(block)
      pos = end
      paragraph++
      continue
    }
    const footnoteMarkers = opts.footnoteMarkers
      ? Object.fromEntries(Object.entries(opts.footnoteMarkers).flatMap(([offset, label]) => {
          const index = Number(offset)
          return index >= pos && index < end ? [[index - pos, label]] : []
        }))
      : undefined
    const nodes = buildRunNodes(text.slice(pos, end), sliceRuns(runs, pos, end), scale, { showMarks: opts.showMarks, footnoteMarkers, footnoteReferenceScale: opts.footnoteReferenceScale })
    const lead = nodes.firstChild as HTMLElement | null
    const isOpening = pos > 0 || !!opts.atParaStart
    // the previous paragraph's closing gap, then this paragraph's own first-line indent
    const spacers: HTMLElement[] = []
    const gapBefore = pos > 0 ? (opts.paraGaps ? opts.paraGaps[paragraph - 1] : opts.paraLineHeight) ?? 0 : 0
    if (gapBefore) spacers.push(paraGap(gapBefore * scale))
    const indent = indentOf(paragraph)
    if (indent && isOpening) spacers.push(paraIndent(indent * scale))
    if (lead) for (const spacer of spacers.reverse()) lead.insertBefore(spacer, lead.firstChild)
    // a window only belongs to a paragraph's own start, not to the tail of one that began in the previous frame
    if (patch?.windowIndent && isOpening) {
      block.style.minHeight = windowBlockMinHeight(gapBefore * scale)
      block.appendChild(windowFloat(patch.windowIndent * scale, gapBefore * scale))
    }
    block.appendChild(nodes)
    frag.appendChild(block)
    pos = end
    paragraph++
  }
  return frag
}

/**
 * Empty floated shapes that keep text out of the areas of pictures (text wrap). They go before the text, inside the same
 * container, so the browser flows the lines around them. They hold no characters, so text offsets are unaffected.
 */
export function buildWrapFloats(floats: WrapFloat[], scale: number): HTMLElement[] {
  return floats.map((f) => {
    const el = document.createElement('div')
    el.className = 'wrap-float'
    el.contentEditable = 'false'
    Object.assign(el.style, {
      float: f.side,
      width: `${f.width * scale}px`,
      height: `${f.height * scale}px`,
      shapeOutside: shapeOf(f, scale),
      pointerEvents: 'none',
      userSelect: 'none',
    })
    return el
  })
}

/** Character offset of a DOM position (node, offset) counted in the text of `root`. */
export function textOffsetIn(root: Node, node: Node, offset: number): number {
  const r = document.createRange()
  r.selectNodeContents(root)
  r.setEnd(node, offset)
  return r.toString().length
}

/** The selection as [start, end] offsets inside `root`'s text, or null if it is not inside `root`. */
export function readSelectionIn(root: HTMLElement): [number, number] | null {
  const sel = document.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null
  const a = textOffsetIn(root, range.startContainer, range.startOffset)
  const b = textOffsetIn(root, range.endContainer, range.endOffset)
  return [Math.min(a, b), Math.max(a, b)]
}

function locate(root: HTMLElement, target: number): [Node, number] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let pos = 0
  let last: Text | null = null
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    last = n
    if (target <= pos + n.data.length) return [n, target - pos]
    pos += n.data.length
  }
  return last ? [last, last.data.length] : [root, 0]
}

/** Select characters [a, b) of `root`'s text (a caret when a === b). */
export function setSelectionIn(root: HTMLElement, a: number, b: number) {
  const sel = document.getSelection()
  if (!sel) return
  const [sn, so] = locate(root, a)
  const [en, eo] = a === b ? [sn, so] : locate(root, b)
  const range = document.createRange()
  range.setStart(sn, so)
  range.setEnd(en, eo)
  sel.removeAllRanges()
  sel.addRange(range)
}

/** Character offset in the text of `root` under a screen point, or null when the point is not over its text. */
export function caretOffsetAt(x: number, y: number, root: HTMLElement | null): number | null {
  if (!root) return null
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  }
  let node: Node | null = null
  let offset = 0
  if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y)
    if (p) [node, offset] = [p.offsetNode, p.offset]
  } else if (document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(x, y)
    if (r) [node, offset] = [r.startContainer, r.startOffset]
  }
  if (!node || !root.contains(node)) return null
  return textOffsetIn(root, node, offset)
}
