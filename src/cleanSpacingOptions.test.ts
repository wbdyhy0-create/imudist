import { describe, expect, it } from 'vitest'
import { cleanSpacingPlan } from './story'

describe('cleaning the spacing: each button does only its own job', () => {
  const text = 'שלום  עולם\n\nשורה  שנייה'

  it('both by default', () => {
    const { ranges, dropped } = cleanSpacingPlan(text)
    expect(ranges.length).toBe(3) // two double spaces and the empty paragraph
    expect(dropped).toEqual([1])
  })

  it('only the repeated spaces', () => {
    const { ranges, dropped } = cleanSpacingPlan(text, 0, text.length, { paragraphs: false })
    expect(ranges.length).toBe(2)
    expect(dropped).toEqual([])
    for (const [a, b] of ranges) expect(text.slice(a, b).trim()).toBe('')
  })

  it('only the empty paragraphs', () => {
    const { ranges, dropped } = cleanSpacingPlan(text, 0, text.length, { spaces: false })
    expect(ranges.length).toBe(1)
    expect(dropped).toEqual([1])
    expect(text.slice(ranges[0][0], ranges[0][1])).toBe('\n')
  })
})
