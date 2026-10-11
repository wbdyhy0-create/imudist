import { describe, expect, it } from 'vitest'
import { defaultDocSettings, type TextFrame } from './document'
import { growOverflowingFrames, type FlowFunction } from './growFrames'
import { pageRects, type DocContent } from './pages'

const frame = (patch: Partial<TextFrame> & { id: string }): TextFrame =>
  ({ x: 50, y: 100, w: 200, h: 40, fontFamily: 'Arial', fontSize: 12, weight: 400, italic: false, tracking: 0, align: 'right', leading: 20, text: 'text', runs: [], next: null, ...patch }) as TextFrame

const contentOf = (frames: TextFrame[]): DocContent => ({
  doc: { ...defaultDocSettings('grow'), pages: 1 },
  frames,
  images: [],
  shapes: [],
  assets: {},
  guides: [],
  paragraphStyles: [],
  parents: [],
  pageParents: [],
  sections: [],
})

/** a layout that says a frame's text does not fit while it is lower than the height it needs (the last frame of a thread is flagged) */
const needing =
  (needs: Record<string, number>): FlowFunction =>
  (frames) => {
    const result = new Map<string, { overflow: boolean }>()
    for (const candidate of frames) {
      const need = needs[candidate.id]
      result.set(candidate.id, { overflow: need !== undefined && candidate.h < need })
    }
    return result
  }

describe('making the text of imported frames show', () => {
  it('makes a frame that is short higher, a line at a time, until the text fits', () => {
    const content = contentOf([frame({ id: 'a', h: 40 })])
    const result = growOverflowingFrames(content, needing({ a: 90 }))
    expect(result.frames[0]!.h).toBe(100)
    expect(result.grown).toBe(1)
    expect(result.stillHidden).toBe(0)
    // the frames of the document are not changed
    expect(content.frames[0]!.h).toBe(40)
  })

  it('leaves a frame whose text fits alone', () => {
    const result = growOverflowingFrames(contentOf([frame({ id: 'a', h: 40 })]), needing({ a: 30 }))
    expect(result.frames[0]!.h).toBe(40)
    expect(result.grown).toBe(0)
  })

  it('stops at the bottom of the page, and counts what still does not fit', () => {
    const page = pageRects({ ...defaultDocSettings('grow'), pages: 1 })[0]!
    const y = page.y + page.h - 50
    const result = growOverflowingFrames(contentOf([frame({ id: 'a', y, h: 30 })]), needing({ a: 500 }))
    expect(result.frames[0]!.y + result.frames[0]!.h).toBeCloseTo(page.y + page.h, 6)
    expect(result.stillHidden).toBe(1)
  })

  it('makes the frames beside the last one of a thread as high (the columns of one frame)', () => {
    const content = contentOf([frame({ id: 'right', x: 200, h: 40, next: 'left' }), frame({ id: 'left', x: 50, h: 40 })])
    const result = growOverflowingFrames(content, needing({ left: 70 }))
    const heights = Object.fromEntries(result.frames.map((candidate) => [candidate.id, candidate.h]))
    expect(heights.left).toBe(80)
    expect(heights.right).toBe(80)
  })

  it('does not make a frame in another place as high', () => {
    const content = contentOf([frame({ id: 'first', y: 100, h: 40, next: 'second' }), frame({ id: 'second', y: 300, h: 40 }), frame({ id: 'other', y: 500, h: 40 })])
    const result = growOverflowingFrames(content, needing({ second: 70 }))
    const heights = Object.fromEntries(result.frames.map((candidate) => [candidate.id, candidate.h]))
    expect(heights.second).toBe(80)
    expect(heights.first).toBe(40)
    expect(heights.other).toBe(40)
  })
})
