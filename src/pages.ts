import { EXTERNAL_PAGE_NUMBER_MARKER, INTERNAL_LETTER_PAGE_NUMBER_MARKER, INTERNAL_PAGE_NUMBER_MARKER, LETTER_PAGE_NUMBER_MARKER, MAX_PAGES, normalizeSizes, PAGE_NUMBER_MARKER, RUNNING_HEADER_MARKER, type Assets, type CharacterStyleRecord, type ColorSample, type DocSettings, type Guide, type ImageFrame, type LayerInfo, type PageSection, type ParagraphStyleRecord, type ParentPage, type RunningHeaderStrategy, type ShapeFrame, type TextFrame } from './document'
import { chainOf, headFrames, removeFrame } from './frames'
import { computeLayout, pageMargins, pageSidesOf, rowGroups } from './layout'
import { formatPageNumber, pageNumberLabel, substituteMarker } from './numbering'
import { normalizeRuns } from './story'

/** Pure operations on the pages of a document. Text frames and pictures follow the page they sit on. */

export interface PageRect {
  x: number
  y: number
  w: number
  h: number
}

export interface ParentShadowRef {
  parentId: string
  pageIndex: number
  sourceId: string
}

export interface ParentOverride extends ParentShadowRef {
  kind: 'frame' | 'image' | 'shape'
  localId: string
}

/** Everything the user has made: the settings and the objects on the pages. It is what undo / save / open handle. */
export interface DocContent {
  doc: DocSettings
  /** front-to-back layer order; absent in older documents */
  layerOrder?: string[]
  /** names, colours, hidden and locked of the layers, by id */
  layers?: Record<string, LayerInfo>
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
  /** named character styles (Character Styles panel); absent in older documents */
  characterStyles?: CharacterStyleRecord[]
  /** the document's parent (master) pages */
  parents: ParentPage[]
  /** which parent page applies to each document page, by index (null / missing = none) */
  pageParents: (string | null)[]
  /** independently-numbered runs of pages (Section Options); empty = the whole document numbers itself plainly */
  sections: PageSection[]
  /** page-local copies of parent items that have been overridden */
  parentOverrides?: ParentOverride[]
  /** colors sampled into this document's color panel */
  colorSamples?: ColorSample[]
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
  // a section follows the page it started on; one whose page is gone is gone too
  const sections = c.sections.flatMap((s) => {
    const n = map(s.startPage)
    return n === null || n >= newDoc.pages ? [] : [n === s.startPage ? s : { ...s, startPage: n }]
  })
  const parentOverrides = (c.parentOverrides ?? []).flatMap((override) => {
    const pageIndex = map(override.pageIndex)
    return pageIndex === null || pageIndex >= newDoc.pages ? [] : [{ ...override, pageIndex }]
  })
  // everything not tied to a page (layer order, character styles, colour samples, whatever is added later) is kept as it is:
  // this result replaces the whole document, so a field left out here would be lost from it
  return {
    ...c,
    doc: newDoc,
    frames,
    images,
    guides,
    shapes,
    pageParents: remapList(c.pageParents, newDoc.pages, map),
    sections,
    parentOverrides,
  }
}

/**
 * The pseudo document used to edit a parent (master) page: matches the real document's own settings (margins,
 * columns, unit…) so its guides match, and is a two-page spread - joined explicitly, not left to page-number
 * parity, which a pseudo document has none of - whenever the real document has facing pages, so the parent can be
 * designed differently for the left side of a real spread than for the right, exactly like the document's own
 * inside/outside margins already work. `parentShadowContent` below picks the matching side back out.
 */
export function parentEditDoc(doc: DocSettings, parent: ParentPage): DocSettings {
  return {
    ...doc,
    name: parent.name,
    width: parent.w,
    height: parent.h,
    pages: doc.facingPages ? 2 : 1,
    startPage: 1,
    primaryTextFrame: false,
    pageSizes: [],
    pageMargins: [],
    pageJoins: doc.facingPages ? [null, true] : [],
    rowsCustom: doc.facingPages,
    perRow: doc.facingPages ? 2 : 1,
  }
}

/**
 * Every parent (master) page's objects, translated onto every document page that uses it - one copy per page, with
 * a synthetic id (so it never collides with a real object), and any auto-page-number marker in its text replaced
 * with that specific page's own number label. Shared by the on-screen "shadow" rendering (which additionally culls
 * to the visible viewport) and by PDF export (which needs every page, not just the ones currently on screen).
 */
export function parentShadowContent(
  doc: DocSettings,
  parents: ParentPage[],
  pageParents: (string | null)[],
  sections: PageSection[],
  documentFrames: TextFrame[] = [],
  runningHeader?: (pageIndex: number, styleId: string, strategy: 'first' | 'last') => string,
  parentOverrides: ParentOverride[] = [],
  documentImages: ImageFrame[] = [],
  documentShapes: ShapeFrame[] = [],
): {
  frames: (TextFrame & { parentShadowRef: ParentShadowRef })[]
  images: (ImageFrame & { parentShadowRef: ParentShadowRef })[]
  shapes: (ShapeFrame & { parentShadowRef: ParentShadowRef })[]
} {
  const rects = pageRects(doc)
  const sides = pageSidesOf(doc)
  const out: {
    frames: (TextFrame & { parentShadowRef: ParentShadowRef })[]
    images: (ImageFrame & { parentShadowRef: ParentShadowRef })[]
    shapes: (ShapeFrame & { parentShadowRef: ParentShadowRef })[]
  } = { frames: [], images: [], shapes: [] }
  const localIds = new Set([...documentFrames, ...documentImages, ...documentShapes].map((item) => item.id))
  const activeOverrides = new Set(parentOverrides
    .filter((override) => localIds.has(override.localId))
    .map((override) => `${override.pageIndex}:${override.parentId}:${override.kind}:${override.sourceId}`))
  const isOverridden = (pageIndex: number, parentId: string, kind: ParentOverride['kind'], sourceId: string) =>
    activeOverrides.has(`${pageIndex}:${parentId}:${kind}:${sourceId}`)
  pageParents.forEach((parentId, pageIndex) => {
    const parent = parentId ? parents.find((p) => p.id === parentId) : undefined
    const rect = rects[pageIndex]
    if (!parent || !rect) return
    const side = sides[pageIndex]
    // a facing document: only the half of the parent's own spread that matches this page's side (left/right),
    // translated from where it sits in that spread onto the real page - not the whole (two-page-wide) parent. A
    // page that isn't really part of a facing pair (side "single") gets the parent's first half, same as when the
    // document has no facing pages at all.
    let srcX = 0
    if (doc.facingPages && side !== 'single') {
      const spread = computeLayout(parentEditDoc(doc, parent)).spreads[0]
      const half = spread?.pages.find((p) => p.side === side)
      if (half) srcX = half.x
    }
    const dx = rect.x - srcX
    const dy = rect.y
    const inHalf = (x: number, w: number) => x + w / 2 >= srcX && x + w / 2 < srcX + parent.w
    const label = pageNumberLabel(sections, pageIndex, doc.startPage)
    for (const f of parent.frames) {
      if (f.hidden || !inHalf(f.x, f.w) || isOverridden(pageIndex, parent.id, 'frame', f.id)) continue
      const pageHeader = f.runningHeaderStyleId ? (runningHeader?.(pageIndex, f.runningHeaderStyleId, f.runningHeaderStrategy ?? 'last') ?? '') : ''
        const sourceRuns = normalizeRuns(f.text, f.runs, f)
        const numbered = substituteMarker(f.text, sourceRuns, PAGE_NUMBER_MARKER, label)
      const internal = substituteMarker(numbered.text, numbered.runs, INTERNAL_PAGE_NUMBER_MARKER, String(pageIndex + 1))
      const externalNumber = substituteMarker(internal.text, internal.runs, EXTERNAL_PAGE_NUMBER_MARKER, String(pageIndex + 1))
      const letters = substituteMarker(externalNumber.text, externalNumber.runs, LETTER_PAGE_NUMBER_MARKER, formatPageNumber(pageIndex + 1, 'hebrew'))
      const internalLetters = substituteMarker(letters.text, letters.runs, INTERNAL_LETTER_PAGE_NUMBER_MARKER, formatPageNumber(pageIndex + 1, 'hebrew'))
      const sub = substituteMarker(internalLetters.text, internalLetters.runs, RUNNING_HEADER_MARKER, pageHeader)
      out.frames.push({ ...f, ...sub, id: `parent-shadow:${pageIndex}:${f.id}`, x: f.x + dx, y: f.y + dy, next: null, parentShadowRef: { parentId: parent.id, pageIndex, sourceId: f.id } })
    }
    for (const im of parent.images) if (!im.hidden && inHalf(im.x, im.w) && !isOverridden(pageIndex, parent.id, 'image', im.id)) out.images.push({ ...im, id: `parent-shadow:${pageIndex}:${im.id}`, x: im.x + dx, y: im.y + dy, parentShadowRef: { parentId: parent.id, pageIndex, sourceId: im.id } })
    for (const sh of parent.shapes) if (!sh.hidden && inHalf(sh.x, sh.w) && !isOverridden(pageIndex, parent.id, 'shape', sh.id)) out.shapes.push({ ...sh, id: `parent-shadow:${pageIndex}:${sh.id}`, x: sh.x + dx, y: sh.y + dy, parentShadowRef: { parentId: parent.id, pageIndex, sourceId: sh.id } })
  })
  return out
}

/**
 * What the given pages show of their parent (master) pages, as ordinary objects with fresh ids - the same content
 * `parentShadowContent` draws on screen (the half of a facing parent that matches the page's side, each auto page
 * number or running header written out as that page's own text), so that detaching a page from its parent leaves
 * it looking exactly as it did instead of copying the whole parent over as it is.
 */
export function detachedParentContent(
  doc: DocSettings,
  parents: ParentPage[],
  pageParents: (string | null)[],
  pageIndices: number[],
  sections: PageSection[],
  documentFrames: TextFrame[],
  documentImages: ImageFrame[],
  documentShapes: ShapeFrame[],
  parentOverrides: ParentOverride[],
  newId: () => string,
  runningHeader?: (pageIndex: number, styleId: string, strategy: 'first' | 'last') => string,
): { frames: TextFrame[]; images: ImageFrame[]; shapes: ShapeFrame[] } {
  const chosen = new Set(pageIndices)
  const onlyChosen = pageParents.map((parentId, pageIndex) => (chosen.has(pageIndex) ? parentId : null))
  const shown = parentShadowContent(doc, parents, onlyChosen, sections, documentFrames, runningHeader, parentOverrides, documentImages, documentShapes)
  const own = <T extends { parentShadowRef: ParentShadowRef }>(items: T[]) => items.map(({ parentShadowRef: _ref, ...item }) => ({ ...item, id: newId() }))
  return { frames: own(shown.frames), images: own(shown.images), shapes: own(shown.shapes) }
}

/**
 * The text a running header (a parent page's "first / last paragraph of this style on the page") shows on each page,
 * worked out from where the text really lies: `flows` says which part of a story each frame holds, and the frame says
 * which page it is on. The paragraphs of a style are collected once, on the first question, so asking for every page of
 * a book stays cheap. A page with no paragraph of the style of its own shows the last one before it (and none at all
 * before the first).
 */
export function runningHeaderLookup(
  doc: DocSettings,
  frames: TextFrame[],
  flows: ReadonlyMap<string, { start: number; end: number }>,
): (pageIndex: number, styleId: string, strategy: RunningHeaderStrategy) => string {
  interface Candidate {
    page: number
    index: number
    text: string
  }
  const byStyle = new Map<string, Candidate[]>()
  let collected = false
  const collect = () => {
    collected = true
    const rects = pageRects(doc)
    for (const head of headFrames(frames)) {
      const styles = head.paragraphStyleIds
      if (!styles || !head.text.trim()) continue
      const paragraphs = head.text.split('\n')
      const starts: number[] = []
      let at = 0
      for (const paragraph of paragraphs) {
        starts.push(at)
        at += paragraph.length + 1
      }
      for (const frame of chainOf(frames, head.id)) {
        const part = flows.get(frame.id)
        if (!part) continue
        const page = ownerPage(rects, frame.x + frame.w / 2, frame.y + frame.h / 2)
        for (let index = 0; index < paragraphs.length; index++) {
          const styleId = styles[index]
          const text = paragraphs[index].trim()
          if (!styleId || !text) continue
          const from = starts[index]
          const to = from + paragraphs[index].length + (index < paragraphs.length - 1 ? 1 : 0)
          // the paragraph shows (at least in part) in this frame
          if (from >= part.end || to <= part.start) continue
          const list = byStyle.get(styleId)
          if (list) list.push({ page, index, text })
          else byStyle.set(styleId, [{ page, index, text }])
        }
      }
    }
    for (const list of byStyle.values()) list.sort((a, b) => a.page - b.page || a.index - b.index)
  }
  return (pageIndex, styleId, strategy) => {
    if (!collected) collect()
    const list = byStyle.get(styleId)
    if (!list) return ''
    let last = -1
    let firstOnPage = -1
    for (let i = 0; i < list.length && list[i].page <= pageIndex; i++) {
      last = i
      if (firstOnPage < 0 && list[i].page === pageIndex) firstOnPage = i
    }
    if (last < 0) return ''
    return list[strategy === 'first' && firstOnPage >= 0 ? firstOnPage : last].text
  }
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
 * `parentId`: the parent (master) page the new pages start out assigned to (null = none); the caller decides this,
 * typically by inheriting whatever the neighbouring page already has, so a run of added pages keeps the same master
 * without it having to be set by hand on every one of them.
 */
export function insertPages(c: DocContent, at: number, count: number, beside = false, parentId: string | null = null): DocContent | null {
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
  const r = remapContent(c, doc, map)
  if (!parentId) return r
  const pageParents = [...r.pageParents]
  while (pageParents.length < pages) pageParents.push(null)
  for (let k = 0; k < count; k++) pageParents[at + k] = parentId
  return { ...r, pageParents }
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
function resizePrimaryTextFrames(original: DocContent, remapped: DocContent, next: DocSettings): DocContent {
  const oldRects = pageRects(original.doc)
  const newRects = pageRects(next)
  const originalById = new Map(original.frames.map((frame) => [frame.id, frame]))
  const resized = remapped.frames.map((frame) => {
    const source = originalById.get(frame.id)
    if (!source) return frame
    const page = ownerPage(oldRects, source.x + source.w / 2, source.y + source.h / 2)
    const oldRect = oldRects[page]
    const newRect = newRects[page]
    if (!oldRect || !newRect) return frame
    const layout = computeLayout(original.doc)
    const pageInfo = layout.spreads.flatMap((spread) => spread.pages).find((candidate) => candidate.index === page)
    if (!pageInfo) return frame
    const oldMargins = pageMargins(original.doc, pageInfo.side, page)
    const newLayout = computeLayout(next)
    const newPageInfo = newLayout.spreads.flatMap((spread) => spread.pages).find((candidate) => candidate.index === page)
    if (!newPageInfo) return frame
    const newMargins = pageMargins(next, newPageInfo.side, page)
    const oldContentW = Math.max(1, oldRect.w - oldMargins.left - oldMargins.right)
    const oldContentH = Math.max(1, oldRect.h - oldMargins.top - oldMargins.bottom)
    const newContentW = Math.max(1, newRect.w - newMargins.left - newMargins.right)
    const newContentH = Math.max(1, newRect.h - newMargins.top - newMargins.bottom)
    const scaleX = newContentW / oldContentW
    const scaleY = newContentH / oldContentH
    return {
      ...frame,
      x: newRect.x + newMargins.left + (source.x - (oldRect.x + oldMargins.left)) * scaleX,
      y: newRect.y + newMargins.top + (source.y - (oldRect.y + oldMargins.top)) * scaleY,
      w: Math.max(1, source.w * scaleX),
      h: Math.max(1, source.h * scaleY),
    }
  })
  return { ...remapped, frames: resized }
}

function resizeParentObjects(c: DocContent, next: DocSettings): DocContent {
  const facing = next.facingPages && next.perRow >= 2
  const resizeObject = <T extends { x: number; y: number; w: number; h: number }>(object: T, parent: ParentPage): T => {
    const half = facing && object.x + object.w / 2 >= parent.w ? 1 : 0
    const oldParentDoc = parentEditDoc(c.doc, parent)
    const newParentDoc = parentEditDoc(next, parent)
    const oldPage = computeLayout(oldParentDoc).spreads[0]?.pages[half]
    const newPage = computeLayout(newParentDoc).spreads[0]?.pages[half]
    if (!oldPage || !newPage) return object
    const oldMargins = pageMargins(c.doc, oldPage.side, half)
    const newMargins = pageMargins(next, newPage.side, half)
    const oldContentW = Math.max(1, parent.w - oldMargins.left - oldMargins.right)
    const oldContentH = Math.max(1, parent.h - oldMargins.top - oldMargins.bottom)
    const newContentW = Math.max(1, parent.w - newMargins.left - newMargins.right)
    const newContentH = Math.max(1, parent.h - newMargins.top - newMargins.bottom)
    const baseX = half * parent.w
    const scaleX = newContentW / oldContentW
    const scaleY = newContentH / oldContentH
    return {
      ...object,
      x: baseX + newMargins.left + (object.x - (baseX + oldMargins.left)) * scaleX,
      y: newMargins.top + (object.y - oldMargins.top) * scaleY,
      w: Math.max(1, object.w * scaleX),
      h: Math.max(1, object.h * scaleY),
    }
  }
  return {
    ...c,
    parents: c.parents.map((parent) => ({
      ...parent,
      frames: parent.frames.map((frame) => resizeObject(frame, parent)),
      images: parent.images.map((image) => resizeObject(image, parent)),
      shapes: parent.shapes.map((shape) => resizeObject(shape, parent)),
    })),
  }
}

export function applySettings(c: DocContent, next: DocSettings, resizeTextFrames = false): DocContent {
  const normalized = normalizeSizes(next)
  const applied = remapContent(c, normalized, (i) => (i < normalized.pages ? i : null))
  if (!resizeTextFrames) return applied
  return resizeParentObjects(resizePrimaryTextFrames(c, applied, normalized), normalized)
}
