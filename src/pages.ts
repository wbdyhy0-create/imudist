import { MAX_PAGES, type Assets, type DocSettings, type ImageFrame, type TextFrame } from './document'
import { removeFrame } from './frames'
import { computeLayout } from './layout'

/** Pure operations on the pages of a document. Text frames and pictures follow the page they sit on. */

export interface PageRect {
  x: number
  y: number
  w: number
  h: number
}

/** Everything the user has made: the settings and the objects on the pages. It is what undo / save / open handle. */
export interface DocContent {
  doc: DocSettings
  frames: TextFrame[]
  images: ImageFrame[]
  /** picture data, by id (kept even when no frame uses it, so undo can bring the picture back) */
  assets: Assets
}

/** World rectangle of every page, indexed by page index. */
export function pageRects(doc: DocSettings): PageRect[] {
  const rects: PageRect[] = new Array(doc.pages)
  for (const s of computeLayout(doc).spreads) {
    for (const p of s.pages) rects[p.index] = { x: p.x, y: s.y, w: doc.width, h: doc.height }
  }
  return rects
}

/** The page a point belongs to: the one containing it, or the nearest one (objects on the pasteboard follow it). */
export function ownerPage(rects: PageRect[], cx: number, cy: number): number {
  let best = 0
  let bestDist = Infinity
  rects.forEach((r, i) => {
    const dx = Math.max(r.x - cx, 0, cx - (r.x + r.w))
    const dy = Math.max(r.y - cy, 0, cy - (r.y + r.h))
    const d = dx * dx + dy * dy
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  })
  return best
}

/**
 * Re-position the objects after the pages changed. Every object belongs to the page it was on; `map` says which
 * page that is afterwards, or null when the page is gone (its objects are deleted, keeping any text thread intact).
 */
export function remapContent(c: DocContent, newDoc: DocSettings, map: (oldIndex: number) => number | null): DocContent {
  const oldRects = pageRects(c.doc)
  const newRects = pageRects(newDoc)

  /** the new position of a box, or null if its page is gone */
  const follow = (b: { x: number; y: number; w: number; h: number }) => {
    const o = ownerPage(oldRects, b.x + b.w / 2, b.y + b.h / 2)
    const n = map(o)
    return n === null || !newRects[n] ? null : { x: newRects[n].x + (b.x - oldRects[o].x), y: newRects[n].y + (b.y - oldRects[o].y) }
  }

  let frames = c.frames.map((f) => {
    const p = follow(f)
    return p ? { ...f, ...p } : f
  })
  for (const f of c.frames) if (!follow(f)) frames = removeFrame(frames, f.id)

  const images = c.images.flatMap((im) => {
    const p = follow(im)
    return p ? [{ ...im, ...p }] : []
  })
  return { doc: newDoc, frames, images, assets: c.assets }
}

/** Insert `count` blank pages so the first new one gets index `at` (0 … pages). */
export function insertPages(c: DocContent, at: number, count: number): DocContent | null {
  count = Math.min(count, MAX_PAGES - c.doc.pages)
  if (count < 1) return null
  at = Math.max(0, Math.min(at, c.doc.pages))
  return remapContent(c, { ...c.doc, pages: c.doc.pages + count }, (i) => (i >= at ? i + count : i))
}

/** Delete pages (and what is on them). A document keeps at least one page. */
export function deletePages(c: DocContent, indices: number[]): DocContent | null {
  const del = new Set(indices.filter((i) => i >= 0 && i < c.doc.pages))
  if (del.size === 0 || del.size >= c.doc.pages) return null
  return remapContent(c, { ...c.doc, pages: c.doc.pages - del.size }, (i) => {
    if (del.has(i)) return null
    let before = 0
    for (const d of del) if (d < i) before++
    return i - before
  })
}

/** Move the page at `from` so that it ends up at index `to` (in the final order). */
export function movePage(c: DocContent, from: number, to: number): DocContent | null {
  if (from === to || from < 0 || to < 0 || from >= c.doc.pages || to >= c.doc.pages) return null
  const order = Array.from({ length: c.doc.pages }, (_, i) => i)
  order.splice(to, 0, order.splice(from, 1)[0])
  // order[newIndex] = oldIndex
  const newIndexOf = new Map(order.map((oldIndex, newIndex) => [oldIndex, newIndex]))
  return remapContent(c, c.doc, (i) => newIndexOf.get(i) ?? null)
}

/** Replace the document's settings (size, margins, page count …); objects stay on their pages. */
export function applySettings(c: DocContent, next: DocSettings): DocContent {
  return remapContent(c, next, (i) => (i < next.pages ? i : null))
}
