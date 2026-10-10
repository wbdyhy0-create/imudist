/**
 * The white point of a picture that is multiplied with what is under it (the blend mode "multiply"). Multiplying lets only a pure white (255)
 * through unchanged; the "white" of a logo from a JPEG is usually a little grey (239, 243, 243), and leaves a faint rectangle. The white
 * point is the level that is taken as white: everything from it up becomes 255, and what is below it is raised in proportion (a "levels"
 * adjustment), so that the logo keeps its look and the paper-grey around it disappears.
 */

/** the lowest the white point can be set to: below it the picture is changed too much to be the same picture */
export const MIN_WHITE_POINT = 128

/** the white point that does something: 255 (or more, or nothing) is the picture as it is */
export const effectiveWhitePoint = (whitePoint: number | undefined): number | null =>
  whitePoint !== undefined && Number.isFinite(whitePoint) && whitePoint < 255 ? Math.max(MIN_WHITE_POINT, Math.round(whitePoint)) : null

/** how much every colour is multiplied by to make the white point white: also what the screen's `brightness()` takes */
export const whitePointGain = (whitePoint: number) => 255 / whitePoint

/** Applies the white point to RGBA pixel data (in place): each of the colours is raised in proportion, up to 255; the transparency is not touched. */
export function applyWhitePoint(data: Uint8ClampedArray, whitePoint: number) {
  const gain = whitePointGain(whitePoint)
  for (let at = 0; at < data.length; at += 4) {
    data[at] = Math.min(255, Math.round(data[at]! * gain))
    data[at + 1] = Math.min(255, Math.round(data[at + 1]! * gain))
    data[at + 2] = Math.min(255, Math.round(data[at + 2]! * gain))
  }
}

/**
 * The white point that makes the paper of a picture white: the picture's border (where a logo's background is) is looked at, and the white
 * point is the level most of it reaches in its darkest colour (the fifth part of the border that is darkest is allowed to stay a little grey).
 * Null when the border is not light (a picture that does not have a paper round it) or has nothing to correct (it is white already).
 */
export function whitePointOfBorder(data: ArrayLike<number>, width: number, height: number): number | null {
  if (width < 4 || height < 4) return null
  const levels: number[] = []
  const inset = Math.min(2, Math.floor(Math.min(width, height) / 4))
  const take = (x: number, y: number) => {
    const at = (y * width + x) * 4
    if ((data[at + 3] ?? 255) < 200) return
    levels.push(Math.min(data[at]!, data[at + 1]!, data[at + 2]!))
  }
  for (let x = inset; x < width - inset; x += 1) {
    take(x, inset)
    take(x, height - 1 - inset)
  }
  for (let y = inset; y < height - inset; y += 1) {
    take(inset, y)
    take(width - 1 - inset, y)
  }
  if (levels.length < 8) return null
  levels.sort((a, b) => a - b)
  const point = levels[Math.floor(levels.length * 0.2)]!
  // a border that is not light is not paper; one that is white needs nothing
  if (point < 180 || point >= 253) return null
  return point
}
