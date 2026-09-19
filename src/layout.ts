import type { DocSettings, Sides } from './document'

export type PageSide = 'left' | 'right' | 'single'

export interface PageLayout {
  index: number
  /** displayed page number (respects "Start #") */
  number: number
  side: PageSide
  /** world x of the page's left edge, points */
  x: number
}

export interface SpreadLayout {
  pages: PageLayout[]
  label: string
  /** world y of the top edge, points */
  y: number
  h: number
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

/**
 * World space: x = 0 is the left edge of the left slot of every spread (all spines line up),
 * y = 0 is the top of the first spread, y grows downwards.
 * Facing pages: (even, odd) page numbers pair up; odd pages are the right-hand pages in
 * left-to-right binding and the left-hand pages in right-to-left binding.
 */
export function computeLayout(doc: DocSettings): DocLayout {
  const { width: w, height: h, pages, facingPages: facing, startPage, binding } = doc
  const rtl = binding === 'rtl'

  const groups: number[][] = []
  for (let i = 0; i < pages; ) {
    const isVerso = (startPage + i) % 2 === 0
    if (facing && isVerso && i + 1 < pages) {
      groups.push([i, i + 1])
      i += 2
    } else {
      groups.push([i])
      i += 1
    }
  }

  const vExtra = Math.max(doc.bleed.top + doc.bleed.bottom, doc.slug.top + doc.slug.bottom)
  const gap = 36 + vExtra

  let y = 0
  const bounds: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }

  const spreads = groups.map((idx): SpreadLayout => {
    const pageLayouts = idx.map((i): PageLayout => {
      const number = startPage + i
      const side: PageSide = !facing ? 'single' : (number % 2 === 1) === rtl ? 'left' : 'right'
      return { index: i, number, side, x: side === 'right' ? w : 0 }
    })

    const leftmost = pageLayouts.reduce((a, b) => (b.x < a.x ? b : a))
    const rightmost = pageLayouts.reduce((a, b) => (b.x > a.x ? b : a))
    const contentX = leftmost.x
    const contentW = rightmost.x + w - leftmost.x

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
      contentX,
      contentW,
      bleed,
      slug,
    }

    bounds.minX = Math.min(bounds.minX, contentX - Math.max(bleed.left, slug.left))
    bounds.maxX = Math.max(bounds.maxX, contentX + contentW + Math.max(bleed.right, slug.right))
    bounds.minY = Math.min(bounds.minY, y - Math.max(bleed.top, slug.top))
    bounds.maxY = Math.max(bounds.maxY, y + h + Math.max(bleed.bottom, slug.bottom))

    y += h + gap
    return spread
  })

  return { spreads, bounds }
}

/** Margins as physical sides of one page (swaps inside/outside on left-hand pages). */
export function pageMargins(doc: DocSettings, side: PageSide): Sides {
  const m = doc.margins
  if (!doc.facingPages || side !== 'left') return m
  return { top: m.top, bottom: m.bottom, left: m.right, right: m.left }
}
