import { describe, expect, it } from 'vitest'
import { letterCenterShift } from './headingMetrics'

describe('where the letters stand in their line', () => {
  it('says nothing is to be moved where there is no canvas to measure with (a test, a server)', () => {
    expect(letterCenterShift({ fontFamily: 'Arial', weight: 400, italic: false, fontSize: 20 }, 24, 'כותרת')).toBe(0)
  })
  it('gives nothing for a size or a line that is not a size', () => {
    expect(letterCenterShift({ fontFamily: 'Arial', weight: 400, italic: false, fontSize: 0 }, 24, 'x')).toBe(0)
    expect(letterCenterShift({ fontFamily: 'Arial', weight: 400, italic: false, fontSize: 20 }, 0, 'x')).toBe(0)
  })
})
