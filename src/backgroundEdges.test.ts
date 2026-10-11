import { describe, expect, it } from 'vitest'
import { cleanEdges } from './backgroundEdges'

/** a picture of width × height of one colour, from a function of the pixel */
function picture(width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) data.set(pixel(x, y), (y * width + x) * 4)
  }
  return data
}

const at = (data: Uint8ClampedArray, width: number, x: number, y: number) => [...data.slice((y * width + x) * 4, (y * width + x) * 4 + 4)]

describe('cleaning the edge of an object whose background was taken out', () => {
  // a red object on columns 0…3; column 4 is a band that is nearly opaque but still white-ish, column 5 a faint trace of the ground
  const width = 8
  const height = 3
  const make = () => picture(width, height, (x) => {
    if (x <= 3) return [200, 20, 20, 255]
    if (x === 4) return [240, 200, 200, 140]
    if (x === 5) return [255, 255, 255, 16]
    return [255, 255, 255, 0]
  })

  it('takes the faint trace of the ground out and keeps the object solid', () => {
    const data = make()
    cleanEdges(data, width, height)
    expect(at(data, width, 5, 1)[3]).toBe(0)
    expect(at(data, width, 6, 1)[3]).toBe(0)
    expect(at(data, width, 1, 1)).toEqual([200, 20, 20, 255])
  })

  it('gives the half-transparent edge the colour of the object, so that no light halo is left', () => {
    const data = make()
    cleanEdges(data, width, height)
    const [r, g, b, a] = at(data, width, 4, 1)
    expect([r, g, b]).toEqual([200, 20, 20])
    expect(a).toBeGreaterThan(0)
    expect(a).toBeLessThan(255)
  })

  it('makes a nearly opaque pixel solid and a nearly clear one clear', () => {
    const data = picture(4, 1, (x) => [[10, 10, 10, 250], [10, 10, 10, 235], [10, 10, 10, 20], [10, 10, 10, 1]][x] as [number, number, number, number])
    cleanEdges(data, 4, 1)
    expect([0, 1, 2, 3].map((x) => at(data, 4, x, 0)[3])).toEqual([255, 255, 0, 0])
  })

  it('leaves a picture that has no edge as it was', () => {
    const data = picture(3, 3, () => [30, 60, 90, 255])
    const before = data.slice()
    cleanEdges(data, 3, 3)
    expect([...data]).toEqual([...before])
  })

  it('does not reach further than it is asked to', () => {
    // a long ramp of half-transparent white: only the pixels within reach of the object get its colour
    const data = picture(8, 1, (x) => (x === 0 ? [200, 20, 20, 255] : [255, 255, 255, 128]))
    cleanEdges(data, 8, 1, { reach: 2 })
    expect(at(data, 8, 1, 0).slice(0, 3)).toEqual([200, 20, 20])
    expect(at(data, 8, 2, 0).slice(0, 3)).toEqual([200, 20, 20])
    expect(at(data, 8, 3, 0).slice(0, 3)).toEqual([255, 255, 255])
  })
})
