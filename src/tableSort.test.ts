import { describe, expect, it } from 'vitest'
import { createTable, mergeRange, type TableData } from './table'
import { setCellFormula } from './tableFormulas'
import { sortTable, type SortOptions } from './tableSort'

const grid = (rows: string[][], extra: { headerRows?: number; footerRows?: number } = {}): TableData => {
  const t = createTable({ rows: rows.length, cols: rows[0].length, width: 400, ...extra })
  return { ...t, cells: t.cells.map((row, r) => row.map((cell, c) => ({ ...cell, text: rows[r][c] }))) }
}
const column = (t: TableData, c: number) => t.cells.map((row) => row[c].text)
const sorted = (t: TableData, options: SortOptions): TableData => {
  const out = sortTable(t, options)
  if (!out.ok) throw new Error(out.reason)
  return out.table
}

describe('sorting a table', () => {
  const people = grid([
    ['שם', 'גיל'],
    ['דני', '30'],
    ['אבי', '9'],
    ['רותי', '100'],
    ['', '5'],
    ['סה״כ', ''],
  ], { headerRows: 1, footerRows: 1 })

  it('puts the text in the order of the language, the header and the footer staying where they are', () => {
    const out = sorted(people, { scope: 'table', keys: [{ col: 0, type: 'text', descending: false }] })
    expect(column(out, 0)).toEqual(['שם', 'אבי', 'דני', 'רותי', '', 'סה״כ'])
    expect(column(out, 1)).toEqual(['גיל', '9', '30', '100', '5', '']) // the rows move whole
  })

  it('sorts numbers as numbers and not as text, either way', () => {
    const asText = sorted(people, { scope: 'table', keys: [{ col: 1, type: 'text', descending: false }] })
    expect(column(asText, 1)).toEqual(['גיל', '100', '30', '5', '9', ''])
    const up = sorted(people, { scope: 'table', keys: [{ col: 1, type: 'number', descending: false }] })
    expect(column(up, 1)).toEqual(['גיל', '5', '9', '30', '100', ''])
    const down = sorted(people, { scope: 'table', keys: [{ col: 1, type: 'number', descending: true }] })
    expect(column(down, 1)).toEqual(['גיל', '100', '30', '9', '5', ''])
    expect(column(down, 0)).toEqual(['שם', 'רותי', 'דני', 'אבי', '', 'סה״כ'])
  })

  it('puts empty cells and words after the numbers, whichever way it sorts', () => {
    const t = grid([['5'], ['x'], [''], ['2'], ['abc']])
    expect(column(sorted(t, { scope: 'table', keys: [{ col: 0, type: 'number', descending: false }] }), 0)).toEqual(['2', '5', 'abc', 'x', ''])
    expect(column(sorted(t, { scope: 'table', keys: [{ col: 0, type: 'number', descending: true }] }), 0)).toEqual(['5', '2', 'x', 'abc', ''])
  })

  it('goes on to the second column when the first is equal, and keeps equal rows in their order', () => {
    const t = grid([['b', '2', 'first'], ['a', '2', 'second'], ['b', '1', 'third'], ['a', '2', 'fourth']])
    const out = sorted(t, { scope: 'table', keys: [{ col: 0, type: 'text', descending: false }, { col: 1, type: 'number', descending: true }] })
    expect(column(out, 2)).toEqual(['second', 'fourth', 'first', 'third'])
  })

  it('can be told to care about case, and uses the rules of the language', () => {
    const t = grid([['b'], ['A'], ['a'], ['B']])
    const insensitive = sorted(t, { scope: 'table', keys: [{ col: 0, type: 'text', descending: false }], locale: 'en' })
    expect(column(insensitive, 0)).toEqual(['A', 'a', 'b', 'B']) // equal letters stay as they were
    const sensitive = sorted(t, { scope: 'table', keys: [{ col: 0, type: 'text', descending: false }], locale: 'en', caseSensitive: true })
    expect(column(sensitive, 0)).toEqual(['a', 'A', 'b', 'B'])
  })

  it('sorts only a column, leaving the other cells of the rows where they were', () => {
    const out = sorted(people, { scope: 'column', column: 1, keys: [{ col: 1, type: 'number', descending: false }] })
    expect(column(out, 1)).toEqual(['גיל', '5', '9', '30', '100', ''])
    expect(column(out, 0)).toEqual(['שם', 'דני', 'אבי', 'רותי', '', 'סה״כ'])
  })

  it('sorts only the cells that are selected', () => {
    const t = grid([['d', '1'], ['c', '2'], ['b', '3'], ['a', '4']])
    const out = sorted(t, { scope: 'selection', selection: { r0: 0, c0: 0, r1: 2, c1: 1 }, keys: [{ col: 0, type: 'text', descending: false }] })
    expect(column(out, 0)).toEqual(['b', 'c', 'd', 'a'])
    expect(column(out, 1)).toEqual(['3', '2', '1', '4'])
  })

  it('does not sort a table with merged cells in the way', () => {
    const t = mergeRange(grid([['a', 'x'], ['b', 'y'], ['c', 'z']]), { r0: 0, c0: 0, r1: 1, c1: 0 })!
    expect(sortTable(t, { scope: 'table', keys: [{ col: 1, type: 'text', descending: true }] })).toEqual({ ok: false, reason: 'merged' })
  })

  it('says when there is nothing to sort', () => {
    expect(sortTable(grid([['a']]), { scope: 'table', keys: [{ col: 0, type: 'text', descending: false }] })).toEqual({ ok: false, reason: 'nothing' })
    expect(sortTable(people, { scope: 'table', keys: [] })).toEqual({ ok: false, reason: 'nothing' })
    const onlyHeader = grid([['h'], ['x']], { headerRows: 1 })
    expect(sortTable(onlyHeader, { scope: 'table', keys: [{ col: 0, type: 'text', descending: false }] })).toEqual({ ok: false, reason: 'nothing' })
  })

  it('returns the same table when the rows are already in order', () => {
    const t = grid([['a'], ['b'], ['c']])
    expect(sorted(t, { scope: 'table', keys: [{ col: 0, type: 'text', descending: false }] })).toBe(t)
  })

  it('moves the formulas with their rows, still naming the cells of their own row', () => {
    let t = grid([['3', ''], ['1', ''], ['2', '']])
    for (const r of [0, 1, 2]) {
      const out = setCellFormula(t, r, 1, `=A${r + 1}*10`)
      if (!out.ok) throw new Error(out.problem)
      t = out.table
    }
    expect(column(t, 1)).toEqual(['30', '10', '20'])
    const out = sorted(t, { scope: 'table', keys: [{ col: 0, type: 'number', descending: false }] })
    expect(column(out, 0)).toEqual(['1', '2', '3'])
    expect(column(out, 1)).toEqual(['10', '20', '30']) // each result belongs to its own row
    expect(out.cells[0][1].formula).toBe('=A1*10')
  })

  it('does not change the table it was given', () => {
    const before = JSON.stringify(people)
    sorted(people, { scope: 'table', keys: [{ col: 0, type: 'text', descending: true }] })
    expect(JSON.stringify(people)).toBe(before)
  })
})
