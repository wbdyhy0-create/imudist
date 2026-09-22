import type { TextFrame, TextStyle } from './document'
import { mergeRuns, normalizeRuns } from './story'

export const styleOf = (f: TextFrame): TextStyle => ({
  fontFamily: f.fontFamily,
  fontSize: f.fontSize,
  weight: f.weight,
  italic: f.italic,
  align: f.align,
})

/** The frames of the story that `id` belongs to, first frame first (empty if `id` is unknown). */
export function chainOf(frames: TextFrame[], id: string): TextFrame[] {
  const byId = new Map(frames.map((f) => [f.id, f]))
  const prevOf = new Map<string, string>()
  for (const f of frames) if (f.next) prevOf.set(f.next, f.id)

  let head = byId.get(id)
  const guard = new Set<string>()
  while (head && prevOf.has(head.id) && !guard.has(head.id)) {
    guard.add(head.id)
    head = byId.get(prevOf.get(head.id)!)
  }

  const chain: TextFrame[] = []
  const seen = new Set<string>()
  for (let cur = head; cur && !seen.has(cur.id); cur = cur.next ? byId.get(cur.next) : undefined) {
    chain.push(cur)
    seen.add(cur.id)
  }
  return chain
}

/**
 * Continue the text of the story ending at `fromId` in frame `toId`.
 * Refused (null) when `fromId` already has a next frame, `toId` already has a previous frame, or it would loop.
 * If the target holds its own text, that text is appended to the story (like joining two stories).
 */
export function linkFrames(frames: TextFrame[], fromId: string, toId: string): TextFrame[] | null {
  const from = frames.find((f) => f.id === fromId)
  const to = frames.find((f) => f.id === toId)
  if (!from || !to || fromId === toId || from.next) return null
  if (frames.some((f) => f.next === toId)) return null
  const chain = chainOf(frames, fromId)
  if (chain.some((f) => f.id === toId)) return null

  const head = chain[0]
  const headRuns = normalizeRuns(head.text, head.runs, head)
  let joined = head.text
  let joinedRuns = headRuns
  if (to.text) {
    const toRuns = normalizeRuns(to.text, to.runs, to)
    if (head.text) {
      joined = head.text + '\n' + to.text
      joinedRuns = mergeRuns([...headRuns, { len: 1, style: headRuns[headRuns.length - 1].style }, ...toRuns])
    } else {
      joined = to.text
      joinedRuns = toRuns
    }
  }
  return frames.map((f) => {
    let n = f
    if (f.id === head.id) n = { ...n, text: joined, runs: joinedRuns }
    if (f.id === fromId) n = { ...n, next: toId }
    if (f.id === toId) n = { ...n, ...styleOf(head), text: '', runs: [] }
    return n
  })
}

/** Cut the thread between `id` and the frame before it. All the text stays with the earlier part. */
export function unlinkBefore(frames: TextFrame[], id: string): TextFrame[] {
  const prev = frames.find((f) => f.next === id)
  return prev ? frames.map((f) => (f.id === prev.id ? { ...f, next: null } : f)) : frames
}

/** Remove a frame, keeping its story connected (the text moves to the next frame if it was the first). */
export function removeFrame(frames: TextFrame[], id: string): TextFrame[] {
  const gone = frames.find((f) => f.id === id)
  if (!gone) return frames
  const prev = frames.find((f) => f.next === id)
  return frames
    .filter((f) => f.id !== id)
    .map((f) => {
      if (prev && f.id === prev.id) return { ...f, next: gone.next }
      if (!prev && gone.next && f.id === gone.next) return { ...f, ...styleOf(gone), text: gone.text, runs: gone.runs }
      return f
    })
}

export type HandleId = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
export const HANDLES: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** the corners a selected object can be turned by (a ring around each corner handle, a little further out) */
export type RotateCorner = 'nw' | 'ne' | 'se' | 'sw'
export const ROTATE_CORNERS: RotateCorner[] = ['nw', 'ne', 'se', 'sw']

/** A vector turned by `deg` clockwise degrees (world y grows downward, so a positive angle turns clockwise on screen, same as CSS `rotate()`). */
export function rotateVec(dx: number, dy: number, deg: number): [number, number] {
  const r = (deg * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return [dx * cos - dy * sin, dx * sin + dy * cos]
}

/** `deg`, wrapped into 0…360. */
export const normalizeDeg = (deg: number): number => ((deg % 360) + 360) % 360

/** The clockwise angle (degrees, screen convention) from one world point to another. */
export const angleOf = (from: { x: number; y: number }, to: { x: number; y: number }): number => (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/**
 * New box after dragging the whole frame ("move") or one of its handles by (dx, dy) world points.
 * With `ratio` (width / height) a corner handle keeps that proportion; edge handles still stretch one side.
 * With `fromCenter` the opposite side moves the same amount the other way, so the box stays around its middle.
 */
export function dragBox(orig: Box, mode: 'move' | HandleId, dx: number, dy: number, min: number, ratio?: number, fromCenter = false): Box {
  if (mode === 'move') return { ...orig, x: orig.x + dx, y: orig.y + dy }
  if (fromCenter) {
    const sx = mode.includes('e') ? 1 : mode.includes('w') ? -1 : 0
    const sy = mode.includes('s') ? 1 : mode.includes('n') ? -1 : 0
    let w = sx ? Math.max(min, orig.w + 2 * sx * dx) : orig.w
    let h = sy ? Math.max(min, orig.h + 2 * sy * dy) : orig.h
    if (ratio && mode.length === 2) {
      const scale = Math.max(w / orig.w, h / orig.h)
      w = Math.max(min, orig.w * scale)
      h = w / ratio
      if (h < min) {
        h = min
        w = h * ratio
      }
    }
    return { x: orig.x + (orig.w - w) / 2, y: orig.y + (orig.h - h) / 2, w, h }
  }
  let { x, y, w, h } = orig
  if (mode.includes('e')) w = Math.max(min, orig.w + dx)
  if (mode.includes('w')) {
    w = Math.max(min, orig.w - dx)
    x = orig.x + orig.w - w
  }
  if (mode.includes('s')) h = Math.max(min, orig.h + dy)
  if (mode.includes('n')) {
    h = Math.max(min, orig.h - dy)
    y = orig.y + orig.h - h
  }
  if (ratio && mode.length === 2) {
    // corner: scale by whichever side was dragged further, then anchor the opposite corner
    const scale = Math.max(w / orig.w, h / orig.h)
    w = Math.max(min, orig.w * scale)
    h = w / ratio
    if (h < min) {
      h = min
      w = h * ratio
    }
    if (mode.includes('w')) x = orig.x + orig.w - w
    if (mode.includes('n')) y = orig.y + orig.h - h
  }
  return { x, y, w, h }
}