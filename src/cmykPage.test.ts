import { describe, expect, it } from 'vitest'
import { rgbaToCmyk, rgbToInks } from './cmykPage'

const pixel = (r: number, g: number, b: number, a = 255) => [r, g, b, a]
const inks = (...pixels: number[][]) => [...rgbaToCmyk(pixels.flat())]

describe('rgbaToCmyk', () => {
  it('writes white as no ink at all', () => {
    expect(inks(pixel(255, 255, 255))).toEqual([0, 0, 0, 0])
  })

  it('writes black, and every grey, as black ink only', () => {
    expect(inks(pixel(0, 0, 0))).toEqual([0, 0, 0, 255])
    expect(inks(pixel(51, 51, 51))).toEqual([0, 0, 0, 204])
    expect(inks(pixel(128, 128, 128))).toEqual([0, 0, 0, 127])
  })

  it('splits a colour into the inks that make it', () => {
    expect(inks(pixel(255, 0, 0))).toEqual([0, 255, 255, 0])
    expect(inks(pixel(0, 255, 0))).toEqual([255, 0, 255, 0])
    expect(inks(pixel(0, 0, 255))).toEqual([255, 255, 0, 0])
    expect(inks(pixel(0, 255, 255))).toEqual([255, 0, 0, 0])
  })

  it('puts the black under a dark colour in the black ink', () => {
    // dark blue: 40% of the light is left, so 60% black, and the colour is scaled up to what is left
    expect(inks(pixel(0, 0, 102))).toEqual([255, 255, 0, 153])
  })

  it('never uses more than 300% of ink', () => {
    for (const [r, g, b] of [[1, 0, 0], [0, 0, 1], [10, 200, 30], [255, 255, 0], [90, 20, 20]]) {
      const [c, m, y, k] = inks(pixel(r, g, b))
      expect((c + m + y + k) / 255).toBeLessThanOrEqual(3.01)
    }
  })

  it('lays a see-through pixel on white paper', () => {
    expect(inks(pixel(0, 0, 0, 0))).toEqual([0, 0, 0, 0])
    expect(inks(pixel(0, 0, 0, 255))).toEqual([0, 0, 0, 255])
    expect(inks(pixel(0, 0, 0, 128))[3]).toBeGreaterThan(100)
  })

  it('writes every pixel by itself, in order', () => {
    expect(inks(pixel(255, 255, 255), pixel(0, 0, 0))).toEqual([0, 0, 0, 0, 0, 0, 0, 255])
  })

  it('can write the inks reversed, as jsPDF states a CMYK picture', () => {
    expect([...rgbaToCmyk(pixel(0, 0, 0), true)]).toEqual([255, 255, 255, 0])
    expect([...rgbaToCmyk(pixel(255, 255, 255), true)]).toEqual([255, 255, 255, 255])
  })
})

describe('rgbToInks', () => {
  it('gives the inks of one colour, black in the black ink only', () => {
    expect(rgbToInks(0, 0, 0)).toEqual([0, 0, 0, 1])
    expect(rgbToInks(255, 255, 255)).toEqual([0, 0, 0, 0])
    expect(rgbToInks(255, 0, 0)).toEqual([0, 1, 1, 0])
    expect(rgbToInks(128, 128, 128)[3]).toBeCloseTo(0.498, 2)
    expect(rgbToInks(128, 128, 128).slice(0, 3)).toEqual([0, 0, 0])
  })

  it('prints the default text colour (#111111) in the black ink at its full strength, and a grey a little lighter as a grey', () => {
    expect(rgbToInks(17, 17, 17)).toEqual([0, 0, 0, 1])
    expect(rgbToInks(0, 0, 17)).toEqual([0, 0, 0, 1])
    expect(rgbToInks(18, 18, 18)[3]).toBeCloseTo(1 - 18 / 255, 5)
    expect([...rgbaToCmyk([17, 17, 17, 255])]).toEqual([0, 0, 0, 255])
    expect([...rgbaToCmyk([40, 40, 40, 255])]).toEqual([0, 0, 0, 215])
  })

  it('agrees with the pictures: the same colour has the same inks in both', () => {
    for (const [r, g, b] of [[255, 0, 0], [10, 200, 30], [90, 20, 20], [0, 51, 170], [200, 200, 100]]) {
      const [c, m, y, k] = rgbToInks(r, g, b)
      const picture = rgbaToCmyk([r, g, b, 255])
      expect(Math.abs(picture[0] - c * 255)).toBeLessThanOrEqual(0.5)
      expect(Math.abs(picture[1] - m * 255)).toBeLessThanOrEqual(0.5)
      expect(Math.abs(picture[2] - y * 255)).toBeLessThanOrEqual(0.5)
      expect(Math.abs(picture[3] - k * 255)).toBeLessThanOrEqual(0.5)
    }
  })

  it('keeps the colour of a see-through pixel when the picture has a mask of its own', () => {
    expect([...rgbaToCmyk([255, 0, 0, 128], false, false)]).toEqual([0, 255, 255, 0])
    expect([...rgbaToCmyk([255, 0, 0, 0], false, true)]).toEqual([0, 0, 0, 0])
  })
})
