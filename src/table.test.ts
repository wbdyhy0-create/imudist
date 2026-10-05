import { describe, expect, it } from 'vitest'
import {
  borderX, cellCornerRadii, cellRect, cellSideStroke, createTable, deleteCols, deleteRows, dragColumnBorder, expandRange, insertCols, insertRows, layoutTable, mergeRange, scaleTable,
  originsOf, ownerGrid, patchCells, regionOf, resolveCell, rowKind, sanitizeTable, setCellText, setHeaderFooter, tableCols, tableLines, tableRows, unmergeAt,
  type TableData,
} from './table'

const fixed = () => 10 // every cell's text is 10 points tall

const grid = (rows: number, cols: number, header = 0, footer = 0) => createTable({ rows, cols, headerRows: header, footerRows: footer, width: 300 })
const label = (t: TableData) => ({ ...t, cells: t.cells.map((row, r) => row.map((cell, c) => ({ ...cell, text: `${r}${c}` }))) })

describe('createTable', () => {
  it('makes the grid, equal columns and the header and footer rows', () => {
    const t = grid(4, 3, 1, 1)
    expect(tableRows(t)).toBe(4)
    expect(tableCols(t)).toBe(3)
    expect(t.colWidths).toEqual([100, 100, 100])
    expect([0, 1, 2, 3].map((r) => rowKind(t, r))).toEqual(['header', 'body', 'body', 'footer'])
  })

  it('keeps header and footer rows inside the table', () => {
    const t = createTable({ rows: 2, cols: 2, headerRows: 5, footerRows: 5, width: 100 })
    expect(t.headerRows).toBe(2)
    expect(t.footerRows).toBe(0)
  })

  it('scales a table proportionally without changing its text or column proportions', () => {
    const base = createTable({ rows: 2, cols: 2, width: 200, cellGapX: 8, cellGapY: 6, cellRadius: 4 })
    const styled = { ...base, rowHeights: [24, 30], style: { ...base.style, fontSize: 12, insetX: 4, insetY: 3, outer: { color: '#000000', width: 1 } } }
    const scaled = scaleTable(styled, 2)
    expect(scaled.colWidths).toEqual(styled.colWidths)
    expect(scaled.rowHeights).toEqual([48, 60])
    expect(scaled.style).toMatchObject({ fontSize: 24, insetX: 8, insetY: 6, cellGapX: 16, cellGapY: 12, cellRadius: 8, outer: { width: 2 } })
    expect(scaled.cells).toEqual(styled.cells)
    expect(styled.style.fontSize).toBe(12)
  })
})

describe('merging', () => {
  it('merges a range into its first cell, keeps the text of all of them, and unmerges', () => {
    const t = mergeRange(label(grid(3, 3)), { r0: 0, c0: 0, r1: 1, c1: 1 })!
    expect(t.cells[0][0]).toMatchObject({ text: '00\n01\n10\n11', rowSpan: 2, colSpan: 2 })
    expect(ownerGrid(t)[1][1]).toEqual([0, 0])
    expect(originsOf(t)).toHaveLength(6)
    expect(regionOf(t, 1, 1)).toMatchObject({ r0: 0, c0: 0, r1: 1, c1: 1 })
    const back = unmergeAt(t, 1, 1)!
    expect(originsOf(back)).toHaveLength(9)
    expect(back.cells[0][0].rowSpan).toBeUndefined()
    expect(back.cells[0][0].text).toBe('00\n01\n10\n11')
  })

  it('grows a range until no merged cell is cut in two', () => {
    const t = mergeRange(grid(3, 3), { r0: 0, c0: 0, r1: 1, c1: 1 })!
    expect(expandRange(t, { r0: 1, c0: 1, r1: 2, c1: 2 })).toEqual({ r0: 0, c0: 0, r1: 2, c1: 2 })
  })

  it('has nothing to merge in a single cell', () => {
    expect(mergeRange(grid(2, 2), { r0: 0, c0: 0, r1: 0, c1: 0 })).toBeNull()
    expect(unmergeAt(grid(2, 2), 0, 0)).toBeNull()
  })

  it('keeps a text edit in a covered position on the merged cell', () => {
    const t = mergeRange(grid(2, 2), { r0: 0, c0: 0, r1: 0, c1: 1 })!
    expect(setCellText(t, 0, 1, 'x').cells[0][0].text).toBe('x')
  })
})

describe('inserting and deleting', () => {
  it('inserts a row and a column where asked, keeping the text in place', () => {
    const t = insertCols(insertRows(label(grid(2, 2)), 1), 0)
    expect(tableRows(t)).toBe(3)
    expect(tableCols(t)).toBe(3)
    expect(t.cells.map((row) => row.map((c) => c.text))).toEqual([['', '00', '01'], ['', '', ''], ['', '10', '11']])
    expect(t.colWidths).toHaveLength(3)
    expect(t.rowHeights).toHaveLength(3)
  })

  it('makes a merged cell taller when a row is inserted inside it, and moves it when the row goes above', () => {
    const merged = mergeRange(grid(3, 2), { r0: 0, c0: 0, r1: 1, c1: 0 })!
    expect(insertRows(merged, 1).cells[0][0].rowSpan).toBe(3)
    const moved = insertRows(merged, 0)
    expect(moved.cells[1][0].rowSpan).toBe(2)
    expect(moved.cells[0][0].rowSpan).toBeUndefined()
  })

  it('counts a row inserted inside the header as header, and one right under it as body', () => {
    const t = grid(4, 2, 2, 1)
    expect(insertRows(t, 1).headerRows).toBe(3)
    expect(insertRows(t, 2).headerRows).toBe(2)
    expect(insertRows(t, 3).footerRows).toBe(1)
    expect(insertRows(t, 4).footerRows).toBe(2)
  })

  it('deletes rows and columns, taking the text and the header count with them', () => {
    const t = label(grid(3, 3, 1))
    const fewer = deleteCols(deleteRows(t, 0, 0)!, 1, 1)!
    expect(fewer.cells.map((row) => row.map((c) => c.text))).toEqual([['10', '12'], ['20', '22']])
    expect(fewer.headerRows).toBe(0)
    expect(fewer.colWidths).toHaveLength(2)
  })

  it('keeps a merged cell alive when only some of its rows are deleted, and moves its text to the first row left', () => {
    const merged = { ...mergeRange(label(grid(4, 2)), { r0: 0, c0: 0, r1: 2, c1: 0 })! }
    const t = deleteRows(merged, 0, 0)!
    expect(t.cells[0][0]).toMatchObject({ rowSpan: 2 })
    expect(t.cells[0][0].text).toContain('00')
    expect(tableRows(t)).toBe(3)
    expect(deleteRows(merged, 0, 2)!.cells[0][0].rowSpan).toBeUndefined()
  })

  it('never deletes the last row or column', () => {
    expect(deleteRows(grid(2, 2), 0, 1)).toBeNull()
    expect(deleteCols(grid(2, 2), 0, 1)).toBeNull()
  })
})

describe('layout', () => {
  it('lays columns out from the right in a right-to-left table, and from the left otherwise', () => {
    const t = grid(1, 3)
    const rtl = layoutTable(t, 300, fixed)
    expect(rtl.colLeft).toEqual([200, 100, 0])
    expect(borderX(t, rtl, 0)).toBe(300)
    expect(borderX(t, rtl, 3)).toBe(0)
    const ltr = layoutTable({ ...t, rtl: false }, 300, fixed)
    expect(ltr.colLeft).toEqual([0, 100, 200])
  })

  it('scales the relative column widths to the table width', () => {
    const t = { ...grid(1, 2), colWidths: [1, 3] }
    expect(layoutTable(t, 200, fixed).colWidth).toEqual([50, 150])
  })

  it('uses a cell inset override when measuring row height', () => {
    const base = grid(1, 1)
    const inset = { ...base, cells: [[{ text: 'x', insetY: 10 }]] }
    expect(layoutTable(base, 100, fixed).rowHeight[0]).toBe(24)
    expect(layoutTable(inset, 100, fixed).rowHeight[0]).toBe(30)
  })

  it('places separated cells inside the same table bounds and includes gutters in merged cells', () => {
    const base = grid(2, 2)
    const table = { ...base, style: { ...base.style, cellGapX: 8, cellGapY: 6 } }
    const layout = layoutTable(table, 200, fixed)
    expect(layout.colWidth).toEqual([96, 96])
    expect(layout.colLeft).toEqual([104, 0])
    expect(layout.rowTop).toEqual([0, 30])
    expect(layout.height).toBe(54)
    expect(cellRect(layout, { r0: 0, c0: 0, r1: 0, c1: 0 })).toEqual({ left: 104, top: 0, width: 96, height: 24 })
    expect(cellRect(layout, { r0: 0, c0: 0, r1: 1, c1: 1 }).width).toBe(200)
    expect(cellRect(layout, { r0: 0, c0: 0, r1: 1, c1: 1 }).height).toBe(54)
  })

  it('keeps a continuous header while retaining body cell gutters', () => {
    const base = createTable({ rows: 3, cols: 3, width: 300, headerRows: 1, cellGapX: 8, cellGapY: 6, headerContinuous: true })
    const layout = layoutTable(base, 300, fixed)
    expect(layout.rowColWidth[0]).toEqual([100, 100, 100])
    expect(layout.rowColLeft[0]).toEqual([200, 100, 0])
    expect(layout.rowColWidth[1].reduce((sum, width) => sum + width, 0)).toBe(284)
    expect(layout.rowColLeft[1][0] - (layout.rowColLeft[1][1] + layout.rowColWidth[1][1])).toBe(8)
    expect(layout.rowTop).toEqual([0, 30, 60])
  })

  it('grows a row to its text but never below its own minimum', () => {
    const t = grid(2, 1)
    const tall = layoutTable(label(t), 100, (cell) => (cell.text === '00' ? 60 : 1))
    expect(tall.rowHeight[0]).toBe(66) // 60 + 2 × 3 of padding
    expect(tall.rowHeight[1]).toBe(24)
    expect(tall.height).toBe(90)
    expect(tall.rowTop).toEqual([0, 66])
  })

  it('gives a merged cell its text height by growing the last row it covers', () => {
    const t = mergeRange(label(grid(3, 1)), { r0: 0, c0: 0, r1: 1, c1: 0 })!
    const out = layoutTable(t, 100, () => 100)
    expect(out.rowHeight[0] + out.rowHeight[1]).toBeGreaterThanOrEqual(106)
    expect(out.rowHeight[0]).toBe(24)
    expect(cellRect(out, regionOf(t, 0, 0)).height).toBe(out.rowHeight[0] + out.rowHeight[1])
  })

  it('measures a column-spanning cell at the width of all its columns', () => {
    const t = mergeRange(label(grid(1, 2)), { r0: 0, c0: 0, r1: 0, c1: 1 })!
    const seen: number[] = []
    layoutTable(t, 200, (_cell, _resolved, width) => { seen.push(width); return 1 })
    expect(seen).toEqual([200 - 2 * t.style.insetX])
  })
})

describe('lines', () => {
  it('draws the outline and the lines between cells, one line per stretch', () => {
    const t = grid(2, 2)
    const lines = tableLines(t, layoutTable(t, 200, fixed))
    expect(lines.filter((l) => l.y1 === l.y2)).toHaveLength(3) // top, middle, bottom
    expect(lines.filter((l) => l.x1 === l.x2)).toHaveLength(3) // both sides and the middle
    expect(lines.filter((l) => l.y1 === l.y2).every((l) => Math.abs(l.x2 - l.x1) === 200)).toBe(true)
  })

  it('leaves out the line a merged cell spans', () => {
    const t = mergeRange(grid(2, 2), { r0: 0, c0: 0, r1: 1, c1: 0 })!
    const lines = tableLines(t, layoutTable(t, 200, fixed))
    const middleHorizontal = lines.filter((l) => l.y1 === l.y2 && l.y1 > 0 && l.y1 < 48)
    expect(middleHorizontal).toHaveLength(1)
    expect(Math.abs(middleHorizontal[0].x2 - middleHorizontal[0].x1)).toBe(100) // only under the unmerged column
  })

  it('hides one cell edge while keeping the rest of the shared row separator', () => {
    const base = grid(2, 2)
    const cells = base.cells.map((row, r) => row.map((cell, c) => r === 0 && c === 0 ? { ...cell, strokes: { bottom: null } } : cell))
    const t = { ...base, cells }
    const horizontal = tableLines(t, layoutTable(t, 200, fixed)).filter((line) => line.y1 === line.y2 && line.y1 === 24)
    expect(horizontal).toHaveLength(1)
    expect(Math.abs(horizontal[0].x2 - horizontal[0].x1)).toBe(100)
  })

  it('draws no lines for strokes that are switched off', () => {
    const t = { ...grid(2, 2), style: { ...grid(2, 2).style, outer: null, rowStroke: null, colStroke: null } }
    expect(tableLines(t, layoutTable(t, 200, fixed))).toEqual([])
  })

  it('alternates row and column separator strokes', () => {
    const base = grid(3, 3)
    const t = { ...base, style: {
      ...base.style,
      rowStroke: { color: '#111111', width: 1 },
      rowStrokeAlternate: { color: '#ff0000', width: 3 },
      colStroke: { color: '#111111', width: 1 },
      colStrokeAlternate: { color: '#0000ff', width: 2 },
    } }
    const lines = tableLines(t, layoutTable(t, 300, fixed))
    const horizontal = lines.filter((line) => line.y1 === line.y2 && line.y1 > 0 && line.y1 < 72)
    const vertical = lines.filter((line) => line.x1 === line.x2 && line.x1 > 0 && line.x1 < 300)
    expect(horizontal.map((line) => [line.width, line.color])).toEqual([[1, '#111111'], [3, '#ff0000']])
    expect(vertical.map((line) => [line.width, line.color])).toEqual([[1, '#111111'], [2, '#0000ff']])
    expect(sanitizeTable(JSON.parse(JSON.stringify(t)))?.style).toMatchObject(t.style)
  })

  it('draws individual cell borders in separated layout and an optional outer outline', () => {
    const base = createTable({ rows: 2, cols: 2, width: 200, cellGapX: 6, cellGapY: 6 })
    const noOuter = { ...base, style: { ...base.style, outer: null } }
    const first = originsOf(noOuter)[0]
    expect(cellSideStroke(noOuter, first, 'top')).toEqual(noOuter.style.rowStroke)
    expect(cellSideStroke(noOuter, first, 'right')).toEqual(noOuter.style.colStroke)
    expect(cellSideStroke(noOuter, originsOf(noOuter)[1], 'right')).toEqual(noOuter.style.colStroke)
    expect(tableLines(noOuter, layoutTable(noOuter, 200, fixed))).toEqual([])
    expect(base.style.outer).not.toBeNull()
    expect(tableLines(base, layoutTable(base, 200, fixed))).toEqual([])
  })

  it('rounds only the outside corners of a continuous header band', () => {
    const table = createTable({ rows: 2, cols: 3, width: 300, headerRows: 1, cellGapX: 8, cellGapY: 8, cellRadius: 6, headerContinuous: true })
    const header = originsOf(table).slice(0, 3).map((cell) => cellCornerRadii(table, cell))
    const body = cellCornerRadii(table, originsOf(table)[3])
    expect(header).toEqual([[0, 6, 6, 0], [0, 0, 0, 0], [6, 0, 0, 6]])
    expect(body).toEqual([6, 6, 6, 6])
  })

  it('draws an internal continuous-header separator on only one adjacent cell', () => {
    const table = createTable({ rows: 2, cols: 2, width: 200, headerRows: 1, cellGapX: 8, headerContinuous: true })
    const header = originsOf(table).slice(0, 2)
    const rightCell = header.find((cell) => cell.c0 === 0)!
    const leftCell = header.find((cell) => cell.c0 === 1)!
    expect(cellSideStroke(table, rightCell, 'left')).toEqual(table.style.colStroke)
    expect(cellSideStroke(table, leftCell, 'right')).toBeNull()
  })
})

describe('moving a column border', () => {
  it('moves width between the two columns beside it and keeps the total', () => {
    const t = grid(1, 3)
    const out = dragColumnBorder(t, 1, 30, 300)
    expect(out.colWidths).toEqual([130, 70, 100])
    expect(out.colWidths.reduce((a, b) => a + b, 0)).toBe(300)
  })

  it('stops before a column gets narrower than the minimum', () => {
    const out = dragColumnBorder(grid(1, 2), 1, 1000, 200)
    expect(out.colWidths[1] / (300 / 200)).toBeCloseTo(12, 5) // 12 points of a 200 point table
  })
})

describe('cell look', () => {
  it('takes the header fill and weight, the stripes, and lets a cell override them', () => {
    const base = { ...grid(4, 1, 1), style: { ...grid(1, 1).style, stripeFill: '#eeeeee' } }
    expect(resolveCell(base, 0, 0)).toMatchObject({ fill: '#e6e6e6', weight: 700 })
    expect(resolveCell(base, 1, 0).fill).toBeNull()
    expect(resolveCell(base, 2, 0).fill).toBe('#eeeeee')
    const painted = patchCells(base, { r0: 2, c0: 0, r1: 2, c1: 0 }, { fill: '#ff0000', align: 'center' })
    expect(resolveCell(painted, 2, 0)).toMatchObject({ fill: '#ff0000', align: 'center' })
    expect(resolveCell(patchCells(painted, { r0: 2, c0: 0, r1: 2, c1: 0 }, { fill: undefined }), 2, 0).fill).toBe('#eeeeee')
  })

  it('alternates body row fills without changing header or footer fills', () => {
    const base = grid(4, 1, 1, 1)
    const styled = { ...base, style: { ...base.style, bodyFill: '#ffffff', stripeFill: '#eeeeee', footerFill: '#dddddd' } }
    expect(resolveCell(styled, 0, 0).fill).toBe('#e6e6e6')
    expect(resolveCell(styled, 1, 0).fill).toBe('#ffffff')
    expect(resolveCell(styled, 2, 0).fill).toBe('#eeeeee')
    expect(resolveCell(styled, 3, 0).fill).toBe('#dddddd')
  })

  it('resolves typography from the table and cell, including an explicit normal style', () => {
    const base = grid(2, 2)
    const styled = { ...base, style: { ...base.style, fontSize: 16, leading: 22, tracking: 12, spaceBefore: 3, spaceAfter: 4, italic: true } }
    expect(resolveCell(styled, 0, 0)).toMatchObject({ fontSize: 16, leading: 22, tracking: 12, spaceBefore: 3, spaceAfter: 4, italic: true })
    const cellStyled = patchCells(styled, { r0: 0, c0: 0, r1: 0, c1: 0 }, { fontSize: 20, leading: 26, italic: false, color: '#123456' })
    expect(resolveCell(cellStyled, 0, 0)).toMatchObject({ fontSize: 20, leading: 26, italic: false, color: '#123456' })
    expect(resolveCell(cellStyled, 1, 0)).toMatchObject({ fontSize: 16, leading: 22, italic: true })
    expect(sanitizeTable(JSON.parse(JSON.stringify(cellStyled)))).toEqual(cellStyled)
  })

  it('preserves cell insets and hidden or custom edge strokes when loading', () => {
    const base = grid(1, 1)
    const t = { ...base, cells: [[{ text: 'x', insetX: 7, insetY: 9, strokes: { top: null, right: { color: '#ff0000', width: 2 } } }]] }
    expect(sanitizeTable(JSON.parse(JSON.stringify(t)))?.cells[0][0]).toEqual(t.cells[0][0])
  })

  it('changes the header and footer counts within the table', () => {
    expect(setHeaderFooter(grid(3, 1), 5, 5)).toMatchObject({ headerRows: 3, footerRows: 0 })
    expect(setHeaderFooter(grid(3, 1, 1), 1, 1)).toMatchObject({ headerRows: 1, footerRows: 1 })
  })
})

describe('reading a table from a file', () => {
  it('gives back a table that was written by the program', () => {
    const t = mergeRange(label(grid(3, 3, 1)), { r0: 1, c0: 0, r1: 2, c1: 1 })!
    expect(sanitizeTable(JSON.parse(JSON.stringify(t)))).toEqual(t)
  })

  it('keeps separated cell gaps when saving and loading', () => {
    const t = createTable({ rows: 3, cols: 4, width: 400, headerRows: 1, cellGapX: 8, cellGapY: 10, cellRadius: 6, headerContinuous: true })
    expect(sanitizeTable(JSON.parse(JSON.stringify(t)))).toEqual(t)
  })

  it('repairs what it cannot trust: ragged rows, bad sizes, spans that run off the grid', () => {
    const out = sanitizeTable({
      cells: [[{ text: 'a', colSpan: 9 }], [{ text: 'b' }, { text: 'c' }, 7]],
      colWidths: [-5, 'x'],
      rowHeights: [null],
      headerRows: 99,
      style: { fontSize: 'big', outer: 5, headerFill: 'red' },
    })!
    expect(tableRows(out)).toBe(2)
    expect(tableCols(out)).toBe(3)
    expect(out.cells[0][0].colSpan).toBe(3)
    expect(out.cells[1].map((c) => c.text)).toEqual(['b', 'c', ''])
    expect(out.colWidths.every((w) => w > 0)).toBe(true)
    expect(out.headerRows).toBe(2)
    expect(out.style.fontSize).toBe(12)
    expect(out.style.headerFill).toBe('#e6e6e6')
  })

  it('rejects something that is not a grid', () => {
    expect(sanitizeTable(null)).toBeNull()
    expect(sanitizeTable({ cells: [] })).toBeNull()
    expect(sanitizeTable({ cells: 'x' })).toBeNull()
  })
})

describe('a table shape in a file', () => {
  const contentWith = async (shape: object) => {
    const { defaultDocSettings, DEFAULT_PARAGRAPH_STYLES } = await import('./document')
    return { doc: defaultDocSettings('x'), frames: [], images: [], assets: {}, guides: [], shapes: [shape], paragraphStyles: DEFAULT_PARAGRAPH_STYLES, parents: [], pageParents: [], sections: [] } as never
  }

  it('survives saving and opening, keeping every cell and merge', async () => {
    const { parseDocument, serializeDocument } = await import('./fileFormat')
    const table = mergeRange(label(grid(3, 3, 1)), { r0: 1, c0: 0, r1: 2, c1: 1 })!
    const shape = { id: 't', kind: 'table', x: 10, y: 20, w: 300, h: 90, table, fill: null, stroke: null, strokeWidth: 0, rotation: 30 }
    const back = parseDocument(serializeDocument(await contentWith(shape)), 'x').shapes[0]
    expect(back).toMatchObject({ kind: 'table', x: 10, y: 20, w: 300, fill: null, stroke: null })
    expect(back.table).toEqual(table)
    expect(back.rotation).toBeUndefined() // a table is never turned
  })

  it('opens a table that is not a grid as a plain rectangle', async () => {
    const { parseDocument, serializeDocument } = await import('./fileFormat')
    const file = JSON.parse(serializeDocument(await contentWith({ id: 't', kind: 'table', x: 0, y: 0, w: 100, h: 50, table: grid(1, 1), fill: null, stroke: null, strokeWidth: 0 })))
    file.shapes[0].table = { cells: 'nope' }
    expect(parseDocument(JSON.stringify(file), 'x').shapes[0].kind).toBe('rect')
  })
})
