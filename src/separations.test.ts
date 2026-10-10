import { describe, expect, it } from 'vitest'
import { composeInkWarning, composeSeparations, inkReport, separate, type InkSelection } from './separations'

const only = (...inks: (keyof InkSelection)[]): InkSelection => ({
  cyan: inks.includes('cyan'),
  magenta: inks.includes('magenta'),
  yellow: inks.includes('yellow'),
  black: inks.includes('black'),
})
const rgba = (...colors: [number, number, number][]) => new Uint8ClampedArray(colors.flatMap(([r, g, b]) => [r, g, b, 255]))

describe('the separation of a page into its inks', () => {
  it('splits a colour into the four inks, and a black into the black ink only', () => {
    const inks = separate(rgba([255, 255, 255], [0, 0, 0], [255, 0, 0], [0, 174, 239]))
    expect([...inks.slice(0, 4)]).toEqual([0, 0, 0, 0])
    // black: the black ink alone, at full strength
    expect([...inks.slice(4, 8)]).toEqual([0, 0, 0, 255])
    // red: no cyan, full magenta and yellow
    expect([...inks.slice(8, 12)]).toEqual([0, 255, 255, 0])
    // a cyan: cyan is the most of it
    expect(inks[12]).toBeGreaterThan(200)
    expect(inks[13]).toBeLessThan(inks[12]!)
  })

  it('shows one ink alone as its own tints on white paper', () => {
    const inks = separate(rgba([255, 255, 255], [255, 0, 0]))
    const out = new Uint8ClampedArray(inks.length)
    composeSeparations(inks, only('magenta'), out)
    // the paper stays white; the red has the magenta alone: a magenta on white
    expect([out[0], out[1], out[2]]).toEqual([255, 255, 255])
    expect(out[4]).toBeGreaterThan(200)
    expect(out[5]).toBeLessThan(10)
    // with the black ink alone the red has no black in it: paper
    composeSeparations(inks, only('black'), out)
    expect([out[4], out[5], out[6]]).toEqual([255, 255, 255])
  })

  it('shows nothing but paper when no ink is shown, and a darker page when more inks are', () => {
    const inks = separate(rgba([60, 120, 200]))
    const none = new Uint8ClampedArray(4)
    composeSeparations(inks, only(), none)
    expect([none[0], none[1], none[2]]).toEqual([255, 255, 255])
    const one = new Uint8ClampedArray(4)
    const all = new Uint8ClampedArray(4)
    composeSeparations(inks, only('cyan'), one)
    composeSeparations(inks, only('cyan', 'magenta', 'yellow', 'black'), all)
    expect(one[0]! + one[1]! + one[2]!).toBeGreaterThan(all[0]! + all[1]! + all[2]!)
  })
})

describe('the ink of a page', () => {
  it('tells the average of each ink and the most ink at one place', () => {
    // half the page is white, half is printed with all four inks (400%)
    const cmyk = new Uint8Array([0, 0, 0, 0, 255, 255, 255, 255])
    const report = inkReport(cmyk, 300)
    expect(report.maxTotal).toBeCloseTo(400, 5)
    expect(report.average.cyan).toBeCloseTo(50, 5)
    expect(report.overLimit).toBeCloseTo(50, 5)
    expect(inkReport(cmyk, 400).overLimit).toBe(0)
  })

  it('paints the places that are over the limit red, and the rest a pale grey', () => {
    const cmyk = new Uint8Array([0, 0, 0, 0, 255, 255, 255, 255, 40, 20, 10, 100])
    const out = new Uint8ClampedArray(12)
    composeInkWarning(cmyk, 300, out)
    // the paper is nearly white; the heavy place is red; the light one is a grey
    expect(out[0]).toBeGreaterThan(230)
    expect(out[4]).toBeGreaterThan(out[5]! + 100)
    expect(out[8]).toBe(out[9])
  })
})
