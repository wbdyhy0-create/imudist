import type { CharStyle } from './document'

/**
 * Where the first line of a frame's text sits against the frame's top.
 *
 * A line of text is drawn by CSS as a box `leading` tall, with the glyphs centred on it: with a leading smaller than the
 * glyphs the box is shorter than the letters and they stick out of the top of it - and so out of the top of the frame, where
 * they are cut off. (Other lines do not mind, they stick out into the line above.) A layout program puts the first baseline an
 * ascent below the frame's top instead, whatever the leading is. `firstLineLift` is what the first line has to be moved down
 * by for that: nothing for the usual leadings, a few points for a very tight one.
 */

export interface FontExtents {
  /** how far the glyphs of the font reach above the baseline, and below it (px) */
  ascent: number
  descent: number
}

export type FontFace = Pick<CharStyle, 'fontFamily' | 'fontSize' | 'weight' | 'italic'>

let canvas: CanvasRenderingContext2D | null = null
const cache = new Map<string, FontExtents>()

/** The ascent and descent of a font at a size, as the browser sets them (the same numbers it centres a line box on). */
export function fontExtents(face: FontFace): FontExtents {
  const key = `${face.fontFamily}|${face.fontSize}|${face.weight}|${face.italic}`
  const known = cache.get(key)
  if (known) return known
  let extents: FontExtents = { ascent: face.fontSize * 0.93, descent: face.fontSize * 0.27 }
  if (typeof document !== 'undefined') {
    canvas ??= document.createElement('canvas').getContext('2d')
    if (canvas) {
      canvas.font = `${face.italic ? 'italic ' : ''}${face.weight} ${face.fontSize}px "${face.fontFamily}", "Segoe UI", Arial, sans-serif`
      const measured = canvas.measureText('Hxg')
      if (measured.fontBoundingBoxAscent > 0) extents = { ascent: measured.fontBoundingBoxAscent, descent: measured.fontBoundingBoxDescent }
    }
  }
  cache.set(key, extents)
  return extents
}

/**
 * How far the first line has to move down so that its glyphs are inside the frame, in px. `strut` is the frame's own font (every
 * line has it as an invisible inline box of its own), `runs` the fonts the first line's text is in, `leading` the line height.
 * Each inline box is `leading` tall and centred on its font's glyph area, so its top is (leading + ascent - descent) / 2 above the
 * baseline; the line box reaches up to the highest of them, the glyphs to the highest ascent.
 */
export function firstLineLift(strut: FontFace, runs: FontFace[], leading: number, extentsOf: (face: FontFace) => FontExtents = fontExtents): number {
  if (!(leading > 0) || runs.length === 0) return 0
  const top = (extents: FontExtents) => (leading + extents.ascent - extents.descent) / 2
  const strutExtents = extentsOf(strut)
  const runExtents = runs.map(extentsOf)
  const lineTop = Math.max(top(strutExtents), ...runExtents.map(top))
  const glyphTop = Math.max(...runExtents.map((extents) => extents.ascent))
  return Math.max(0, Math.round((glyphTop - lineTop) * 10) / 10)
}
