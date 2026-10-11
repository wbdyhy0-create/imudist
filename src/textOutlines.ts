import type { ShapeFrame, TextFrame } from './document'
import { rotateVec } from './frames'
import { outlineFontOf, outlineShapeOf } from './glyphOutlines'
import { frameLetters, type PreparedExport } from './pdfExport'
import { zOfFrame } from './stacking'
import type { PictureReason } from './vectorText'

/**
 * A text frame as shapes: every letter is a path of its own (its holes cut out), and the letters of the frame are one group, which
 * moves as the text did. Used by "convert text to vector" and by the export of a page to SVG.
 */

/** the most letters one frame is turned into outlines for: a shape for each, so more would be slow to draw and to edit */
export const MAX_OUTLINE_LETTERS = 3000

export type FrameOutlines =
  | { shapes: ShapeFrame[] }
  /** the frame has no text to draw */
  | { problem: 'empty' }
  /** the frame is not plain text that can be turned into shapes: `reason` is why */
  | { problem: 'picture'; reason: PictureReason }
  | { problem: 'long'; letters: number }
  /** the font file has no outlines that can be read */
  | { problem: 'font' }

/** the outlines of one frame, as shapes in front of the same objects the frame was in front of */
export async function outlineFrame(prepared: PreparedExport, frame: TextFrame, newId: () => string): Promise<FrameOutlines> {
  const result = await frameLetters(prepared, frame.id)
  if ('reason' in result) return result.reason === 'empty' ? { problem: 'empty' } : { problem: 'picture', reason: result.reason }
  if (result.glyphs.length > MAX_OUTLINE_LETTERS) return { problem: 'long', letters: result.glyphs.length }
  const rotation = frame.rotation ?? 0
  const groupId = frame.groupId ?? (result.glyphs.length > 1 ? newId() : undefined)
  const shapes: ShapeFrame[] = []
  for (const glyph of result.glyphs) {
    const font = outlineFontOf(glyph.font.bytes)
    if (!font) return { problem: 'font' }
    const outline = outlineShapeOf([{ font, text: glyph.text, x: glyph.x, baseline: glyph.baseline, size: glyph.size, width: glyph.width }])
    if (!outline) continue
    // the box of the letter is in the frame's own, unturned places: it is turned about the centre of the frame as the frame was
    const [shiftX, shiftY] = rotateVec(outline.x + outline.w / 2 - frame.w / 2, outline.y + outline.h / 2 - frame.h / 2, rotation)
    const centerX = frame.x + frame.w / 2 + shiftX
    const centerY = frame.y + frame.h / 2 + shiftY
    const [red, green, blue] = glyph.color
    const shape: ShapeFrame = {
      id: newId(),
      kind: 'path',
      x: centerX - outline.w / 2,
      y: centerY - outline.h / 2,
      w: outline.w,
      h: outline.h,
      geom: outline.geom,
      fill: `#${[red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('')}`,
      stroke: null,
      strokeWidth: 0,
      z: zOfFrame(frame),
      label: `אות ${glyph.text}`,
    }
    if (frame.layerId) shape.layerId = frame.layerId
    if (groupId) shape.groupId = groupId
    if (rotation) shape.rotation = rotation
    if (frame.opacity !== undefined && frame.opacity < 1) shape.opacity = frame.opacity
    shapes.push(shape)
  }
  return { shapes }
}
