import type { Assets, DocSettings, ImageFrame, ShapeFrame, TextFrame } from './document'
import { ownerPage, type PageRect } from './pages'
import type { FrameFlow } from './textLayout'

/** What the check found: text that does not fit, things off the page, what is missing. */
export type PreflightKind = 'overset' | 'footnote-overflow' | 'outside-page' | 'crosses-page' | 'missing-font' | 'missing-image'

export type PreflightSeverity = 'error' | 'warning'

export interface PreflightIssue {
  /** the same problem keeps the same id from one check to the next */
  id: string
  kind: PreflightKind
  severity: PreflightSeverity
  /** short name of the problem, in Hebrew */
  title: string
  /** where and how much, in Hebrew */
  detail: string
  /** 0-based index of the page it is on */
  page: number
  /** what to select when the problem is opened */
  target: { type: 'frame' | 'image' | 'shape'; id: string } | null
}

export interface PreflightInput {
  doc: Pick<DocSettings, 'bleed'>
  frames: TextFrame[]
  images: ImageFrame[]
  shapes: ShapeFrame[]
  assets: Assets
  /** where every frame's share of its story ended up (the layout) */
  flows: ReadonlyMap<string, FrameFlow>
  pageRects: PageRect[]
  isFontAvailable: (family: string) => boolean
}

const GENERIC_FAMILIES = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui'])
/** how far past an edge still counts as on it (a fraction of a point is rounding) */
const TOLERANCE = 0.5

interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** The box a possibly rotated frame covers. */
function coverOf(item: Box & { rotation?: number }): Box {
  if (!item.rotation) return { x: item.x, y: item.y, w: item.w, h: item.h }
  const angle = (item.rotation * Math.PI) / 180
  const cos = Math.abs(Math.cos(angle))
  const sin = Math.abs(Math.sin(angle))
  const w = item.w * cos + item.h * sin
  const h = item.w * sin + item.h * cos
  return { x: item.x + item.w / 2 - w / 2, y: item.y + item.h / 2 - h / 2, w, h }
}

const touches = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

const KIND_NAME = { frame: 'מסגרת טקסט', image: 'תמונה', shape: 'צורה' } as const

/**
 * Everything that would go wrong in print, found from the document as it is now: text that does not fit its frames (and
 * notes that do not fit their page), objects off the page or running over its edge, fonts the computer does not have and
 * pictures whose file is gone. A pure function of the document and its layout, so it can run after every change.
 */
export function runPreflight(input: PreflightInput): PreflightIssue[] {
  const { frames, images, shapes, assets, flows, pageRects, isFontAvailable } = input
  const issues: PreflightIssue[] = []
  const frameById = new Map(frames.map((frame) => [frame.id, frame]))
  const pageOf = (box: Box) => (pageRects.length ? ownerPage(pageRects, box.x + box.w / 2, box.y + box.h / 2) : 0)

  // text that does not fit: the last frame of a story that still has text left, and notes that no longer have room
  for (const [frameId, flow] of flows) {
    const frame = frameById.get(frameId)
    if (!frame) continue
    const page = pageOf(frame)
    if (flow.overflow) {
      const left = Math.max(0, flow.story.length - flow.end)
      issues.push({
        id: `overset:${frameId}`,
        kind: 'overset',
        severity: 'error',
        title: 'טקסט עודף',
        detail: `עמוד ${page + 1}: ${left.toLocaleString('he-IL')} תווים לא נכנסו במסגרת האחרונה של הסיפור`,
        page,
        target: { type: 'frame', id: frameId },
      })
    }
    if (frame.next === null || frame.next === undefined) {
      const notes = flow.footnoteOverflowItems.length
      if (notes > 0) {
        issues.push({
          id: `footnote-overflow:${frameId}`,
          kind: 'footnote-overflow',
          severity: 'error',
          title: 'הערות שוליים שלא נכנסו',
          detail: `עמוד ${page + 1}: ${notes} ${notes === 1 ? 'הערה' : 'הערות'} חורגות מהעמוד`,
          page,
          target: { type: 'frame', id: frameId },
        })
      }
    }
  }

  // objects off the page, or over its edge
  const maxBleedX = Math.max(input.doc.bleed.left, input.doc.bleed.right, 0)
  const maxBleedY = Math.max(input.doc.bleed.top, input.doc.bleed.bottom, 0)
  const checkBounds = (kind: 'frame' | 'image' | 'shape', item: Box & { id: string; rotation?: number }, printsText: boolean) => {
    if (!(item.w > 0 && item.h > 0) || pageRects.length === 0) return
    const box = coverOf(item)
    const page = pageOf(box)
    const hit = pageRects.filter((rect) => touches(box, rect))
    if (hit.length === 0) {
      issues.push({ id: `outside-page:${item.id}`, kind: 'outside-page', severity: 'warning', title: 'אובייקט מחוץ לעמוד', detail: `${KIND_NAME[kind]} שנמצאת על שולחן העבודה, ליד עמוד ${page + 1}`, page, target: { type: kind, id: item.id } })
      return
    }
    // the area it may fill: the pages it touches together (a picture across a spread is fine), and for what is not text also the bleed
    const bleedX = printsText ? 0 : maxBleedX
    const bleedY = printsText ? 0 : maxBleedY
    const left = Math.min(...hit.map((rect) => rect.x)) - bleedX
    const top = Math.min(...hit.map((rect) => rect.y)) - bleedY
    const right = Math.max(...hit.map((rect) => rect.x + rect.w)) + bleedX
    const bottom = Math.max(...hit.map((rect) => rect.y + rect.h)) + bleedY
    if (box.x < left - TOLERANCE || box.y < top - TOLERANCE || box.x + box.w > right + TOLERANCE || box.y + box.h > bottom + TOLERANCE) {
      issues.push({
        id: `crosses-page:${item.id}`,
        kind: 'crosses-page',
        severity: printsText ? 'error' : 'warning',
        title: printsText ? 'טקסט חורג מקצה העמוד' : 'אובייקט חורג מקצה העמוד',
        detail: printsText ? `עמוד ${page + 1}: חלק מהטקסט נמצא מחוץ לעמוד ולא יודפס` : `עמוד ${page + 1}: ${KIND_NAME[kind]} חורגת מעבר לשולי הגלישה`,
        page,
        target: { type: kind, id: item.id },
      })
    }
  }
  for (const frame of frames) {
    const flow = flows.get(frame.id)
    checkBounds('frame', frame, !!flow && flow.slice.trim().length > 0)
  }
  for (const image of images) checkBounds('image', image, false)
  for (const shape of shapes) checkBounds('shape', shape, false)

  // pictures whose file is not in the document
  for (const image of images) {
    if (assets[image.assetId]) continue
    const page = pageOf(image)
    issues.push({ id: `missing-image:${image.id}`, kind: 'missing-image', severity: 'error', title: 'תמונה חסרה', detail: `עמוד ${page + 1}: קובץ התמונה לא נמצא במסמך`, page, target: { type: 'image', id: image.id } })
  }

  // fonts the text uses that are not installed: one problem per font, at the first place it is used
  const hasPrev = new Set(frames.map((frame) => frame.next).filter((id): id is string => !!id))
  const missing = new Map<string, { frame: TextFrame; places: number }>()
  for (const head of frames) {
    if (hasPrev.has(head.id)) continue
    const chain: TextFrame[] = []
    for (let frame: TextFrame | undefined = head; frame && !chain.includes(frame); frame = frame.next ? frameById.get(frame.next) : undefined) chain.push(frame)
    const frameAt = (offset: number) => chain.find((frame) => {
      const flow = flows.get(frame.id)
      return !!flow && offset >= flow.start && offset < flow.end
    }) ?? chain[chain.length - 1]
    const note = (family: string | undefined, offset: number) => {
      if (!family || GENERIC_FAMILIES.has(family.toLowerCase()) || isFontAvailable(family)) return
      const seen = missing.get(family)
      if (seen) seen.places++
      else missing.set(family, { frame: frameAt(offset), places: 1 })
    }
    let offset = 0
    const runs = head.runs ?? []
    for (const run of runs) {
      if (run.len > 0 && head.text.slice(offset, offset + run.len).trim()) note(run.style.fontFamily, offset)
      offset += run.len
    }
    // text no run covers is in the story's own font
    if (offset < head.text.length && head.text.slice(offset).trim()) note(head.fontFamily, offset)
    if (!runs.length && head.text.trim()) note(head.fontFamily, 0)
  }
  for (const [family, { frame, places }] of missing) {
    const page = pageOf(frame)
    issues.push({
      id: `missing-font:${family}`,
      kind: 'missing-font',
      severity: 'error',
      title: 'גופן חסר',
      detail: `${family}: לא מותקן במחשב (${places === 1 ? 'מקום אחד' : `${places} מקומות`} בטקסט, הראשון בעמוד ${page + 1})`,
      page,
      target: { type: 'frame', id: frame.id },
    })
  }

  // errors before warnings, then by page, then in the order found
  return issues
    .map((issue, index) => ({ issue, index }))
    .sort((a, b) => (a.issue.severity === b.issue.severity ? 0 : a.issue.severity === 'error' ? -1 : 1) || a.issue.page - b.issue.page || a.index - b.index)
    .map(({ issue }) => issue)
}

/** The numbers the status bar shows. */
export function summarizePreflight(issues: PreflightIssue[]): { errors: number; warnings: number } {
  let errors = 0
  for (const issue of issues) if (issue.severity === 'error') errors++
  return { errors, warnings: issues.length - errors }
}
