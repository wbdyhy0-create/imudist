import { MAX_PAGES, type DocSettings, type TextFrame } from './document'
import { chainOf, styleOf, type Box } from './frames'
import type { PlacedText } from './importText'
import { computeLayout, pageMargins, type PageSide } from './layout'
import { ownerPage, pageRects, type DocContent, type PageRect } from './pages'
import { normalizeRuns, sliceRuns } from './story'
import { fitStoryEnd, flowFrames } from './textLayout'

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
export function columnBoxes(doc: DocSettings, rect: PageRect, side: PageSide): Box[] {
  const m = pageMargins(doc, side)
  const cols = Math.max(1, doc.columns)
  const contentW = doc.width - m.left - m.right
  const colW = (contentW - doc.gutter * (cols - 1)) / cols
  const boxes: Box[] = []
  for (let i = 0; i < cols; i++) {
    boxes.push({ x: rect.x + m.left + i * (colW + doc.gutter), y: rect.y + m.top, w: colW, h: doc.height - m.top - m.bottom })
  }
  return doc.binding === 'rtl' ? boxes.reverse() : boxes
}

/** Where a plain click puts the first frame: the column under the click, from the click down to the bottom margin. */
export function boxAtClick(doc: DocSettings, x: number, y: number): Box {
  const rects = pageRects(doc)
  const sides = pageSides(doc)
  const page = ownerPage(rects, x, y)
  let best = columnBoxes(doc, rects[page], sides[page])[0]
  let bestDist = Infinity
  for (const c of columnBoxes(doc, rects[page], sides[page])) {
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
  content: DocContent
  /** the frame that holds the story (the first of the thread) */
  headId: string
  /** semi-auto: the text that did not fit and stays loaded */
  remaining: PlacedText | null
  /** some text could not be placed (single-frame mode, or the frames were too small) */
  overflow: boolean
  pagesAdded: number
}

const newId = () => globalThis.crypto?.randomUUID?.() ?? `f${Date.now()}${Math.random()}`

/**
 * Semi-automatic flow: each click adds one frame to the same story. The first click creates the story in a frame;
 * later clicks link a new frame after the last one (`placed.continueFrom`). The text stays loaded while some is left over.
 */
function pourSemi(doc: DocSettings, frames: TextFrame[], placed: PlacedText, target: PourTarget): PourResult {
  const existing = target.frameId ? frames.find((f) => f.id === target.frameId) : undefined
  const box: Box = existing ? { x: existing.x, y: existing.y, w: existing.w, h: existing.h } : target.box
  const id = existing?.id ?? newId()
  const others = frames.filter((f) => f.id !== existing?.id)
  // the frame the new one continues from (it may have been deleted since the last click)
  const tail = placed.continueFrom ? others.find((f) => f.id === placed.continueFrom && !f.next) : undefined

  let next: TextFrame[]
  let headId: string
  if (tail) {
    const head = chainOf(others, tail.id)[0]
    const frame: TextFrame = { ...styleOf(head), id, x: box.x, y: box.y, w: box.w, h: box.h, text: '', runs: [], next: null }
    next = [...others.map((f) => (f.id === tail.id ? { ...f, next: id } : f)), frame]
    headId = head.id
  } else {
    const runs = normalizeRuns(placed.text, placed.runs, placed.style)
    next = [...others, { ...placed.style, id, x: box.x, y: box.y, w: box.w, h: box.h, text: placed.text, runs, next: null }]
    headId = id
  }

  const last = flowFrames(next).get(id)!
  const headFrame = next.find((f) => f.id === headId)!
  const storyRuns = normalizeRuns(headFrame.text, headFrame.runs, headFrame)
  const remaining: PlacedText | null = last.overflow
    ? { ...placed, text: last.story.slice(last.end), runs: sliceRuns(storyRuns, last.end, last.story.length), continueFrom: id }
    : null
  return { content: { doc, frames: next }, headId, remaining, overflow: false, pagesAdded: 0 }
}

/**
 * Put a text into the document. The result is one new document state, so it is a single undo step.
 * In auto mode the text keeps flowing into the following columns and pages; pages are added when it runs out.
 */
export function pourText(doc: DocSettings, frames: TextFrame[], placed: PlacedText, target: PourTarget, mode: FlowMode): PourResult {
  if (mode === 'semi') return pourSemi(doc, frames, placed, target)
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

  const existing = target.frameId ? frames.find((f) => f.id === target.frameId) : undefined
  const first: Box = existing ? { x: existing.x, y: existing.y, w: existing.w, h: existing.h } : target.box

  const boxes: Box[] = [first]
  const ends: number[] = []
  let start = fitStoryEnd(story, runs, style, 0, first)
  ends.push(start)

  if (mode === 'auto' && start < story.length) {
    // continue in the column after the first frame, then page after page
    let page = ownerPage(rects, first.x + first.w / 2, first.y + first.h / 2)
    const firstCols = columnBoxes(curDoc, rects[page], sides[page])
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
      const box = columnBoxes(curDoc, rects[page], sides[page])[col]
      col++
      if (box.w < 8 || box.h < 8) break
      const end = fitStoryEnd(story, runs, style, start, box, Math.max(1, lastLen))
      if (end <= start) break // the frame is smaller than one line
      boxes.push(box)
      ends.push(end)
      lastLen = end - start
      start = end
    }
  }

  const ids = boxes.map((_, i) => (i === 0 && existing ? existing.id : newId()))
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
    next: i < boxes.length - 1 ? ids[i + 1] : null,
  }))

  return {
    content: { doc: curDoc, frames: [...frames.filter((f) => f.id !== existing?.id), ...made] },
    headId: ids[0],
    remaining: null,
    overflow: start < story.length,
    pagesAdded: curDoc.pages - doc.pages,
  }
}
