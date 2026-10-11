import { describe, expect, it } from 'vitest'
import { DIGITAL_PRESETS, fromPt, PAGE_PRESETS } from './units'

describe('page size presets', () => {
  it('includes B5 for print', () => {
    const b5 = PAGE_PRESETS.find((preset) => preset.id === 'B5')
    expect(b5).toBeDefined()
    expect(b5 && [fromPt(b5.width, 'mm'), fromPt(b5.height, 'mm')]).toEqual([176, 250])
  })

  it('keeps social and screen sizes in pixels and at their specified orientation', () => {
    expect(DIGITAL_PRESETS).toMatchObject([
      { id: 'story', width: 1080, height: 1920, unit: 'px', rotateWithDocument: false },
      { id: 'square-post', width: 1080, height: 1080, unit: 'px', rotateWithDocument: false },
      { id: 'wide-post', width: 1200, height: 630, unit: 'px', rotateWithDocument: false },
      { id: 'facebook-cover', width: 851, height: 315, unit: 'px', rotateWithDocument: false },
      { id: 'full-hd', width: 1920, height: 1080, unit: 'px', rotateWithDocument: false },
    ])
  })
})

describe('the number typed in a numeric field', () => {
  // imported lazily so that the existing imports of this file stay as they are
  it('reads a plain number, with or without the percent sign the field shows', async () => {
    const { parseFieldValue } = await import('./units')
    expect(parseFieldValue('40', undefined)).toBe(40)
    expect(parseFieldValue('40%', undefined)).toBe(40)
    expect(parseFieldValue(' 40 % ', undefined)).toBe(40)
    expect(parseFieldValue('0,5', undefined)).toBe(1)
    expect(parseFieldValue('-3', undefined)).toBe(-3)
    expect(parseFieldValue('', undefined)).toBeNull()
    expect(parseFieldValue('abc', undefined)).toBeNull()
  })

  it('reads a field of percentages that has its sign in the text it shows', async () => {
    const { parseFieldValue } = await import('./units')
    expect(parseFieldValue('55 %', 'px', '%')).toBe(55)
    expect(parseFieldValue('55', 'px', '%')).toBe(55)
    // points and millimetres are still read by their unit
    expect(parseFieldValue('10 mm', 'mm')).toBeCloseTo(28.346, 2)
    expect(parseFieldValue('12 pt', 'px', 'pt')).toBe(12)
  })
})
