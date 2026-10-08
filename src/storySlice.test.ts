import { describe, expect, it } from 'vitest'
import type { TextFrame } from './document'
import { frameAsOwnStory } from './storySlice'

const frame: TextFrame = {
  id: 'f', x: 0, y: 0, w: 100, h: 50, text: 'ראשון\nשני\nשלישי\nרביעי', runs: [], next: 'g',
  fontFamily: 'Arial', fontSize: 12, weight: 400, italic: false, tracking: 0, align: 'right', color: '#000000',
  paragraphStyleId: 'a', paragraphStyleIds: ['a', 'b', 'c', 'd'], paragraphStyleNames: ['A', 'B', 'C', 'D'], paraSpaceBefore: [1, 2, 3, 4],
  footnotes: [{ id: 'n1', anchor: 2, content: 'x' }, { id: 'n2', anchor: 12, content: 'y' }],
}
const style = { align: 'right' as const, fontFamily: 'Arial', fontSize: 12, weight: 400, italic: false, tracking: 0 }

describe('a frame copied as a story of its own', () => {
  it('keeps a whole story as it is', () => {
    const own = frameAsOwnStory(frame, { style, slice: frame.text, runs: [], start: 0, end: frame.text.length, startParaIndex: 0 })
    expect(own.paragraphStyleIds).toEqual(['a', 'b', 'c', 'd'])
    expect(own.paragraphStyleId).toBe('a')
    expect(own.footnotes?.map((note) => note.anchor)).toEqual([2, 12])
    expect(own.next).toBeNull()
  })

  it('starts the paragraph lists and the footnotes again at the frame\'s own first paragraph', () => {
    // the frame holds "שלישי\nרביעי": the story's third paragraph on, from offset 10
    const own = frameAsOwnStory(frame, { style, slice: 'שלישי\nרביעי', runs: [], start: 10, end: 21, startParaIndex: 2 })
    expect(own.paragraphStyleIds).toEqual(['c', 'd'])
    expect(own.paragraphStyleNames).toEqual(['C', 'D'])
    expect(own.paraSpaceBefore).toEqual([3, 4])
    expect(own.paragraphStyleId).toBeUndefined()
    // the first footnote is in an earlier frame; the second moves from 12 to 2
    expect(own.footnotes).toEqual([{ id: 'n2', anchor: 2, content: 'y' }])
  })

  it('drops the footnotes that are not in the share', () => {
    const own = frameAsOwnStory(frame, { style, slice: 'ראשון', runs: [], start: 0, end: 5, startParaIndex: 0 })
    expect(own.footnotes?.map((note) => note.id)).toEqual(['n1'])
    const none = frameAsOwnStory(frame, { style, slice: 'ראשון', runs: [], start: 30, end: 35, startParaIndex: 0 })
    expect(none.footnotes).toBeUndefined()
  })
})
