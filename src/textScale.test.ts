import { describe, expect, it } from 'vitest'
import { textFlowBoxOf } from './document'

describe('textFlowBoxOf', () => {
  it('is the frame itself for text that is not scaled', () => {
    expect(textFlowBoxOf({ w: 260, h: 108 })).toEqual({ w: 260, h: 108 })
  })

  it('is the frame divided by the scale, so that the scaled text fills exactly the frame', () => {
    const box = textFlowBoxOf({ w: 300, h: 120, textScale: { x: 1.5, y: 0.8 } })
    expect(box).toEqual({ w: 200, h: 150 })
    expect(box.w * 1.5).toBe(300)
    expect(box.h * 0.8).toBeCloseTo(120, 9)
  })

  it('follows the frame when it is resized: nothing is stored that can go stale', () => {
    const scaled = { textScale: { x: 2, y: 2 } }
    expect(textFlowBoxOf({ w: 400, h: 100, ...scaled })).toEqual({ w: 200, h: 50 })
    expect(textFlowBoxOf({ w: 400.5, h: 90, ...scaled })).toEqual({ w: 200.25, h: 45 })
  })

  it('ignores a scale that cannot be used', () => {
    expect(textFlowBoxOf({ w: 100, h: 50, textScale: { x: 0, y: -1 } })).toEqual({ w: 100, h: 50 })
  })
})
