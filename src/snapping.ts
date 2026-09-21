import type { DocSettings, Guide } from './document'
import { pageMargins, pageSidesOf } from './layout'
import { pageRects } from './pages'
import { columnBoxes } from './placeText'

/** Lines that objects snap to while they are dragged or resized: page edges, margins, column edges and ruler guides. */

export interface SnapLine {
  /** 'v': a vertical line at x = `at`; 'h': a horizontal line at y = `at` */
  axis: 'v' | 'h'
  /** world coordinate: x for a vertical line, y for a horizontal one */
  at: number
  /** the stretch the line covers (the height of its page for a vertical line, the width for a horizontal one) */
  from: number
  to: number
  kind: 'page' | 'margin' | 'column' | 'guide' | 'center'
}

export interface SnapLines {
  v: SnapLine[]
  h: SnapLine[]
  /** the middle of every page and of its text area: the middle of a moved object is held on these */
  cv: SnapLine[]
  ch: SnapLine[]
}

/** Every snapping line of the document. */
export function snapLinesOf(doc: DocSettings, guides: Guide[]): SnapLines {
  const rects = pageRects(doc)
  const sides = pageSidesOf(doc)
  const v: SnapLine[] = []
  const h: SnapLine[] = []
  const cv: SnapLine[] = []
  const ch: SnapLine[] = []
  rects.forEach((r, i) => {
    const m = pageMargins(doc, sides[i], i)
    const across = (kind: SnapLine['kind'], at: number) => v.push({ axis: 'v', at, from: r.y, to: r.y + r.h, kind })
    const down = (kind: SnapLine['kind'], at: number) => h.push({ axis: 'h', at, from: r.x, to: r.x + r.w, kind })
    across('page', r.x)
    across('page', r.x + r.w)
    down('page', r.y)
    down('page', r.y + r.h)
    across('margin', r.x + m.left)
    across('margin', r.x + r.w - m.right)
    down('margin', r.y + m.top)
    down('margin', r.y + r.h - m.bottom)
    // the middle of the page, and of the area inside the margins when that is somewhere else (facing pages have an inside and an outside margin)
    for (const at of new Set([r.x + r.w / 2, r.x + (m.left + r.w - m.right) / 2].map((v) => Math.round(v * 100) / 100))) cv.push({ axis: 'v', at, from: r.y, to: r.y + r.h, kind: 'center' })
    for (const at of new Set([r.y + r.h / 2, r.y + (m.top + r.h - m.bottom) / 2].map((v) => Math.round(v * 100) / 100))) ch.push({ axis: 'h', at, from: r.x, to: r.x + r.w, kind: 'center' })
    if (doc.columns > 1) {
      for (const c of columnBoxes(doc, r, sides[i], i)) {
        across('column', c.x)
        across('column', c.x + c.w)
      }
    }
  })
  for (const g of guides) {
    const r = rects[g.page]
    if (!r) continue
    if (g.axis === 'v') v.push({ axis: 'v', at: r.x + g.pos, from: r.y, to: r.y + r.h, kind: 'guide' })
    else h.push({ axis: 'h', at: r.y + g.pos, from: r.x, to: r.x + r.w, kind: 'guide' })
  }
  return { v, h, cv, ch }
}

/**
 * The smallest move that puts one of the `edges` exactly on a line, if that takes no more than `tol`.
 * Lines that only the page's outer edge shares with a margin of 0 are the same line: the nearest wins.
 */
export function snapEdges(edges: number[], lines: SnapLine[], tol: number): { delta: number; line: SnapLine } | null {
  let best: { delta: number; line: SnapLine } | null = null
  for (const line of lines) {
    for (const e of edges) {
      const delta = line.at - e
      if (Math.abs(delta) <= tol && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, line }
    }
  }
  return best
}
