import { describe, expect, it } from 'vitest'
import { brushFromOutlines, customBrushPolygons, parseStoredBrushes, previewBrush, restyleStroke, strokeShape, type CustomBrush } from './customBrushes'

type Pt = [number, number]
const square = (x: number, y: number, size: number): Pt[] => [[x, y], [x + size, y], [x + size, y + size], [x, y + size]]
const box = (polygons: Pt[][][]) => {
  const xs = polygons.flatMap((polygon) => polygon.flatMap((ring) => ring.map((p) => p[0])))
  const ys = polygons.flatMap((polygon) => polygon.flatMap((ring) => ring.map((p) => p[1])))
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
}
const horizontal: Pt[] = Array.from({ length: 21 }, (_, i): Pt => [i * 10, 0])

const dropBrush = (extra: Partial<CustomBrush> = {}): CustomBrush => ({ ...brushFromOutlines([[square(0, 0, 10)]], 'drop', 'custom:drop')!, variation: 0, spacing: 2, ...extra })

describe('a brush made from outlines', () => {
  it('is one unit high and centred, with the width as its aspect', () => {
    const brush = brushFromOutlines([[square(100, 50, 20), square(105, 55, 5)]], 'ring', 'custom:ring')!
    expect(brush.id).toBe('custom:ring')
    expect(brush.aspect).toBeCloseTo(1, 3)
    const b = box(brush.polygons)
    expect(b.y1 - b.y0).toBeCloseTo(1, 3)
    expect((b.x0 + b.x1) / 2).toBeCloseTo(0, 3)
    expect((b.y0 + b.y1) / 2).toBeCloseTo(0, 3)
  })

  it('has a hole where two lines of one thing lie inside each other', () => {
    const brush = brushFromOutlines([[square(0, 0, 30), square(10, 10, 10)]], 'ring')!
    expect(brush.polygons).toHaveLength(1)
    expect(brush.polygons[0]).toHaveLength(2)
  })

  it('joins things that overlap, and keeps those that do not apart', () => {
    const touching = brushFromOutlines([[square(0, 0, 10)], [square(5, 0, 10)]], 'a')!
    expect(touching.polygons).toHaveLength(1)
    const apart = brushFromOutlines([[square(0, 0, 10)], [square(30, 0, 10)]], 'b')!
    expect(apart.polygons).toHaveLength(2)
  })

  it('is a stretched brush for a long thin shape and a repeated one for a round one', () => {
    expect(brushFromOutlines([[[[0, 0], [100, 0], [100, 10], [0, 10]]]], 'long')!.mode).toBe('stretch')
    expect(brushFromOutlines([[square(0, 0, 10)]], 'drop')!.mode).toBe('repeat')
  })

  it('is nothing for no lines, or lines with no area', () => {
    expect(brushFromOutlines([], 'none')).toBeNull()
    expect(brushFromOutlines([[[[0, 0], [10, 0], [20, 0]]]], 'flat')).toBeNull()
  })

  it('has at most so many points, however many the drawing had', () => {
    const circle: Pt[] = Array.from({ length: 20000 }, (_, i): Pt => [Math.cos((i / 20000) * Math.PI * 2) * 50, Math.sin((i / 20000) * Math.PI * 2) * 50])
    const brush = brushFromOutlines([[circle]], 'round')!
    const points = brush.polygons.reduce((sum, polygon) => sum + polygon.reduce((inner, ring) => inner + ring.length, 0), 0)
    expect(points).toBeLessThanOrEqual(1500)
    expect(points).toBeGreaterThan(20)
  })
})

describe('a repeated brush', () => {
  it('puts copies of the shape along the line, the distance of the spacing apart', () => {
    const polygons = customBrushPolygons(horizontal, dropBrush({ spacing: 2 }), 10)
    // 200 long, a copy is 10 wide with 20 between the starts: about ten copies
    expect(polygons.length).toBeGreaterThanOrEqual(8)
    expect(polygons.length).toBeLessThanOrEqual(13)
    const b = box(polygons)
    expect(b.y1 - b.y0).toBeCloseTo(10, 0)
  })

  it('joins copies that overlap into one shape', () => {
    const polygons = customBrushPolygons(horizontal, dropBrush({ spacing: 0.5 }), 10)
    expect(polygons).toHaveLength(1)
  })

  it('turns the copies to the line when it is asked, and leaves them when not', () => {
    const wide = brushFromOutlines([[[[0, 0], [30, 0], [30, 10], [0, 10]]]], 'bar', 'custom:bar')!
    const alongLine = { ...wide, mode: 'repeat' as const, spacing: 3, variation: 0, rotate: true }
    const vertical: Pt[] = Array.from({ length: 21 }, (_, i): Pt => [0, i * 10])
    const turned = box(customBrushPolygons(vertical, alongLine, 10))
    // turned along a vertical line the bar of three units by one stands up: as wide as it is high (10), not as it was drawn (30)
    expect(turned.x1 - turned.x0).toBeCloseTo(10, 0)
    const fixed = box(customBrushPolygons(vertical, { ...alongLine, rotate: false }, 10))
    expect(fixed.x1 - fixed.x0).toBeCloseTo(30, 0)
  })

  it('is the same for the same stroke, and not for another', () => {
    const varied = dropBrush({ variation: 0.8, spacing: 1.5 })
    const a = JSON.stringify(customBrushPolygons(horizontal, varied, 14))
    expect(JSON.stringify(customBrushPolygons(horizontal, varied, 14))).toBe(a)
    expect(JSON.stringify(customBrushPolygons(horizontal.map(([x, y]) => [x, y + 1] as Pt), varied, 14))).not.toBe(a)
  })

  it('is one copy for a click', () => {
    const polygons = customBrushPolygons([[40, 40]], dropBrush(), 12)
    expect(polygons).toHaveLength(1)
    const b = box(polygons)
    expect(b.x1 - b.x0).toBeCloseTo(12, 0)
  })

  it('has a number of copies that a very long line does not push past', () => {
    const long = Array.from({ length: 800 }, (_, i): Pt => [i * 20, Math.sin(i / 7) * 40])
    const polygons = customBrushPolygons(long, dropBrush({ spacing: 1.2 }), 4)
    expect(polygons.length).toBeLessThanOrEqual(900)
  })
})

describe('a stretched brush', () => {
  const bar = brushFromOutlines([[[[0, 0], [100, 0], [100, 10], [0, 10]]]], 'bar', 'custom:bar')!

  it('takes the length of the line and the height of the size', () => {
    const polygons = customBrushPolygons(horizontal, { ...bar, mode: 'stretch' }, 20)
    const b = box(polygons)
    expect(b.x1 - b.x0).toBeGreaterThan(190)
    expect(b.x1 - b.x0).toBeLessThan(210)
    expect(b.y1 - b.y0).toBeCloseTo(20, 0)
  })

  it('bends with a line that bends', () => {
    const arc: Pt[] = Array.from({ length: 41 }, (_, i): Pt => [Math.cos((i / 40) * Math.PI) * 100, Math.sin((i / 40) * Math.PI) * 100])
    const polygons = customBrushPolygons(arc, { ...bar, mode: 'stretch' }, 10)
    const b = box(polygons)
    // a half circle of radius 100 is about 100 high; a straight bar would be 10
    expect(b.y1 - b.y0).toBeGreaterThan(90)
    // and every point lies within half the size of the line
    for (const [x, y] of polygons.flatMap((polygon) => polygon.flatMap((ring) => ring))) {
      const distance = Math.abs(Math.hypot(x, y) - 100)
      expect(distance).toBeLessThan(5.6)
    }
  })

  it('keeps a hole of the shape', () => {
    const ring = brushFromOutlines([[[[0, 0], [100, 0], [100, 20], [0, 20]], [[40, 5], [60, 5], [60, 15], [40, 15]]]], 'ring', 'custom:ring')!
    const polygons = customBrushPolygons(horizontal, { ...ring, mode: 'stretch' }, 20)
    expect(polygons).toHaveLength(1)
    expect(polygons[0]!.length).toBeGreaterThanOrEqual(2)
  })
})

describe('a stroke', () => {
  it('is a shape of the colour, from a brush of the program or an imported one', () => {
    const imported = dropBrush({ id: 'custom:x' })
    const own = strokeShape(horizontal, 'custom:x', [imported], 10, '#336699', 's1', 4, 'layer-1')!
    expect(own.kind).toBe('path')
    expect(own.fill).toBe('#336699')
    expect(own.layerId).toBe('layer-1')
    const builtIn = strokeShape(horizontal, 'splatter', [imported], 20, '#000000', 's2', 5)!
    expect(builtIn.geom!.length).toBeGreaterThan(3)
  })

  it('is a plain line when the brush it names has been removed', () => {
    const shape = strokeShape(horizontal, 'custom:gone', [], 10, '#000000', 's3', 1)!
    expect(shape.geom!).toHaveLength(1)
  })
})

describe('the brushes that are kept', () => {
  const stored = (brush: CustomBrush) => JSON.parse(JSON.stringify(brush)) as unknown

  it('come back as they were saved', () => {
    const brush = dropBrush({ mode: 'stretch', spacing: 3, rotate: false, variation: 0.5 })
    expect(parseStoredBrushes([stored(brush)])).toEqual([brush])
  })

  it('leave out what is not a brush, and bring back what is wrong to something usable', () => {
    const brush = dropBrush()
    const broken = { ...brush, id: 'other:1' }
    const noShape = { ...brush, id: 'custom:2', polygons: [] }
    const wrongPoint = { ...brush, id: 'custom:3', polygons: [[[[0, 0], [1, 'x'], [1, 1]]]] }
    const odd = { ...(stored(brush) as object), id: 'custom:4', mode: 'wavy', spacing: -3, variation: 9, aspect: 'wide' }
    const result = parseStoredBrushes([broken, noShape, wrongPoint, odd, 'junk', null])
    expect(result).toHaveLength(1)
    expect(result[0]!.mode).toBe('repeat')
    expect(result[0]!.spacing).toBeGreaterThanOrEqual(0.05)
    expect(result[0]!.variation).toBe(1)
    expect(result[0]!.aspect).toBe(1)
  })

  it('are none for anything that is not a list', () => {
    expect(parseStoredBrushes(null)).toEqual([])
    expect(parseStoredBrushes({})).toEqual([])
  })
})

describe('a brush drawn small in a list', () => {
  const rough = (): CustomBrush => {
    const circle: Pt[] = Array.from({ length: 1200 }, (_, i): Pt => [Math.cos((i / 1200) * Math.PI * 2) * 50, Math.sin((i / 1200) * Math.PI * 2) * 50])
    return brushFromOutlines([[circle]], 'round', 'custom:round')!
  }

  it('has few points, and is the same shape', () => {
    const brush = rough()
    const small = previewBrush(brush)
    const points = small.polygons.reduce((sum, polygon) => sum + polygon.reduce((inner, ring) => inner + ring.length, 0), 0)
    expect(points).toBeLessThanOrEqual(160)
    expect(points).toBeGreaterThan(8)
    expect(small.aspect).toBe(brush.aspect)
    expect(small.id).toBe(brush.id)
  })

  it('is the brush itself when it is small already', () => {
    const brush = dropBrush()
    expect(previewBrush(brush)).toBe(brush)
  })
})

describe('a stroke that can be drawn again', () => {
  const stroke = (extra: Parameters<typeof strokeShape>[8] = 'medium') => strokeShape(horizontal, 'round', [], 12, '#336699', 'b1', 7, 'layer-2', extra)!

  it('keeps what it was drawn with: the style, the size and the points in its box', () => {
    const shape = stroke('sharp')
    expect(shape.brush).toMatchObject({ style: 'round', size: 12, sharpness: 'sharp' })
    expect(shape.brush!.points).toHaveLength(horizontal.length)
    for (const [u, v] of shape.brush!.points) {
      expect(u).toBeGreaterThanOrEqual(-0.0001)
      expect(u).toBeLessThanOrEqual(1.0001)
      expect(v).toBeGreaterThanOrEqual(-0.0001)
      expect(v).toBeLessThanOrEqual(1.0001)
    }
  })

  it('takes another style where it is, and keeps its place in the stack, its layer and its opacity', () => {
    const shape = { ...stroke(), opacity: 0.5, groupId: 'g' }
    const next = restyleStroke(shape, { style: 'dots' }, [])!
    expect(next.id).toBe('b1')
    expect(next.z).toBe(7)
    expect(next.layerId).toBe('layer-2')
    expect(next.opacity).toBe(0.5)
    expect(next.groupId).toBe('g')
    expect(next.brush!.style).toBe('dots')
    expect(next.geom!.length).toBeGreaterThan(shape.geom!.length)
    // the line is where it was: the dots lie along the same 200 points
    expect(next.x).toBeLessThan(5)
    expect(next.x + next.w).toBeGreaterThan(195)
  })

  it('follows the shape when it was moved since', () => {
    const shape = { ...stroke(), x: stroke().x + 300, y: stroke().y + 50 }
    const next = restyleStroke(shape, { size: 30 }, [])!
    expect(next.x).toBeGreaterThan(280)
    expect(next.y).toBeGreaterThan(30)
    expect(next.brush!.size).toBe(30)
  })

  it('takes the turn into its points, and has none after', () => {
    const shape = { ...stroke(), rotation: 90 }
    const next = restyleStroke(shape, { style: 'round' }, [])!
    expect(next.rotation).toBeUndefined()
    // a line that ran along was turned to run down
    expect(next.h).toBeGreaterThan(next.w * 5)
  })

  it('has a blur at the soft level and none after', () => {
    const soft = restyleStroke(stroke(), { sharpness: 'soft' }, [])!
    expect(soft.blur).toBeGreaterThan(0)
    expect(soft.brush!.sharpness).toBe('soft')
    const back = restyleStroke(soft, { sharpness: 'sharp' }, [])!
    expect(back.blur).toBeUndefined()
  })

  it('takes a new colour, and keeps the old one when none is given', () => {
    expect(restyleStroke(stroke(), { color: '#ff0000' }, [])!.fill).toBe('#ff0000')
    expect(restyleStroke(stroke(), { style: 'taper' }, [])!.fill).toBe('#336699')
  })

  it('is nothing for a shape that was not drawn with the brush tool', () => {
    const plain = { ...stroke() }
    delete plain.brush
    expect(restyleStroke(plain, { style: 'dots' }, [])).toBeNull()
  })

  it('can be drawn again with an imported brush', () => {
    const imported = dropBrush({ id: 'custom:x' })
    const next = restyleStroke(stroke(), { style: 'custom:x' }, [imported])!
    expect(next.brush!.style).toBe('custom:x')
    expect(next.geom!.length).toBeGreaterThanOrEqual(5)
  })
})
