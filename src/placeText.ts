import { DEFAULT_TEXT_STYLE, MAX_PAGES, type DocSettings, type ImageFrame, type ShapeFrame, type TextFrame } from './document'
import { chainOf, styleOf, type Box } from './frames'
import type { PlacedText } from './importText'
import { computeLayout, pageMargins, type PageSide } from './layout'
import { ownerPage, pageRects, type DocContent, type PageRect } from './pages'
import { nextZ } from './stacking'
import { normalizeRuns, sliceRuns } from './story'
import { fitStoryEnd, flowFrames } from './textLayout'
import { wrapFloatsFor } from './wrap'

/**
 * How placed text fills frames.
 * auto: keep creating linked frames (adding pages) until all the text is placed.
 * semi: fill this frame, then keep the rest loaded for the next click.
 * single: one frame; whatever doesn't fit stays as overflow.
 */
export type FlowMode = 'auto' | 'semi' | 'single'

/** Never create more frames than this from one text, whatever happens. */
const MAX_FRAMES = 3000

function pageSides(doc: DocSettings): PageSide[] {
  const sides: PageSide[] = []
  for (const s of computeLayout(doc).spreads) for (const p of s.pages) sides[p.index] = p.side
  return sides
}

/** The text boxes of a page: its margin area cut into columns, in reading order (right-to-left binding starts on the right). */
export function columnBoxes(doc: DocSettings, rect: PageRect, side: PageSide, index: number): Box[] {
  const m = pageMargins(doc, side, index)
  const cols = Math.max(1, doc.columns)
  const contentW = rect.w - m.left - m.right
  const colW = (contentW - doc.gutter * (cols - 1)) / cols
  const boxes: Box[] = []
  for (let i = 0; i < cols; i++) {
    boxes.push({ x: rect.x + m.left + i * (colW + doc.gutter), y: rect.y + m.top, w: colW, h: rect.h - m.top - m.bottom })
  }
  return doc.binding === 'rtl' ? boxes.reverse() : boxes
}

/** Where a plain click puts the first frame: the column under the click, from the click down to the bottom margin. */
export function boxAtClick(doc: DocSettings, x: number, y: number): Box {
  const rects = pageRects(doc)
  const sides = pageSides(doc)
  const page = ownerPage(rects, x, y)
  let best = columnBoxes(doc, rects[page], sides[page], page)[0]
  let bestDist = Infinity
  for (const c of columnBoxes(doc, rects[page], sides[page], page)) {
    const d = Math.abs(c.x + c.w / 2 - x)
    if (d < bestDist) {
      bestDist = d
      best = c
    }
  }
  const bottom = best.y + best.h
  const top = Math.min(Math.max(y, best.y), bottom - 24)
  return { x: best.x, y: top, w: best.w, h: bottom - top }
}

export interface PourTarget {
  /** the first frame's box, or the box of `frameId` when filling an existing empty frame */
  box: Box
  frameId?: string
}

export interface PourResult {
  /** the document settings and text frames after placing (pictures are untouched) */
  content: { doc: DocSettings; frames: TextFrame[] }
  /** the frame that holds the story (the first of the thread) */
  headId: string
  /** semi-auto: the text that did not fit and stays loaded */
  remaining: PlacedText | null
  /** some text could not be placed (single-frame mode, or the frames were too small) */
  overflow: boolean
  pagesAdded: number
}

const newId = () => globalThis.crypto?.randomUUID?.() ?? `f${Date.now()}${Math.random()}`
const paragraphIndexAt = (text: string, offset: number) => (text.slice(0, offset).match(/\n/g) ?? []).length

/** The text frames of some pages: one exactly on the margins, or — when the page has columns — one exactly on each column. */
export function primaryFrames(doc: DocSettings, pageIndices: number[]): TextFrame[] {
  const rects = pageRects(doc)
  const sides = pageSides(doc)
  return pageIndices.flatMap((i) =>
    rects[i]
      ? columnBoxes(doc, rects[i], sides[i], i).map(
          (b): TextFrame => ({ ...DEFAULT_TEXT_STYLE, id: newId(), x: b.x, y: b.y, w: b.w, h: b.h, text: '', runs: [], next: null }),
        )
      : [],
  )
}

export function primaryTextFrameOrder(doc: DocSettings, frames: TextFrame[]): string[] {
  const rects = pageRects(doc)
  const sides = pageSides(doc)
  const near = (a: number, b: number) => Math.abs(a - b) < 0.5
  return rects.flatMap((rect, page) =>
    columnBoxes(doc, rect, sides[page], page).flatMap((box) => {
      const frame = frames.find((candidate) => near(candidate.x, box.x) && near(candidate.y, box.y) && near(candidate.w, box.w) && near(candidate.h, box.h))
      return frame ? [frame.id] : []
    }),
  )
}

/** Expand existing automatic primary frames into per-column frames when a document gains columns. */
export function expandPrimaryFramesForColumns(content: DocContent, previousDoc: DocSettings, previousFrames: TextFrame[]): DocContent {
  if (content.doc.columns <= previousDoc.columns) return content
  const oldPrimaryIds = new Set(primaryTextFrameOrder(previousDoc, previousFrames))
  if (oldPrimaryIds.size === 0) return content
  const oldRects = pageRects(previousDoc)
  const newRects = pageRects(content.doc)
  const oldSides = pageSides(previousDoc)
  const newSides = pageSides(content.doc)
  const near = (a: number, b: number) => Math.abs(a - b) < 0.5
  let frames = content.frames
  let changed = false

  for (let page = 0; page < Math.min(oldRects.length, newRects.length); page++) {
    const oldBoxes = columnBoxes(previousDoc, oldRects[page], oldSides[page], page)
    const newBoxes = columnBoxes(content.doc, newRects[page], newSides[page], page)
    if (newBoxes.length <= oldBoxes.length) continue
    const occupied = new Set<number>()
    for (let index = 0; index < oldBoxes.length; index++) {
      const oldBox = oldBoxes[index]
      const source = previousFrames.find((frame) => oldPrimaryIds.has(frame.id) && near(frame.x, oldBox.x) && near(frame.y, oldBox.y) && near(frame.w, oldBox.w) && near(frame.h, oldBox.h))
      const target = source && frames.find((frame) => frame.id === source.id)
      if (!source || !target || !newBoxes[index]) continue
      occupied.add(index)
      const box = newBoxes[index]
      frames = frames.map((frame) => frame.id === target.id
        ? { ...frame, ...box, textFlowBox: undefined, textScale: undefined }
        : frame)
      changed = true
    }
    const generated = primaryFrames(content.doc, [page])
    newBoxes.forEach((box, index) => {
      if (occupied.has(index)) return
      const frame = generated[index]
      if (frame) {
        frames = [...frames, { ...frame, ...box }]
        changed = true
      }
    })
  }
  return changed ? { ...content, frames } : content
}

/**
 * The content with margin text frames added to `pages` (or all pages) that have no text frame at all yet, so a page
 * that already has its own frames is never given a second one.
 */
export function withPrimaryFrames(c: DocContent, pages: 'all' | number[]): DocContent {
  const rects = pageRects(c.doc)
  const occupied = new Set(c.frames.map((f) => ownerPage(rects, f.x + f.w / 2, f.y + f.h / 2)))
  const targets = (pages === 'all' ? rects.map((_, i) => i) : pages).filter((i) => !occupied.has(i))
  const frames = [...c.frames, ...primaryFrames(c.doc, targets)]
  const order = primaryTextFrameOrder(c.doc, frames)
  const nextById = new Map(order.map((id, index) => [id, order[index + 1] ?? null]))
  let changed = frames.length !== c.frames.length
  const threaded = frames.map((frame) => {
    const next = nextById.get(frame.id)
    if (next === undefined || frame.next === next) return frame
    changed = true
    return { ...frame, next }
  })
  return changed ? { ...c, frames: threaded } : c
}

/** The empty, unlinked text frames that sit exactly on the margins / columns of their page: the ones made automatically and never used. */
export function emptyPrimaryFrameIds(doc: DocSettings, frames: TextFrame[]): string[] {
  const rects = pageRects(doc)
  const sides = pageSides(doc)
  const linked = new Set(frames.map((f) => f.next).filter((n): n is string => !!n))
  const near = (a: number, b: number) => Math.abs(a - b) < 0.5
  return frames
    .filter((f) => {
      if (f.text || f.next || linked.has(f.id)) return false
      const page = ownerPage(rects, f.x + f.w / 2, f.y + f.h / 2)
      return columnBoxes(doc, rects[page], sides[page], page).some((b) => near(f.x, b.x) && near(f.y, b.y) && near(f.w, b.w) && near(f.h, b.h))
    })
    .map((f) => f.id)
}

/** An empty, unlinked text frame that sits exactly on `box` (a primary frame waiting for text), if there is one. */
function emptyFrameAt(frames: TextFrame[], box: Box, taken: Set<string>): TextFrame | undefined {
  const linked = new Set(frames.map((f) => f.next).filter((n): n is string => !!n))
  const near = (a: number, b: number) => Math.abs(a - b) < 0.5
  return frames.find((f) => !taken.has(f.id) && !f.text && !f.next && !linked.has(f.id) && near(f.x, box.x) && near(f.y, box.y) && near(f.w, box.w) && near(f.h, box.h))
}

/**
 * Semi-automatic flow: each click adds one frame to the same story. The first click creates the story in a frame;
 * later clicks link a new frame after the last one (`placed.continueFrom`). The text stays loaded while some is left over.
 */
function pourSemi(doc: DocSettings, frames: TextFrame[], images: ImageFrame[], shapes: ShapeFrame[], placed: PlacedText, target: PourTarget): PourResult {
  const existing = target.frameId ? frames.find((f) => f.id === target.frameId) : undefined
  const box: Box = existing ? { x: existing.x, y: existing.y, w: existing.w, h: existing.h } : target.box
  const id = existing?.id ?? newId()
  const others = frames.filter((f) => f.id !== existing?.id)
  // the frame the new one continues from (it may have been deleted since the last click)
  const tail = placed.continueFrom ? others.find((f) => f.id === placed.continueFrom && !f.next) : undefined
  const z = nextZ(frames, images, shapes)

  let next: TextFrame[]
  let headId: string
  if (tail) {
    const head = chainOf(others, tail.id)[0]
    const frame: TextFrame = { ...styleOf(head), id, x: box.x, y: box.y, w: box.w, h: box.h, text: '', runs: [], next: null, z }
    next = [...others.map((f) => (f.id === tail.id ? { ...f, next: id } : f)), frame]
    headId = head.id
  } else {
    const runs = normalizeRuns(placed.text, placed.runs, placed.style)
    const footnotes = placed.footnotes?.map((note) => ({ ...note, id: newId() }))
    next = [...others, { ...placed.style, id, x: box.x, y: box.y, w: box.w, h: box.h, text: placed.text, runs, paragraphStyleIds: placed.paragraphStyleIds, paragraphStyleNames: placed.paragraphStyleNames, ...(footnotes?.length ? { footnotes } : {}), next: null, z }]
    headId = id
  }

  const last = flowFrames(next, images).get(id)!
  const headFrame = next.find((f) => f.id === headId)!
  const storyRuns = normalizeRuns(headFrame.text, headFrame.runs, headFrame)
  const remaining: PlacedText | null = last.overflow
    ? { ...placed, text: last.story.slice(last.end), runs: sliceRuns(storyRuns, last.end, last.story.length), paragraphStyleIds: placed.paragraphStyleIds?.slice(paragraphIndexAt(last.story, last.end)), paragraphStyleNames: placed.paragraphStyleNames?.slice(paragraphIndexAt(last.story, last.end)), continueFrom: id }
    : null
  return { content: { doc, frames: next }, headId, remaining, overflow: false, pagesAdded: 0 }
}

/**
 * Put a text into the document. The result is one new document state, so it is a single undo step.
 * In auto mode the text keeps flowing into the following columns and pages; pages are added when it runs out.
 * `images` are only read: pictures with text wrap keep the text out of their area.
 */
export function pourText(
  doc: DocSettings,
  frames: TextFrame[],
  images: ImageFrame[],
  placed: PlacedText,
  target: PourTarget,
  mode: FlowMode,
  shapes: ShapeFrame[] = [],
): PourResult {
  if (mode === 'semi') return pourSemi(doc, frames, images, shapes, placed, target)
  const story = placed.text
  const style = placed.style
  const runs = normalizeRuns(story, placed.runs, style)

  let curDoc = doc
  let rects = pageRects(curDoc)
  let sides = pageSides(curDoc)
  const refresh = () => {
    rects = pageRects(curDoc)
    sides = pageSides(curDoc)
  }

  const existing = target.frameId ? frames.find((f) => f.id === target.frameId) : emptyFrameAt(frames, target.box, new Set())
  const first: Box = existing ? { x: existing.x, y: existing.y, w: existing.w, h: existing.h } : target.box
  /** empty frames of the document that the text flows into instead of new ones being made on top of them */
  const reused = new Set<string>(existing ? [existing.id] : [])
  const reuse: (string | null)[] = [existing?.id ?? null]

  const boxes: Box[] = [first]
  const ends: number[] = []
  let start = fitStoryEnd(story, runs, style, 0, first, wrapFloatsFor(first, images))
  ends.push(start)

  if (mode === 'auto' && start < story.length) {
    // continue in the column after the first frame, then page after page
    let page = ownerPage(rects, first.x + first.w / 2, first.y + first.h / 2)
    const firstCols = columnBoxes(curDoc, rects[page], sides[page], page)
    let col = firstCols.reduce((best, c, i) => (Math.abs(c.x + c.w / 2 - (first.x + first.w / 2)) < Math.abs(firstCols[best].x + firstCols[best].w / 2 - (first.x + first.w / 2)) ? i : best), 0) + 1
    let lastLen = ends[0]

    while (start < story.length && boxes.length < MAX_FRAMES) {
      if (col >= Math.max(1, curDoc.columns)) {
        page++
        col = 0
      }
      if (page >= curDoc.pages) {
        if (curDoc.pages >= MAX_PAGES) break
        curDoc = { ...curDoc, pages: curDoc.pages + 1 }
        refresh()
      }
      const box = columnBoxes(curDoc, rects[page], sides[page], page)[col]
      col++
      if (box.w < 8 || box.h < 8) break
      const found = emptyFrameAt(frames, box, reused)
      const end = fitStoryEnd(story, runs, style, start, box, wrapFloatsFor(box, images), Math.max(1, lastLen))
      if (end <= start) break // the frame is smaller than one line
      boxes.push(box)
      reuse.push(found?.id ?? null)
      if (found) reused.add(found.id)
      ends.push(end)
      lastLen = end - start
      start = end
    }
  }

  const ids = boxes.map((_, i) => reuse[i] ?? newId())
  const z = nextZ(frames, images, shapes)
  const made: TextFrame[] = boxes.map((b, i) => ({
    ...style,
    id: ids[i],
    x: b.x,
    y: b.y,
    w: b.w,
    h: b.h,
    // the whole story lives in the first frame; the other frames only display their share
    text: i === 0 ? story : '',
    runs: i === 0 ? runs : [],
    ...(i === 0 && placed.footnotes?.length ? { footnotes: placed.footnotes.map((note) => ({ ...note, id: newId() })) } : {}),
    paragraphStyleIds: i === 0 ? placed.paragraphStyleIds : undefined,
    paragraphStyleNames: i === 0 ? placed.paragraphStyleNames : undefined,
    next: i < boxes.length - 1 ? ids[i + 1] : null,
    // an existing frame keeps its place in the stack
    z: i === 0 && existing ? existing.z : z,
  }))

  return {
    content: { doc: curDoc, frames: [...frames.filter((f) => !reused.has(f.id)), ...made] },
    headId: ids[0],
    remaining: null,
    overflow: start < story.length,
    pagesAdded: curDoc.pages - doc.pages,
  }
}
