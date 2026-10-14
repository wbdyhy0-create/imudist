import type { ParagraphStyleRecord, TextFrame } from './document'
import { flowFrames } from './textLayout'

/** Does a frame hold all its text, as the layout of the program lays it out (the data merge makes a text smaller until it does). */
export const frameFits = (paragraphStyles: ParagraphStyleRecord[]) => (frame: TextFrame): boolean => {
  const flow = flowFrames([{ ...frame, next: null }], [], undefined, undefined, undefined, paragraphStyles).get(frame.id)
  return !flow || !flow.overflow
}
