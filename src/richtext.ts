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

/** DOM for a formatted text: one <span> per run. The text keeps its "\n" characters (white-space: pre-wrap). */
export function buildRunNodes(text: string, runs: Run[], scale: number): DocumentFragment {
  const frag = document.createDocumentFragment()
  let pos = 0
  for (const r of runs) {
    const span = document.createElement('span')
    applyRunStyle(span, r.style, scale)
    span.textContent = text.slice(pos, pos + r.len)
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
