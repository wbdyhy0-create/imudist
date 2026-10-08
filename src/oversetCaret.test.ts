import { describe, expect, it } from 'vitest'
import { editRangeInStory, reportIsViewOf } from './oversetCaret'

// a frame that shows characters 100…180 of a story (80 characters)
const frame = { start: 100, end: 180 }

describe('editRangeInStory', () => {
  it('is the place in the frame when nothing reaches beyond it', () => {
    expect(editRangeInStory(frame, 10, 10, null, false)).toEqual({ a: 110, b: 110 })
    expect(editRangeInStory(frame, 10, 12, { a: 110, b: 112 }, false)).toEqual({ a: 110, b: 112 })
  })

  it('replaces the selection that runs across frames', () => {
    expect(editRangeInStory(frame, 3, 3, { a: 0, b: 500 }, false)).toEqual({ a: 0, b: 500 })
  })

  it('makes an edit where the caret is when the caret is in text no frame shows', () => {
    const caret = { a: 230, b: 230 }
    // typing: the editor says "at the end of what I show"
    expect(editRangeInStory(frame, 80, 80, caret, true)).toEqual({ a: 230, b: 230 })
    // backspace: the letter before the end of what it shows
    expect(editRangeInStory(frame, 79, 80, caret, true)).toEqual({ a: 229, b: 230 })
  })

  it('does not take a caret beyond the frame for a caret in the text unless it was put there by typing on', () => {
    expect(editRangeInStory(frame, 80, 80, { a: 230, b: 230 }, false)).toEqual({ a: 230, b: 230 })
  })

  it('leaves an edit in the middle of the frame where it is, whatever the caret was', () => {
    // the editor does not say "end of what I show": the user put the caret in the frame
    expect(editRangeInStory(frame, 20, 20, { a: 230, b: 230 }, true)).toEqual({ a: 230, b: 230 })
  })
})

describe('reportIsViewOf', () => {
  it('is a view of a selection that runs across frames when the editor reports its own part of it', () => {
    expect(reportIsViewOf({ a: 0, b: 500 }, frame, 0, 80, false)).toBe(true)
    expect(reportIsViewOf({ a: 120, b: 500 }, frame, 20, 80, false)).toBe(true)
    expect(reportIsViewOf({ a: 0, b: 500 }, frame, 5, 80, false)).toBe(false)
  })

  it('is a view of a caret in text no frame shows, shown at the end of what the frame shows', () => {
    expect(reportIsViewOf({ a: 230, b: 230 }, frame, 80, 80, true)).toBe(true)
  })

  it('is a caret of its own when the user put it at the end of what the frame shows', () => {
    expect(reportIsViewOf({ a: 230, b: 230 }, frame, 80, 80, false)).toBe(false)
  })

  it('is a caret of its own when the editor reports another place', () => {
    expect(reportIsViewOf({ a: 230, b: 230 }, frame, 79, 79, true)).toBe(false)
  })

  it('is not a view of a selection that is inside the frame', () => {
    expect(reportIsViewOf({ a: 120, b: 140 }, frame, 20, 40, true)).toBe(false)
  })
})
