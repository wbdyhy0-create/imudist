import { describe, expect, it } from 'vitest'
import { blurPadding, blurRgba, boxSizes } from './canvasBlur'

const pixels = (width: number, height: number) => new Uint8ClampedArray(width * height * 4)
const alphaAt = (data: Uint8ClampedArray, width: number, x: number, y: number) => data[(y * width + x) * 4 + 3]!

describe('the boxes of a blur', () => {
  it('are odd widths, three of them, that grow with the blur', () => {
    const small = boxSizes(2)
    const large = boxSizes(10)
    expect(small).toHaveLength(3)
    for (const size of [...small, ...large]) expect(size % 2).toBe(1)
    expect(large[0]!).toBeGreaterThan(small[0]!)
  })
})

describe('a blur of pixels', () => {
  it('leaves them alone for a blur of nothing', () => {
    const data = pixels(5, 5)
    data[(2 * 5 + 2) * 4 + 3] = 255
    blurRgba(data, 5, 5, 0)
    expect(alphaAt(data, 5, 2, 2)).toBe(255)
    expect(alphaAt(data, 5, 1, 2)).toBe(0)
  })

  it('spreads a dot to its neighbours, symmetrically, and keeps its weight', () => {
    const width = 41
    const data = pixels(width, width)
    const centre = 20
    data[(centre * width + centre) * 4 + 3] = 255
    for (let i = 0; i < width * width; i += 1) data[i * 4] = 200
    // the dot is as red as the pixels round it, so that only its alpha is what is blurred
    blurRgba(data, width, width, 3)
    const left = alphaAt(data, width, centre - 3, centre)
    const right = alphaAt(data, width, centre + 3, centre)
    expect(left).toBeGreaterThan(0)
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1)
    expect(alphaAt(data, width, centre, centre)).toBeLessThan(255)
    let total = 0
    for (let i = 0; i < width * width; i += 1) total += data[i * 4 + 3]!
    // the sum of the alpha is still about 255, apart from rounding
    expect(Math.abs(total - 255)).toBeLessThan(width * width * 0.5)
  })

  it('does not turn a coloured edge grey', () => {
    const width = 20
    const data = pixels(width, 1)
    for (let x = 0; x < 10; x += 1) {
      data[x * 4] = 255
      data[x * 4 + 3] = 255
    }
    blurRgba(data, width, 1, 2)
    // at the edge the pixel is half see-through but still red
    const edge = 9
    expect(data[edge * 4]!).toBeGreaterThan(240)
    expect(data[edge * 4 + 1]!).toBeLessThan(5)
    expect(alphaAt(data, width, 12, 0)).toBeGreaterThan(0)
  })
})

describe('the room a blur needs', () => {
  it('is three deviations and a little over', () => {
    expect(blurPadding(0)).toBe(2)
    expect(blurPadding(4)).toBe(14)
  })
})
