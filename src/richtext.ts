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
   * points, unscaled: extra vertical space inserted right after every "\n" — how `spaceAfter` becomes real space
   * between paragraphs, not just once at the edges of a frame. See the long comment on `buildRunNodes` below.
   */
  paraLineHeight?: number
}

/** A zero-width `display: inline-block` sibling right after a "\n", `height` tall — see `buildRunNodes`. */
function paraGap(heightPx: number): HTMLElement {
  const gap = document.createElement('span')
  gap.className = 'para-gap'
  gap.contentEditable = 'false'
  gap.style.height = `${heightPx}px`
  return gap
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
 * The spacer holds no text, so it is invisible to anything that counts characters (`textOffsetIn`, `locate`,
 * `el.textContent`) — the same reasoning `.wrap-float` already relies on. Marked `contentEditable="false"` so the
 * live editor treats it as an atomic, unselectable unit, like `.wrap-float`.
 */
export function buildRunNodes(text: string, runs: Run[], scale: number, opts: RunNodeOpts = {}): DocumentFragment {
  const frag = document.createDocumentFragment()
  let pos = 0
  for (const r of runs) {
    const span = document.createElement('span')
    applyRunStyle(span, r.style, scale)
    const runText = text.slice(pos, pos + r.len)
    if (opts.showMarks || opts.paraLineHeight) {
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
          if (opts.paraLineHeight) span.appendChild(paraGap(opts.paraLineHeight * scale))
        } else if (opts.showMarks) {
          const mark = document.createElement('span')
          mark.className = 'mark-space'
          mark.textContent = piece.text
          span.appendChild(mark)
        } else {
          span.appendChild(document.createTextNode(piece.text))
        }
      }
    } else {
      span.textContent = runText
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
