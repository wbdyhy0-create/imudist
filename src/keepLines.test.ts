import { describe, expect, it } from 'vitest'
import { KEEP_ALL_LINES } from './document'
import { setParaOverride } from './story'

describe('setParaOverride', () => {
  it('sets a paragraph\'s own value, padding the list with "none" up to it', () => {
    expect(setParaOverride(undefined, 2, KEEP_ALL_LINES)).toEqual([null, null, KEEP_ALL_LINES])
    expect(setParaOverride([1, null, 3], 1, 2)).toEqual([1, 2, 3])
  })

  it('without a value takes the paragraph\'s own value away, and touches nothing else', () => {
    expect(setParaOverride([KEEP_ALL_LINES, KEEP_ALL_LINES], 0, undefined)).toEqual([null, KEEP_ALL_LINES])
    expect(setParaOverride(undefined, 3, undefined)).toBeUndefined()
    const list = [null, 2]
    expect(setParaOverride(list, 0, undefined)).toBe(list)
  })
})

describe('the keep settings survive saving and opening the file', () => {
  it('keeps lines together, keep with next, and the same options of a paragraph style', async () => {
    const { DEFAULT_PARAGRAPH_STYLES, DEFAULT_TEXT_STYLE, defaultDocSettings } = await import('./document')
    const { parseDocument, serializeDocument } = await import('./fileFormat')
    const style = { fontFamily: 'Arial', fontSize: 12, weight: 400, italic: false, tracking: 0 }
    const frame = { ...DEFAULT_TEXT_STYLE, id: 'a', x: 0, y: 0, w: 100, h: 100, text: 'א\nב\nג', runs: [{ len: 5, style }], next: null, paraKeepFirstLines: [null, KEEP_ALL_LINES, null], paraKeepLastLines: [null, KEEP_ALL_LINES, null], paraKeepWithNext: [1, null, null] }
    const styles = DEFAULT_PARAGRAPH_STYLES.map((record, index) => (index === 0 ? { ...record, patch: { ...record.patch, keepLinesTogether: true, keepWithNext: true } } : record))
    const content = { doc: defaultDocSettings('x'), frames: [frame], images: [], assets: {}, guides: [], shapes: [], paragraphStyles: styles, parents: [], pageParents: [], sections: [] }
    const back = parseDocument(serializeDocument(content), 'x')
    expect(back.frames[0].paraKeepFirstLines).toEqual([null, KEEP_ALL_LINES, null])
    expect(back.frames[0].paraKeepLastLines).toEqual([null, KEEP_ALL_LINES, null])
    expect(back.frames[0].paraKeepWithNext).toEqual([1, null, null])
    expect(back.paragraphStyles[0].patch.keepLinesTogether).toBe(true)
    expect(back.paragraphStyles[0].patch.keepWithNext).toBe(true)
  })
})
