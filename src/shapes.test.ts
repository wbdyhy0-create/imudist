import { describe, expect, it } from 'vitest'
import type { PathGeom, ShapeFrame } from './document'
import { deleteVertices, editablePoints, imageGeometry, locateVertex, replaceVertex, splitPathVerticesAt, vertexAt } from './shapes'

describe('picture geometry inside a shape frame', () => {
  const shape: ShapeFrame = {
    id: 'frame',
    kind: 'rect',
    x: 0,
    y: 0,
    w: 400,
    h: 100,
    fill: null,
    stroke: null,
    strokeWidth: 0,
    image: { assetId: 'photo', fit: 'fill' },
  }

  it('stretches fill images to the complete frame without cropping', () => {
    expect(imageGeometry(shape, { width: 200, height: 200 })).toEqual({ x: 0, y: 0, w: 400, h: 100 })
  })

  it('keeps fit images proportional and shows the entire image', () => {
    expect(imageGeometry({ ...shape, image: { assetId: 'photo', fit: 'fit' } }, { width: 200, height: 200 }))
      .toEqual({ x: 150, y: 0, w: 100, h: 100 })
  })
})

describe('scissors path splitting', () => {
  it('opens a closed ring at an anchor and keeps the closing edge in the open path', () => {
    const ring = ['top-left', 'top-right', 'bottom-right', 'bottom-left']

    expect(splitPathVerticesAt(ring, 3, true)).toEqual([['bottom-left', 'top-left', 'top-right', 'bottom-right', 'bottom-left']])
  })

  it('splits an open path at an interior anchor without smoothing or dropping either segment', () => {
    const path = ['bottom-left', 'top-left', 'top-right', 'bottom-right', 'bottom-left']

    expect(splitPathVerticesAt(path, 3, false)).toEqual([
      ['bottom-left', 'top-left', 'top-right', 'bottom-right'],
      ['bottom-right', 'bottom-left'],
    ])
    expect(splitPathVerticesAt(path, 0, false)).toBeNull()
    expect(splitPathVerticesAt(path, path.length - 1, false)).toBeNull()
  })
})

describe('point editing across the rings of a compound outline', () => {
  // two letters: the first with a hole (4 + 3 points), the second plain (4 points)
  const geom: PathGeom = [
    [
      [[0, 0], [0.4, 0], [0.4, 1], [0, 1]],
      [[0.1, 0.2], [0.3, 0.2], [0.2, 0.8]],
    ],
    [[[0.6, 0], [1, 0], [1, 1], [0.6, 1]]],
  ]
  const shape = { id: 's', kind: 'path', x: 0, y: 0, w: 100, h: 50, geom, fill: '#000', stroke: null, strokeWidth: 0 } as ShapeFrame

  it('numbers the points one after the other across every ring, each with the point after it in its own ring', () => {
    const points = editablePoints(shape)!
    expect(points).toHaveLength(11)
    expect(points.map((point) => point.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    // the last point of a ring is followed by the first of the same ring
    expect(points[3]!.next).toEqual([0, 0])
    expect(points[6]!.next).toEqual([0.1, 0.2])
    expect(points[10]!.next).toEqual([0.6, 0])
  })

  it('finds a numbered point, and replaces just that one', () => {
    expect(locateVertex(geom, 5)).toEqual({ poly: 0, ring: 1, index: 1, start: 4, length: 3 })
    expect(locateVertex(geom, 9)).toEqual({ poly: 1, ring: 0, index: 2, start: 7, length: 4 })
    expect(locateVertex(geom, 11)).toBeNull()
    expect(vertexAt(geom, 8)).toEqual([1, 0])
    const moved = replaceVertex(geom, 9, [0.9, 0.9])
    expect(moved[1]![0]![2]).toEqual([0.9, 0.9])
    expect(moved[0]).toBe(geom[0])
  })

  it('deletes points in any ring, keeps a ring that would be left with too few, and drops a ring that is chosen whole', () => {
    // one point of the second letter goes
    const one = deleteVertices(geom, [8])!
    expect(one[1]![0]).toHaveLength(3)
    expect(one[0]).toEqual(geom[0])
    // a point of the three-point hole: the ring would have two points, so it stays as it was
    expect(deleteVertices(geom, [4])).toBeNull()
    // the whole hole
    const noHole = deleteVertices(geom, [4, 5, 6])!
    expect(noHole[0]).toHaveLength(1)
    expect(noHole).toHaveLength(2)
    // the whole outer ring of the first letter takes its hole with it
    const noFirst = deleteVertices(geom, [0, 1, 2, 3])!
    expect(noFirst).toHaveLength(1)
    expect(noFirst[0]![0]).toEqual(geom[1]![0])
    // nothing is chosen, or everything: nothing happens
    expect(deleteVertices(geom, [])).toBeNull()
    expect(deleteVertices(geom, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBeNull()
  })
})
