import { describe, expect, it } from 'vitest'
import { footnoteBlockWidth, layoutFootnotes, type FootnoteLayoutItem } from './footnoteLayout'

const items: FootnoteLayoutItem[] = [
  { id: 'first', anchor: 0, referenceNumber: 1, content: 'first note' },
  { id: 'second', anchor: 1, referenceNumber: 2, content: 'second note' },
]

describe('vertical footnote columns', () => {
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
