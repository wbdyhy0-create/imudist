import { describe, expect, it } from 'vitest'
import { releaseCompoundPath, pieceCount } from './compoundPath'
import type { PathGeom, ShapeFrame } from './document'

const ids = () => {
  let next = 0
  return () => `piece-${next++}`
}

describe('releasing a compound path into its pieces', () => {
  // two pieces side by side in a 200 by 100 box: a square with a hole on the left, a triangle on the right
  const geom: PathGeom = [
    [
      [[0, 0], [0.4, 0], [0.4, 1], [0, 1]],
      [[0.1, 0.25], [0.3, 0.25], [0.3, 0.75], [0.1, 0.75]],
    ],
    [[[0.6, 0], [1, 1], [0.6, 1]]],
  ]
  const shape = { id: 's', kind: 'path', x: 100, y: 50, w: 200, h: 100, geom, fill: '#0066ff', stroke: null, strokeWidth: 0, z: 3, layerId: 'layer-2', label: 'letters' } as ShapeFrame

  it('makes a shape for each piece, where the piece was, with its own holes and the look of the shape', () => {
    const pieces = releaseCompoundPath(shape, ids(), 'group-1')!
    expect(pieces).toHaveLength(2)
    expect(pieces[0]).toMatchObject({ kind: 'path', x: 100, y: 50, w: 80, h: 100, fill: '#0066ff', z: 3, layerId: 'layer-2', groupId: 'group-1', id: 'piece-0' })
    expect(pieces[0]!.geom).toHaveLength(1)
    expect(pieces[0]!.geom![0]).toHaveLength(2)
    expect(pieces[1]).toMatchObject({ x: 220, y: 50, w: 80, h: 100 })
    // the hole of the first piece is 0.25 to 0.75 of the piece's own width
    expect(pieces[0]!.geom![0]![1]![0]).toEqual([0.25, 0.25])
    expect(pieceCount(shape)).toBe(2)
  })

  it('keeps the places of the pieces when the shape is turned', () => {
    const turned = { ...shape, rotation: 90 } as ShapeFrame
    const [left, right] = releaseCompoundPath(turned, ids(), undefined)!
    // the shape turned a quarter about its centre (200, 100): the left piece, 60 left of the centre line, is now 60 above it
    expect(left!.x + left!.w / 2).toBeCloseTo(200 + (-60) * 0 - 0 * 0 + 0, 5)
    expect(left!.y + left!.h / 2).toBeCloseTo(100 - 60, 5)
    expect(right!.y + right!.h / 2).toBeCloseTo(100 + 60, 5)
    expect(left!.rotation).toBe(90)
    expect(left!.groupId).toBeUndefined()
  })

  it('scales the curve handles to the piece', () => {
    const curved: PathGeom = [
      [[[0, 0], { p: [0.2, 0], ho: [0.05, 0.1] }, [0.2, 0.5]]],
      [[[0.6, 0], [1, 0], [1, 1]]],
    ]
    const [first] = releaseCompoundPath({ ...shape, geom: curved }, ids(), undefined)!
    const vertex = first!.geom![0]![0]![1] as { p: [number, number]; ho: [number, number] }
    // the handle is 0.05 of the old box (10 points): it is the same 10 points in the piece's own, narrower box
    expect(vertex.ho[0] * first!.w).toBeCloseTo(0.05 * 200, 5)
  })

  it('does nothing for a shape that is one piece, or is not a path', () => {
    expect(releaseCompoundPath({ ...shape, geom: [geom[0]!] }, ids(), undefined)).toBeNull()
    expect(releaseCompoundPath({ ...shape, kind: 'rect' } as ShapeFrame, ids(), undefined)).toBeNull()
    expect(pieceCount({ kind: 'rect', geom: undefined })).toBe(0)
  })
})
