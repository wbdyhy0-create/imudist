import { effectiveLeading, type TextFrame } from './document'
import { chainOf } from './frames'
import { pageRects, type DocContent } from './pages'
import { flowFrames, type FrameFlow } from './textLayout'

/**
 * Making the text of an imported document show: the layout of another program is not reproduced to the line (its composer, its font
 * metrics), so a frame that held its text exactly there is often a line or two short here, and the text that does not fit is hidden.
 * Each frame at the end of a thread whose text does not fit is made higher, a line at a time, until it fits - or until it reaches the
 * bottom of its page.
 */

/** the layout of some frames: which of them (the last of a thread) has text that does not fit anywhere */
export type FlowFunction = (frames: TextFrame[], content: DocContent) => Map<string, Pick<FrameFlow, 'overflow'>>

const layOut: FlowFunction = (frames, content) => flowFrames(frames, content.images, undefined, undefined, undefined, content.paragraphStyles)

export interface GrowResult {
  /** the frames, as they are now (copies: the ones of the document are not changed) */
  frames: TextFrame[]
  /** how many threads had their last frame made higher */
  grown: number
  /** how many threads still have text that does not fit (their frame is at the bottom of its page) */
  stillHidden: number
}

export function growOverflowingFrames(content: DocContent, flow: FlowFunction = layOut, maxPasses = 16): GrowResult {
  const rects = pageRects(content.doc)
  const frames = content.frames.map((frame) => ({ ...frame }))
  const byId = new Map(frames.map((frame) => [frame.id, frame] as const))
  /** how far down a frame may reach: the bottom of the page it stands on (nothing stops it when it is on none) */
  const bottomOf = (frame: TextFrame): number => {
    const x = frame.x + frame.w / 2
    const y = frame.y + frame.h / 2
    const page = rects.find((rect) => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h)
    return page ? page.y + page.h : Infinity
  }
  const grown = new Set<string>()
  const stuck = new Set<string>()
  let pending: TextFrame[] = frames
  for (let pass = 0; pass < maxPasses && pending.length > 0; pass += 1) {
    const flows = flow(pending, content)
    const affected = new Map<string, TextFrame>()
    for (const [id, result] of flows) {
      if (!result.overflow) continue
      const last = byId.get(id)
      if (!last) continue
      const room = bottomOf(last) - last.y
      if (last.h >= room - 0.01) {
        stuck.add(id)
        continue
      }
      const height = Math.min(room, last.h + Math.max(6, effectiveLeading(last)))
      const chain = chainOf(frames, id)
      // the frames beside it (the columns of one frame) are as high
      for (const frame of chain) {
        if (Math.abs(frame.y - last.y) < 1 && Math.abs(frame.h - last.h) < 1) frame.h = height
      }
      grown.add(id)
      for (const frame of chain) affected.set(frame.id, frame)
    }
    pending = [...affected.values()]
  }
  // the threads that grew may be short still, when the passes ran out
  if (pending.length > 0) {
    for (const [id, result] of flow(pending, content)) if (result.overflow) stuck.add(id)
  }
  return { frames, grown: grown.size, stillHidden: stuck.size }
}
