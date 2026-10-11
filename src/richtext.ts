import { cssTextAlign, DEFAULT_TEXT_STYLE, FOOTNOTE_MARKER, FOOTNOTE_REFERENCE_SCALE, TOC_LEADER_MARKER, TOC_PAGE_MARKER, wordSpacingPt, type CharStyle, type FootnoteReferenceLook, type ParagraphBox, type Run, type TextAlign } from './document'
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

export function textOutlineStroke(style: CharStyle, scale: number): string {
  const width = (style.outlineWidth ?? 0) * scale
  return width > 0 ? `${Number(width.toFixed(3))}px ${style.outlineColor ?? '#000000'}` : ''
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
export function applyRunStyle(el: HTMLElement, style: CharStyle, scale: number, outlineMode: 'shadow' | 'stroke' = 'shadow') {
  el.style.fontFamily = `"${style.fontFamily}", "Segoe UI", Arial, sans-serif`
  el.style.fontSize = `${style.fontSize * scale}px`
  el.style.fontWeight = String(style.weight)
  el.style.fontStyle = style.italic ? 'italic' : 'normal'
  el.style.color = style.color ?? ''
  el.style.textShadow = [
    outlineMode === 'shadow' ? textOutlineShadow(style, scale) : '',
    textDropShadow(style, scale),
  ].filter(Boolean).join(', ')
  if (outlineMode === 'stroke') el.style.setProperty('-webkit-text-stroke', textOutlineStroke(style, scale))
  // tracking is 1/1000 em (the standard typographic unit)
  el.style.letterSpacing = style.tracking ? `${(style.tracking / 1000) * style.fontSize * scale}px` : ''
  // baseline shift: moved by `top`, not by vertical-align, so the line keeps its height
  el.style.position = style.baselineShift ? 'relative' : ''
  el.style.top = style.baselineShift ? `${-style.baselineShift * scale}px` : ''
}

/** the same shift for a React style object */
export const baselineShiftCss = (style: CharStyle, scale: number): { position: 'relative'; top: string } | undefined =>
  style.baselineShift ? { position: 'relative', top: `${-style.baselineShift * scale}px` } : undefined

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
  /** how to render character outlines in the generated DOM */
  outlineMode?: 'shadow' | 'stroke'
  footnoteMarkers?: Record<number, string>
  footnoteReferenceScale?: number
  footnoteReferenceGap?: number
  footnoteReferenceVerticalOffset?: number
  /** the font, weight, italic, colour and size the reference numbers are set in (from the style chosen for them); what is missing comes from the text before the number */
  footnoteReferenceLook?: FootnoteReferenceLook
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
  /** unscaled story line height, used to offset list markers by paragraph spacing only */
  baseLeading?: number
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
    applyRunStyle(span, r.style, scale, opts.outlineMode)
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
          const look = opts.footnoteReferenceLook
          marker.style.fontFamily = `"${look?.fontFamily ?? referenceStyle.fontFamily}", "Segoe UI", Arial, sans-serif`
          marker.style.fontWeight = String(look?.weight ?? referenceStyle.weight)
          marker.style.fontStyle = (look?.italic ?? referenceStyle.italic) ? 'italic' : 'normal'
          if (look?.color) marker.style.color = look.color
          marker.style.setProperty('--footnote-marker-size', `${(look?.fontSize ?? referenceStyle.fontSize * (opts.footnoteReferenceScale ?? FOOTNOTE_REFERENCE_SCALE)) * scale}px`)
          marker.style.setProperty('--footnote-marker-direction', /[\u0590-\u05ff]/.test(reference) ? 'rtl' : 'ltr')
          marker.style.setProperty('--footnote-reference-gap', `${(opts.footnoteReferenceGap ?? 0) * scale}px`)
          marker.style.setProperty('--footnote-reference-offset', `${(opts.footnoteReferenceVerticalOffset ?? 0) * scale}px`)
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
export interface ParagraphPatch extends ParagraphBox {
  leading?: number
  wordSpacingMin?: number
  wordSpacingMax?: number
  indentLeft?: number
  indentRight?: number
  firstLineIndent?: number
  secondLineIndent?: number
  align?: TextAlign
  listKind?: 'bullet' | 'number'
  listGap?: number
  /**
   * points, unscaled: "a window in the text" (טיפוגרפיה > יצירת חלון בטקסט) - the paragraph's SECOND line starts this far
   * in from the side the text starts on, leaving room under the (larger) opening word(s) of the first line.
   */
  windowIndent?: number
  /** how many opening words that window was made as wide as - what lets it be measured again when the lines change */
  windowWords?: number
}

/** true when a patch changes something only a paragraph BLOCK can express (line height, side indents, alignment) */
const shapesBlock = (p: ParagraphPatch | undefined) => !!p && (p.leading !== undefined || p.wordSpacingMin !== undefined || p.wordSpacingMax !== undefined || !!p.indentLeft || !!p.indentRight || p.firstLineIndent !== undefined || !!p.secondLineIndent || p.align !== undefined || !!p.windowIndent || !!p.listKind || paragraphHasBox(p))

/** the room (points, unscaled) a paragraph's fill or line keeps between itself and the text at the sides */
const BOX_INSET = 3

/** true when the paragraph has a fill behind it or a line around it */
export const paragraphHasBox = (p: ParagraphBox | undefined) => !!p && (!!p.background || (p.borderWidth ?? 0) > 0)

/** CSS for a paragraph block's own fill and line */
export function paragraphBoxStyle(p: ParagraphBox | undefined, scale: number): { backgroundColor?: string; border?: string } {
  if (!p) return {}
  return {
    ...(p.background ? { backgroundColor: p.background } : {}),
    ...((p.borderWidth ?? 0) > 0 ? { border: `${p.borderWidth! * scale}px solid ${p.borderColor ?? '#000000'}` } : {}),
  }
}

/** a paragraph block's side padding: its indents, plus the room that keeps the text off its fill / line */
export function paragraphSidePadding(p: (ParagraphBox & Pick<ParagraphPatch, 'indentLeft' | 'indentRight' | 'secondLineIndent'>) | undefined, scale: number): { paddingLeft?: string; paddingRight?: string } {
  const inset = paragraphHasBox(p) ? BOX_INSET : 0
  const left = (p?.indentLeft ?? 0) + inset
  const right = (p?.indentRight ?? 0) + (p?.secondLineIndent ?? 0) + inset
  return { ...(left ? { paddingLeft: `${left * scale}px` } : {}), ...(right ? { paddingRight: `${right * scale}px` } : {}) }
}
/** A CSS-generated marker for a list paragraph; adjacent numbered paragraphs continue their count. */
export function paragraphListMarker(patches: ParagraphPatch[] | undefined, paragraph: number): string | undefined {
  const kind = patches?.[paragraph]?.listKind
  if (kind === 'bullet') return '•'
  if (kind !== 'number') return undefined
  let number = 1
  for (let index = paragraph - 1; index >= 0 && patches?.[index]?.listKind === 'number'; index--) number++
  return `.${number}`
}

export const paragraphListMarkerWidth = (marker: string) => Math.max(0.75, marker.length * 0.65 + 0.15)
export const paragraphListMarkerOffset = (gap: number, leading: number, scale = 1) => Math.max(0, gap - leading * scale)

/** The font sizes (px) that decide how tall the lines of a window paragraph are: those of its opening words and of the rest. */
export interface WindowFonts {
  opening: number
  main: number
}

/** The window's font sizes for the paragraph [start, end) of a story: the first run's, and the size most of the paragraph is in. */
export function windowFontsOf(runs: Run[], start: number, end: number, scale = 1): WindowFonts | undefined {
  const own = sliceRuns(runs, start, end).filter((run) => run.len > 0)
  if (own.length === 0) return undefined
  const bySize = new Map<number, number>()
  for (const run of own) bySize.set(run.style.fontSize, (bySize.get(run.style.fontSize) ?? 0) + run.len)
  const main = [...bySize.entries()].sort((a, b) => b[1] - a[1])[0][0]
  return { opening: own[0].style.fontSize * scale, main: main * scale }
}

/**
 * Where the window's band lies, as CSS lengths from the top of the paragraph.
 *
 * The window is the paragraph's second line made shorter on the reading-start side, and a float can only be placed by distance
 * from the top - so how tall the first line is decides whether the band lands on the second line, or on the first. That is not
 * the paragraph's `lh`: a line box is as tall as the union of its inline boxes, and boxes of fonts of different sizes sit
 * differently on the baseline. A text in 18px set in a frame whose own font is 32px (the strut of every line) has lines about
 * twice its `lh` apart. So the heights are worked out from the sizes involved:
 *   a line = `lh` + about half the difference between its biggest and its smallest font (`em` here is the frame's own size - the float
 *   inherits it - the others come from the runs);
 *   the first line also holds the opening words, and can be taller still where `gap` (the spacer of the previous paragraph's closing
 *   gap sits on it, `max(1lh, gap + below)`).
 * The band is the middle of the second line (from 30% to 70% of it), so it is still inside it when the figures are off by a third.
 */
function windowBand(gap: number, fonts?: WindowFonts) {
  const strut = '1em'
  const opening = fonts ? `${fonts.opening}px` : strut
  const main = fonts ? `${fonts.main}px` : strut
  const second = `(1lh + 0.5 * (max(${strut}, ${main}) - min(${strut}, ${main})))`
  const first = `max(1lh + 0.5 * (max(${strut}, ${opening}, ${main}) - min(${strut}, ${opening}, ${main})), ${gap}px + 0.35lh)`
  return { top: `calc(${first} + 0.3 * ${second})`, bottom: `calc(${first} + 0.7 * ${second})` }
}

export function windowFloatStyle(width: number, gap: number, fonts?: WindowFonts) {
  const { top, bottom } = windowBand(gap, fonts)
  return {
    float: 'right' as const,
    width: `${width}px`,
    height: bottom,
    shapeOutside: `polygon(${width}px 0, ${width}px ${top}, 0 ${top}, 0 ${bottom}, ${width}px ${bottom})`,
    pointerEvents: 'none' as const,
    userSelect: 'none' as const,
  }
}

/** a paragraph block that holds a window is at least as tall as the float, so the float never spills onto the next paragraph */
export const windowBlockMinHeight = (gap: number, fonts?: WindowFonts) => windowBand(gap, fonts).bottom

function windowFloat(width: number, gap: number, fonts?: WindowFonts): HTMLElement {
  const el = document.createElement('div')
  el.className = 'wrap-float'
  el.contentEditable = 'false'
  Object.assign(el.style, windowFloatStyle(width, gap, fonts))
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
    const marker = paragraphListMarker(patches, paragraph)
    if (marker && (pos > 0 || !!opts.atParaStart)) {
      block.className = 'paragraph-list-item'
      block.dataset.listMarker = marker
      block.style.display = 'grid'
      block.style.gridTemplateColumns = `${paragraphListMarkerWidth(marker)}em minmax(0, 1fr)`
      block.style.columnGap = `${(patch?.listGap ?? 4) * scale}px`
    }
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
    Object.assign(block.style, paragraphSidePadding(patch, scale), paragraphBoxStyle(patch, scale))
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
      title.appendChild(buildRunNodes(line.slice(0, leaderMarkerAt).replace(/\t$/, ''), sliceRuns(runs, pos, pos + leaderMarkerAt - (line[leaderMarkerAt - 1] === '\t' ? 1 : 0)), scale, { showMarks: opts.showMarks, outlineMode: opts.outlineMode }))
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
    const nodes = buildRunNodes(text.slice(pos, end), sliceRuns(runs, pos, end), scale, { showMarks: opts.showMarks, footnoteMarkers, footnoteReferenceScale: opts.footnoteReferenceScale, footnoteReferenceGap: opts.footnoteReferenceGap, footnoteReferenceVerticalOffset: opts.footnoteReferenceVerticalOffset, footnoteReferenceLook: opts.footnoteReferenceLook, outlineMode: opts.outlineMode })
    const lead = nodes.firstChild as HTMLElement | null
    const isOpening = pos > 0 || !!opts.atParaStart
    // the previous paragraph's closing gap, then this paragraph's own first-line indent
    const spacers: HTMLElement[] = []
    const gapBefore = pos > 0 ? (opts.paraGaps ? opts.paraGaps[paragraph - 1] : opts.paraLineHeight) ?? 0 : 0
    if (gapBefore) spacers.push(paraGap(gapBefore * scale))
    if (marker && gapBefore) {
      const leading = patch?.leading ?? opts.baseLeading ?? Math.round(styleAtChar(runs, pos, DEFAULT_TEXT_STYLE).fontSize * 1.25)
      block.style.setProperty('--list-marker-offset', `${paragraphListMarkerOffset(gapBefore * scale, leading, scale)}px`)
    }
    const indent = indentOf(paragraph)
    if (indent && isOpening) spacers.push(paraIndent(indent * scale))
    if (lead) for (const spacer of spacers.reverse()) lead.insertBefore(spacer, lead.firstChild)
    // a window only belongs to a paragraph's own start, not to the tail of one that began in the previous frame
    if (patch?.windowIndent && isOpening) {
      const fonts = windowFontsOf(runs, pos, end, scale)
      block.style.minHeight = windowBlockMinHeight(gapBefore * scale, fonts)
      block.appendChild(windowFloat(patch.windowIndent * scale, gapBefore * scale, fonts))
    }
    if (marker && (pos > 0 || !!opts.atParaStart)) {
      const content = document.createElement('span')
      content.className = 'paragraph-list-content'
      content.appendChild(nodes)
      block.appendChild(content)
    } else block.appendChild(nodes)
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

/** Move a collapsed caret out of element boundaries and paragraph breaks to the canonical text-node position. */
export function normalizeCaretIn(root: HTMLElement): boolean {
  const sel = document.getSelection()
  const node = sel?.anchorNode
  if (!sel || !sel.isCollapsed || !node || !root.contains(node)) return false
  const offset = textOffsetIn(root, node, sel.anchorOffset)
  const [textNode, textOffset] = locate(root, offset)
  if (node === textNode && sel.anchorOffset === textOffset) return false
  setSelectionIn(root, offset, offset)
  return true
}

function locate(root: HTMLElement, target: number): [Node, number] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let pos = 0
  let last: Text | null = null
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    last = n
    // an offset between two paragraphs is the start of the later one: the end of the earlier one, after its break, is
    // a place with no box of its own, where the caret is not drawn and an arrow key finds no line to move from
    if (target < pos + n.data.length || (target === pos + n.data.length && !n.data.endsWith('\n'))) return [n, target - pos]
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
