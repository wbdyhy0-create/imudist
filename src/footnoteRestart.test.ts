import { describe, expect, it } from 'vitest'
import { DEFAULT_FOOTNOTE_CONFIG, type FootnoteLayoutConfig } from './document'
import { footnoteRestartMarks, numberFootnotes, type FootnoteOrderEntry } from './footnoteLayout'
import { parseFootnoteConfig } from './fileFormat'

const config = (patch: Partial<FootnoteLayoutConfig>): FootnoteLayoutConfig => ({ ...DEFAULT_FOOTNOTE_CONFIG, ...patch })
const note = (id: string, page: number, frameY: number, anchor: number): FootnoteOrderEntry => ({ id, page, spread: page, frameX: 0, frameY, anchor })

describe('footnote numbering that starts over at a paragraph style', () => {
  const entries = [note('a', 0, 0, 5), note('b', 0, 0, 40), note('c', 1, 0, 3), note('d', 1, 0, 90)]

  it('stays continuous when nothing marks a restart', () => {
    const numbers = numberFootnotes(entries, config({ restart: 'style', restartStyleId: 'h1' }), 'rtl', [])
    expect([...numbers.values()]).toEqual([1, 2, 3, 4])
  })

  it('starts again at the opening of each paragraph in the style', () => {
    // a chapter heading begins at offset 30 of the first frame (before note b) and at offset 50 of the second one (before note d)
    const marks = [
      { page: 0, spread: 0, frameX: 0, frameY: 0, anchor: 30 },
      { page: 1, spread: 1, frameX: 0, frameY: 0, anchor: 50 },
    ]
    const numbers = numberFootnotes(entries, config({ restart: 'style', restartStyleId: 'h1' }), 'rtl', marks)
    expect(numbers.get('a')).toBe(1)
    expect(numbers.get('b')).toBe(1)
    expect(numbers.get('c')).toBe(2)
    expect(numbers.get('d')).toBe(1)
  })

  it('counts from the starting number', () => {
    const marks = [{ page: 0, spread: 0, frameX: 0, frameY: 0, anchor: 0 }]
    const numbers = numberFootnotes(entries, config({ restart: 'style', restartStyleId: 'h1', startAt: 5 }), 'rtl', marks)
    expect([...numbers.values()]).toEqual([5, 6, 7, 8])
  })

  it('a restart on another page applies to the notes that follow it, wherever they stand', () => {
    const marks = [{ page: 1, spread: 1, frameX: 0, frameY: 0, anchor: 0 }]
    const numbers = numberFootnotes(entries, config({ restart: 'style', restartStyleId: 'h1' }), 'rtl', marks)
    expect([numbers.get('a'), numbers.get('b'), numbers.get('c'), numbers.get('d')]).toEqual([1, 2, 1, 2])
  })

  it('ignores the marks when the numbering is not by style', () => {
    const marks = [{ page: 0, spread: 0, frameX: 0, frameY: 0, anchor: 30 }]
    const numbers = numberFootnotes(entries, config({ restart: 'continuous' }), 'rtl', marks)
    expect([...numbers.values()]).toEqual([1, 2, 3, 4])
  })

  it('still restarts per page the old way', () => {
    const numbers = numberFootnotes(entries, config({ restart: 'page' }), 'rtl', [])
    expect([numbers.get('a'), numbers.get('b'), numbers.get('c'), numbers.get('d')]).toEqual([1, 2, 1, 2])
  })
})

describe('where the numbering starts over', () => {
  const heads = new Map([
    ['story', { text: 'Title\nBody one\nChapter two\nBody two', paragraphStyleId: 'h1', paragraphStyleIds: ['h1', 'body', 'h1', 'body'] }],
  ])
  const where = (frameId: string) => ({ page: frameId === 'f1' ? 0 : 1, spread: 0, frameX: 0, frameY: 0 })

  it('finds the paragraphs in the style, in the frame that shows them', () => {
    // 'Title\n' is 0-5, 'Body one\n' 6-14, 'Chapter two\n' starts at 15
    const flows = new Map([
      ['f1', { headId: 'story', start: 0, end: 15 }],
      ['f2', { headId: 'story', start: 15, end: 40 }],
    ])
    const marks = footnoteRestartMarks(flows, heads, 'h1', where)
    expect(marks).toEqual([
      { page: 0, spread: 0, frameX: 0, frameY: 0, anchor: 0 },
      { page: 1, spread: 0, frameX: 0, frameY: 0, anchor: 15 },
    ])
  })

  it('finds nothing without a style or for a style no paragraph has', () => {
    const flows = new Map([['f1', { headId: 'story', start: 0, end: 40 }]])
    expect(footnoteRestartMarks(flows, heads, undefined, where)).toEqual([])
    expect(footnoteRestartMarks(flows, heads, 'missing', where)).toEqual([])
  })

  it('takes the style of the first paragraph from the frame when the list does not name it', () => {
    const only = new Map([['story', { text: 'One\nTwo', paragraphStyleId: 'h1' }]])
    const flows = new Map([['f1', { headId: 'story', start: 0, end: 7 }]])
    expect(footnoteRestartMarks(flows, only, 'h1', where)).toEqual([{ page: 0, spread: 0, frameX: 0, frameY: 0, anchor: 0 }])
  })
})

describe('the setting is kept in the file', () => {
  it('reads the style the numbering restarts at', () => {
    const read = parseFootnoteConfig({ ...DEFAULT_FOOTNOTE_CONFIG, restart: 'style', restartStyleId: 'h1' })
    expect(read.restart).toBe('style')
    expect(read.restartStyleId).toBe('h1')
  })
})
