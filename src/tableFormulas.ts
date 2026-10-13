import { t } from './i18n'
import { deleteCols, deleteRows, insertCols, insertRows, tableCols, tableRows, type FormulaFormat, type TableCell, type TableData } from './table'

/**
 * Formulas in table cells: "=SUM(A1:A5)", "=(B2-12)*C2" and the like, worked out like a spreadsheet. A cell is named by its column
 * letter and row number in READING order - A1 is the first cell of the first row (for the usual right-to-left table, the rightmost) -
 * and a range by its two ends, "A1:A5". The cell keeps the formula and shows the result as its text; every change of the table writes
 * the results again. Pure data, no browser.
 */

export const ERR_SYNTAX = '#שגיאה'
export const ERR_VALUE = '#ערך'
export const ERR_DIVIDE = '#חילוק'
export const ERR_CYCLE = '#מעגל'
const ERROR_TEXTS = new Set([ERR_SYNTAX, ERR_VALUE, ERR_DIVIDE, ERR_CYCLE])

/** whether a cell's text is the sign of a formula that could not be worked out */
export const isFormulaError = (text: string) => ERROR_TEXTS.has(text)

class FormulaError extends Error {
  code: string
  constructor(code: string) {
    super(code)
    this.code = code
  }
}

// ── names of cells ──

/** 0 -> "A", 25 -> "Z", 26 -> "AA" (up to the 40 columns a table can have) */
export function columnLabel(column: number): string {
  let n = column
  let label = ''
  do {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return label
}

const columnIndex = (letters: string): number => [...letters.toUpperCase()].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1

/** "A1" for the cell at row 0, column 0 */
export const cellName = (row: number, column: number) => `${columnLabel(column)}${row + 1}`

// ── numbers in cells ──

const INVISIBLE = /[‎‏‪-‮⁦-⁩ \s]/g
const MONEY = /[₪$€£]/g

/**
 * The number a cell's text holds, or null when it holds none (empty, or words). "1,234.50", "1.234,50", "12,5", "-3", "(7)" and a
 * leading or trailing currency sign or percent sign are read; a percent is left as it is (20% is 20).
 */
export function parseCellNumber(text: string): number | null {
  let s = text.replace(INVISIBLE, '').replace(MONEY, '').replace(/%$/, '').replace(/−/g, '-')
  if (!s) return null
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  if (s.startsWith('-')) {
    negative = !negative
    s = s.slice(1)
  } else if (s.startsWith('+')) s = s.slice(1)
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null
  const dots = (s.match(/\./g) ?? []).length
  const commas = (s.match(/,/g) ?? []).length
  let normal: string
  if (dots > 0 && commas > 0) {
    // the one that comes last is the decimal point
    const decimal = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ','
    const group = decimal === '.' ? ',' : '.'
    normal = s.split(group).join('').replace(decimal, '.')
  } else if (commas > 0) {
    // "1,234" and "1,234,567" are thousands; "12,5" is a decimal comma
    normal = commas === 1 && !/^[1-9]\d{0,2},\d{3}$/.test(s) ? s.replace(',', '.') : s.split(',').join('')
  } else if (dots > 1) {
    normal = s.split('.').join('')
  } else normal = s
  const value = Number(normal)
  if (!Number.isFinite(value)) return null
  return negative ? -value : value
}

/** a result written for a cell */
export function formatNumber(value: number, format: FormulaFormat = {}): string {
  const clean = Math.abs(value) < 1e-12 ? 0 : value
  let text: string
  if (format.decimals === undefined) text = String(Number(clean.toFixed(10)))
  else text = clean.toFixed(Math.min(10, Math.max(0, Math.round(format.decimals))))
  if (/e/i.test(text)) text = clean.toFixed(10).replace(/\.?0+$/, '')
  if (format.thousands) {
    const negative = text.startsWith('-')
    const [whole, fraction] = (negative ? text.slice(1) : text).split('.')
    text = (negative ? '-' : '') + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction !== undefined ? `.${fraction}` : '')
  }
  return `${format.prefix ?? ''}${text}${format.suffix ?? ''}`
}

// ── reading a formula ──

type Token =
  | { t: 'num'; v: number }
  | { t: 'ref'; r: number; c: number }
  | { t: 'name'; v: string }
  | { t: 'op'; v: string }
  | { t: 'bad' }

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let at = 0
  while (at < source.length) {
    const rest = source.slice(at)
    const space = /^\s+/.exec(rest)
    if (space) {
      at += space[0].length
      continue
    }
    const bad = /^#REF!?/i.exec(rest)
    if (bad) {
      tokens.push({ t: 'bad' })
      at += bad[0].length
      continue
    }
    const num = /^(\d+(\.\d+)?|\.\d+)/.exec(rest)
    if (num) {
      tokens.push({ t: 'num', v: Number(num[0]) })
      at += num[0].length
      continue
    }
    const ref = /^([A-Za-z]{1,2})(\d+)(?![\p{L}\d(])/u.exec(rest)
    if (ref) {
      tokens.push({ t: 'ref', r: Number(ref[2]) - 1, c: columnIndex(ref[1]) })
      at += ref[0].length
      continue
    }
    const name = /^[\p{L}_][\p{L}\d_.]*/u.exec(rest)
    if (name) {
      tokens.push({ t: 'name', v: name[0] })
      at += name[0].length
      continue
    }
    const op = /^[-+*/^(),;:%]/.exec(rest)
    if (op) {
      tokens.push({ t: 'op', v: op[0] === ';' ? ',' : op[0] })
      at += 1
      continue
    }
    throw new FormulaError(ERR_SYNTAX)
  }
  return tokens
}

type Node =
  | { k: 'num'; v: number }
  | { k: 'ref'; r: number; c: number }
  | { k: 'range'; r0: number; c0: number; r1: number; c1: number }
  | { k: 'neg'; a: Node }
  | { k: 'pct'; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'call'; name: string; args: Node[] }
  | { k: 'bad' }

const FUNCTIONS: Record<string, string> = {
  SUM: 'SUM', 'סכום': 'SUM',
  AVERAGE: 'AVERAGE', AVG: 'AVERAGE', 'ממוצע': 'AVERAGE',
  MIN: 'MIN', 'מינימום': 'MIN',
  MAX: 'MAX', 'מקסימום': 'MAX',
  COUNT: 'COUNT', 'ספירה': 'COUNT',
  PRODUCT: 'PRODUCT', 'מכפלה': 'PRODUCT',
  ABS: 'ABS', 'מוחלט': 'ABS',
  INT: 'INT', 'שלם': 'INT',
  ROUND: 'ROUND', 'עיגול': 'ROUND',
}

/** the functions a formula can use, as the formula dialog offers them (name and a sample of its arguments) */
export const FORMULA_FUNCTIONS: { name: string; sample: string; label: string }[] = [
  { name: 'SUM', sample: 'SUM(A1:A5)', get label() { return t('סכום') } },
  { name: 'AVERAGE', sample: 'AVERAGE(A1:A5)', get label() { return t('ממוצע') } },
  { name: 'MIN', sample: 'MIN(A1:A5)', get label() { return t('הקטן ביותר') } },
  { name: 'MAX', sample: 'MAX(A1:A5)', get label() { return t('הגדול ביותר') } },
  { name: 'COUNT', sample: 'COUNT(A1:A5)', get label() { return t('כמה מספרים') } },
  { name: 'PRODUCT', sample: 'PRODUCT(A1:A5)', get label() { return t('מכפלה') } },
  { name: 'ABS', sample: 'ABS(A1)', get label() { return t('ערך מוחלט') } },
  { name: 'INT', sample: 'INT(A1)', get label() { return t('עיגול כלפי מטה למספר שלם') } },
  { name: 'ROUND', sample: 'ROUND(A1,2)', get label() { return t('עיגול למספר ספרות') } },
]

const MAX_DEPTH = 40

function parse(source: string): Node {
  const tokens = tokenize(source)
  let at = 0
  const peek = () => tokens[at]
  const isOp = (v: string) => peek()?.t === 'op' && (peek() as { v: string }).v === v
  const eat = (v: string) => {
    if (!isOp(v)) throw new FormulaError(ERR_SYNTAX)
    at++
  }
  const expression = (depth: number): Node => {
    if (depth > MAX_DEPTH) throw new FormulaError(ERR_SYNTAX)
    let left = term(depth)
    while (isOp('+') || isOp('-')) {
      const op = (tokens[at++] as { v: string }).v
      left = { k: 'bin', op, a: left, b: term(depth) }
    }
    return left
  }
  const term = (depth: number): Node => {
    let left = power(depth)
    while (isOp('*') || isOp('/')) {
      const op = (tokens[at++] as { v: string }).v
      left = { k: 'bin', op, a: left, b: power(depth) }
    }
    return left
  }
  const power = (depth: number): Node => {
    const base = unary(depth)
    if (isOp('^')) {
      at++
      return { k: 'bin', op: '^', a: base, b: power(depth + 1) }
    }
    return base
  }
  const unary = (depth: number): Node => {
    if (isOp('-')) {
      at++
      return { k: 'neg', a: unary(depth + 1) }
    }
    if (isOp('+')) {
      at++
      return unary(depth + 1)
    }
    let node = primary(depth)
    while (isOp('%')) {
      at++
      node = { k: 'pct', a: node }
    }
    return node
  }
  const primary = (depth: number): Node => {
    const token = tokens[at++]
    if (!token) throw new FormulaError(ERR_SYNTAX)
    if (token.t === 'num') return { k: 'num', v: token.v }
    if (token.t === 'bad') return { k: 'bad' }
    if (token.t === 'ref') {
      if (isOp(':')) {
        at++
        const end = tokens[at++]
        if (!end || end.t !== 'ref') throw new FormulaError(ERR_SYNTAX)
        return { k: 'range', r0: Math.min(token.r, end.r), c0: Math.min(token.c, end.c), r1: Math.max(token.r, end.r), c1: Math.max(token.c, end.c) }
      }
      return { k: 'ref', r: token.r, c: token.c }
    }
    if (token.t === 'name') {
      const name = FUNCTIONS[token.v.toUpperCase()] ?? FUNCTIONS[token.v]
      if (!name || !isOp('(')) throw new FormulaError(ERR_SYNTAX)
      at++
      const args: Node[] = []
      if (!isOp(')')) {
        for (;;) {
          args.push(expression(depth + 1))
          if (isOp(',')) {
            at++
            continue
          }
          break
        }
      }
      eat(')')
      if (args.length === 0) throw new FormulaError(ERR_SYNTAX)
      return { k: 'call', name, args }
    }
    if (token.t === 'op' && token.v === '(') {
      const inner = expression(depth + 1)
      eat(')')
      return inner
    }
    throw new FormulaError(ERR_SYNTAX)
  }
  const result = expression(0)
  if (at < tokens.length) throw new FormulaError(ERR_SYNTAX)
  return result
}

/** the formula without its "=" and with the spaces at its ends taken off; null when it does not start with "=" or is empty */
const bodyOf = (source: string): string | null => {
  const trimmed = source.trim()
  if (!trimmed.startsWith('=')) return null
  const body = trimmed.slice(1).trim()
  return body ? body : null
}

/** what is wrong with a formula as written, or null when it can be worked out (cells outside `table` are named when it is given) */
export function formulaProblem(source: string, table?: Pick<TableData, 'cells'>): string | null {
  const body = bodyOf(source)
  if (body === null) return 'נוסחה מתחילה בסימן = ואחריו חישוב'
  let tree: Node
  try {
    tree = parse(body)
  } catch {
    return 'התחביר של הנוסחה אינו תקין'
  }
  let outside = false
  let bad = false
  const walk = (node: Node): void => {
    if (node.k === 'bad') bad = true
    else if (node.k === 'ref' && table && (node.r >= table.cells.length || node.c >= (table.cells[0]?.length ?? 0))) outside = true
    else if (node.k === 'range' && table && (node.r1 >= table.cells.length || node.c1 >= (table.cells[0]?.length ?? 0))) outside = true
    else if (node.k === 'neg' || node.k === 'pct') walk(node.a)
    else if (node.k === 'bin') {
      walk(node.a)
      walk(node.b)
    } else if (node.k === 'call') node.args.forEach(walk)
  }
  walk(tree)
  if (bad) return 'הנוסחה מפנה לתא שנמחק'
  if (outside) return 'הנוסחה מפנה לתא שאינו בטבלה'
  return null
}

// ── working it out ──

/** the value of every formula cell of a table, by `row,column` (results are text: a number written, or the sign of an error) */
function evaluateTable(t: TableData): Map<string, { value: number } | { error: string }> {
  const rows = tableRows(t)
  const cols = tableCols(t)
  const done = new Map<string, { value: number } | { error: string }>()
  const working = new Set<string>()
  const trees = new Map<string, Node | FormulaError>()

  const treeOf = (key: string, formula: string): Node => {
    let tree = trees.get(key)
    if (!tree) {
      const body = bodyOf(formula)
      try {
        tree = body === null ? new FormulaError(ERR_SYNTAX) : parse(body)
      } catch (problem) {
        tree = problem instanceof FormulaError ? problem : new FormulaError(ERR_SYNTAX)
      }
      trees.set(key, tree)
    }
    if (tree instanceof FormulaError) throw tree
    return tree
  }

  /** the number a cell holds: null for an empty one or one with words in it */
  const numberAt = (r: number, c: number): number | null => {
    if (r < 0 || c < 0 || r >= rows || c >= cols) throw new FormulaError(ERR_SYNTAX)
    const cell = t.cells[r][c]
    if (cell.formula !== undefined) {
      const result = valueOf(r, c)
      if ('error' in result) throw new FormulaError(result.error)
      return result.value
    }
    return parseCellNumber(cell.text)
  }

  const evaluate = (node: Node): number => {
    switch (node.k) {
      case 'num':
        return node.v
      case 'bad':
        throw new FormulaError(ERR_SYNTAX)
      case 'ref': {
        const value = numberAt(node.r, node.c)
        if (value === null) {
          if (t.cells[node.r][node.c].text.replace(INVISIBLE, '') === '') return 0
          throw new FormulaError(ERR_VALUE)
        }
        return value
      }
      case 'range':
        throw new FormulaError(ERR_VALUE)
      case 'neg':
        return -evaluate(node.a)
      case 'pct':
        return evaluate(node.a) / 100
      case 'bin': {
        const a = evaluate(node.a)
        const b = evaluate(node.b)
        if (node.op === '+') return a + b
        if (node.op === '-') return a - b
        if (node.op === '*') return a * b
        if (node.op === '^') {
          const power = a ** b
          if (!Number.isFinite(power)) throw new FormulaError(ERR_VALUE)
          return power
        }
        if (b === 0) throw new FormulaError(ERR_DIVIDE)
        return a / b
      }
      case 'call':
        return call(node.name, node.args)
    }
  }

  /** the numbers an aggregate function's arguments stand for: a range or a cell gives its numbers, a calculation gives its result */
  const numbersOf = (args: Node[]): number[] => {
    const out: number[] = []
    for (const arg of args) {
      if (arg.k === 'range') {
        if (arg.r1 >= rows || arg.c1 >= cols) throw new FormulaError(ERR_SYNTAX)
        for (let r = arg.r0; r <= arg.r1; r++) {
          for (let c = arg.c0; c <= arg.c1; c++) {
            const value = numberAt(r, c)
            if (value !== null) out.push(value)
          }
        }
      } else if (arg.k === 'ref') {
        const value = numberAt(arg.r, arg.c)
        if (value !== null) out.push(value)
      } else out.push(evaluate(arg))
    }
    return out
  }

  const call = (name: string, args: Node[]): number => {
    if (name === 'ABS' || name === 'INT') {
      if (args.length !== 1) throw new FormulaError(ERR_SYNTAX)
      const value = evaluate(args[0])
      return name === 'ABS' ? Math.abs(value) : Math.floor(value)
    }
    if (name === 'ROUND') {
      if (args.length < 1 || args.length > 2) throw new FormulaError(ERR_SYNTAX)
      const value = evaluate(args[0])
      const digits = args[1] ? Math.round(evaluate(args[1])) : 0
      const factor = 10 ** Math.min(10, Math.max(-10, digits))
      return (Math.sign(value) * Math.round(Math.abs(value) * factor + 1e-9)) / factor
    }
    if (args.length === 0) throw new FormulaError(ERR_SYNTAX)
    const numbers = numbersOf(args)
    if (name === 'COUNT') return numbers.length
    if (name === 'SUM') return numbers.reduce((sum, n) => sum + n, 0)
    if (name === 'PRODUCT') return numbers.length ? numbers.reduce((product, n) => product * n, 1) : 0
    if (numbers.length === 0) {
      if (name === 'AVERAGE') throw new FormulaError(ERR_DIVIDE)
      return 0
    }
    if (name === 'AVERAGE') return numbers.reduce((sum, n) => sum + n, 0) / numbers.length
    if (name === 'MIN') return Math.min(...numbers)
    return Math.max(...numbers)
  }

  const valueOf = (r: number, c: number): { value: number } | { error: string } => {
    const key = `${r},${c}`
    const known = done.get(key)
    if (known) return known
    if (working.has(key)) return { error: ERR_CYCLE }
    working.add(key)
    let result: { value: number } | { error: string }
    try {
      const formula = t.cells[r][c].formula
      result = { value: evaluate(treeOf(key, formula ?? '')) }
      if (!Number.isFinite((result as { value: number }).value)) result = { error: ERR_VALUE }
    } catch (problem) {
      result = { error: problem instanceof FormulaError ? problem.code : ERR_SYNTAX }
    }
    working.delete(key)
    done.set(key, result)
    return result
  }

  // a cell that is part of a cycle gives the sign of one wherever the walk began
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (t.cells[r][c].formula !== undefined) valueOf(r, c)
  return done
}

/** the table with the text of every formula cell worked out again; the same table when nothing changes */
export function recalcTable(t: TableData): TableData {
  if (!t.cells.some((row) => row.some((cell) => cell.formula !== undefined))) return t
  const results = evaluateTable(t)
  let changed = false
  const cells = t.cells.map((row, r) => row.map((cell, c) => {
    if (cell.formula === undefined) return cell
    const result = results.get(`${r},${c}`)
    const text = !result ? ERR_SYNTAX : 'error' in result ? result.error : formatNumber(result.value, cell.formulaFormat)
    if (text === cell.text) return cell
    changed = true
    return { ...cell, text }
  }))
  return changed ? { ...t, cells } : t
}

// ── putting a formula in a cell, and taking it out ──

export type FormulaOutcome = { ok: true; table: TableData } | { ok: false; problem: string }

/** a formula in the cell at (r, c) (the cell a merged one starts at), its result written at once */
export function setCellFormula(t: TableData, r: number, c: number, source: string, format?: FormulaFormat): FormulaOutcome {
  const problem = formulaProblem(source, t)
  if (problem) return { ok: false, problem }
  const body = bodyOf(source)!
  const cell = t.cells[r]?.[c]
  if (!cell) return { ok: false, problem: 'התא אינו בטבלה' }
  const next: TableCell = { ...cell, formula: `=${body}` }
  if (format && Object.keys(format).length) next.formulaFormat = format
  else delete next.formulaFormat
  const table = { ...t, cells: t.cells.map((row, i) => (i === r ? row.map((old, j) => (j === c ? next : old)) : row)) }
  return { ok: true, table: recalcTable(table) }
}

/** the formula taken off the cell, its result staying as plain text */
export function clearCellFormula(t: TableData, r: number, c: number): TableData {
  const cell = t.cells[r]?.[c]
  if (!cell || cell.formula === undefined) return t
  const { formula: _formula, formulaFormat: _format, ...rest } = cell
  return { ...t, cells: t.cells.map((row, i) => (i === r ? row.map((old, j) => (j === c ? rest : old)) : row)) }
}

/** the table without its formulas: what they showed stays as text (a table that stops being a calculation table) */
export function withoutFormulas(t: TableData): TableData {
  if (!t.cells.some((row) => row.some((cell) => cell.formula !== undefined || cell.formulaFormat !== undefined))) return t
  return {
    ...t,
    cells: t.cells.map((row) => row.map((cell) => {
      if (cell.formula === undefined && cell.formulaFormat === undefined) return cell
      const { formula: _formula, formulaFormat: _format, ...rest } = cell
      return rest
    })),
  }
}

// ── formulas follow the cells they name ──

export type Shift =
  | { axis: 'row' | 'col'; kind: 'insert'; at: number; count: number }
  | { axis: 'row' | 'col'; kind: 'delete'; from: number; to: number }
  /** cells of rows `from`..`to` were moved by `delta` rows: what the formula names inside is moved with it (as a copied cell's would be) */
  | { axis: 'row'; kind: 'move'; from: number; to: number; delta: number }

const REF = /\b([A-Za-z]{1,2})(\d+)(?::([A-Za-z]{1,2})(\d+))?(?![\p{L}\d(])/gu

/** a formula with the cells it names moved as the structure changed; names that point at a deleted cell become "#REF!" */
export function shiftFormula(formula: string, shift: Shift): string {
  const move = (index: number, isRange: boolean, isEnd: boolean): number | null => {
    if (shift.kind === 'insert') return index >= shift.at ? index + shift.count : index
    if (shift.kind === 'move') return index >= shift.from && index <= shift.to ? index + shift.delta : index
    const n = shift.to - shift.from + 1
    if (index < shift.from) return index
    if (index > shift.to) return index - n
    if (!isRange) return null
    return isEnd ? shift.from - 1 : shift.from
  }
  return formula.replace(REF, (_whole, c1: string, r1: string, c2: string | undefined, r2: string | undefined) => {
    const parts: { col: number; row: number }[] = [{ col: columnIndex(c1), row: Number(r1) - 1 }]
    if (c2 !== undefined && r2 !== undefined) parts.push({ col: columnIndex(c2), row: Number(r2) - 1 })
    const isRange = parts.length === 2
    const moved = parts.map((part, i) => {
      const isEnd = i === 1
      if (shift.axis === 'row') {
        const row = move(part.row, isRange, isEnd)
        return row === null ? null : { col: part.col, row }
      }
      const col = move(part.col, isRange, isEnd)
      return col === null ? null : { col, row: part.row }
    })
    if (moved.some((part) => part === null || part.row < 0 || part.col < 0)) return '#REF!'
    if (isRange) {
      const [a, b] = moved as { col: number; row: number }[]
      if (a.row > b.row || a.col > b.col) return '#REF!'
      return `${cellName(a.row, a.col)}:${cellName(b.row, b.col)}`
    }
    const only = moved[0]!
    return cellName(only.row, only.col)
  })
}

/** every formula of the table moved as `shift` says, and worked out again */
export function shiftTableFormulas(t: TableData, shift: Shift): TableData {
  if (!t.cells.some((row) => row.some((cell) => cell.formula !== undefined))) return t
  let changed = false
  const cells = t.cells.map((row) => row.map((cell) => {
    if (cell.formula === undefined) return cell
    const formula = shiftFormula(cell.formula, shift)
    if (formula === cell.formula) return cell
    changed = true
    return { ...cell, formula }
  }))
  return recalcTable(changed ? { ...t, cells } : t)
}

/** `insertRows` etc. for a table with formulas: they keep naming the cells they named, and are worked out again */
export function insertRowsKeepingFormulas(t: TableData, at: number, count = 1): TableData {
  const next = insertRows(t, at, count)
  if (next === t) return t
  return shiftTableFormulas(next, { axis: 'row', kind: 'insert', at: Math.min(Math.max(0, at), tableRows(t)), count: tableRows(next) - tableRows(t) })
}

export function insertColsKeepingFormulas(t: TableData, at: number, count = 1): TableData {
  const next = insertCols(t, at, count)
  if (next === t) return t
  return shiftTableFormulas(next, { axis: 'col', kind: 'insert', at: Math.min(Math.max(0, at), tableCols(t)), count: tableCols(next) - tableCols(t) })
}

export function deleteRowsKeepingFormulas(t: TableData, from: number, to: number): TableData | null {
  const next = deleteRows(t, from, to)
  if (!next) return next
  const last = tableRows(t) - 1
  return shiftTableFormulas(next, { axis: 'row', kind: 'delete', from: Math.min(Math.max(0, Math.min(from, to)), last), to: Math.min(Math.max(0, Math.max(from, to)), last) })
}

export function deleteColsKeepingFormulas(t: TableData, from: number, to: number): TableData | null {
  const next = deleteCols(t, from, to)
  if (!next) return next
  const last = tableCols(t) - 1
  return shiftTableFormulas(next, { axis: 'col', kind: 'delete', from: Math.min(Math.max(0, Math.min(from, to)), last), to: Math.min(Math.max(0, Math.max(from, to)), last) })
}
