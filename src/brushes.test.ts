import { describe, expect, it } from 'vitest'
import { defaultDocSettings, type ShapeFrame } from './document'
import { parseDocument, serializeDocument } from './fileFormat'
import type { DocContent } from './pages'
import { BRUSH_STYLES, brushPolygons, brushShape, centerlinesOf, resample, seedOf, shapeFromPolygons, smoothPoints, type BrushStyleId } from './brushes'

type Pt = [number, number]
const line: Pt[] = Array.from({ length: 21 }, (_, i): Pt => [i * 10, 0])
const box = (polygons: Pt[][][]) => {
  const xs = polygons.flatMap((polygon) => polygon.flatMap((ring) => ring.map((p) => p[0])))
  const ys = polygons.flatMap((polygon) => polygon.flatMap((ring) => ring.map((p) => p[1])))
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
}

describe('the points of a stroke', () => {
  it('are smoothed with the ends where they were', () => {
    const zigzag: Pt[] = [[0, 0], [10, 10], [20, 0], [30, 10]]
    const smooth = smoothPoints(zigzag, 2)
    expect(smooth[0]).toEqual([0, 0])
    expect(smooth[smooth.length - 1]).toEqual([30, 10])
    expect(smooth.length).toBeGreaterThan(zigzag.length)
  })

  it('are resampled at a distance along the line, ends kept', () => {
    const points = resample([[0, 0], [100, 0]], 10)
    expect(points).toHaveLength(11)
    expect(points[0]).toEqual([0, 0])
    expect(points[10]![0]).toBeCloseTo(100, 6)
    expect(points[5]![0]).toBeCloseTo(50, 6)
  })

  it('give the same seed for the same stroke and another for another', () => {
    expect(seedOf(line)).toBe(seedOf(line.map((p) => [...p] as Pt)))
    expect(seedOf(line)).not.toBe(seedOf(line.map(([x, y]) => [x, y + 1] as Pt)))
  })
})

describe('what a brush covers', () => {
  it('is the same for the same stroke', () => {
    for (const style of BRUSH_STYLES.map((s) => s.id)) {
      expect(JSON.stringify(brushPolygons(line, style, 20))).toBe(JSON.stringify(brushPolygons(line, style, 20)))
    }
  })

  it('is a stroke as wide as the brush, with round ends, for the round brush', () => {
    const polygons = brushPolygons(line, 'round', 12)
    expect(polygons).toHaveLength(1)
    const b = box(polygons)
    expect(b.x0).toBeCloseTo(-6, 0)
    expect(b.x1).toBeCloseTo(206, 0)
    expect(b.y1 - b.y0).toBeCloseTo(12, 0)
  })

  it('is thin at the ends and thick in the middle for the graduated brush', () => {
    const polygons = brushPolygons(line, 'taper', 20)
    const b = box(polygons)
    expect(b.y1 - b.y0).toBeGreaterThan(14)
    const ring = polygons[0]![0]!
    const nearEnd = ring.filter((p) => p[0] < 4)
    expect(nearEnd.length).toBeGreaterThan(0)
    expect(Math.max(...nearEnd.map((p) => Math.abs(p[1])))).toBeLessThan(4)
  })

  it('is flat for a nib held at an angle: not as wide across one way as the other', () => {
    const across = box(brushPolygons([[0, 0], [0, 100]], 'calligraphic', 24))
    const along = box(brushPolygons([[0, 0], [100, 0]], 'calligraphic', 24))
    // a vertical stroke and a horizontal one of the same nib are of different widths
    expect(Math.abs(across.x1 - across.x0 - (along.y1 - along.y0))).toBeGreaterThan(2)
  })

  it('is many pieces round the body for the splatter, reaching outside the stroke', () => {
    const polygons = brushPolygons(line, 'splatter', 24)
    expect(polygons.length).toBeGreaterThan(5)
    const b = box(polygons)
    expect(b.y1 - b.y0).toBeGreaterThan(24)
  })

  it('is separate dots for the dots, and broken hairs for the dry brush', () => {
    expect(brushPolygons(line, 'dots', 14).length).toBeGreaterThan(5)
    expect(brushPolygons(line, 'dry', 26).length).toBeGreaterThan(3)
  })

  it('is a dot for a click', () => {
    const polygons = brushPolygons([[50, 50]], 'round', 10)
    expect(polygons).toHaveLength(1)
    const b = box(polygons)
    expect(b.x1 - b.x0).toBeCloseTo(10, 0)
  })

  it('stays within a number of pieces however long the stroke is', () => {
    const long = Array.from({ length: 400 }, (_, i): Pt => [i * 10, Math.sin(i / 10) * 30])
    for (const style of ['splatter', 'dry', 'dots'] as BrushStyleId[]) {
      const polygons = brushPolygons(long, style, 30)
      expect(polygons.length).toBeLessThan(1500)
    }
  })
})

describe('a stroke as a shape', () => {
  it('is a path in the box that holds it, with its outline relative to the box', () => {
    const shape = brushShape(line, 'round', 10, '#336699', 'brush-1', 5, 'layer-2')!
    expect(shape.kind).toBe('path')
    expect(shape.fill).toBe('#336699')
    expect(shape.stroke).toBeNull()
    expect(shape.z).toBe(5)
    expect(shape.layerId).toBe('layer-2')
    expect(shape.x).toBeCloseTo(-5, 0)
    expect(shape.w).toBeCloseTo(210, 0)
    for (const polygon of shape.geom!) {
      for (const ring of polygon) {
        for (const v of ring) {
          const p = Array.isArray(v) ? v : v.p
          expect(p[0]).toBeGreaterThanOrEqual(-0.0001)
          expect(p[0]).toBeLessThanOrEqual(1.0001)
        }
      }
    }
  })

  it('is nothing when nothing is covered', () => {
    expect(shapeFromPolygons([], '#000000', 'x', 0)).toBeNull()
    expect(brushShape([], 'round', 10, '#000000', 'x', 0)).toBeNull()
  })
})

describe('the lines of an outline', () => {
  const shape = (extra: Partial<ShapeFrame>): ShapeFrame => ({ id: 's', kind: 'rect', x: 10, y: 20, w: 100, h: 50, fill: null, stroke: '#000000', strokeWidth: 1, ...extra })

  it('is the closed ring of a rectangle, its first point repeated at the end', () => {
    const lines = centerlinesOf(shape({}))!
    expect(lines).toHaveLength(1)
    const ring = lines[0]!
    expect(ring[0]).toEqual(ring[ring.length - 1])
    expect(Math.min(...ring.map((p) => p[0]))).toBeCloseTo(10, 6)
    expect(Math.max(...ring.map((p) => p[0]))).toBeCloseTo(110, 6)
  })

  it('is the two ends of a line', () => {
    const lines = centerlinesOf(shape({ kind: 'line' }))!
    expect(lines[0]).toEqual([[10, 20], [110, 70]])
  })

  it('is an open line for an open path, curves sampled', () => {
    const lines = centerlinesOf(shape({ kind: 'path', closed: false, geom: [[[{ p: [0, 0], ho: [0.3, 0] }, { p: [1, 1], hi: [-0.3, 0] }]]] }))!
    expect(lines).toHaveLength(1)
    expect(lines[0]!.length).toBeGreaterThan(4)
    expect(lines[0]![0]).not.toEqual(lines[0]![lines[0]!.length - 1])
  })

  it('is nothing for a table', () => {
    expect(centerlinesOf(shape({ kind: 'table' }))).toBeNull()
  })
})

describe('a ring', () => {
  const ring: Pt[] = Array.from({ length: 33 }, (_, i): Pt => [100 + Math.cos((i / 32) * Math.PI * 2) * 60, 100 + Math.sin((i / 32) * Math.PI * 2) * 60])

  it('keeps the width of the graduated brush all the way round', () => {
    const polygons = brushPolygons(ring, 'taper', 20)
    const b = box(polygons)
    // the outer edge reaches the radius and half a width beyond it, on the side where a stroke would have started
    expect(b.x1 - b.x0).toBeGreaterThan(120 + 14)
    const start = polygons.flatMap((polygon) => polygon.flatMap((points) => points)).filter((p) => p[0] > 150)
    expect(Math.max(...start.map((p) => p[0]))).toBeGreaterThan(165)
  })
})

describe('a brush stroke in a file', () => {
  it('comes back as it was drawn: the same pieces, the same colour', () => {
    const shape = brushShape(line, 'splatter', 24, '#cc3300', 'stroke', 3)!
    const content: DocContent = { doc: defaultDocSettings('brush'), frames: [], images: [], assets: {}, guides: [], shapes: [shape], paragraphStyles: [], parents: [], pageParents: [], sections: [] }
    const restored = parseDocument(serializeDocument(content), 'brush.imudist')
    const again = restored.shapes[0]!
    expect(again.kind).toBe('path')
    expect(again.fill).toBe('#cc3300')
    expect(again.geom!.length).toBe(shape.geom!.length)
    expect(again.w).toBeCloseTo(shape.w, 3)
  })
})

describe('the sharpness of a brush', () => {
  it('gives the round brush flat ends at the sharp level, and round ones otherwise', () => {
    const sharp = box(brushPolygons(line, 'round', 12, 1, 'sharp'))
    expect(sharp.x0).toBeCloseTo(0, 0)
    expect(sharp.x1).toBeCloseTo(200, 0)
    expect(sharp.y1 - sharp.y0).toBeCloseTo(12, 0)
    const medium = box(brushPolygons(line, 'round', 12, 1, 'medium'))
    expect(medium.x0).toBeCloseTo(-6, 0)
    const soft = box(brushPolygons(line, 'round', 12, 1, 'soft'))
    expect(soft.x0).toBeCloseTo(-6, 0)
  })

  it('keeps a flat stroke whole round a corner', () => {
    const corner: Pt[] = [[0, 0], [100, 0], [100, 100]]
    const polygons = brushPolygons(corner, 'round', 20, 1, 'sharp')
    expect(polygons).toHaveLength(1)
    const b = box(polygons)
    expect(b.x1).toBeGreaterThan(105)
    expect(b.y1).toBeCloseTo(100, 0)
  })

  it('falls away in a straight line to a point at the ends for the graduated brush', () => {
    const ring = brushPolygons(line, 'taper', 20, 1, 'sharp')[0]![0]!
    // how tall the stroke is where a vertical line at x cuts its outline
    const heightAt = (x: number) => {
      const ys: number[] = []
      for (let i = 0; i < ring.length; i += 1) {
        const [x0, y0] = ring[i]!
        const [x1, y1] = ring[(i + 1) % ring.length]!
        if ((x0 <= x && x1 >= x) || (x1 <= x && x0 >= x)) ys.push(x1 === x0 ? y0 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0))
      }
      return Math.max(...ys) - Math.min(...ys)
    }
    const middle = heightAt(100)
    const quarter = heightAt(50)
    expect(middle).toBeGreaterThan(17)
    // a quarter of the way along it is about half as wide as in the middle
    expect(quarter / middle).toBeGreaterThan(0.4)
    expect(quarter / middle).toBeLessThan(0.62)
  })

  it('is a different shape from the medium one for every style, and the same for the same level', () => {
    for (const style of ['round', 'calligraphic', 'taper', 'splatter', 'dry', 'dots'] as BrushStyleId[]) {
      const sharp = JSON.stringify(brushPolygons(line, style, 20, 5, 'sharp'))
      expect(sharp).not.toBe(JSON.stringify(brushPolygons(line, style, 20, 5, 'medium')))
      expect(JSON.stringify(brushPolygons(line, style, 20, 5, 'sharp'))).toBe(sharp)
    }
  })

  it('has the same outline at the soft level as at the medium one, and a blur on the shape', () => {
    expect(JSON.stringify(brushPolygons(line, 'splatter', 20, 5, 'soft'))).toBe(JSON.stringify(brushPolygons(line, 'splatter', 20, 5, 'medium')))
    const soft = brushShape(line, 'round', 20, '#000000', 's', 1, undefined, 'soft')!
    expect(soft.blur).toBeGreaterThan(0)
    expect(brushShape(line, 'round', 20, '#000000', 's', 1, undefined, 'medium')!.blur).toBeUndefined()
    expect(brushShape(line, 'round', 20, '#000000', 's', 1, undefined, 'sharp')!.blur).toBeUndefined()
  })
})
