import { describe, expect, it } from 'vitest'
import { textOutlineStroke } from './richtext'
import { atParaEnd, leadingFollowingSize, mergeRuns, normalizeRuns, styleRange } from './story'

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
  it('converts outline width and color into a scaled text stroke', () => {
    expect(textOutlineStroke({ ...base, outlineColor: '#0066ff', outlineWidth: 1.25 }, 300 / 72)).toBe('5.208px #0066ff')
    expect(textOutlineStroke({ ...base, outlineWidth: 0 }, 300 / 72)).toBe('')
  })

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

describe('the leading that follows the size of the letters', () => {
  const body = { ...base, fontSize: 14 }
  const text = 'שלום\nעולם'
  const runs = (size: number, size2 = size) => [{ len: 5, style: { ...body, fontSize: size } }, { len: 4, style: { ...body, fontSize: size2 } }]

  it('moves the leading of the whole story with its size, and the paragraphs that have their own', () => {
    const frame = { text, leading: 17, paragraphStylePatches: [{ leading: 20 }, {}] }
    const follow = leadingFollowingSize(frame, runs(14), runs(21), 14, 21, null)!
    expect(follow.leading).toBe(25.5)
    expect(follow.paragraphStylePatches).toEqual([{ leading: 30 }, {}])
    expect(follow.firstParagraph).toBe(0)
  })

  it('writes the story leading on the paragraphs of a selection that is made larger, and leaves the others', () => {
    const frame = { text, leading: 17, paragraphStylePatches: undefined }
    const follow = leadingFollowingSize(frame, runs(14), runs(14, 28), 14, 14, [1])!
    expect(follow.leading).toBe(17)
    expect(follow.paragraphStylePatches).toEqual([{}, { leading: 34 }])
    expect(follow.firstParagraph).toBe(1)
  })

  it('leaves an automatic leading to itself, and a size that is the same', () => {
    expect(leadingFollowingSize({ text, leading: undefined, paragraphStylePatches: undefined }, runs(14), runs(21), 14, 21, null)).toBeNull()
    expect(leadingFollowingSize({ text, leading: 17, paragraphStylePatches: undefined }, runs(14), runs(14), 14, 14, null)).toBeNull()
  })

  it('is exact in proportion: every point of size adds leading / size points, and the way back returns the leading', () => {
    const frame = { text: 'שלום', leading: 9.6, paragraphStylePatches: undefined }
    const sized = (size: number) => [{ len: 4, style: { ...body, fontSize: size } }]
    expect(leadingFollowingSize(frame, sized(14), sized(20), 14, 20, null)!.leading).toBe(13.714)
    const up = leadingFollowingSize(frame, sized(14), sized(15), 14, 15, null)!
    expect(up.leading).toBe(10.286) // 9.6 / 14 = 0.6857 per point
    const back = leadingFollowingSize({ ...frame, leading: 13.714 }, sized(20), sized(14), 20, 14, null)!
    expect(back.leading).toBe(9.6)
  })

  it('goes by the size most of a paragraph has, as the toolbar shows it, and not by its largest word', () => {
    const frame = { text, leading: 20, paragraphStylePatches: [{ leading: 20 }, {}] }
    // paragraph 0 = 3 letters of 14 and one of 28
    const mixed = [{ len: 3, style: { ...body, fontSize: 14 } }, { len: 2, style: { ...body, fontSize: 28 } }, { len: 4, style: { ...body, fontSize: 14 } }]
    const largerWord = [{ len: 3, style: { ...body, fontSize: 14 } }, { len: 2, style: { ...body, fontSize: 30 } }, { len: 4, style: { ...body, fontSize: 14 } }]
    const all = [{ len: 9, style: { ...body, fontSize: 21 } }]
    expect(leadingFollowingSize(frame, mixed, largerWord, 14, 14, [0])).toBeNull()
    expect(leadingFollowingSize(frame, mixed, all, 14, 21, [0])!.paragraphStylePatches?.[0].leading).toBe(30)
  })
})

describe('a size stepped up a point at a time', () => {
  it('arrives where one jump would, with no drift from the steps', () => {
    const body = { fontFamily: 'Arial', fontSize: 14, weight: 400, italic: false, tracking: 0 }
    const sized = (size: number) => [{ len: 4, style: { ...body, fontSize: size } }]
    let frame = { text: 'שלום', leading: 9 as number | undefined, paragraphStylePatches: undefined }
    for (const size of [15, 16]) {
      frame = { ...frame, leading: leadingFollowingSize(frame, sized(size - 1), sized(size), size - 1, size, null)!.leading }
    }
    expect(Math.round(frame.leading! * 100) / 100).toBe(10.29) // 9 × 16 / 14
  })
})

describe('the automatic leading and a size that is not the story\'s own', () => {
  const body = { fontFamily: 'Arial', fontSize: 14, weight: 400, italic: false, tracking: 0 }
  const text = 'שלום\nעולם'
  const runs = (size: number, size2 = size) => [{ len: 5, style: { ...body, fontSize: size } }, { len: 4, style: { ...body, fontSize: size2 } }]

  it('writes the automatic leading of a paragraph that is given another size than the story has', () => {
    // paragraph 1 goes from 14 to 28 while the story stays at 14: its lines get 125% of 28, not of 14
    const follow = leadingFollowingSize({ text, leading: undefined, paragraphStylePatches: undefined }, runs(14), runs(14, 28), 14, 14, [1])!
    expect(follow.leading).toBeUndefined()
    expect(follow.paragraphStylePatches).toEqual([{}, { leading: 35 }])
  })

  it('leaves the automatic leading alone when it follows by itself, and writes it when the text is not at the size of the story', () => {
    expect(leadingFollowingSize({ text, leading: undefined, paragraphStylePatches: undefined }, runs(14), runs(21), 14, 21, null)).toBeNull()
    // the story says 14 and its text is 28: the story steps to 15 and the text to 29, but the automatic leading goes by the 15
    const follow = leadingFollowingSize({ text, leading: undefined, paragraphStylePatches: undefined }, runs(28), runs(29), 14, 15, null)!
    expect(follow.paragraphStylePatches).toEqual([{ leading: 36 }, { leading: 36 }])
  })
})
