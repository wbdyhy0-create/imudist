import { MAX_GUIDES, pageSize, type DocSettings, type Guide, type PageSize } from './document'
import { pageMargins, type PageSide } from './layout'

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
