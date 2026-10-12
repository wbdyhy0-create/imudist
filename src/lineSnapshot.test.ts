import { describe, expect, it } from 'vitest'
import type { ShapeFrame } from './document'
import { lineVisualBox } from './lineSnapshot'

const line = (extra: Partial<ShapeFrame>): ShapeFrame => ({ id: 'l', kind: 'line', x: 10, y: 20, w: 100, h: 0, fill: null, stroke: '#112244', strokeWidth: 3, ...extra }) as ShapeFrame

describe('the box a line paints', () => {
  it('has the thickness of the stroke although the line itself has no height', () => {
    const box = lineVisualBox(line({}))
    expect(box.h).toBeCloseTo(3)
    expect(box.w).toBeCloseTo(103)
    expect(box.y).toBeCloseTo(18.5)
  })

  it('is as wide as the arrow heads when it has them', () => {
    const box = lineVisualBox(line({ arrowStart: 'triangle', arrowEnd: 'triangle' }))
    // an arrow head is 3.2 times the thickness wide (6 points at least)
    expect(box.h).toBeCloseTo(9.6)
    expect(box.w).toBeCloseTo(100)
  })

  it('covers a vertical line, which has no width', () => {
    const box = lineVisualBox(line({ w: 0, h: 80 }))
    expect(box.w).toBeCloseTo(3)
    expect(box.h).toBeCloseTo(83)
  })

  it('turns with the line', () => {
    const upright = lineVisualBox(line({}))
    const turned = lineVisualBox(line({ rotation: 90 }))
    expect(turned.w).toBeCloseTo(upright.h)
    expect(turned.h).toBeCloseTo(upright.w)
  })
})
