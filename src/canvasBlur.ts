/**
 * A Gaussian blur of RGBA pixels, done in the program (three passes of a box blur, which is as near a Gaussian as makes no difference)
 * instead of by the canvas filter, which not every browser has. The colours are blurred premultiplied by their alpha, so that a soft
 * edge of a red shape does not go grey.
 */

/** the widths of three box blurs that together blur like a Gaussian of `sigma` */
export function boxSizes(sigma: number, passes = 3): number[] {
  const ideal = Math.sqrt((12 * sigma * sigma) / passes + 1)
  let lower = Math.floor(ideal)
  if (lower % 2 === 0) lower -= 1
  const upper = lower + 2
  const mIdeal = (12 * sigma * sigma - passes * lower * lower - 4 * passes * lower - 3 * passes) / (-4 * lower - 4)
  const m = Math.round(mIdeal)
  return Array.from({ length: passes }, (_, i) => (i < m ? lower : upper))
}

/** one line of values blurred by a box of `radius` either side, what lies outside the line being nothing */
function boxLine(source: Float32Array, target: Float32Array, length: number, radius: number, sourceStart: number, step: number): void {
  const scale = 1 / (radius + radius + 1)
  let sum = 0
  // the first window: what is within the radius of the first value
  for (let i = 0; i <= radius && i < length; i += 1) sum += source[sourceStart + i * step]!
  for (let i = 0; i < length; i += 1) {
    target[sourceStart + i * step] = sum * scale
    const incoming = i + radius + 1
    const outgoing = i - radius
    if (incoming < length) sum += source[sourceStart + incoming * step]!
    if (outgoing >= 0) sum -= source[sourceStart + outgoing * step]!
  }
}

/** `data` (RGBA, `width` × `height`) blurred in place by a Gaussian of standard deviation `sigma` pixels */
export function blurRgba(data: Uint8ClampedArray, width: number, height: number, sigma: number): void {
  if (!(sigma > 0.2) || width < 1 || height < 1) return
  const count = width * height
  const channels = [new Float32Array(count), new Float32Array(count), new Float32Array(count), new Float32Array(count)]
  for (let pixel = 0; pixel < count; pixel += 1) {
    const alpha = data[pixel * 4 + 3]! / 255
    channels[0]![pixel] = data[pixel * 4]! * alpha
    channels[1]![pixel] = data[pixel * 4 + 1]! * alpha
    channels[2]![pixel] = data[pixel * 4 + 2]! * alpha
    channels[3]![pixel] = data[pixel * 4 + 3]!
  }
  const scratch = new Float32Array(count)
  for (const size of boxSizes(sigma)) {
    const radius = (size - 1) / 2
    if (radius < 1) continue
    for (const channel of channels) {
      for (let row = 0; row < height; row += 1) boxLine(channel, scratch, width, radius, row * width, 1)
      for (let column = 0; column < width; column += 1) boxLine(scratch, channel, height, radius, column, width)
    }
  }
  for (let pixel = 0; pixel < count; pixel += 1) {
    const alpha = channels[3]![pixel]!
    const back = alpha > 0 ? 255 / alpha : 0
    data[pixel * 4] = Math.min(255, Math.round(channels[0]![pixel]! * back))
    data[pixel * 4 + 1] = Math.min(255, Math.round(channels[1]![pixel]! * back))
    data[pixel * 4 + 2] = Math.min(255, Math.round(channels[2]![pixel]! * back))
    data[pixel * 4 + 3] = Math.min(255, Math.round(alpha))
  }
}

/** how many pixels of room a blur of `sigma` needs round a shape, so that its soft edge is not cut off */
export const blurPadding = (sigma: number): number => Math.ceil(sigma * 3) + 2
