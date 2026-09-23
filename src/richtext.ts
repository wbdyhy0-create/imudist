import type { CharStyle, Run } from './document'
import { shapeOf, type WrapFloat } from './wrap'

/** CSS for one run. `scale` is the zoom (1 for measuring); font sizes are stored in points. */
export function applyRunStyle(el: HTMLElement, style: CharStyle, scale: number) {
  el.style.fontFamily = `"${style.fontFamily}", "Segoe UI", Arial, sans-serif`
  el.style.fontSize = `${style.fontSize * scale}px`
  el.style.fontWeight = String(style.weight)
  el.style.fontStyle = style.italic ? 'italic' : 'normal'
  // tracking is 1/1000 em (InDesign's own unit)
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
    if (opts.showMarks || opts.paraLineHeight || opts.paraGaps || opts.firstLineIndent) {
      for (const piece of splitMarks(runText)) {
        if (piece.kind === 'text') {
          span.appendChild(document.createTextNode(piece.text))
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
      span.textContent = runText
      seen += runText.length
    }
    frag.appendChild(span)
    pos += r.len
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

/** Character offset `target` of `root`'s text, as a DOM (node, offset) position. Shared by `setSelectionIn` and
 *  pdfExport.ts's own line-break lookup (mapping a word's [start,end) into Ranges for `getClientRects()`). */
export function locate(root: HTMLElement, target: number): [Node, number] {
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
