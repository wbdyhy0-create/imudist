import type { Assets, ImageFrame, ShapeFrame, TextFrame } from './document'

/**
 * The clipboard for objects (text frames, pictures, shapes). The objects themselves are kept here, in the program;
 * the system clipboard only gets a short marker text, so a later Ctrl+V can tell whether the last thing copied was
 * objects from this program or something else (text from another program, a picture …).
 */

export interface ClipObjects {
  frames: TextFrame[]
  images: ImageFrame[]
  shapes: ShapeFrame[]
  /** the picture data the copied pictures use, so they can be pasted into another document */
  assets: Assets
  /** what pictures and shapes look like, drawn when they were copied: it is what they become when pasted into text (an anchored object) */
  preview?: { src: string; w: number; h: number }
}

interface Entry {
  data: ClipObjects
  token: string
  /** how many times it was pasted since it was copied: each paste lands a little further, so copies do not hide each other */
  pastes: number
}

const PREFIX = 'imudist-objects:'
let current: Entry | null = null
let counter = 0

/** Remember these objects; the returned text is what goes to the system clipboard. */
export function setClip(data: ClipObjects): string {
  counter += 1
  current = { data, token: `${PREFIX}${Date.now().toString(36)}-${counter}`, pastes: 0 }
  return current.token
}

/** The copied objects, if the text (from the system clipboard) is the marker of the last copy. */
export function clipForToken(text: string): Entry | null {
  return current && text === current.token ? current : null
}

/** The last copied objects, whatever the system clipboard holds now. */
export const lastClip = (): Entry | null => current

export const isClipToken = (text: string) => text.startsWith(PREFIX)
