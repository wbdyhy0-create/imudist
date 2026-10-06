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
