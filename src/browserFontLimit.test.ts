import { describe, expect, it } from 'vitest'
import { effectiveFontSize } from './browserFontLimit'

describe('the size a text is really drawn at', () => {
  it('is the size asked for when nothing holds a minimum', () => {
    // a text that is 20 em wide: 80 at 4px, 960 at 48px
    expect(effectiveFontSize(4, 80, 48, 960)).toBeCloseTo(4, 5)
  })

  it('is the minimum when the browser holds one', () => {
    // set at 4px but drawn at 15px: 300 wide, next to 960 at 48px
    expect(effectiveFontSize(4, 300, 48, 960)).toBeCloseTo(15, 5)
  })

  it('is nothing when a width could not be measured', () => {
    expect(effectiveFontSize(4, 0, 48, 960)).toBeNull()
    expect(effectiveFontSize(4, 80, 48, 0)).toBeNull()
  })
})
