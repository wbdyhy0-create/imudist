import { describe, expect, it } from 'vitest'
import { chooseTier } from './imageProxy'

describe('chooseTier', () => {
  it('shows a picture that is not much wider than the biggest copy as it is', () => {
    expect(chooseTier(300, 1000)).toBeNull()
    expect(chooseTier(800, 1800)).toBeNull()
  })

  it('a 300-DPI A4 page: the thumbnail when it is shown tiny, the page-sized copy up to that size, the picture itself beyond', () => {
    expect(chooseTier(70, 2480)).toBe(320)
    expect(chooseTier(320, 2480)).toBe(320)
    expect(chooseTier(321, 2480)).toBe(1240)
    expect(chooseTier(1240, 2480)).toBe(1240)
    expect(chooseTier(1241, 2480)).toBeNull()
    expect(chooseTier(2400, 2480)).toBeNull()
  })
})
