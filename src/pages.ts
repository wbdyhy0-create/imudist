import { MAX_PAGES, normalizeSizes, type Assets, type DocSettings, type Guide, type ImageFrame, type ParagraphStyleRecord, type ParentPage, type ShapeFrame, type TextFrame } from './document'
import { removeFrame } from './frames'
import { computeLayout, rowGroups } from './layout'

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
  /** ruler guides, each on one page */
  guides: Guide[]
  /** drawn shapes */
  shapes: ShapeFrame[]
  /** named paragraph styles (Paragraph Styles panel); every document has at least one */
  paragraphStyles: ParagraphStyleRecord[]
  /** the document's parent (master) pages */
  parents: ParentPage[]
  /** which parent page applies to each document page, by index (null / missing = none) */
  pageParents: (string | null)[]
}

/** World rectangle of every page, indexed by page index. */
export function pageRects(doc: DocSettings): PageRect[] {
  const rects: PageRect[] = new Array(doc.pages)
  for (const s of computeLayout(doc).spreads) {
    for (const p of s.pages) rects[p.index] = { x: p.x, y: s.y, w: p.w, h: p.h }
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
  const shapes = c.shapes.flatMap((sh) => {
    const p = follow(sh)
    return p ? [{ ...sh, ...p }] : []
  })
  // a guide follows its page; the guides of a deleted page are gone
  const guides = c.guides.flatMap((g) => {
    const n = map(g.page)
    return n === null || n >= newDoc.pages ? [] : [n === g.page ? g : { ...g, page: n }]
  })
  return {
    doc: newDoc,
    frames,
    images,
    assets: c.assets,
    guides,
    shapes,
    paragraphStyles: c.paragraphStyles,
    parents: c.parents,
    pageParents: remapList(c.pageParents, newDoc.pages, map),
  }
}

/**
 * Every parent (master) page's objects, translated onto every document page that uses it - one copy per page,
 * with a synthetic id (so it never collides with a real object). Shared by the on-screen "shadow" rendering
 * (which additionally culls to the visible viewport) and by PDF export (which needs every page, not just the
 * ones currently on screen).
 */
export function parentShadowContent(
  doc: DocSettings,
  parents: ParentPage[],
  pageParents: (string | null)[],
): { frames: TextFrame[]; images: ImageFrame[]; shapes: ShapeFrame[] } {
  const rects = pageRects(doc)
  const out: { frames: TextFrame[]; images: ImageFrame[]; shapes: ShapeFrame[] } = { frames: [], images: [], shapes: [] }
  pageParents.forEach((parentId, pageIndex) => {
    const parent = parentId ? parents.find((p) => p.id === parentId) : undefined
    const rect = rects[pageIndex]
    if (!parent || !rect) return
    const dx = rect.x
    const dy = rect.y
    for (const f of parent.frames) out.frames.push({ ...f, id: `parent-shadow:${pageIndex}:${f.id}`, x: f.x + dx, y: f.y + dy, next: null })
    for (const im of parent.images) out.images.push({ ...im, id: `parent-shadow:${pageIndex}:${im.id}`, x: im.x + dx, y: im.y + dy })
    for (const sh of parent.shapes) out.shapes.push({ ...sh, id: `parent-shadow:${pageIndex}:${sh.id}`, x: sh.x + dx, y: sh.y + dy })
  })
  return out
}

/** A per-page list (sizes, margins) after the pages were renumbered: `map` gives the new index of an old page, or null if it is gone. */
function remapList<T>(list: (T | null)[], pages: number, map: (i: number) => number | null): (T | null)[] {
  const out: (T | null)[] = new Array(pages).fill(null)
  list.forEach((z, i) => {
    const n = map(i)
    if (z && n !== null && n >= 0 && n < pages) out[n] = z
  })
  while (out.length > 0 && out[out.length - 1] === null) out.pop()
  return out
}

/** The document's per-page settings after the pages were renumbered. */
const remapDoc = (doc: DocSettings, pages: number, map: (i: number) => number | null): DocSettings => ({
  ...doc,
  pages,
  pageSizes: remapList(doc.pageSizes, pages, map),
  pageMargins: remapList(doc.pageMargins, pages, map),
  pageJoins: remapList(doc.pageJoins, pages, map),
})

/** The document with its rows written down page by page, so a page can be added into one row without moving the others. */
function withCustomRows(doc: DocSettings): DocSettings {
  if (doc.rowsCustom) return doc
  const joins: (true | null)[] = new Array(doc.pages).fill(null)
  for (const row of rowGroups(doc)) for (const i of row.slice(1)) joins[i] = true
  return { ...doc, rowsCustom: true, pageJoins: joins }
}

/**
 * Insert `count` blank pages so the first new one gets index `at` (0 … pages).
 * `beside`: the new pages join the row of the page before them (the row grows), instead of starting rows of their own.
 */
export function insertPages(c: DocContent, at: number, count: number, beside = false): DocContent | null {
  count = Math.min(count, MAX_PAGES - c.doc.pages)
  if (count < 1) return null
  at = Math.max(0, Math.min(at, c.doc.pages))
  const map = (i: number) => (i >= at ? i + count : i)
  const pages = c.doc.pages + count
  let doc = remapDoc(beside && at > 0 ? withCustomRows(c.doc) : c.doc, pages, map)
  if (doc.rowsCustom) {
    const joins = [...doc.pageJoins]
    while (joins.length < pages) joins.push(null)
    for (let k = 0; k < count; k++) joins[at + k] = beside && at > 0 ? true : null
    // a page that was joined to the one before it, and now follows the new pages, starts its own row
    if (!(beside && at > 0) && at + count < pages) joins[at + count] = null
    doc = { ...doc, pageJoins: joins }
  }
  return remapContent(c, doc, map)
}

/** Delete pages (and what is on them). A document keeps at least one page. */
export function deletePages(c: DocContent, indices: number[]): DocContent | null {
  const del = new Set(indices.filter((i) => i >= 0 && i < c.doc.pages))
  if (del.size === 0 || del.size >= c.doc.pages) return null
  const map = (i: number) => {
    if (del.has(i)) return null
    let before = 0
    for (const d of del) if (d < i) before++
    return i - before
  }
  const pages = c.doc.pages - del.size
  return remapContent(c, remapDoc(c.doc, pages, map), map)
}

/** Move the page at `from` so that it ends up at index `to` (in the final order). */
export function movePage(c: DocContent, from: number, to: number): DocContent | null {
  if (from === to || from < 0 || to < 0 || from >= c.doc.pages || to >= c.doc.pages) return null
  const order = Array.from({ length: c.doc.pages }, (_, i) => i)
  order.splice(to, 0, order.splice(from, 1)[0])
  // order[newIndex] = oldIndex
  const newIndexOf = new Map(order.map((oldIndex, newIndex) => [oldIndex, newIndex]))
  const map = (i: number) => newIndexOf.get(i) ?? null
  return remapContent(c, remapDoc(c.doc, c.doc.pages, map), map)
}

/** Replace the document's settings (size, margins, page count …); objects stay on their pages. */
export function applySettings(c: DocContent, next: DocSettings): DocContent {
  return remapContent(c, normalizeSizes(next), (i) => (i < next.pages ? i : null))
}
