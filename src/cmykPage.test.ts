import { describe, expect, it } from 'vitest'
import { rgbaToCmyk } from './cmykPage'

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
