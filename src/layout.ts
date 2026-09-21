import { marginsOf, pageSize, type DocSettings, type Sides } from './document'

export type PageSide = 'left' | 'right' | 'single'

export interface PageLayout {
  index: number
  /** displayed page number (respects "Start #") */
  number: number
  side: PageSide
  /** world x of the page's left edge, points */
  x: number
  /** the page's size, points */
  w: number
  h: number
}

export interface SpreadLayout {
  pages: PageLayout[]
  label: string
  /** world y of the top edge (all the pages of a row are aligned at the top), points */
  y: number
  /** the height of the tallest page of the row */
  h: number
  /** the pages touch each other (a spread) instead of standing apart */
  joined: boolean
  /** x-range that actually holds pages (an empty half of a spread is excluded) */
  contentX: number
  contentW: number
  /** physical (left/right = real sides) bleed and slug around this spread */
  bleed: Sides
  slug: Sides
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface DocLayout {
  spreads: SpreadLayout[]
  bounds: Bounds
}

/** Space between the pages of a row that are not joined into a spread, points. */
export const ROW_GAP = 28

/**
 * World space: y = 0 is the top of the first row, y grows downwards. Rows are stacked; the pages of a row stand next
 * to each other (`perRow` of them) and are aligned at the top, each with its own size.
 * Facing pages (two per row): (even, odd) page numbers pair up; odd pages are the right-hand pages in left-to-right
 * binding and the left-hand pages in right-to-left binding; x = 0 is the left edge of the widest left-hand page and
 * all the spines line up. Other rows start at x = 0 (left-to-right) or end at the right edge of the widest row
 * (right-to-left, where the first page of a row is the rightmost).
 */
export function computeLayout(doc: DocSettings): DocLayout {
  const { pages, startPage, binding } = doc
  const rtl = binding === 'rtl'
  const perRow = Math.max(1, Math.floor(doc.perRow))
  const facing = doc.facingPages && perRow >= 2
  const pairing = facing && perRow === 2

  const groups: number[][] = []
  if (pairing) {
    for (let i = 0; i < pages; ) {
      const isVerso = (startPage + i) % 2 === 0
      if (isVerso && i + 1 < pages) {
        groups.push([i, i + 1])
        i += 2
      } else {
        groups.push([i])
        i += 1
      }
    }
  } else {
    for (let i = 0; i < pages; i += perRow) groups.push(Array.from({ length: Math.min(perRow, pages - i) }, (_, k) => i + k))
  }

  /** the side of a facing pair's page (odd pages sit on the left in right-to-left binding) */
  const pairSide = (number: number): PageSide => ((number % 2 === 1) === rtl ? 'left' : 'right')

  // the spine of facing pairs: the widest left-hand page decides where the pages meet
  let spine = 0
  if (pairing) {
    for (let i = 0; i < pages; i++) if (pairSide(startPage + i) === 'left') spine = Math.max(spine, pageSize(doc, i).w)
  }

  const gap = facing ? 0 : ROW_GAP
  const rowWidth = (idx: number[]) => idx.reduce((sum, i) => sum + pageSize(doc, i).w, 0) + gap * (idx.length - 1)
  const widest = pairing ? 0 : groups.reduce((m, g) => Math.max(m, rowWidth(g)), 0)

  const vExtra = Math.max(doc.bleed.top + doc.bleed.bottom, doc.slug.top + doc.slug.bottom)
  const rowGap = 36 + vExtra

  let y = 0
  const bounds: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }

  const spreads = groups.map((idx): SpreadLayout => {
    let pageLayouts: PageLayout[]
    if (pairing) {
      pageLayouts = idx.map((i) => {
        const number = startPage + i
        const side = pairSide(number)
        const { w, h } = pageSize(doc, i)
        return { index: i, number, side, x: side === 'right' ? spine : spine - w, w, h }
      })
    } else {
      // physical order, left to right: the first page of a row is the rightmost one in right-to-left binding
      const order = rtl ? [...idx].reverse() : idx
      let x = rtl ? widest - rowWidth(idx) : 0
      pageLayouts = order.map((i, k) => {
        const { w, h } = pageSize(doc, i)
        const side: PageSide = !facing ? 'single' : k === 0 ? 'left' : k === order.length - 1 ? 'right' : 'single'
        const p: PageLayout = { index: i, number: startPage + i, side, x, w, h }
        x += w + gap
        return p
      })
    }

    const leftmost = pageLayouts.reduce((a, b) => (b.x < a.x ? b : a))
    const rightmost = pageLayouts.reduce((a, b) => (b.x + b.w > a.x + a.w ? b : a))
    const contentX = leftmost.x
    const contentW = rightmost.x + rightmost.w - leftmost.x
    const h = pageLayouts.reduce((m, p) => Math.max(m, p.h), 0)

    // left = inside, right = outside in the document model when facing pages are on
    const physical = (s: Sides): Sides =>
      !facing
        ? s
        : {
            top: s.top,
            bottom: s.bottom,
            left: leftmost.side === 'left' ? s.right : s.left,
            right: rightmost.side === 'right' ? s.right : s.left,
          }
    const bleed = physical(doc.bleed)
    const slug = physical(doc.slug)

    const spread: SpreadLayout = {
      pages: pageLayouts,
      label: pageLayouts
        .map((p) => p.number)
        .sort((a, b) => a - b)
        .join('-'),
      y,
      h,
      joined: facing,
      contentX,
      contentW,
      bleed,
      slug,
    }

    bounds.minX = Math.min(bounds.minX, contentX - Math.max(bleed.left, slug.left))
    bounds.maxX = Math.max(bounds.maxX, contentX + contentW + Math.max(bleed.right, slug.right))
    bounds.minY = Math.min(bounds.minY, y - Math.max(bleed.top, slug.top))
    bounds.maxY = Math.max(bounds.maxY, y + h + Math.max(bleed.bottom, slug.bottom))

    y += h + rowGap
    return spread
  })

  return { spreads, bounds }
}

/** The side (left / right / single) of every page, by page index. */
export function pageSidesOf(doc: DocSettings): PageSide[] {
  const sides: PageSide[] = []
  for (const s of computeLayout(doc).spreads) for (const p of s.pages) sides[p.index] = p.side
  return sides
}

/** Margins as physical sides of one page (swaps inside/outside on left-hand pages). */
export function pageMargins(doc: DocSettings, side: PageSide, index: number): Sides {
  const m = marginsOf(doc, index)
  if (!doc.facingPages || side !== 'left') return m
  return { top: m.top, bottom: m.bottom, left: m.right, right: m.left }
}
