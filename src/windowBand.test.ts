import { describe, expect, it } from 'vitest'
import type { Run } from './document'
import { windowBlockMinHeight, windowFloatStyle, windowFontsOf } from './richtext'

const run = (len: number, fontSize: number): Run => ({ len, style: { fontFamily: 'Arial', fontSize, weight: 400, italic: false, tracking: 0, color: '#000000' } })

describe('windowFontsOf', () => {
  it('takes the opening words from the first run and the main size from the biggest share of the paragraph', () => {
    // a 22px opening word, then 300 characters at 18px and a short stretch at 12px
    const runs = [run(5, 22), run(300, 18), run(20, 12)]
    expect(windowFontsOf(runs, 0, 325)).toEqual({ opening: 22, main: 18 })
    expect(windowFontsOf(runs, 0, 325, 0.5)).toEqual({ opening: 11, main: 9 })
  })

  it('looks only at the paragraph asked for', () => {
    const runs = [run(10, 30), run(10, 12)]
    expect(windowFontsOf(runs, 10, 20)).toEqual({ opening: 12, main: 12 })
    expect(windowFontsOf([], 0, 5)).toBeUndefined()
  })
})

describe('the window band', () => {
  it('is worked out from the frame font (em) and the sizes of the paragraph, not from the line height alone', () => {
    const style = windowFloatStyle(23, 0, { opening: 18, main: 18 })
    // the strut of the lines (1em) against the paragraph's own size: the band has to move down with the taller lines
    expect(style.shapeOutside).toContain('max(1em, 18px)')
    expect(style.shapeOutside).toContain('min(1em, 18px)')
    expect(style.width).toBe('23px')
    expect(windowBlockMinHeight(0, { opening: 18, main: 18 })).toBe(style.height)
  })

  it('keeps the gap of the previous paragraph in the height of the first line', () => {
    expect(windowFloatStyle(23, 47).shapeOutside).toContain('+ 47px')
  })

  it('falls back to the line height when the sizes are not known', () => {
    expect(windowFloatStyle(23, 0).shapeOutside).toContain('max(1em, 1em)')
  })
})
