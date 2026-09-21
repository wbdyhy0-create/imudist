import { MAX_GUIDES, pageSize, type DocSettings, type Guide, type GuideAxis, type PageSize } from './document'
import { pageMargins, type PageSide } from './layout'

/** The guides another guide lines up with while it is dragged. */
export interface GuideSnap {
  /** world coordinate (y for a horizontal guide, x for a vertical one) that the dragged guide is held on */
  world: number
  /** the guides on that coordinate */
  ids: string[]
  /** the stretch along the guide that the alignment line covers (x range for h, y range for v), world points */
  span: [number, number]
}

/**
 * If the dragged guide (at `world`, on `page`) is within `tol` of a guide of the same direction on ANOTHER page, the
 * exact coordinate of that guide and everything that lines up there; otherwise null. Guides on different pages of a
 * row have equal world coordinates when they are the same distance from the same top edge.
 */
export function snapGuide(
  axis: GuideAxis,
  world: number,
  page: number,
  dragId: string | null,
  guides: Guide[],
  rects: { x: number; y: number; w: number; h: number }[],
  tol: number,
): GuideSnap | null {
  const at = (g: Guide) => (axis === 'h' ? rects[g.page].y + g.pos : rects[g.page].x + g.pos)
  const others = guides.filter((g) => g.axis === axis && g.id !== dragId && g.page !== page && rects[g.page])
  let target: number | null = null
  for (const g of others) {
    const d = Math.abs(at(g) - world)
    if (d <= tol && (target === null || d < Math.abs(target - world))) target = at(g)
  }
  if (target === null) return null

  const ids: string[] = []
  let lo = Infinity
  let hi = -Infinity
  const cover = (r: { x: number; y: number; w: number; h: number }) => {
    lo = Math.min(lo, axis === 'h' ? r.x : r.y)
    hi = Math.max(hi, axis === 'h' ? r.x + r.w : r.y + r.h)
  }
  cover(rects[page])
  for (const g of others) {
    if (Math.abs(at(g) - target) < 0.01) {
      ids.push(g.id)
      cover(rects[g.page])
    }
  }
  return { world: target, ids, span: [lo, hi] }
}

/** Making many guides at once: an equal division of the page, or lines at a fixed distance. */

export type GuideMode = 'divide' | 'spacing'

export interface GuideSpec {
  /**
   * divide: split the area into `cols` × `rows` cells separated by gutters (`colGap`, `rowGap`); the guides mark the cell edges.
   * spacing: `cols` vertical and `rows` horizontal lines, each `colGap` / `rowGap` after the previous one, counted from the area's start.
   */
  mode: GuideMode
  cols: number
  colGap: number
  rows: number
  rowGap: number
  /** the margins (the text area of the page) or the whole page */
  area: 'margins' | 'page'
}

export const DEFAULT_GUIDE_SPEC: GuideSpec = { mode: 'divide', cols: 2, colGap: 0, rows: 2, rowGap: 0, area: 'margins' }

const EPS = 0.01

/** Positions (points from the page's left / top edge) of the vertical and horizontal guides of one page. */
export function guidePositions(doc: DocSettings, side: PageSide, size: PageSize, index: number, spec: GuideSpec): { v: number[]; h: number[] } {
  const m = spec.area === 'margins' ? pageMargins(doc, side, index) : { top: 0, bottom: 0, left: 0, right: 0 }
  const x0 = m.left
  const y0 = m.top
  const x1 = size.w - m.right
  const y1 = size.h - m.bottom

  const line = (start: number, end: number, count: number, gap: number): number[] => {
    const n = Math.max(0, Math.floor(count))
    if (spec.mode === 'spacing') {
      if (gap <= EPS) return []
      const out: number[] = []
      for (let k = 1; k <= n; k++) {
        const p = start + k * gap
        if (p <= end + EPS) out.push(p)
      }
      return out
    }
    if (n < 2) return []
    const cell = (end - start - gap * (n - 1)) / n
    if (cell <= EPS) return []
    const out: number[] = []
    for (let i = 1; i < n; i++) {
      out.push(start + i * cell + (i - 1) * gap) // where cell i ends
      if (gap > EPS) out.push(start + i * (cell + gap)) // where the next one starts
    }
    return out
  }

  return { v: line(x0, x1, spec.cols, spec.colGap), h: line(y0, y1, spec.rows, spec.rowGap) }
}

/**
 * The guides of `spec` for the given pages, added to `existing` (or replacing the ones on those pages when `replace`).
 * A guide that is already there is not added twice, and the total never passes MAX_GUIDES.
 */
export function applyGuideSpec(
  doc: DocSettings,
  sides: PageSide[],
  existing: Guide[],
  pages: number[],
  spec: GuideSpec,
  color: string,
  replace: boolean,
  newId: () => string,
): Guide[] {
  const target = new Set(pages)
  const out = replace ? existing.filter((g) => !target.has(g.page)) : [...existing]
  for (const page of pages) {
    const { v, h } = guidePositions(doc, sides[page] ?? 'single', pageSize(doc, page), page, spec)
    const add = (axis: 'h' | 'v', pos: number) => {
      if (out.length >= MAX_GUIDES) return
      if (out.some((g) => g.page === page && g.axis === axis && Math.abs(g.pos - pos) < EPS)) return
      out.push({ id: newId(), page, axis, pos: Math.round(pos * 1000) / 1000, color })
    }
    v.forEach((p) => add('v', p))
    h.forEach((p) => add('h', p))
  }
  return out
}
