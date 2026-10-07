import { describe, expect, it } from 'vitest'
import { firstLineLift, type FontExtents, type FontFace } from './firstLine'

// a font whose glyphs reach 0.9 of the size above the baseline and 0.3 below it
const extents = (face: FontFace): FontExtents => ({ ascent: face.fontSize * 0.9, descent: face.fontSize * 0.3 })
const face = (fontSize: number): FontFace => ({ fontFamily: 'X', fontSize, weight: 400, italic: false })

describe('firstLineLift', () => {
  it('is nothing for the leadings text is usually set in', () => {
    // 20px text: the glyph area is 24, a leading of 25 holds it
    expect(firstLineLift(face(20), [face(20)], 25, extents)).toBe(0)
    expect(firstLineLift(face(20), [face(20)], 38, extents)).toBe(0)
  })

  it('moves the line down by what sticks out above it, for a leading tighter than the letters', () => {
    // 20px: the line box reaches (leading + 18 - 6) / 2 above the baseline, the glyphs 18
    expect(firstLineLift(face(20), [face(20)], 24, extents)).toBe(0)
    expect(firstLineLift(face(20), [face(20)], 12, extents)).toBe(6)
    expect(firstLineLift(face(20), [face(20)], 1, extents)).toBe(11.5)
  })

  it('grows as the leading shrinks and never goes negative', () => {
    const lifts = [40, 30, 24, 12, 6, 1].map((leading) => firstLineLift(face(28), [face(28)], leading, extents))
    for (let i = 1; i < lifts.length; i++) expect(lifts[i]).toBeGreaterThanOrEqual(lifts[i - 1])
    expect(lifts[0]).toBe(0)
    expect(lifts[lifts.length - 1]).toBeGreaterThan(0)
  })

  it('counts the frame’s own bigger font: its invisible inline box already makes some room', () => {
    // the glyphs are 18px; the frame's font being 32px lifts the top of every line box, so less is left to move down
    const own = firstLineLift(face(18), [face(18)], 9, extents)
    const inBiggerFrame = firstLineLift(face(32), [face(18)], 9, extents)
    expect(own).toBe(6.3)
    expect(inBiggerFrame).toBe(2.1)
  })

  it('has nothing to do for no leading or no text', () => {
    expect(firstLineLift(face(20), [face(20)], 0, extents)).toBe(0)
    expect(firstLineLift(face(20), [], 5, extents)).toBe(0)
  })
})
