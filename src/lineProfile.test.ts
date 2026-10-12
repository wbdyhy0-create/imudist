import { describe, expect, it } from 'vitest'
import { cleanLineWidths, isProfiledLine, LINE_PROFILES, lineOutline, lineOutlinePath, lineProfileShape, widthAt } from './lineProfile'
import { shapePath } from './shapes'
import type { ShapeFrame } from './document'

const line = (patch: Partial<ShapeFrame> = {}): ShapeFrame =>
  ({ id: 'l', kind: 'line', x: 10, y: 20, w: 100, h: 0, fill: null, stroke: '#cc0000', strokeWidth: 10, ...patch }) as ShapeFrame

describe('the width of a line along its length', () => {
  it('goes through the three widths and is smooth between them', () => {
    expect(widthAt([1, 0.5, 0], 0)).toBeCloseTo(1, 6)
    expect(widthAt([1, 0.5, 0], 0.5)).toBeCloseTo(0.5, 6)
    expect(widthAt([1, 0.5, 0], 1)).toBeCloseTo(0, 6)
    // thick in the middle only: the curve is the highest in the middle
    const middle = [0, 1, 0] as const
    expect(widthAt([...middle], 0.5)).toBeCloseTo(1, 6)
    expect(widthAt([...middle], 0.25)).toBeCloseTo(0.75, 6)
    // never below nothing, whatever the three are
    for (const preset of LINE_PROFILES) for (let i = 0; i <= 20; i += 1) expect(widthAt(preset.widths, i / 20)).toBeGreaterThanOrEqual(0)
  })

  it('tells a profile from a plain line, and cleans what the file gives', () => {
    expect(isProfiledLine(line())).toBe(false)
    expect(isProfiledLine(line({ lineWidths: [1, 1, 1] }))).toBe(false)
    expect(isProfiledLine(line({ lineWidths: [1, 0.5, 0] }))).toBe(true)
    expect(isProfiledLine({ kind: 'rect', lineWidths: [1, 0.5, 0] })).toBe(false)
    expect(cleanLineWidths([9, -1, 0.5])).toEqual([4, 0, 0.5])
    expect(cleanLineWidths([1, 2])).toBeNull()
    expect(cleanLineWidths([1, 'x', 1])).toBeNull()
  })
})

describe('the outline of a profiled line', () => {
  it('is as thick as the line at the thick end and comes to a point at the thin end', () => {
    // a horizontal line 100 long, 10 thick, thick at the start and a point at the end
    const ring = lineOutline(line({ lineWidths: [1, 0.5, 0] }))
    const ys = (xMax: number, xMin: number) => ring.filter(([x]) => x >= xMin && x <= xMax).map(([, y]) => y)
    const start = ys(2, 0)
    expect(Math.max(...start) - Math.min(...start)).toBeGreaterThan(9)
    const end = ys(100, 98)
    expect(Math.max(...end) - Math.min(...end)).toBeLessThan(1)
    // all of it is between the line's two ends
    for (const [x] of ring) expect(x).toBeGreaterThanOrEqual(-0.001)
  })

  it('runs along a line that is not horizontal, and follows the flip', () => {
    const down = lineOutline(line({ w: 60, h: 80, lineWidths: [0, 1, 0] }))
    const up = lineOutline(line({ w: 60, h: 80, flip: true, lineWidths: [0, 1, 0] }))
    // the down line goes from its top left to its bottom right: its outline reaches both of those corners, and the other pair for the flipped one
    expect(down.some(([x, y]) => Math.hypot(x, y) < 0.5)).toBe(true)
    expect(down.some(([x, y]) => Math.hypot(x - 60, y - 80) < 0.5)).toBe(true)
    expect(up.some(([x, y]) => Math.hypot(x, y - 80) < 0.5)).toBe(true)
    expect(up.some(([x, y]) => Math.hypot(x - 60, y) < 0.5)).toBe(true)
  })

  it('has round or square ends when the line has', () => {
    const butt = lineOutline(line({ lineWidths: [1, 1, 0.9] }))
    const round = lineOutline(line({ lineWidths: [1, 1, 0.9], strokeCap: 'round' }))
    const square = lineOutline(line({ lineWidths: [1, 1, 0.9], strokeCap: 'square' }))
    expect(Math.max(...round.map(([x]) => x))).toBeGreaterThan(Math.max(...butt.map(([x]) => x)) + 3)
    expect(Math.min(...square.map(([x]) => x))).toBeCloseTo(-5, 3)
    expect(lineOutlinePath(line({ lineWidths: [1, 0.5, 0] }), 2).startsWith('M')).toBe(true)
    expect(lineOutline(line({ w: 0, h: 0, lineWidths: [1, 0.5, 0] }))).toEqual([])
  })
})

describe('a profiled line as a shape for the exports', () => {
  it('is a filled path in the colour of the line, in a box that holds all of the outline', () => {
    const shape = lineProfileShape(line({ lineWidths: [1, 0.5, 0] }))!
    expect(shape.kind).toBe('path')
    expect(shape).toMatchObject({ fill: '#cc0000', stroke: null, strokeWidth: 0 })
    // the line was 0 high; the outline is 10 high at its thick end, centred on the line (y = 20)
    expect(shape.x).toBeCloseTo(10, 3)
    expect(shape.y).toBeCloseTo(15, 3)
    expect(shape.w).toBeCloseTo(100, 3)
    expect(shape.h).toBeCloseTo(10, 1)
    expect(shapePath(shape).startsWith('M')).toBe(true)
    expect(lineProfileShape(line())).toBeNull()
  })

  it('keeps its place when the line is turned', () => {
    // a line turned a quarter about its centre (60, 20): it goes up and down through there
    const shape = lineProfileShape(line({ lineWidths: [1, 1, 0.5], rotation: 90 }))!
    expect(shape.x + shape.w / 2).toBeCloseTo(60, 0)
    // the shape carries the turn itself: its own box is still the unturned one
    expect(shape.rotation).toBe(90)
    expect(shape.w).toBeGreaterThan(shape.h)
  })
})

import { widthAt as widthAtPos } from './lineProfile'
describe('widthAt with a moved middle', () => {
  it('passes through the ends and the middle', () => {
    const w: [number, number, number] = [1, 3, 0.5]
    expect(widthAtPos(w, 0, 0.3)).toBeCloseTo(1)
    expect(widthAtPos(w, 0.3, 0.3)).toBeCloseTo(3)
    expect(widthAtPos(w, 1, 0.3)).toBeCloseTo(0.5)
    expect(widthAtPos(w, 0.5, 0.5)).toBeCloseTo(widthAtPos(w, 0.5))
  })
})

import { lineOutline as outlineOf } from './lineProfile'
describe('line arrows', () => {
  const base = { w: 100, h: 0, strokeWidth: 2 } as Parameters<typeof outlineOf>[0]
  it('makes a line with a head a profiled one', () => {
    expect(isProfiledLine({ kind: 'line', arrowEnd: 'triangle' })).toBe(true)
    expect(isProfiledLine({ kind: 'line', arrowEnd: 'nope' as never })).toBe(false)
  })
  it('puts the tip of a head on the end of the line, for every kind', () => {
    for (const kind of ['triangle', 'stealth', 'diamond', 'circle', 'square'] as const) {
      const ring = outlineOf({ ...base, arrowEnd: kind })
      expect(ring.length).toBeGreaterThan(4)
      expect(Math.max(...ring.map(([x]) => x))).toBeCloseTo(100, 3)
      expect(Math.max(...ring.map(([, y]) => Math.abs(y)))).toBeGreaterThan(2.5)
    }
  })
  it('puts a head on the start too', () => {
    const ring = outlineOf({ ...base, arrowStart: 'triangle', arrowEnd: 'triangle' })
    expect(Math.min(...ring.map(([x]) => x))).toBeCloseTo(0, 3)
    expect(Math.max(...ring.map(([x]) => x))).toBeCloseTo(100, 3)
  })
})
