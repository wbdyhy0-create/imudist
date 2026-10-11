import { describe, expect, it } from 'vitest'
import { boostThinFeatures, brightnessField, contoursOf, DEFAULT_TRACE, otsuLevel, shapeFromTrace, signedArea, suggestedTrace, tracedColor, traceField, visibleRegion, workingScale } from './imageTrace'
import { shapePath } from './shapes'
import type { ImageFrame, ShapeFrame } from './document'

/** a picture of `width` by `height`, white, with some black (`ink`) painted by a function of the pixel */
function picture(width: number, height: number, ink: (x: number, y: number) => boolean) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4
      const value = ink(x, y) ? 0 : 255
      data[at] = value
      data[at + 1] = value
      data[at + 2] = value
      data[at + 3] = 255
    }
  }
  return data
}

describe('finding the outline of a shape in a picture', () => {
  it('follows the edge of a square, with the crossings between the pixels', () => {
    const data = picture(20, 20, (x, y) => x >= 5 && x < 15 && y >= 5 && y < 15)
    const field = brightnessField(data, 20, 20)
    const loops = contoursOf(field, 20, 20, 128, 'dark')
    expect(loops).toHaveLength(1)
    const [loop] = loops
    const xs = loop!.map((point) => point[0])
    const ys = loop!.map((point) => point[1])
    // the square covers 5 to 15: its outline is half way between its pixels and the white ones next to them
    expect(Math.min(...xs)).toBeCloseTo(4.5 + 0.5, 0)
    expect(Math.max(...xs)).toBeCloseTo(14.5 + 0.5, 0)
    expect(Math.abs(signedArea(loop!))).toBeGreaterThan(90)
    expect(Math.abs(signedArea(loop!))).toBeLessThan(110)
    expect(Math.min(...ys)).toBeGreaterThan(3.9)
  })

  it('makes a hole of what is inside a shape (the inside of an O), and a shape of what is inside the hole', () => {
    const data = picture(40, 40, (x, y) => {
      const distance = Math.hypot(x - 20, y - 20)
      return distance < 15 && distance > 8
    })
    const result = traceField(brightnessField(data, 40, 40), 40, 40, { ...DEFAULT_TRACE, smooth: 0 })
    expect(result.shapes).toBe(1)
    expect(result.holes).toBe(1)
    expect(result.geom[0]).toHaveLength(2)
  })

  it('drops specks, and keeps the real shapes', () => {
    const data = picture(30, 30, (x, y) => (x >= 5 && x < 20 && y >= 5 && y < 20) || (x === 25 && y === 25))
    const kept = traceField(brightnessField(data, 30, 30), 30, 30, { ...DEFAULT_TRACE, smooth: 0, minArea: 6 })
    expect(kept.shapes).toBe(1)
    const all = traceField(brightnessField(data, 30, 30), 30, 30, { ...DEFAULT_TRACE, smooth: 0, minArea: 0 })
    expect(all.shapes).toBe(2)
  })

  it('traces what is light on a dark ground when asked', () => {
    // a white square on black
    const dark = picture(20, 20, (x, y) => !(x >= 5 && x < 15 && y >= 5 && y < 15))
    const field = brightnessField(dark, 20, 20)
    expect(suggestedTrace(field, 128)).toBe('light')
    const result = traceField(field, 20, 20, { ...DEFAULT_TRACE, trace: 'light', smooth: 0 })
    expect(result.shapes).toBe(1)
    expect(result.holes).toBe(0)
  })

  it('has a shape that fills a path the app can draw, with the holes cut out', () => {
    const data = picture(40, 40, (x, y) => {
      const distance = Math.hypot(x - 20, y - 20)
      return distance < 15 && distance > 8
    })
    const result = traceField(brightnessField(data, 40, 40), 40, 40, { ...DEFAULT_TRACE, smooth: 0 })
    const shape = { id: 's', kind: 'path', x: 0, y: 0, w: 40, h: 40, geom: result.geom, fill: '#000', stroke: null, strokeWidth: 0 } as ShapeFrame
    const path = shapePath(shape)
    // two rings: an outer one and the hole
    expect(path.match(/M/g)?.length).toBe(2)
    expect(path.endsWith('Z')).toBe(true)
  })
})

describe('what the picture is made of', () => {
  it('finds the level between a dark and a light picture, and the colour of the shape', () => {
    const data = picture(20, 20, (x, y) => x < 8 && y < 8)
    const field = brightnessField(data, 20, 20)
    const level = otsuLevel(field)
    expect(level).toBeGreaterThan(0)
    expect(level).toBeLessThan(255)
    expect(suggestedTrace(field, level)).toBe('dark')
    expect(tracedColor(data, field, level, 'dark')).toBe('#000000')
    expect(tracedColor(data, field, level, 'light')).toBe('#ffffff')
  })
})

describe('where the traced shape goes', () => {
  it('takes the whole frame when the picture is stretched, and the part the picture has when it is fitted', () => {
    expect(visibleRegion('stretch', 200, 100, 50, 50)).toEqual({ src: { x: 0, y: 0, w: 50, h: 50 }, box: { x: 0, y: 0, w: 200, h: 100 } })
    const fitted = visibleRegion('fit', 200, 100, 50, 50)
    expect(fitted.box).toEqual({ x: 50, y: 0, w: 100, h: 100 })
    expect(fitted.src).toEqual({ x: 0, y: 0, w: 50, h: 50 })
  })

  it('traces only the part that shows when the picture fills the frame and goes over its edges', () => {
    const filled = visibleRegion('fill', 200, 100, 50, 50)
    expect(filled.box).toEqual({ x: 0, y: 0, w: 200, h: 100 })
    // the frame is twice as wide as high: the picture shows its middle half, from top to bottom of the shown band
    expect(filled.src.w).toBe(50)
    expect(filled.src.h).toBe(25)
    expect(filled.src.y).toBe(12.5)
  })

  it('enlarges a small picture and reduces a huge one before tracing it', () => {
    expect(workingScale(300, 200)).toBe(4)
    expect(workingScale(1500, 1000)).toBe(1)
    expect(workingScale(4800, 3000)).toBeCloseTo(0.5, 5)
  })

  it('makes a shape in the place of the picture, mirrored when the picture was, with its layer, turning and blending', () => {
    const data = picture(20, 20, (x, y) => x >= 2 && x < 8 && y >= 4 && y < 10)
    const result = traceField(brightnessField(data, 20, 20), 20, 20, { ...DEFAULT_TRACE, smooth: 0 })
    const image = { id: 'i', x: 100, y: 50, w: 80, h: 80, assetId: 'a', fit: 'stretch', flipX: true, rotation: 30, opacity: 0.5, blendMode: 'multiply', layerId: 'layer-2' } as ImageFrame
    const shape = shapeFromTrace(image, visibleRegion('stretch', 80, 80, 20, 20), result, '#0066ff', 'new', 7)
    expect(shape).toMatchObject({ kind: 'path', x: 100, y: 50, w: 80, h: 80, fill: '#0066ff', z: 7, rotation: 30, opacity: 0.5, blendMode: 'multiply', layerId: 'layer-2', stroke: null })
    // the square was on the left of the picture; mirrored it is on the right
    const xs = shape.geom!.flat(2).map((vertex) => (Array.isArray(vertex) ? vertex[0] : vertex.p[0]))
    expect(Math.min(...xs)).toBeGreaterThan(0.55)
  })
})

describe('the colour of what is traced', () => {
  it('is the ink, not the ink mixed with paper at its edges', () => {
    // a 10 by 10 patch of ink (0, 102, 255) with a one pixel border that is half paper
    const width = 14
    const data = new Uint8ClampedArray(width * width * 4).fill(255)
    for (let y = 1; y < 13; y += 1) {
      for (let x = 1; x < 13; x += 1) {
        const edge = x === 1 || y === 1 || x === 12 || y === 12
        const at = (y * width + x) * 4
        data[at] = edge ? 128 : 0
        data[at + 1] = edge ? 178 : 102
        data[at + 2] = 255
      }
    }
    const field = brightnessField(data, width, width)
    expect(tracedColor(data, field, 200, 'dark')).toBe('#0066ff')
  })
})

describe('keeping thin and faint lines', () => {
  /** a picture with a bold bar and a faint, thin, soft line (a lot lighter than the level), the way a soft scroll has its tails */
  const soft = (() => {
    const width = 60
    const height = 40
    const field = new Float32Array(width * height).fill(255)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        // a bold bar on the left
        if (x >= 4 && x < 14 && y >= 5 && y < 35) field[y * width + x] = 10
        // a faint line with a soft profile: darkest 60 below the paper, 2 pixels wide
        const across = Math.abs(y - 20)
        const x0 = 24
        if (x >= x0 && x < 56) field[y * width + x] = Math.min(field[y * width + x]!, 255 - 60 * Math.exp(-(across * across) / 2))
      }
    }
    return { field, width, height }
  })()

  it('loses the faint line when only the level decides', () => {
    const plain = traceField(soft.field, soft.width, soft.height, { ...DEFAULT_TRACE, level: 128, smooth: 0, thin: 0 })
    expect(plain.shapes).toBe(1)
  })

  it('has the faint line too once thin lines are kept, and the bold bar the same as before', () => {
    const kept = traceField(soft.field, soft.width, soft.height, { ...DEFAULT_TRACE, level: 128, smooth: 0, thin: 30, thinReach: 4 })
    expect(kept.shapes).toBe(2)
    // the bar is not changed by it: the same single outline for it
    const withoutLine = new Float32Array(soft.field)
    for (let y = 0; y < soft.height; y += 1) for (let x = 20; x < soft.width; x += 1) withoutLine[y * soft.width + x] = 255
    const barOnly = traceField(withoutLine, soft.width, soft.height, { ...DEFAULT_TRACE, level: 128, smooth: 0, thin: 30, thinReach: 4 })
    const barOnlyPlain = traceField(withoutLine, soft.width, soft.height, { ...DEFAULT_TRACE, level: 128, smooth: 0, thin: 0 })
    expect(barOnly.shapes).toBe(1)
    expect(barOnly.points).toBe(barOnlyPlain.points)
  })

  it('does not turn a bold shape into a thicker one', () => {
    // the area of the bold bar is the same with and without the boost
    const area = (field: Float32Array, thin: number) => {
      const loops = contoursOf(thin > 0 ? boostThinFeatures(field, soft.width, soft.height, 128, 'dark', 4, thin) : field, soft.width, soft.height, 128, 'dark')
      return loops.reduce((sum, loop) => sum + Math.abs(signedArea(loop)), 0)
    }
    const barOnly = new Float32Array(soft.field)
    for (let y = 0; y < soft.height; y += 1) for (let x = 20; x < soft.width; x += 1) barOnly[y * soft.width + x] = 255
    expect(area(barOnly, 30)).toBeCloseTo(area(barOnly, 0), 3)
  })

  it('works for light lines on a dark ground too', () => {
    const inverted = new Float32Array(soft.field.length)
    for (let i = 0; i < inverted.length; i += 1) inverted[i] = 255 - soft.field[i]!
    const kept = traceField(inverted, soft.width, soft.height, { ...DEFAULT_TRACE, trace: 'light', level: 128, smooth: 0, thin: 30, thinReach: 4 })
    expect(kept.shapes).toBe(2)
  })
})
