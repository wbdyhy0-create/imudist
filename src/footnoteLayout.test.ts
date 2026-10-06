import { describe, expect, it } from 'vitest'
import { DEFAULT_FOOTNOTE_CONFIG, DEFAULT_PARAGRAPH_STYLES, DEFAULT_TEXT_STYLE, defaultDocSettings, type TextFrame } from './document'
import { parseDocument, serializeDocument } from './fileFormat'
import { changedFootnoteOffset, footnoteBlockWidth, footnoteDividerHeight, layoutFootnotes, type FootnoteLayoutItem, updateFootnoteParagraphStyle } from './footnoteLayout'
import { computeLayout } from './layout'
import { columnBoxes, primaryTextFramePageGroups } from './placeText'
import { pageRects } from './pages'
import { mergeSharedPageFootnotes, type FrameFlow } from './textLayout'

const items: FootnoteLayoutItem[] = [
  { id: 'first', anchor: 0, referenceNumber: 1, content: 'first note' },
  { id: 'second', anchor: 1, referenceNumber: 2, content: 'second note' },
]

describe('footnote divider settings', () => {
  it('reserves the heading paragraph leading instead of line thickness when heading mode is active', () => {
    expect(footnoteDividerHeight({ ...DEFAULT_FOOTNOTE_CONFIG, dividerMode: 'line', dividerThickness: 2.5 }, DEFAULT_PARAGRAPH_STYLES)).toBe(2.5)
    expect(footnoteDividerHeight({ ...DEFAULT_FOOTNOTE_CONFIG, dividerMode: 'heading', dividerHeadingStyleId: 'heading' }, DEFAULT_PARAGRAPH_STYLES)).toBe(30)
  })

  it('preserves divider width, thickness, and alignment when saving and reopening a document', () => {
    const divider = { ...DEFAULT_FOOTNOTE_CONFIG, placement: 'endnotes' as const, dividerWidth: 62, dividerThickness: 2.5, dividerAlignment: 'center' as const, dividerMode: 'heading' as const, dividerText: 'הערות חשובות', dividerHeadingLines: true, dividerHeadingDecoration: 'needle' as const, dividerHeadingStyleId: 'heading' }
    const note = { id: 'note-1', anchor: 0, content: 'Styled note', runs: [{ len: 11, style: { ...DEFAULT_TEXT_STYLE, fontSize: 9, weight: 700 } }], style: { ...DEFAULT_TEXT_STYLE, fontSize: 9 }, paragraphStyleId: 'heading' }
    const frame = { ...DEFAULT_TEXT_STYLE, id: 'story', x: 0, y: 0, w: 100, h: 100, text: '\uE006', runs: [{ len: 1, style: DEFAULT_TEXT_STYLE }], next: null, footnotes: [note] }
    const content = {
      doc: { ...defaultDocSettings('footnotes'), footnotes: divider },
      frames: [frame], images: [], assets: {}, guides: [], shapes: [], paragraphStyles: DEFAULT_PARAGRAPH_STYLES,
      parents: [], pageParents: [], sections: [],
    }

    const restored = parseDocument(serializeDocument(content), 'footnotes')

    expect(restored.doc.footnotes).toMatchObject({ placement: 'endnotes', dividerWidth: 62, dividerThickness: 2.5, dividerAlignment: 'center', dividerMode: 'heading', dividerText: 'הערות חשובות', dividerHeadingLines: true, dividerHeadingDecoration: 'needle', dividerHeadingStyleId: 'heading' })
    expect(restored.frames[0].footnotes?.[0]).toMatchObject({
      id: note.id,
      anchor: note.anchor,
      content: note.content,
      paragraphStyleId: note.paragraphStyleId,
      style: { fontSize: 9 },
      runs: [{ len: 11, style: { fontSize: 9, weight: 700 } }],
    })
  })
})

describe('vertical footnote columns', () => {
  it('starts incremental reflow at the earliest changed footnote anchor', () => {
    const previous = [
      { id: 'earlier', anchor: 10, content: 'unchanged' },
      { id: 'edited', anchor: 40, content: 'before' },
    ]
    const next = [previous[0], { ...previous[1], content: 'after' }]

    expect(changedFootnoteOffset(previous, next)).toBe(40)
    expect(changedFootnoteOffset(previous, previous)).toBeUndefined()
  })

  it('updates imported run defaults when their paragraph style changes and keeps direct run overrides', () => {
    const note = {
      id: 'imported',
      anchor: 0,
      content: 'inherited direct',
      paragraphStyleId: 'footnote-text',
      style: { ...DEFAULT_TEXT_STYLE, fontSize: 12 },
      runs: [
        { len: 10, style: { ...DEFAULT_TEXT_STYLE, fontSize: 12 } },
        { len: 6, style: { ...DEFAULT_TEXT_STYLE, fontSize: 9, weight: 700 } },
      ],
    }
    const previous = { ...DEFAULT_TEXT_STYLE, fontSize: 10 }
    const next = { ...previous, fontSize: 16, align: 'center' as const }
    const updated = updateFootnoteParagraphStyle(note, previous, next)

    expect(updated.style?.fontSize).toBe(16)
    expect(updated.style?.align).toBe('center')
    expect(updated.runs?.[0].style.fontSize).toBe(16)
    expect(updated.runs?.[1].style.fontSize).toBe(9)
    expect(updated.runs?.[1].style.weight).toBe(700)
  })

  it('keeps a single note in the right column', () => {
    const result = layoutFootnotes([items[0]], {
      mode: 'vertical',
      columns: 2,
      columnWidth: 216,
      maxFootnoteHeight: 200,
      minSpacingBetweenInline: 8,
    }, () => ({ width: 100, height: 20 }))

    expect(result.placements).toHaveLength(1)
    expect(result.placements[0].x).toBe(0)
  })

  it('wraps footnote text into additional lines when columns narrow', () => {
    const longItem = { ...items[0], content: 'long note '.repeat(20) }
    const measure = (item: FootnoteLayoutItem, width: number) => ({
      width,
      height: Math.ceil((item.content.length * 8) / width) * 12,
    })
    const fullWidth = layoutFootnotes([longItem], {
      mode: 'vertical',
      columns: 2,
      columnGap: 10,
      columnWidth: 216,
      maxFootnoteHeight: 500,
      minSpacingBetweenInline: 8,
    }, measure)
    const narrowWidth = layoutFootnotes([longItem], {
      mode: 'vertical',
      columns: 2,
      columnGap: 6,
      columnWidth: footnoteBlockWidth(216, 0.6),
      maxFootnoteHeight: 500,
      minSpacingBetweenInline: 8,
    }, measure)

    expect(narrowWidth.placements[0].height).toBeGreaterThan(fullWidth.placements[0].height)
  })

  it('narrows both text columns and keeps the right edge fixed', () => {
    const frameWidth = 216
    const widthScale = 0.6
    const scaledWidth = footnoteBlockWidth(frameWidth, widthScale)
    const originalGap = 10
    const result = layoutFootnotes(items, {
      mode: 'vertical',
      columns: 2,
      columnGap: originalGap * widthScale,
      columnWidth: scaledWidth,
      maxFootnoteHeight: 20,
      minSpacingBetweenInline: 8,
    }, () => ({ width: 80, height: 20 }))
    const rightColumn = result.placements.find((placement) => placement.x === 0)!
    const leftColumn = result.placements.find((placement) => placement.x > 0)!

    expect(rightColumn.width).toBeCloseTo(64.8)
    expect(leftColumn.width).toBeCloseTo(58.8)
    expect(leftColumn.x - rightColumn.width).toBeCloseTo(originalGap * widthScale)
    expect(frameWidth - rightColumn.x).toBe(frameWidth)
    expect(leftColumn.x).toBeLessThan(118)
  })

  it('uses a 10-point column gap when the right column fills', () => {
    const result = layoutFootnotes(items, {
      mode: 'vertical',
      columns: 2,
      columnWidth: 216,
      maxFootnoteHeight: 20,
      minSpacingBetweenInline: 8,
    }, () => ({ width: 100, height: 20 }))

    expect(result.placements.map((placement) => placement.x)).toEqual([0, 118])
    expect(result.placements.map((placement) => placement.width)).toEqual([108, 98])
  })

  it('puts about two-thirds of notes in the right column even when both columns have room', () => {
    const fourItems = Array.from({ length: 4 }, (_, index) => ({ ...items[index % items.length], id: `note-${index}` }))
    const result = layoutFootnotes(fourItems, {
      mode: 'vertical',
      columns: 2,
      columnGap: 32,
      columnWidth: 216,
      maxFootnoteHeight: 200,
      minSpacingBetweenInline: 8,
    }, () => ({ width: 100, height: 20 }))

    expect(result.placements.filter((placement) => placement.x === 0)).toHaveLength(3)
    expect(result.placements.filter((placement) => placement.x > 0)).toHaveLength(1)
    expect(result.overflowItems).toHaveLength(0)
  })

  it('keeps the right-column majority with larger note counts', () => {
    const oddItems = Array.from({ length: 13 }, (_, index) => ({ ...items[index % items.length], id: `note-${index}` }))
    const result = layoutFootnotes(oddItems, {
      mode: 'vertical',
      columns: 2,
      columnGap: 16,
      columnWidth: 216,
      maxFootnoteHeight: 200,
      minSpacingBetweenInline: 8,
    }, () => ({ width: 100, height: 20 }))

    expect(result.placements.filter((placement) => placement.x === 0)).toHaveLength(9)
    expect(result.placements.filter((placement) => placement.x > 0)).toHaveLength(4)
  })
})

describe('horizontal footnote alignment', () => {
  it('anchors rows at the right by default and centers them across the page on request', () => {
    const measure = (item: FootnoteLayoutItem, width: number) => {
      const naturalWidth = item.content.length * 10
      return { width: Number.isFinite(width) ? Math.min(naturalWidth, width) : naturalWidth, height: 12 }
    }
    const options = { mode: 'horizontal' as const, columnWidth: 300, maxFootnoteHeight: 100, minSpacingBetweenInline: 8 }
    const right = layoutFootnotes(items, { ...options, alignment: 'right' }, measure)
    const center = layoutFootnotes(items, { ...options, alignment: 'center' }, measure)
    const centerLeft = Math.min(...center.placements.map((placement) => placement.x))
    const centerRight = Math.max(...center.placements.map((placement) => placement.x + placement.width))

    expect(right.placements[0].x).toBe(0)
    expect(centerLeft).toBeGreaterThan(0)
    expect(centerLeft).toBeCloseTo((300 - (centerRight - centerLeft)) / 2)
    expect(centerRight).toBeCloseTo(300 - centerLeft)
  })
})

describe('shared page footnotes', () => {
  it('groups all automatic text columns on a page into one content-width area', () => {
    const doc = { ...defaultDocSettings('two-columns'), columns: 2 }
    const rect = pageRects(doc)[0]
    const page = computeLayout(doc).spreads.flatMap((spread) => spread.pages).find((candidate) => candidate.index === 0)!
    const boxes = columnBoxes(doc, rect, page.side, 0)
    const frames = boxes.map((box, index) => ({ ...DEFAULT_TEXT_STYLE, id: `column-${index}`, ...box, text: '', runs: [], next: null }))
    const groups = primaryTextFramePageGroups(doc, frames)

    expect(groups).toHaveLength(1)
    expect(groups[0].frameIds).toEqual(frames.map((frame) => frame.id))
    expect(groups[0].x).toBe(Math.min(...boxes.map((box) => box.x)))
    expect(groups[0].width).toBeCloseTo(Math.max(...boxes.map((box) => box.x + box.w)) - groups[0].x)
  })

  it('combines notes from two primary columns into one full-width area and wraps into another row', () => {
    const frame = (id: string, x: number): TextFrame => ({ ...DEFAULT_TEXT_STYLE, id, x, y: 0, w: 50, h: 100, text: '', runs: [], next: null })
    const makeNote = (id: string, anchor: number): FrameFlow['footnotes'][number] => ({
      id, anchor, referenceNumber: anchor + 1, content: `note ${id}`, x: 0, y: 1,
      width: 60, height: 10, computedWidth: 60, computedHeight: 10,
    })
    const makeFlow = (_id: string, note: FrameFlow['footnotes'][number]): FrameFlow => ({
      headId: 'story', prevId: null, style: DEFAULT_TEXT_STYLE, story: '', start: 0, end: 0, slice: '', runs: [],
      overflow: false, paraGaps: [], startParaIndex: 0, atParaStart: true, spaceBeforeFirst: 0, spaceAfterLast: 0,
      footnotes: [note], footnoteReferences: [], footnoteHeight: 11, footnoteOverflowItems: [],
    })
    const frames = [frame('right', 50), frame('left', 0)]
    const flows = new Map([
      ['right', makeFlow('right', makeNote('right-note', 0))],
      ['left', makeFlow('left', makeNote('left-note', 1))],
    ])

    const merged = mergeSharedPageFootnotes(flows, frames, [{ frameIds: ['right', 'left'], x: 0, width: 100 }], {
      ...DEFAULT_FOOTNOTE_CONFIG,
      mode: 'horizontal',
      dividerGap: 0,
      spaceBefore: 0,
      dividerThickness: 1,
    }, DEFAULT_PARAGRAPH_STYLES)

    expect(merged.get('right')?.footnotes).toHaveLength(2)
    expect(merged.get('right')?.footnoteAreaWidth).toBe(100)
    expect(merged.get('right')?.footnotes[1].y).toBeGreaterThan(merged.get('right')?.footnotes[0].y ?? 0)
    expect(merged.get('left')?.footnotes).toEqual([])
    expect(merged.get('left')?.footnoteHeight).toBe(merged.get('right')?.footnoteHeight)
  })
})

