import type { TextFrame, TextStyle } from './document'

export const styleOf = (f: TextFrame): TextStyle => ({
  fontFamily: f.fontFamily,
  fontSize: f.fontSize,
  align: f.align,
  bold: f.bold,
  italic: f.italic,
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
  const joined = to.text ? (head.text ? head.text + '\n' + to.text : to.text) : head.text
  return frames.map((f) => {
    let n = f
    if (f.id === head.id) n = { ...n, text: joined }
    if (f.id === fromId) n = { ...n, next: toId }
    if (f.id === toId) n = { ...n, ...styleOf(head), text: '' }
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
      if (!prev && gone.next && f.id === gone.next) return { ...f, text: gone.text }
      return f
    })
}

export type HandleId = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
export const HANDLES: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** New box after dragging the whole frame ("move") or one of its handles by (dx, dy) world points. */
export function dragBox(orig: Box, mode: 'move' | HandleId, dx: number, dy: number, min: number): Box {
  if (mode === 'move') return { ...orig, x: orig.x + dx, y: orig.y + dy }
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
  return { x, y, w, h }
}
