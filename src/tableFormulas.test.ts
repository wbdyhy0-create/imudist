import { describe, expect, it } from 'vitest'
import { createTable, sanitizeTable, setCellText, tableCols, tableRows, type TableData } from './table'
import {
  cellName,
  clearCellFormula,
  columnLabel,
  deleteColsKeepingFormulas,
  deleteRowsKeepingFormulas,
  formatNumber,
  formulaProblem,
  insertColsKeepingFormulas,
  insertRowsKeepingFormulas,
  parseCellNumber,
  recalcTable,
  setCellFormula,
  shiftFormula,
  withoutFormulas,
} from './tableFormulas'

/** a table with the given text in its cells (rows of equal length) */
const grid = (rows: string[][], extra: { headerRows?: number; footerRows?: number } = {}): TableData => {
  const t = createTable({ rows: rows.length, cols: rows[0].length, width: 400, ...extra })
  return { ...t, cells: t.cells.map((row, r) => row.map((cell, c) => ({ ...cell, text: rows[r][c] }))) }
}
const formula = (t: TableData, r: number, c: number, source: string, format?: Parameters<typeof setCellFormula>[4]): TableData => {
  const out = setCellFormula(t, r, c, source, format)
  if (!out.ok) throw new Error(out.problem)
  return out.table
}
const text = (t: TableData, r: number, c: number) => t.cells[r][c].text

describe('names of cells', () => {
  it('count columns as letters', () => {
    expect([0, 1, 25, 26, 27, 39].map(columnLabel)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AN'])
    expect(cellName(0, 0)).toBe('A1')
    expect(cellName(4, 2)).toBe('C5')
  })
})

describe('numbers in cells', () => {
  it('are read in the usual ways', () => {
    expect(parseCellNumber('12')).toBe(12)
    expect(parseCellNumber(' 1,234.50 ')).toBe(1234.5)
    expect(parseCellNumber('1.234,50')).toBe(1234.5)
    expect(parseCellNumber('12,5')).toBe(12.5)
    expect(parseCellNumber('0,125')).toBe(0.125)
    expect(parseCellNumber('1,234')).toBe(1234)
    expect(parseCellNumber('1,234,567')).toBe(1234567)
    expect(parseCellNumber('-3')).toBe(-3)
    expect(parseCellNumber('−3')).toBe(-3)
    expect(parseCellNumber('(7)')).toBe(-7)
    expect(parseCellNumber('₪ 45')).toBe(45)
    expect(parseCellNumber('45%')).toBe(45)
    expect(parseCellNumber('‏15‏')).toBe(15)
  })

  it('are not found in words or in nothing', () => {
    for (const none of ['', '  ', 'abc', 'שלום', '12 kg', '1-2', '.', '-']) expect(parseCellNumber(none), none).toBeNull()
  })

  it('are written with the format the formula asks for', () => {
    expect(formatNumber(3)).toBe('3')
    expect(formatNumber(0.1 + 0.2)).toBe('0.3')
    expect(formatNumber(2.5, { decimals: 2 })).toBe('2.50')
    expect(formatNumber(1234567.891, { decimals: 1, thousands: true })).toBe('1,234,567.9')
    expect(formatNumber(-1234.5, { thousands: true })).toBe('-1,234.5')
    expect(formatNumber(50, { suffix: '%' })).toBe('50%')
    expect(formatNumber(12, { prefix: '₪', decimals: 0 })).toBe('₪12')
    expect(formatNumber(0.0000001)).toBe('0.0000001')
  })
})

describe('a formula in a cell', () => {
  const sales = grid([['3', '4', ''], ['10', '20', ''], ['x', '', '']])

  it('adds, subtracts, multiplies and divides, with brackets and a power', () => {
    expect(text(formula(sales, 0, 2, '=A1+B1'), 0, 2)).toBe('7')
    expect(text(formula(sales, 0, 2, '=(B2-A2)*2'), 0, 2)).toBe('20')
    expect(text(formula(sales, 0, 2, '=B2/A2'), 0, 2)).toBe('2')
    expect(text(formula(sales, 0, 2, '=A1^2+1'), 0, 2)).toBe('10')
    expect(text(formula(sales, 0, 2, '=-A1+B1'), 0, 2)).toBe('1')
    expect(text(formula(sales, 0, 2, '= 2 + 3 * 4 '), 0, 2)).toBe('14')
    expect(text(formula(sales, 0, 2, '=A1*50%'), 0, 2)).toBe('1.5')
  })

  it('works on ranges with the functions', () => {
    expect(text(formula(sales, 0, 2, '=SUM(A1:B2)'), 0, 2)).toBe('37')
    expect(text(formula(sales, 0, 2, '=AVERAGE(A1:B2)'), 0, 2)).toBe('9.25')
    expect(text(formula(sales, 0, 2, '=MIN(A1:B2)'), 0, 2)).toBe('3')
    expect(text(formula(sales, 0, 2, '=MAX(A1:B2)'), 0, 2)).toBe('20')
    expect(text(formula(sales, 0, 2, '=COUNT(A1:B3)'), 0, 2)).toBe('4') // the word and the empty cells are not numbers
    expect(text(formula(sales, 0, 2, '=PRODUCT(A1,B1)'), 0, 2)).toBe('12')
    expect(text(formula(sales, 0, 2, '=SUM(A1:A3)'), 0, 2)).toBe('13') // a word in the range is skipped
    expect(text(formula(sales, 0, 2, '=ABS(-2.5)'), 0, 2)).toBe('2.5')
    expect(text(formula(sales, 0, 2, '=INT(8.9)'), 0, 2)).toBe('8')
    expect(text(formula(sales, 0, 2, '=INT(-8.1)'), 0, 2)).toBe('-9')
    expect(text(formula(sales, 0, 2, '=ROUND(8.35,1)'), 0, 2)).toBe('8.4')
    expect(text(formula(sales, 0, 2, '=ROUND(2.5)'), 0, 2)).toBe('3')
    expect(text(formula(sales, 0, 2, '=SUM(A1:A2, B1:B2, 100)'), 0, 2)).toBe('137')
  })

  it('knows the functions by their Hebrew names and with lower case, and the semicolon as a separator', () => {
    expect(text(formula(sales, 0, 2, '=סכום(A1:B1)'), 0, 2)).toBe('7')
    expect(text(formula(sales, 0, 2, '=sum(a1:b1)'), 0, 2)).toBe('7')
    expect(text(formula(sales, 0, 2, '=עיגול(8.35;1)'), 0, 2)).toBe('8.4')
    expect(text(formula(sales, 0, 2, '=ממוצע(A1;B1)'), 0, 2)).toBe('3.5')
  })

  it('shows the sign of what cannot be worked out', () => {
    expect(text(formula(sales, 0, 2, '=A1/0'), 0, 2)).toBe('#חילוק')
    expect(text(formula(sales, 0, 2, '=A3+1'), 0, 2)).toBe('#ערך') // a word is not a number
    expect(text(formula(sales, 0, 2, '=AVERAGE(A3:B3)'), 0, 2)).toBe('#חילוק') // nothing to average: a word and an empty cell
    expect(text(formula(sales, 0, 2, '=SUM(A1:A2)+B3'), 0, 2)).toBe('13') // an empty cell is 0 in a calculation
  })

  it('takes the format of the result', () => {
    const t = formula(sales, 0, 2, '=B2/3', { decimals: 2, suffix: ' ₪' })
    expect(text(t, 0, 2)).toBe('6.67 ₪')
    expect(t.cells[0][2].formulaFormat).toEqual({ decimals: 2, suffix: ' ₪' })
  })

  it('refuses what is not a formula, has a bad syntax or names a cell that is not there', () => {
    for (const bad of ['SUM(A1)', '=', '=1+', '=SUM(', '=FOO(1)', '=A1 B1', '=1..2', '=SUM()', '=2 $ 3']) {
      expect(setCellFormula(sales, 0, 2, bad).ok, bad).toBe(false)
    }
    expect(formulaProblem('=A9', sales)).toMatch(/אינו בטבלה/)
    expect(formulaProblem('=SUM(A1:D1)', sales)).toMatch(/אינו בטבלה/)
    expect(formulaProblem('=A1+B1', sales)).toBeNull()
    expect(formulaProblem('=A1+#REF!', sales)).toMatch(/נמחק/)
  })

  it('follow the cells they name when those change, and a formula can name another formula', () => {
    let t = formula(sales, 0, 2, '=A1+B1')
    t = formula(t, 1, 2, '=C1*2')
    expect(text(t, 1, 2)).toBe('14')
    t = recalcTable(setCellText(t, 0, 0, '10'))
    expect(text(t, 0, 2)).toBe('14')
    expect(text(t, 1, 2)).toBe('28')
  })

  it('are put right when two cells name each other', () => {
    let t = formula(sales, 0, 2, '=C2+1')
    t = formula(t, 1, 2, '=C1+1')
    expect(text(t, 0, 2)).toBe('#מעגל')
    expect(text(t, 1, 2)).toBe('#מעגל')
    expect(text(formula(sales, 0, 2, '=C1+1'), 0, 2)).toBe('#מעגל') // a cell that names itself
  })

  it('give way to text typed over their result', () => {
    const t = formula(sales, 0, 2, '=A1+B1')
    const typed = recalcTable(setCellText(t, 0, 2, 'ידני'))
    expect(typed.cells[0][2].formula).toBeUndefined()
    expect(text(typed, 0, 2)).toBe('ידני')
  })

  it('can be taken off, the result staying as text', () => {
    const t = clearCellFormula(formula(sales, 0, 2, '=A1+B1'), 0, 2)
    expect(t.cells[0][2].formula).toBeUndefined()
    expect(text(t, 0, 2)).toBe('7')
    expect(clearCellFormula(t, 0, 2)).toBe(t)
  })

  it('leave a table with none as it is, and a table whose results are right', () => {
    expect(recalcTable(sales)).toBe(sales)
    const t = formula(sales, 0, 2, '=A1+B1')
    expect(recalcTable(t)).toBe(t)
  })

  it('come back from a file, and a formula that is not one is dropped', () => {
    const t = formula(sales, 0, 2, '=A1+B1', { decimals: 1, thousands: true })
    const back = sanitizeTable(JSON.parse(JSON.stringify(t)))!
    expect(back.cells[0][2].formula).toBe('=A1+B1')
    expect(back.cells[0][2].formulaFormat).toEqual({ decimals: 1, thousands: true })
    const raw = JSON.parse(JSON.stringify(t))
    raw.cells[0][2].formula = 'A1+B1'
    raw.cells[1][2].formula = '=' + 'A1+'.repeat(300)
    const cleaned = sanitizeTable(raw)!
    expect(cleaned.cells[0][2].formula).toBeUndefined()
    expect(cleaned.cells[1][2].formula).toBeUndefined()
  })
})

describe('formulas when the table changes its shape', () => {
  const base = () => {
    const t = grid([['1', ''], ['2', ''], ['3', ''], ['', '']])
    return formula(t, 3, 0, '=SUM(A1:A3)')
  }

  it('shift a name when rows come in above it, and a range grows when they come in inside it', () => {
    expect(shiftFormula('=A3+B1', { axis: 'row', kind: 'insert', at: 1, count: 2 })).toBe('=A5+B1')
    expect(shiftFormula('=SUM(A1:A3)', { axis: 'row', kind: 'insert', at: 1, count: 1 })).toBe('=SUM(A1:A4)')
    expect(shiftFormula('=SUM(A1:A3)', { axis: 'row', kind: 'insert', at: 0, count: 1 })).toBe('=SUM(A2:A4)')
    expect(shiftFormula('=A1', { axis: 'col', kind: 'insert', at: 0, count: 1 })).toBe('=B1')
  })

  it('keep summing the same cells after a row is inserted', () => {
    const t = insertRowsKeepingFormulas(base(), 0)
    expect(tableRows(t)).toBe(5)
    expect(t.cells[4][0].formula).toBe('=SUM(A2:A4)')
    expect(text(t, 4, 0)).toBe('6')
    const inside = insertRowsKeepingFormulas(base(), 1)
    expect(inside.cells[4][0].formula).toBe('=SUM(A1:A4)')
    expect(text(inside, 4, 0)).toBe('6')
  })

  it('keep the same cells after a column comes in', () => {
    const t = insertColsKeepingFormulas(base(), 0)
    expect(tableCols(t)).toBe(3)
    expect(t.cells[3][1].formula).toBe('=SUM(B1:B3)')
    expect(text(t, 3, 1)).toBe('6')
  })

  it('shrink a range when rows of it are deleted, and give #REF for a cell that is gone', () => {
    expect(shiftFormula('=SUM(A1:A5)', { axis: 'row', kind: 'delete', from: 1, to: 2 })).toBe('=SUM(A1:A3)')
    expect(shiftFormula('=SUM(A2:A5)', { axis: 'row', kind: 'delete', from: 1, to: 2 })).toBe('=SUM(A2:A3)')
    expect(shiftFormula('=SUM(A1:A3)', { axis: 'row', kind: 'delete', from: 1, to: 5 })).toBe('=SUM(A1:A1)')
    expect(shiftFormula('=A2+A5', { axis: 'row', kind: 'delete', from: 1, to: 1 })).toBe('=#REF!+A4')
    expect(shiftFormula('=SUM(A2:A3)', { axis: 'row', kind: 'delete', from: 1, to: 2 })).toBe('=SUM(#REF!)')
    const t = deleteRowsKeepingFormulas(base(), 1, 1)!
    expect(t.cells[2][0].formula).toBe('=SUM(A1:A2)')
    expect(text(t, 2, 0)).toBe('4')
    expect(text(deleteRowsKeepingFormulas(formula(grid([['1'], ['2'], ['']]), 2, 0, '=A2*2'), 1, 1)!, 1, 0)).toBe('#שגיאה')
  })

  it('follow a column that is deleted', () => {
    const t = deleteColsKeepingFormulas(insertColsKeepingFormulas(base(), 0), 0, 0)!
    expect(t.cells[3][0].formula).toBe('=SUM(A1:A3)')
    expect(text(t, 3, 0)).toBe('6')
  })
})

describe('a calculation table', () => {
  const plain = grid([['1', '2', ''], ['3', '4', '']])

  it('is marked in the file, and an unmarked table stays plain', () => {
    const marked = { ...plain, calculation: true as const }
    expect(sanitizeTable(JSON.parse(JSON.stringify(marked)))!.calculation).toBe(true)
    expect(sanitizeTable(JSON.parse(JSON.stringify(plain)))!.calculation).toBeUndefined()
    expect(sanitizeTable({ ...JSON.parse(JSON.stringify(plain)), calculation: 'yes' })!.calculation).toBeUndefined()
  })

  it('is what a table with formulas from an older file is read as', () => {
    const raw = JSON.parse(JSON.stringify(formula(plain, 0, 2, '=A1+B1')))
    delete raw.calculation
    expect(sanitizeTable(raw)!.calculation).toBe(true)
  })

  it('loses its formulas when it stops being one, the results staying as text', () => {
    const t = formula({ ...plain, calculation: true }, 0, 2, '=A1+B1', { decimals: 1 })
    expect(text(t, 0, 2)).toBe('3.0')
    const stripped = withoutFormulas(t)
    expect(stripped.cells[0][2].formula).toBeUndefined()
    expect(stripped.cells[0][2].formulaFormat).toBeUndefined()
    expect(text(stripped, 0, 2)).toBe('3.0')
    expect(withoutFormulas(plain)).toBe(plain)
  })
})
