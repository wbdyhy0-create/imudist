/**
 * Where the letters of a line of text really stand in their line. A line box is as tall as the leading says, and the letters sit in it
 * by the metrics of the font (its ascent and descent, which a Hebrew font often makes big, for the marks above and below the letters):
 * so the middle of the letters is not always the middle of the line, and an ornament put at the middle of the line looks too low (or
 * too high) beside the text. `letterCenterShift` says how far the one is from the other.
 */

interface FontLike {
  fontFamily: string
  weight: number
  italic: boolean
  fontSize: number
}

let context: CanvasRenderingContext2D | null | undefined
const cache = new Map<string, number>()

/**
 * How far (px, down is positive) the middle of the letters is below the middle of a line box of `lineHeight`. The letters measured are
 * a Hebrew base letter, or an H for a text that has none.
 */
export function letterCenterShift(font: FontLike, lineHeight: number, text: string): number {
  if (typeof document === 'undefined' || !(font.fontSize > 0) || !(lineHeight > 0)) return 0
  const sample = /[֐-׿]/.test(text) ? 'א' : 'H'
  const key = `${font.fontFamily}|${font.weight}|${font.italic ? 1 : 0}|${font.fontSize}|${lineHeight}|${sample}`
  const known = cache.get(key)
  if (known !== undefined) return known
  context ??= document.createElement('canvas').getContext('2d')
  if (!context) return 0
  context.font = `${font.italic ? 'italic ' : ''}${font.weight} ${font.fontSize}px "${font.fontFamily.replace(/"/g, '')}", "Segoe UI", Arial, sans-serif`
  const measured = context.measureText(sample)
  const ascent = measured.fontBoundingBoxAscent
  const descent = measured.fontBoundingBoxDescent
  let shift = 0
  if (Number.isFinite(ascent) && Number.isFinite(descent) && ascent + descent > 0) {
    // the baseline: the line's extra room is shared above and below the font's own height
    const baseline = (lineHeight - (ascent + descent)) / 2 + ascent
    const center = baseline - (measured.actualBoundingBoxAscent - measured.actualBoundingBoxDescent) / 2
    shift = center - lineHeight / 2
  }
  // a font that is not there yet is measured by the one that stands in for it: do not keep that
  if (Math.abs(shift) < lineHeight) cache.set(key, shift)
  return shift
}
