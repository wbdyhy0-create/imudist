import { describe, expect, it } from 'vitest'
import { atParaEnd, mergeRuns, normalizeRuns, styleRange } from './story'

const base = { fontFamily: 'Arial', fontSize: 14, weight: 400, italic: false, tracking: 0 }

describe('paragraph end positions', () => {
  it('identifies only the position before a paragraph break or the end of the story', () => {
    const text = 'פסוק\nטקסט רץ'

    expect(atParaEnd(text, 4)).toBe(true)
    expect(atParaEnd(text, 5)).toBe(false)
    expect(atParaEnd(text, text.length)).toBe(true)
    expect(atParaEnd(text, 0)).toBe(false)
  })
})

describe('character outlines', () => {
  it('preserves outline formatting on a selected run', () => {
    const runs = normalizeRuns('text', undefined, base)
    const outlined = styleRange(runs, 1, 3, { outlineColor: '#ff0000', outlineWidth: 1.5 })

    expect(outlined.map((run) => [run.len, run.style.outlineColor, run.style.outlineWidth])).toEqual([
      [1, undefined, undefined],
      [2, '#ff0000', 1.5],
      [1, undefined, undefined],
    ])
  })

  it('does not merge adjacent runs with different outlines', () => {
    const merged = mergeRuns([
      { len: 1, style: { ...base, outlineColor: '#ff0000', outlineWidth: 1 } },
      { len: 1, style: { ...base, outlineColor: '#0000ff', outlineWidth: 1 } },
    ])

    expect(merged).toHaveLength(2)
  })
})
