import type { ImageFrame, ShapeFrame, TextFrame } from './document'

/** Stacking order of the objects on the pages (text frames and pictures share one order). */

export type ArrangeOp = 'front' | 'forward' | 'backward' | 'back'

/** Default layers of objects that have no explicit `z`: pictures at the back, text frames in front of them. */
const DEFAULT_IMAGE_Z = 0
const DEFAULT_FRAME_Z = 1

export const zOfFrame = (f: TextFrame) => f.z ?? DEFAULT_FRAME_Z
export const zOfImage = (i: ImageFrame) => i.z ?? DEFAULT_IMAGE_Z
export const zOfShape = (sh: ShapeFrame) => sh.z ?? DEFAULT_FRAME_Z

export interface StackItem {
  kind: 'frame' | 'image' | 'shape'
  id: string
  layerId: string
  z: number
  /** where the object is, to tell which objects lie on top of each other */
  box: { x: number; y: number; w: number; h: number }
}

const boxOf = (o: { x: number; y: number; w: number; h: number }) => ({ x: o.x, y: o.y, w: o.w, h: o.h })
const overlaps = (a: StackItem['box'], b: StackItem['box']) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** Every object from back to front. Objects on the same layer keep their creation order (pictures first). */
export function stackOrder(frames: TextFrame[], images: ImageFrame[], shapes: ShapeFrame[] = [], layerOrder: string[] = ['layer-1']): StackItem[] {
  const items: StackItem[] = [
    ...images.map((i): StackItem => ({ kind: 'image', id: i.id, layerId: i.layerId ?? 'layer-1', z: zOfImage(i), box: boxOf(i) })),
    ...shapes.map((sh): StackItem => ({ kind: 'shape', id: sh.id, layerId: sh.layerId ?? 'layer-1', z: zOfShape(sh), box: boxOf(sh) })),
    ...frames.map((f): StackItem => ({ kind: 'frame', id: f.id, layerId: f.layerId ?? 'layer-1', z: zOfFrame(f), box: boxOf(f) })),
  ]
  const layerRank = new Map(layerOrder.map((id, index) => [id, index]))
  // Layers are ordered front-to-back; each layer's own objects remain back-to-front by z.
  return items.sort((a, b) => (layerRank.get(b.layerId) ?? layerOrder.length) - (layerRank.get(a.layerId) ?? layerOrder.length) || a.z - b.z)
}

/** The layer for a new object: in front of everything (like other layout programs). */
export function nextZ(frames: TextFrame[], images: ImageFrame[], shapes: ShapeFrame[] = []): number {
  let top = DEFAULT_FRAME_Z
  for (const sh of shapes) top = Math.max(top, zOfShape(sh))
  for (const f of frames) top = Math.max(top, zOfFrame(f))
  for (const i of images) top = Math.max(top, zOfImage(i))
  return top + 1
}

/**
 * Move one object in the stack. To the front / back it goes past everything; forward / backward moves it past the next
 * object that overlaps it, one per call. The whole stack is renumbered 0…n-1 so the result is clean; the result is null
 * when nothing changed.
 */
export function arrange(
  frames: TextFrame[],
  images: ImageFrame[],
  id: string,
  op: ArrangeOp,
  shapes: ShapeFrame[] = [],
  layerOrder: string[] = ['layer-1'],
): { frames: TextFrame[]; images: ImageFrame[]; shapes: ShapeFrame[] } | null {
  const allItems = stackOrder(frames, images, shapes, layerOrder)
  const selected = allItems.find((item) => item.id === id)
  if (!selected) return null
  const order = allItems.filter((item) => item.layerId === selected.layerId)
  const from = order.findIndex((item) => item.id === id)
  if (from < 0) return null
  let to: number
  if (op === 'front') to = order.length - 1
  else if (op === 'back') to = 0
  else {
    // one step means passing ONE object that actually lies on top of / under this one: the objects in between that are
    // somewhere else on the page would make a click change nothing you can see
    const step = op === 'forward' ? 1 : -1
    let j = from + step
    while (j >= 0 && j < order.length && !overlaps(order[j].box, order[from].box)) j += step
    if (j < 0 || j >= order.length) return null // nothing overlapping in that direction: it is already at the front / back of its group
    to = j
  }
  if (to === from) return null

  const [moved] = order.splice(from, 1)
  order.splice(to, 0, moved)
  const zById = new Map(order.map((o, index) => [o.id, index]))
  return {
    frames: frames.map((frame) => {
      if ((frame.layerId ?? 'layer-1') !== selected.layerId) return frame
      const z = zById.get(frame.id)
      return z === undefined || frame.z === z ? frame : { ...frame, z }
    }),
    images: images.map((image) => {
      if ((image.layerId ?? 'layer-1') !== selected.layerId) return image
      const z = zById.get(image.id)
      return z === undefined || image.z === z ? image : { ...image, z }
    }),
    shapes: shapes.map((shape) => {
      if ((shape.layerId ?? 'layer-1') !== selected.layerId) return shape
      const z = zById.get(shape.id)
      return z === undefined || shape.z === z ? shape : { ...shape, z }
    }),
  }
}
