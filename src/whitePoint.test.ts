import { describe, expect, it } from 'vitest'
import { applyWhitePoint, effectiveWhitePoint, whitePointGain, whitePointOfBorder } from './whitePoint'

/** a picture 20 by 10 of one colour, with a dark mark in the middle */
function picture(background: [number, number, number], mark = [20, 20, 20]) {
  const data = new Uint8ClampedArray(20 * 10 * 4)
  for (let y = 0; y < 10; y += 1) {
    for (let x = 0; x < 20; x += 1) {
      const at = (y * 20 + x) * 4
      const inside = x >= 8 && x < 12 && y >= 4 && y < 6
      const color = inside ? mark : background
      data[at] = color[0]!
      data[at + 1] = color[1]!
      data[at + 2] = color[2]!
      data[at + 3] = 255
    }
  }
  return data
}

describe('the white point', () => {
  it('does nothing at 255, and cannot go below the lowest', () => {
    expect(effectiveWhitePoint(undefined)).toBeNull()
    expect(effectiveWhitePoint(255)).toBeNull()
    expect(effectiveWhitePoint(240)).toBe(240)
    expect(effectiveWhitePoint(40)).toBe(128)
  })

  it('makes the grey of a logo background white and keeps the dark mark dark', () => {
    const data = picture([239, 243, 243])
    applyWhitePoint(data, 239)
    // the background: all three colours are 255 now
    expect([data[0], data[1], data[2], data[3]]).toEqual([255, 255, 255, 255])
    // the mark was 20: raised by 255/239 only
    const mark = (5 * 20 + 9) * 4
    expect(data[mark]).toBe(Math.round(20 * whitePointGain(239)))
  })

  it('does not touch the transparency', () => {
    const data = new Uint8ClampedArray([200, 200, 200, 90])
    applyWhitePoint(data, 200)
    expect([...data]).toEqual([255, 255, 255, 90])
  })
})

describe('finding the white point of a picture', () => {
  it('is the level of the border: the logo with a light grey paper round it', () => {
    expect(whitePointOfBorder(picture([239, 243, 243]), 20, 10)).toBe(239)
  })

  it('has nothing to find when the border is white already, or is not paper', () => {
    expect(whitePointOfBorder(picture([255, 255, 255]), 20, 10)).toBeNull()
    expect(whitePointOfBorder(picture([90, 60, 40]), 20, 10)).toBeNull()
  })

  it('lets the darkest fifth of an uneven paper stay a little grey', () => {
    const data = picture([240, 240, 240])
    // the left fifth of the top row is darker (a corner's shade)
    for (let x = 2; x < 6; x += 1) {
      const at = (2 * 20 + x) * 4
      data[at] = data[at + 1] = data[at + 2] = 215
    }
    const point = whitePointOfBorder(data, 20, 10)
    expect(point).toBeGreaterThanOrEqual(215)
    expect(point).toBeLessThanOrEqual(240)
  })
})
