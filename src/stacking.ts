import type { ImageFrame, TextFrame } from './document'

/** Stacking order of the objects on the pages (text frames and pictures share one order). */

export type ArrangeOp = 'front' | 'forward' | 'backward' | 'back'

/** Default layers of objects that have no explicit `z`: pictures at the back, text frames in front of them. */
const DEFAULT_IMAGE_Z = 0
const DEFAULT_FRAME_Z = 1

export const zOfFrame = (f: TextFrame) => f.z ?? DEFAULT_FRAME_Z
export const zOfImage = (i: ImageFrame) => i.z ?? DEFAULT_IMAGE_Z

export interface StackItem {
  kind: 'frame' | 'image'
  id: string
  z: number
}

/** Every object from back to front. Objects on the same layer keep their creation order (pictures first). */
export function stackOrder(frames: TextFrame[], images: ImageFrame[]): StackItem[] {
  const items: StackItem[] = [
    ...images.map((i): StackItem => ({ kind: 'image', id: i.id, z: zOfImage(i) })),
    ...frames.map((f): StackItem => ({ kind: 'frame', id: f.id, z: zOfFrame(f) })),
  ]
  // Array.prototype.sort is stable, so ties keep the order above
  return items.sort((a, b) => a.z - b.z)
}

/** The layer for a new object: in front of everything (like other layout programs). */
export function nextZ(frames: TextFrame[], images: ImageFrame[]): number {
  let top = DEFAULT_FRAME_Z
  for (const f of frames) top = Math.max(top, zOfFrame(f))
  for (const i of images) top = Math.max(top, zOfImage(i))
  return top + 1
}

/**
 * Move one object in the stack. The whole stack is renumbered 0…n-1 so the result is clean; the returned lists are
 * null when nothing changed (already at that end).
 */
export function arrange(
  frames: TextFrame[],
  images: ImageFrame[],
  id: string,
  op: ArrangeOp,
): { frames: TextFrame[]; images: ImageFrame[] } | null {
  const order = stackOrder(frames, images)
  const from = order.findIndex((o) => o.id === id)
  if (from < 0) return null
  const to = op === 'front' ? order.length - 1 : op === 'back' ? 0 : op === 'forward' ? Math.min(order.length - 1, from + 1) : Math.max(0, from - 1)
  if (to === from) return null

  const [moved] = order.splice(from, 1)
  order.splice(to, 0, moved)
  const zById = new Map(order.map((o, index) => [o.id, index]))
  return {
    frames: frames.map((f) => (f.z === zById.get(f.id) ? f : { ...f, z: zById.get(f.id) })),
    images: images.map((i) => (i.z === zById.get(i.id) ? i : { ...i, z: zById.get(i.id) })),
  }
}
