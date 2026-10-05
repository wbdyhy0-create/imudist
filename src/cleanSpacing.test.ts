import { describe, expect, it } from 'vitest'
import { DEFAULT_TEXT_STYLE, type TextFrame } from './document'
import { replaceInStory } from './findReplace'
import { cleanSpacing, cleanSpacingPlan, cleanSpacingRanges } from './story'

const base = { fontFamily: 'Arial', fontSize: 12, weight: 400, italic: false, tracking: 0 }
const clean = (text: string) => cleanSpacing(text, [{ len: text.length, style: base }], base).text

describe('cleanSpacing', () => {
  it('collapses repeated spaces, no-break spaces included', () => {
    expect(clean('א  ב   ג')).toBe('א ב ג')
    expect(clean('א   ב')).toBe('א ב')
  })

  it('removes every empty paragraph - also those holding only spaces or invisible marks', () => {
    expect(clean('א\n\nב')).toBe('א\nב')
    expect(clean('א\n \nב')).toBe('א\nב')
    expect(clean('א\n \nב')).toBe('א\nב')
    expect(clean('א\n‏\n‎ \nב')).toBe('א\nב')
    expect(clean('א\n\n\n\nב')).toBe('א\nב')
  })

  it('also at the start of the story, and leaves a single break at the end', () => {
    expect(clean('\n\nא\nב')).toBe('א\nב')
    expect(clean('  \nא')).toBe('א')
    expect(clean('א\n')).toBe('א\n')
    expect(clean('א\n\n')).toBe('א\n')
    expect(clean('א\n   ')).toBe('א\n')
  })

  it('leaves a paragraph of text alone, tabs and single spaces included', () => {
    expect(clean('א ב\tג\nד ה')).toBe('א ב\tג\nד ה')
  })

  it('only looks at the selected part', () => {
    const text = 'א  ב\n\nג  ד\n\nה'
    // select the second paragraph and the empty one after it
    const from = text.indexOf('ג')
    expect(cleanSpacing(text, [{ len: text.length, style: base }], base, from, text.length).text).toBe('א  ב\n\nג ד\nה')
  })

  it('ranges come back in order and never overlap', () => {
    const ranges = cleanSpacingRanges('  \nא  ב\n\n\nג')
    expect(ranges).toEqual([[0, 3], [5, 6], [8, 9], [9, 10]])
  })
})

describe('cleaning a frame keeps what belongs to each paragraph that stays', () => {
  const frame = (text: string, extra: Partial<TextFrame>): TextFrame => ({
    ...DEFAULT_TEXT_STYLE,
    id: 'a',
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    text,
    runs: [{ len: text.length, style: base }],
    next: null,
    ...extra,
  })

  it('paragraph styles and spacing stay with their paragraphs when empty ones between them go', () => {
    const f = frame('כותרת\n\nפסקה\n \n\nסוף', {
      paragraphStyleIds: ['heading', 'blank', 'body', 'blank', 'blank', 'end'],
      paraSpaceBefore: [20, null, 5, null, null, 9],
    })
    const { ranges, dropped } = cleanSpacingPlan(f.text)
    const out = replaceInStory(f, ranges.map(([start, end]) => ({ start, end, replacement: '' })), { dropParagraphs: dropped })
    expect(out.text).toBe('כותרת\nפסקה\nסוף')
    expect(out.paragraphStyleIds).toEqual(['heading', 'body', 'end'])
    expect(out.paraSpaceBefore).toEqual([20, 5, 9])
  })
})
