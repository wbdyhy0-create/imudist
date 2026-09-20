import { MAX_PAGES, type DocSettings, type TextFrame } from './document'
import { removeFrame } from './frames'
import { computeLayout } from './layout'

/** Pure operations on the pages of a document. Text frames follow the page they sit on. */

export interface PageRect {
  x: number
  y: number
  w: number
  h: number
}

/** World rectangle of every page, indexed by page index. */
export function pageRects(doc: DocSettings): PageRect[] {
  const rects: PageRect[] = new Array(doc.pages)
  for (const s of computeLayout(doc).spreads) {
    for (const p of s.pages) rects[p.index] = { x: p.x, y: s.y, w: doc.width, h: doc.height }
  }
  return rects
}

/** The page a point belongs to: the one containing it, or the nearest one (frames on the pasteboard follow it). */
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
 * Re-position frames after the pages changed. Every frame belongs to the page it was on (`oldDoc`); `map` says which
 * page that is afterwards, or null when the page is gone (its frames are deleted, keeping any text thread intact).
 */
export function remapFrames(frames: TextFrame[], oldDoc: DocSettings, newDoc: DocSettings, map: (oldIndex: number) => number | null): TextFrame[] {
  const oldRects = pageRects(oldDoc)
  const newRects = pageRects(newDoc)
  const moved = new Map<string, { x: number; y: number }>()
  const gone: string[] = []

  for (const f of frames) {
    const o = ownerPage(oldRects, f.x + f.w / 2, f.y + f.h / 2)
    const n = map(o)
    if (n === null || !newRects[n]) gone.push(f.id)
    else moved.set(f.id, { x: newRects[n].x + (f.x - oldRects[o].x), y: newRects[n].y + (f.y - oldRects[o].y) })
  }

  let out = frames.map((f) => (moved.has(f.id) ? { ...f, ...moved.get(f.id)! } : f))
  for (const id of gone) out = removeFrame(out, id)
  return out
}

export interface DocContent {
  doc: DocSettings
  frames: TextFrame[]
}

/** Insert `count` blank pages so the first new one gets index `at` (0 … pages). */
export function insertPages(doc: DocSettings, frames: TextFrame[], at: number, count: number): DocContent | null {
  count = Math.min(count, MAX_PAGES - doc.pages)
  if (count < 1) return null
  at = Math.max(0, Math.min(at, doc.pages))
  const next = { ...doc, pages: doc.pages + count }
  return { doc: next, frames: remapFrames(frames, doc, next, (i) => (i >= at ? i + count : i)) }
}

/** Delete pages (and the frames on them). A document keeps at least one page. */
export function deletePages(doc: DocSettings, frames: TextFrame[], indices: number[]): DocContent | null {
  const del = new Set(indices.filter((i) => i >= 0 && i < doc.pages))
  if (del.size === 0 || del.size >= doc.pages) return null
  const next = { ...doc, pages: doc.pages - del.size }
  return {
    doc: next,
    frames: remapFrames(frames, doc, next, (i) => {
      if (del.has(i)) return null
      let before = 0
      for (const d of del) if (d < i) before++
      return i - before
    }),
  }
}

/** Move the page at `from` so that it ends up at index `to` (in the final order). */
export function movePage(doc: DocSettings, frames: TextFrame[], from: number, to: number): DocContent | null {
  if (from === to || from < 0 || to < 0 || from >= doc.pages || to >= doc.pages) return null
  const order = Array.from({ length: doc.pages }, (_, i) => i)
  order.splice(to, 0, order.splice(from, 1)[0])
  // order[newIndex] = oldIndex
  const newIndexOf = new Map(order.map((oldIndex, newIndex) => [oldIndex, newIndex]))
  return { doc, frames: remapFrames(frames, doc, doc, (i) => newIndexOf.get(i) ?? null) }
}

/** Replace the document's settings (size, margins, page count …); frames stay on their pages. */
export function applySettings(doc: DocSettings, frames: TextFrame[], next: DocSettings): DocContent {
  return { doc: next, frames: remapFrames(frames, doc, next, (i) => (i < next.pages ? i : null)) }
}
