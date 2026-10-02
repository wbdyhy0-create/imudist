import { describe, expect, it } from 'vitest'
import { expandGapObject, findGaps, moveGap, type GapObject, type GapRegion } from './gapTool'
import { spacing } from './spacing'

const row: GapObject[] = [
  { id: 'left', x: 0, y: 0, w: 20, h: 20 },
  { id: 'right', x: 30, y: 0, w: 20, h: 20 },
]
const rowGap: GapRegion = { axis: 'x', x: 20, y: 0, w: 10, h: 20, beforeIds: ['left'], afterIds: ['right'] }

describe('findGaps', () => {
  it('finds the nearest neighbors along both movement axes', () => {
    const gaps = findGaps({ x: 25, y: 10 }, row)
    expect(gaps).toHaveLength(1)
    expect(gaps[0]).toMatchObject({ axis: 'x', x: 20, y: 0, w: 10, h: 20, beforeIds: ['left'], afterIds: ['right'] })
    expect(findGaps({ x: 25, y: 25 }, row)).toEqual([])
  })

  it('requires a gap wider than 1pt', () => {
    const touching = [{ id: 'a', x: 0, y: 0, w: 20, h: 20 }, { id: 'b', x: 21, y: 0, w: 20, h: 20 }]
    expect(findGaps({ x: 20.5, y: 10 }, touching)).toEqual([])
  })

  it('expands aligned neighbors within the 0.5pt touch tolerance', () => {
    const objects: GapObject[] = [
      { id: 'a1', x: 0, y: 0, w: 20, h: 20 },
      { id: 'a2', x: 0, y: 20.4, w: 20, h: 20 },
      { id: 'b1', x: 30, y: 0, w: 20, h: 20 },
      { id: 'b2', x: 30, y: 20.4, w: 20, h: 20 },
    ]
    const expanded = findGaps({ x: 25, y: 10 }, objects)
    const nearest = findGaps({ x: 25, y: 10 }, objects, true)
    expect(expanded[0].beforeIds).toEqual(['a1', 'a2'])
    expect(expanded[0].afterIds).toEqual(['b1', 'b2'])
    expect(nearest[0].beforeIds).toEqual(['a1'])
    expect(nearest[0].afterIds).toEqual(['b1'])
  })

  it('returns both axes at a 2x2 junction, while Shift limits each axis to its nearest pair', () => {
    const grid: GapObject[] = [
      { id: 'tl', x: 0, y: 0, w: 50, h: 40 },
      { id: 'tr', x: 110, y: 0, w: 50, h: 40 },
      { id: 'bl', x: 0, y: 90, w: 50, h: 40 },
      { id: 'br', x: 110, y: 90, w: 50, h: 40 },
    ]
    const junction = findGaps({ x: 80, y: 65 }, grid)
    const nearest = findGaps({ x: 80, y: 65 }, grid, true)
    expect(junction.map((gap) => gap.axis)).toEqual(['x', 'y'])
    expect(junction[0].beforeIds).toEqual(['tl', 'bl'])
    expect(junction[0].afterIds).toEqual(['tr', 'br'])
    expect(nearest[0].beforeIds).toEqual(['tl'])
    expect(nearest[1].beforeIds).toEqual(['tl'])
  })
})

describe('moveGap', () => {
  it('keeps the gap width fixed in the default mode and clamps objects to the minimum', () => {
    const moved = moveGap([rowGap], row, { x: 100, y: 0 }, 6)
    expect(moved.delta.x).toBe(14)
    expect(moved.objects).toMatchObject([
      { id: 'left', x: 0, w: 34 },
      { id: 'right', x: 44, w: 6 },
    ])
    expect(moved.gaps[0]).toMatchObject({ x: 34, w: 10 })
  })

  it('Ctrl mirrors the opposite edge around the center, according to the edge grabbed at pointerdown', () => {
    const leftGrab = moveGap([rowGap], row, { x: 2, y: 0 }, 6, { ctrl: true, grabbedEdges: { x: 'before' } })
    expect(leftGrab.objects).toMatchObject([{ id: 'left', w: 22 }, { id: 'right', x: 28, w: 22 }])
    expect(leftGrab.gaps[0]).toMatchObject({ x: 22, w: 6 })

    const rightGrab = moveGap([rowGap], row, { x: 2, y: 0 }, 6, { ctrl: true, grabbedEdges: { x: 'after' } })
    expect(rightGrab.objects).toMatchObject([{ id: 'left', w: 18 }, { id: 'right', x: 32, w: 18 }])
    expect(rightGrab.gaps[0]).toMatchObject({ x: 18, w: 14 })
  })

  it('Alt moves both sides without resizing; Ctrl+Alt keeps the before side and moves the after side', () => {
    const alt = moveGap([rowGap], row, { x: 2, y: 0 }, 6, { alt: true })
    expect(alt.objects).toMatchObject([{ id: 'left', x: 2, w: 20 }, { id: 'right', x: 32, w: 20 }])
    expect(alt.gaps[0]).toMatchObject({ x: 22, w: 10 })

    const combined = moveGap([rowGap], row, { x: 2, y: 0 }, 6, { ctrl: true, alt: true })
    expect(combined.objects).toMatchObject([{ id: 'left', x: 0, w: 20 }, { id: 'right', x: 32, w: 20 }])
    expect(combined.gaps[0]).toMatchObject({ x: 20, w: 12 })
  })

  it('does not mutate input snapshots', () => {
    const original = row.map((object) => ({ ...object }))
    moveGap([rowGap], row, { x: 3, y: 0 }, 6)
    expect(row).toEqual(original)
  })

  it('resizes group members proportionally from a shared bounding rectangle', () => {
    const group: GapObject = {
      id: 'group:g',
      x: 0,
      y: 0,
      w: 20,
      h: 10,
      memberIds: ['g1', 'g2'],
      members: [
        { id: 'g1', x: 0, y: 0, w: 10, h: 10 },
        { id: 'g2', x: 10, y: 0, w: 10, h: 10 },
      ],
    }
    const right: GapObject = { id: 'right', x: 30, y: 0, w: 20, h: 10 }
    const gap: GapRegion = { axis: 'x', x: 20, y: 0, w: 10, h: 10, beforeIds: ['group:g'], afterIds: ['right'] }
    const resized = moveGap([gap], [group, right], { x: 5, y: 0 }, 6)
    expect(resized.objects[0]).toMatchObject({ x: 0, w: 25 })
    expect(expandGapObject(resized.objects[0], 6)).toEqual([
      { id: 'g1', x: 0, y: 0, w: 12.5, h: 10 },
      { id: 'g2', x: 12.5, y: 0, w: 12.5, h: 10 },
    ])
  })
})

describe('spacing axis convention', () => {
  it('uses h for the horizontal measurement line between side-by-side objects', () => {
    const result = spacing({ x: 0, y: 0, w: 20, h: 20 }, [{ x: 30, y: 0, w: 20, h: 20 }], 0, { x: false, y: false })
    expect(result.marks.some((mark) => mark.axis === 'h' && mark.value === 10)).toBe(true)
  })
})
