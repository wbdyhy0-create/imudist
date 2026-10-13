import { ownerGrid, tableCols, tableRows, type CellRange, type TableCell, type TableData } from './table'
import { parseCellNumber, recalcTable, shiftFormula } from './tableFormulas'

/**
 * Sorting the rows of a table by one or more columns (text or numbers, up and down, in the rules of a language). Header and footer
 * rows stay where they are. The rows are moved with everything they carry (text, look, formula); a formula that names cells of
 * the rows that were sorted is moved with its row, as a copied one would be. Pure data, no browser.
 */

export interface SortKey {
  /** the column, in reading order */
  col: number
  type: 'text' | 'number'
  descending: boolean
}

/** the whole body of the table, only one column of it, or only the cells that are selected */
export type SortScope = 'table' | 'column' | 'selection'

export interface SortOptions {
  keys: SortKey[]
  scope: SortScope
  /** scope 'selection': the cells selected */
  selection?: CellRange
  /** scope 'column': the one column that is sorted (the first key's, when missing) */
  column?: number
  /** the language whose rules of order are used ("he", "en"...) */
  locale?: string
  caseSensitive?: boolean
}

export type SortOutcome = { ok: true; table: TableData } | { ok: false; reason: 'merged' | 'nothing' }

export const SORT_LOCALES: { id: string; label: string }[] = [
  { id: 'he', label: 'עברית' },
  { id: 'en', label: 'אנגלית' },
  { id: 'ar', label: 'ערבית' },
  { id: 'ru', label: 'רוסית' },
  { id: 'fr', label: 'צרפתית' },
  { id: 'de', label: 'גרמנית' },
]

const clean = (text: string) => text.replace(/[‎‏‪-‮⁦-⁩]/g, '').trim()

/** the rows and columns a sort moves, or null when there is nothing to sort */
function areaOf(t: TableData, options: SortOptions): { rows: number[]; cols: number[] } | null {
  const total = tableRows(t)
  const first = t.headerRows
  const last = total - t.footerRows - 1
  if (last < first) return null
  const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i)
  if (options.scope === 'table') return { rows: range(first, last), cols: range(0, tableCols(t) - 1) }
  if (options.scope === 'column') {
    const col = options.column ?? options.keys[0]?.col ?? 0
    return col >= 0 && col < tableCols(t) ? { rows: range(first, last), cols: [col] } : null
  }
  const selection = options.selection
  if (!selection) return null
  const rows = range(Math.max(first, selection.r0), Math.min(last, selection.r1))
  const cols = range(Math.max(0, selection.c0), Math.min(tableCols(t) - 1, selection.c1))
  return rows.length && cols.length ? { rows, cols } : null
}

export function sortTable(t: TableData, options: SortOptions): SortOutcome {
  const area = areaOf(t, options)
  if (!area || area.rows.length < 2) return { ok: false, reason: 'nothing' }
  const { rows, cols } = area
  // a merged cell cannot be moved by itself: nothing in the area may be merged, and no merged cell may reach into it
  const owner = ownerGrid(t)
  for (const r of rows) {
    for (const c of cols) {
      const [or, oc] = owner[r][c]
      const cell = t.cells[r][c]
      if (or !== r || oc !== c || (cell.rowSpan ?? 1) > 1 || (cell.colSpan ?? 1) > 1) return { ok: false, reason: 'merged' }
    }
  }
  const keys = options.keys.filter((key) => cols.includes(key.col))
  if (keys.length === 0) return { ok: false, reason: 'nothing' }

  const collator = new Intl.Collator(options.locale || 'he', { sensitivity: options.caseSensitive ? 'variant' : 'accent', usage: 'sort' })
  const keyText = (r: number, key: SortKey) => clean(t.cells[r][key.col].text)
  const order = rows.map((_, i) => i)
  order.sort((x, y) => {
    for (const key of keys) {
      const a = keyText(rows[x], key)
      const b = keyText(rows[y], key)
      // empty cells go last in either direction
      if (a === '' || b === '') {
        if (a === b) continue
        return a === '' ? 1 : -1
      }
      let compared: number
      if (key.type === 'number') {
        const na = parseCellNumber(a)
        const nb = parseCellNumber(b)
        if (na === null || nb === null) {
          if (na === nb) compared = collator.compare(a, b)
          else return na === null ? 1 : -1 // words after numbers
        } else compared = na - nb
      } else compared = collator.compare(a, b)
      if (compared !== 0) return key.descending ? -compared : compared
    }
    return x - y // equal: they stay in the order they were in
  })
  if (order.every((from, to) => from === to)) return { ok: true, table: t }

  const cells = t.cells.map((row) => row.slice())
  const wholeRows = cols.length === tableCols(t)
  const rowHeights = wholeRows ? t.rowHeights.slice() : t.rowHeights
  order.forEach((from, to) => {
    const sourceRow = rows[from]
    const targetRow = rows[to]
    const delta = targetRow - sourceRow
    for (const c of cols) {
      const cell: TableCell = t.cells[sourceRow][c]
      cells[targetRow][c] = cell.formula !== undefined && delta !== 0
        ? { ...cell, formula: shiftFormula(cell.formula, { axis: 'row', kind: 'move', from: rows[0], to: rows[rows.length - 1], delta }) }
        : cell
    }
    if (wholeRows) rowHeights[targetRow] = t.rowHeights[sourceRow]
  })
  return { ok: true, table: recalcTable({ ...t, cells, rowHeights }) }
}
