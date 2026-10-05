import type { TextAlign } from './document'

/**
 * The table object (a `ShapeFrame` of kind 'table'): a grid of cells with the usual spans (merged cells), a few shared
 * style settings and the sizes. Everything here is pure data and pure functions, so it can be tested and saved without
 * a browser; the only thing that needs one is measuring how tall a cell's text is, and that is handed in by the caller.
 *
 * Positions are always in READING order: column 0 is the first column of a row, which for the (default) right-to-left
 * table is the rightmost one. `layoutTable` turns them into physical x positions.
 */

export type CellVAlign = 'top' | 'middle' | 'bottom'

export interface TableStroke {
  color: string
  /** points */
  width: number
}

export interface TableCell {
  text: string
  /** this cell is the origin of a merge covering this many columns / rows (missing = 1); the cells it covers are blank */
  colSpan?: number
  rowSpan?: number
  /** missing = follow the table's style (header, stripes...); null = no fill */
  fill?: string | null
  insetX?: number
  insetY?: number
  strokes?: Partial<Record<'top' | 'right' | 'bottom' | 'left', TableStroke | null>>
  align?: TextAlign
  valign?: CellVAlign
  fontFamily?: string
  fontSize?: number
  leading?: number
  tracking?: number
  spaceBefore?: number
  spaceAfter?: number
  weight?: number
  italic?: boolean
  color?: string
}

export interface TableStyle {
  fontFamily: string
  fontSize: number
  leading?: number
  tracking?: number
  spaceBefore?: number
  spaceAfter?: number
  color: string
  weight: number
  italic?: boolean
  align: TextAlign
  valign: CellVAlign
  /** space between a cell's edge and its text, points */
  insetX: number
  insetY: number
  /** points between cell boxes; zero keeps a conventional continuous grid */
  cellGapX?: number
  cellGapY?: number
  /** corner radius applied to individual cell boxes when gaps separate them */
  cellRadius?: number
  /** header cells touch edge-to-edge even when body cells have gutters */
  headerContinuous?: boolean
  /** the table's outline, the lines between rows and the lines between columns; null = none */
  outer: TableStroke | null
  rowStroke: TableStroke | null
  rowStrokeAlternate?: TableStroke
  colStroke: TableStroke | null
  colStrokeAlternate?: TableStroke
  /** fill on the first, third, ... body rows; missing/null stays transparent */
  bodyFill?: string | null
  headerFill: string | null
  headerWeight: number
  footerFill: string | null
  /** every second row of the body */
  stripeFill: string | null
}

export interface TableData {
  /** relative column widths (scaled to the table's width), in reading order */
  colWidths: number[]
  /** minimum row heights, points: a row grows with its text but never gets lower than this */
  rowHeights: number[]
  headerRows: number
  footerRows: number
  /** rows × columns; a cell covered by a merge is blank and ignored */
  cells: TableCell[][]
  style: TableStyle
  /** false = left to right; missing = right to left */
  rtl?: boolean
}

export const MAX_TABLE_ROWS = 500
export const MAX_TABLE_COLS = 40
export const DEFAULT_ROW_HEIGHT = 24

export const defaultTableStyle = (): TableStyle => ({
  fontFamily: 'Segoe UI',
  fontSize: 12,
  color: '#000000',
  weight: 400,
  align: 'right',
  valign: 'top',
  insetX: 4,
  insetY: 3,
  cellGapX: 0,
  cellGapY: 0,
  cellRadius: 0,
  headerContinuous: false,
  outer: { color: '#000000', width: 1 },
  rowStroke: { color: '#000000', width: 0.5 },
  colStroke: { color: '#000000', width: 0.5 },
  bodyFill: null,
  headerFill: '#e6e6e6',
  headerWeight: 700,
  footerFill: null,
  stripeFill: null,
})

export const tableRows = (t: TableData) => t.cells.length
export const tableCols = (t: TableData) => t.cells[0]?.length ?? 0

const blankCell = (): TableCell => ({ text: '' })

export function createTable(options: { rows: number; cols: number; headerRows?: number; footerRows?: number; width: number; cellGapX?: number; cellGapY?: number; cellRadius?: number; headerContinuous?: boolean }): TableData {
  const rows = Math.min(MAX_TABLE_ROWS, Math.max(1, Math.round(options.rows)))
  const cols = Math.min(MAX_TABLE_COLS, Math.max(1, Math.round(options.cols)))
  const headerRows = Math.min(rows, Math.max(0, Math.round(options.headerRows ?? 0)))
  const footerRows = Math.min(rows - headerRows, Math.max(0, Math.round(options.footerRows ?? 0)))
  return {
    colWidths: Array.from({ length: cols }, () => options.width / cols),
    rowHeights: Array.from({ length: rows }, () => DEFAULT_ROW_HEIGHT),
    headerRows,
    footerRows,
    cells: Array.from({ length: rows }, () => Array.from({ length: cols }, blankCell)),
    style: {
      ...defaultTableStyle(),
      cellGapX: Math.max(0, Math.min(200, options.cellGapX ?? 0)),
      cellGapY: Math.max(0, Math.min(200, options.cellGapY ?? 0)),
      cellRadius: Math.max(0, Math.min(100, options.cellRadius ?? 0)),
      headerContinuous: options.headerContinuous ?? false,
    },
  }
}

/** Scale a table's visual measurements while preserving its content and relative column proportions. */
export function scaleTable(t: TableData, scale: number): TableData {
  const factor = Number.isFinite(scale) ? Math.max(0.01, scale) : 1
  const stroke = (value: TableStroke | null | undefined) => value ? { ...value, width: value.width * factor } : value
  const style = t.style
  return {
    ...t,
    rowHeights: t.rowHeights.map((height) => Math.max(1, height * factor)),
    cells: t.cells.map((row) => row.map((cell) => ({
      ...cell,
      ...(cell.fontSize !== undefined ? { fontSize: cell.fontSize * factor } : {}),
      ...(cell.leading !== undefined ? { leading: cell.leading * factor } : {}),
      ...(cell.spaceBefore !== undefined ? { spaceBefore: cell.spaceBefore * factor } : {}),
      ...(cell.spaceAfter !== undefined ? { spaceAfter: cell.spaceAfter * factor } : {}),
      ...(cell.insetX !== undefined ? { insetX: cell.insetX * factor } : {}),
      ...(cell.insetY !== undefined ? { insetY: cell.insetY * factor } : {}),
      ...(cell.strokes ? { strokes: Object.fromEntries(Object.entries(cell.strokes).map(([side, value]) => [side, stroke(value)])) as TableCell['strokes'] } : {}),
    }))),
    style: {
      ...style,
      fontSize: style.fontSize * factor,
      ...(style.leading !== undefined ? { leading: style.leading * factor } : {}),
      ...(style.spaceBefore !== undefined ? { spaceBefore: style.spaceBefore * factor } : {}),
      ...(style.spaceAfter !== undefined ? { spaceAfter: style.spaceAfter * factor } : {}),
      insetX: style.insetX * factor,
      insetY: style.insetY * factor,
      ...(style.cellGapX !== undefined ? { cellGapX: style.cellGapX * factor } : {}),
      ...(style.cellGapY !== undefined ? { cellGapY: style.cellGapY * factor } : {}),
      ...(style.cellRadius !== undefined ? { cellRadius: style.cellRadius * factor } : {}),
      outer: stroke(style.outer) ?? null,
      rowStroke: stroke(style.rowStroke) ?? null,
      ...(style.rowStrokeAlternate ? { rowStrokeAlternate: stroke(style.rowStrokeAlternate)! } : {}),
      colStroke: stroke(style.colStroke) ?? null,
      ...(style.colStrokeAlternate ? { colStrokeAlternate: stroke(style.colStrokeAlternate)! } : {}),
    },
  }
}

/** a rectangle of cells, both ends included, `r0 <= r1` and `c0 <= c1` */
export interface CellRange {
  r0: number
  c0: number
  r1: number
  c1: number
}

export const normalizeRange = (a: [number, number], b: [number, number]): CellRange => ({
  r0: Math.min(a[0], b[0]),
  c0: Math.min(a[1], b[1]),
  r1: Math.max(a[0], b[0]),
  c1: Math.max(a[1], b[1]),
})

/** for every position, the origin (the cell whose text and style it shows): itself, or the merged cell that covers it */
export function ownerGrid(t: TableData): [number, number][][] {
  const rows = tableRows(t)
  const cols = tableCols(t)
  const owner: ([number, number] | null)[][] = Array.from({ length: rows }, () => Array<[number, number] | null>(cols).fill(null))
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (owner[r][c]) continue
      const cell = t.cells[r][c]
      const rs = Math.max(1, Math.min(cell.rowSpan ?? 1, rows - r))
      const cs = Math.max(1, Math.min(cell.colSpan ?? 1, cols - c))
      for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) if (!owner[r + i][c + j]) owner[r + i][c + j] = [r, c]
    }
  }
  return owner as [number, number][][]
}

export interface Origin extends CellRange {
  cell: TableCell
}

/** every real cell with the area it covers, in reading order */
export function originsOf(t: TableData): Origin[] {
  const owner = ownerGrid(t)
  const found = new Map<string, Origin>()
  const order: string[] = []
  owner.forEach((row, r) => row.forEach(([or, oc], c) => {
    const key = `${or},${oc}`
    const known = found.get(key)
    if (known) {
      known.r1 = Math.max(known.r1, r)
      known.c1 = Math.max(known.c1, c)
    } else {
      found.set(key, { r0: or, c0: oc, r1: r, c1: c, cell: t.cells[or][oc] })
      order.push(key)
    }
  }))
  return order.map((key) => found.get(key)!)
}

/** the area of the real cell that covers (r, c) */
export function regionOf(t: TableData, r: number, c: number): CellRange {
  const [or, oc] = ownerGrid(t)[r]?.[c] ?? [r, c]
  return originsOf(t).find((o) => o.r0 === or && o.c0 === oc) ?? { r0: r, c0: c, r1: r, c1: c }
}

/** the range grown until it cuts no merged cell in two */
export function expandRange(t: TableData, range: CellRange): CellRange {
  let { r0, c0, r1, c1 } = range
  const origins = originsOf(t)
  for (let changed = true; changed;) {
    changed = false
    for (const o of origins) {
      const touches = o.r0 <= r1 && o.r1 >= r0 && o.c0 <= c1 && o.c1 >= c0
      if (!touches) continue
      if (o.r0 < r0) { r0 = o.r0; changed = true }
      if (o.c0 < c0) { c0 = o.c0; changed = true }
      if (o.r1 > r1) { r1 = o.r1; changed = true }
      if (o.c1 > c1) { c1 = o.c1; changed = true }
    }
  }
  return { r0, c0, r1, c1 }
}

function rebuild(t: TableData, rows: number, cols: number, origins: Origin[], extra: Partial<TableData>): TableData {
  const cells = Array.from({ length: rows }, () => Array.from({ length: cols }, blankCell))
  for (const o of origins) {
    const cell: TableCell = { ...o.cell }
    delete cell.rowSpan
    delete cell.colSpan
    if (o.r1 > o.r0) cell.rowSpan = o.r1 - o.r0 + 1
    if (o.c1 > o.c0) cell.colSpan = o.c1 - o.c0 + 1
    cells[o.r0][o.c0] = cell
  }
  return { ...t, ...extra, cells }
}

const clampIndex = (n: number, max: number) => Math.min(max, Math.max(0, n))

export function insertRows(t: TableData, at: number, count = 1): TableData {
  const rows = tableRows(t)
  count = Math.min(count, MAX_TABLE_ROWS - rows)
  if (count <= 0) return t
  at = clampIndex(at, rows)
  const origins = originsOf(t).map((o): Origin => {
    if (at <= o.r0) return { ...o, r0: o.r0 + count, r1: o.r1 + count }
    if (at <= o.r1) return { ...o, r1: o.r1 + count } // inside a merged cell: it grows
    return o
  })
  const height = t.rowHeights[Math.max(0, at - 1)] ?? t.rowHeights[at] ?? DEFAULT_ROW_HEIGHT
  const rowHeights = [...t.rowHeights.slice(0, at), ...Array.from({ length: count }, () => height), ...t.rowHeights.slice(at)]
  return rebuild(t, rows + count, tableCols(t), origins, {
    rowHeights,
    headerRows: at < t.headerRows ? t.headerRows + count : t.headerRows,
    footerRows: t.footerRows > 0 && at > rows - t.footerRows ? t.footerRows + count : t.footerRows,
  })
}

export function insertCols(t: TableData, at: number, count = 1): TableData {
  const cols = tableCols(t)
  count = Math.min(count, MAX_TABLE_COLS - cols)
  if (count <= 0) return t
  at = clampIndex(at, cols)
  const origins = originsOf(t).map((o): Origin => {
    if (at <= o.c0) return { ...o, c0: o.c0 + count, c1: o.c1 + count }
    if (at <= o.c1) return { ...o, c1: o.c1 + count }
    return o
  })
  const average = t.colWidths.reduce((sum, w) => sum + w, 0) / Math.max(1, cols)
  const colWidths = [...t.colWidths.slice(0, at), ...Array.from({ length: count }, () => average), ...t.colWidths.slice(at)]
  return rebuild(t, tableRows(t), cols + count, origins, { colWidths })
}

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0) + 1)

/** null when every row would go: a table keeps at least one */
export function deleteRows(t: TableData, from: number, to: number): TableData | null {
  const rows = tableRows(t)
  const a = clampIndex(Math.min(from, to), rows - 1)
  const b = clampIndex(Math.max(from, to), rows - 1)
  const n = b - a + 1
  if (n >= rows) return null
  const origins: Origin[] = []
  for (const o of originsOf(t)) {
    const gone = overlap(o.r0, o.r1, a, b)
    const left = o.r1 - o.r0 + 1 - gone
    if (left <= 0) continue
    const r0 = o.r0 < a ? o.r0 : o.r0 > b ? o.r0 - n : a
    origins.push({ ...o, r0, r1: r0 + left - 1 })
  }
  return rebuild(t, rows - n, tableCols(t), origins, {
    rowHeights: [...t.rowHeights.slice(0, a), ...t.rowHeights.slice(b + 1)],
    headerRows: t.headerRows - overlap(0, t.headerRows - 1, a, b),
    footerRows: t.footerRows - overlap(rows - t.footerRows, rows - 1, a, b),
  })
}

export function deleteCols(t: TableData, from: number, to: number): TableData | null {
  const cols = tableCols(t)
  const a = clampIndex(Math.min(from, to), cols - 1)
  const b = clampIndex(Math.max(from, to), cols - 1)
  const n = b - a + 1
  if (n >= cols) return null
  const origins: Origin[] = []
  for (const o of originsOf(t)) {
    const gone = overlap(o.c0, o.c1, a, b)
    const left = o.c1 - o.c0 + 1 - gone
    if (left <= 0) continue
    const c0 = o.c0 < a ? o.c0 : o.c0 > b ? o.c0 - n : a
    origins.push({ ...o, c0, c1: c0 + left - 1 })
  }
  return rebuild(t, tableRows(t), cols - n, origins, { colWidths: [...t.colWidths.slice(0, a), ...t.colWidths.slice(b + 1)] })
}

/** merges the cells of the range (grown to whole merged cells) into the first one, keeping all their text; null when there is nothing to merge */
export function mergeRange(t: TableData, range: CellRange): TableData | null {
  const area = expandRange(t, range)
  if (area.r0 === area.r1 && area.c0 === area.c1) return null
  const inside = originsOf(t).filter((o) => o.r0 >= area.r0 && o.r1 <= area.r1 && o.c0 >= area.c0 && o.c1 <= area.c1)
  if (inside.length < 2) return null
  const first = inside.find((o) => o.r0 === area.r0 && o.c0 === area.c0) ?? inside[0]
  const text = inside.map((o) => o.cell.text).filter((s) => s !== '').join('\n')
  const isInside = (o: Origin) => o.r0 >= area.r0 && o.r1 <= area.r1 && o.c0 >= area.c0 && o.c1 <= area.c1
  const kept = originsOf(t).filter((o) => !isInside(o))
  return rebuild(t, tableRows(t), tableCols(t), [...kept, { ...area, cell: { ...first.cell, text } }], {})
}

/** undoes the merge the cell at (r, c) is part of; null when it is not merged */
export function unmergeAt(t: TableData, r: number, c: number): TableData | null {
  const region = regionOf(t, r, c)
  if (region.r0 === region.r1 && region.c0 === region.c1) return null
  const origins = originsOf(t).map((o) => (o.r0 === region.r0 && o.c0 === region.c0 ? { ...o, r1: o.r0, c1: o.c0 } : o))
  return rebuild(t, tableRows(t), tableCols(t), origins, {})
}

export function setCellText(t: TableData, r: number, c: number, text: string): TableData {
  const [or, oc] = ownerGrid(t)[r]?.[c] ?? [r, c]
  if (!t.cells[or] || t.cells[or][oc].text === text) return t
  return { ...t, cells: t.cells.map((row, i) => (i === or ? row.map((cell, j) => (j === oc ? { ...cell, text } : cell)) : row)) }
}

/** a setting on every real cell of the range (grown to whole merged cells); a value of undefined takes the setting away */
export function patchCells(t: TableData, range: CellRange, patch: Partial<Omit<TableCell, 'text' | 'colSpan' | 'rowSpan'>>): TableData {
  const area = expandRange(t, range)
  const hit = new Set(originsOf(t).filter((o) => o.r0 >= area.r0 && o.r1 <= area.r1 && o.c0 >= area.c0 && o.c1 <= area.c1).map((o) => `${o.r0},${o.c0}`))
  return {
    ...t,
    cells: t.cells.map((row, r) => row.map((cell, c) => {
      if (!hit.has(`${r},${c}`)) return cell
      const next: TableCell = { ...cell, ...patch }
      for (const key of Object.keys(patch) as (keyof typeof patch)[]) if (patch[key] === undefined) delete next[key]
      return next
    })),
  }
}

/** moves the border between column `index - 1` and `index` by `delta` points of table width, positive = towards the end of the row in reading order (column `index - 1` grows); the table keeps its width */
export function dragColumnBorder(t: TableData, index: number, delta: number, width: number, minWidth = 12): TableData {
  const total = t.colWidths.reduce((sum, w) => sum + w, 0)
  if (index < 1 || index >= t.colWidths.length || total <= 0 || width <= 0) return t
  const unit = total / width
  const left = t.colWidths[index - 1]
  const right = t.colWidths[index]
  const min = minWidth * unit
  const moved = Math.max(min - left, Math.min(right - min, delta * unit))
  if (moved === 0) return t
  const colWidths = t.colWidths.map((w, i) => (i === index - 1 ? left + moved : i === index ? right - moved : w))
  return { ...t, colWidths }
}

export function setRowMinHeight(t: TableData, row: number, height: number): TableData {
  if (!t.rowHeights[row] && t.rowHeights[row] !== 0) return t
  return { ...t, rowHeights: t.rowHeights.map((h, i) => (i === row ? Math.max(1, height) : h)) }
}

export function setHeaderFooter(t: TableData, headerRows: number, footerRows: number): TableData {
  const rows = tableRows(t)
  const header = clampIndex(Math.round(headerRows), rows)
  const footer = clampIndex(Math.round(footerRows), rows - header)
  return header === t.headerRows && footer === t.footerRows ? t : { ...t, headerRows: header, footerRows: footer }
}

export const rowKind = (t: TableData, row: number): 'header' | 'body' | 'footer' =>
  row < t.headerRows ? 'header' : row >= tableRows(t) - t.footerRows ? 'footer' : 'body'

export interface ResolvedCell {
  fill: string | null
  insetX: number
  insetY: number
  fontFamily: string
  fontSize: number
  leading: number
  tracking: number
  spaceBefore: number
  spaceAfter: number
  color: string
  weight: number
  italic: boolean
  align: TextAlign
  valign: CellVAlign
}

/** what the real cell at (r, c) looks like: its own settings over the header / footer / stripe / table style */
export function resolveCell(t: TableData, r: number, c: number): ResolvedCell {
  const [or, oc] = ownerGrid(t)[r]?.[c] ?? [r, c]
  const cell = t.cells[or]?.[oc] ?? blankCell()
  const s = t.style
  const kind = rowKind(t, or)
  const bodyRow = or - t.headerRows
  const inherited = kind === 'header' ? s.headerFill : kind === 'footer' ? s.footerFill : bodyRow % 2 === 1 ? s.stripeFill : s.bodyFill ?? null
  return {
    fill: cell.fill === undefined ? inherited : cell.fill,
    insetX: cell.insetX ?? s.insetX,
    insetY: cell.insetY ?? s.insetY,
    fontFamily: cell.fontFamily ?? s.fontFamily,
    fontSize: cell.fontSize ?? s.fontSize,
    leading: cell.leading ?? s.leading ?? Math.round((cell.fontSize ?? s.fontSize) * 1.25),
    tracking: cell.tracking ?? s.tracking ?? 0,
    spaceBefore: cell.spaceBefore ?? s.spaceBefore ?? 0,
    spaceAfter: cell.spaceAfter ?? s.spaceAfter ?? 0,
    color: cell.color ?? s.color,
    weight: cell.weight ?? (kind === 'header' ? Math.max(s.weight, s.headerWeight) : s.weight),
    italic: cell.italic ?? s.italic ?? false,
    align: cell.align ?? s.align,
    valign: cell.valign ?? s.valign,
  }
}

export interface TableLayout {
  width: number
  height: number
  /** physical left edge and width of each column, reading order */
  colLeft: number[]
  colWidth: number[]
  rowColLeft: number[][]
  rowColWidth: number[][]
  rowTop: number[]
  rowHeight: number[]
  rowGapBefore: number[]
}

/** how tall the text of a cell is when set `innerWidth` points wide (the caller measures; the style says how it is set) */
export type CellMeasure = (cell: TableCell, resolved: ResolvedCell, innerWidth: number, style: TableStyle) => number

export function layoutTable(t: TableData, width: number, measure: CellMeasure): TableLayout {
  const rows = tableRows(t)
  const cols = tableCols(t)
  const total = t.colWidths.reduce((sum, w) => sum + w, 0) || 1
  const gapX = Math.max(0, t.style.cellGapX ?? 0)
  const gapY = Math.max(0, t.style.cellGapY ?? 0)
  const colWidthForGap = (gap: number) => {
    const contentWidth = Math.max(cols, width - gap * Math.max(0, cols - 1))
    return t.colWidths.map((w) => (w / total) * contentWidth)
  }
  const colWidth = colWidthForGap(gapX)
  const rtl = t.rtl !== false
  const positionsFor = (row: number) => {
    const gap = t.style.headerContinuous && row < t.headerRows ? 0 : gapX
    const widths = colWidthForGap(gap)
    const left = widths.map((w, c) => {
      const before = widths.slice(0, c).reduce((sum, x) => sum + x, 0)
      return rtl ? width - before - gap * c - w : before + gap * c
    })
    return { widths, left }
  }
  const rowPositions = Array.from({ length: rows }, (_, row) => positionsFor(row))
  const colLeft = positionsFor(Math.min(t.headerRows, Math.max(0, rows - 1))).left
  const rowColLeft = rowPositions.map((position) => position.left)
  const rowColWidth = rowPositions.map((position) => position.widths)
  const rowGapBefore = Array.from({ length: rows }, (_, row) => row > 0 && !(t.style.headerContinuous && row < t.headerRows) ? gapY : 0)
  const rowHeight = t.rowHeights.slice(0, rows).map((h) => Math.max(1, h))
  while (rowHeight.length < rows) rowHeight.push(DEFAULT_ROW_HEIGHT)
  const s = t.style
  const cells = originsOf(t).sort((a, b) => a.r1 - a.r0 - (b.r1 - b.r0))
  for (const o of cells) {
    if (o.cell.text === '' && o.r0 === o.r1) continue
    const resolved = resolveCell(t, o.r0, o.c0)
    const inner = rowColWidth[o.r0].slice(o.c0, o.c1 + 1).reduce((sum, w) => sum + w, 0) - 2 * resolved.insetX
    const needed = measure(o.cell, resolved, Math.max(1, inner), s) + 2 * resolved.insetY
    const have = rowHeight.slice(o.r0, o.r1 + 1).reduce((sum, h) => sum + h, 0) + rowGapBefore.slice(o.r0 + 1, o.r1 + 1).reduce((sum, gap) => sum + gap, 0)
    if (needed > have) rowHeight[o.r1] += needed - have
  }
  const rowTop = rowHeight.map((_, r) => rowHeight.slice(0, r).reduce((sum, h) => sum + h, 0) + rowGapBefore.slice(0, r + 1).reduce((sum, gap) => sum + gap, 0))
  return { width, height: rowHeight.reduce((sum, h) => sum + h, 0) + rowGapBefore.reduce((sum, gap) => sum + gap, 0), colLeft, colWidth, rowColLeft, rowColWidth, rowTop, rowHeight, rowGapBefore }
}

/** the rectangle a real cell covers, table coordinates */
export function cellRect(layout: TableLayout, o: CellRange) {
  const colLeft = layout.rowColLeft[o.r0] ?? layout.colLeft
  const colWidth = layout.rowColWidth[o.r0] ?? layout.colWidth
  const left = Math.min(...colLeft.slice(o.c0, o.c1 + 1))
  const right = Math.max(...colLeft.slice(o.c0, o.c1 + 1).map((x, i) => x + colWidth[o.c0 + i]))
  const width = right - left
  const top = layout.rowTop[o.r0]
  const last = o.r1
  const height = layout.rowTop[last] + layout.rowHeight[last] - top
  return { left, top, width, height }
}

/** the physical x of the border after `k` columns in reading order (0 = the start edge, `cols` = the far edge) */
export function borderX(t: TableData, layout: TableLayout, k: number): number {
  const cols = tableCols(t)
  const rtl = t.rtl !== false
  if (k <= 0) return rtl ? layout.width : 0
  if (k >= cols) return rtl ? 0 : layout.width
  const gap = Math.max(0, t.style.cellGapX ?? 0)
  const before = layout.colWidth.slice(0, k).reduce((sum, w) => sum + w, 0) + gap * (k - 0.5)
  return rtl ? layout.width - before : before
}

export interface TableLine {
  x1: number
  y1: number
  x2: number
  y2: number
  width: number
  color: string
}

const rowStrokeAt = (t: TableData, boundary: number): TableStroke | null =>
  (boundary === 0 || boundary === tableRows(t) ? t.style.rowStroke : (boundary - 1) % 2 === 1 ? t.style.rowStrokeAlternate ?? t.style.rowStroke : t.style.rowStroke)

const colStrokeAt = (t: TableData, boundary: number): TableStroke | null =>
  (boundary === 0 || boundary === tableCols(t) ? t.style.colStroke : (boundary - 1) % 2 === 1 ? t.style.colStrokeAlternate ?? t.style.colStroke : t.style.colStroke)

/** The effective stroke on a physical side of a cell, including its local override. */
export function cellSideStroke(t: TableData, cell: Origin, side: 'top' | 'right' | 'bottom' | 'left'): TableStroke | null {
  const override = cell.cell.strokes?.[side]
  if (override !== undefined) return override
  const continuousHeader = !!t.style.headerContinuous && cell.r0 < t.headerRows
  if (side === 'top') {
    if (continuousHeader && cell.r0 > 0) return null
    return rowStrokeAt(t, cell.r0)
  }
  if (side === 'bottom') return rowStrokeAt(t, cell.r1 + 1)
  const boundary = t.rtl === false
    ? side === 'left' ? cell.c0 : cell.c1 + 1
    : side === 'left' ? cell.c1 + 1 : cell.c0
  if (continuousHeader && boundary > 0 && boundary < tableCols(t)) {
    const sharedSide = t.rtl === false ? 'right' : 'left'
    if (side !== sharedSide) return null
  }
  return colStrokeAt(t, boundary)
}

/** CSS order: top-left, top-right, bottom-right, bottom-left. */
export function cellCornerRadii(t: TableData, cell: Origin): [number, number, number, number] {
  const radius = Math.max(0, t.style.cellRadius ?? 0)
  if (!radius) return [0, 0, 0, 0]
  const separated = (t.style.cellGapX ?? 0) > 0 || (t.style.cellGapY ?? 0) > 0
  if (!separated || !t.style.headerContinuous || cell.r0 >= t.headerRows) return [radius, radius, radius, radius]
  const leftEdge = t.rtl === false ? cell.c0 === 0 : cell.c1 === tableCols(t) - 1
  const rightEdge = t.rtl === false ? cell.c1 === tableCols(t) - 1 : cell.c0 === 0
  const topEdge = cell.r0 === 0
  const bottomEdge = cell.r1 === t.headerRows - 1
  return [topEdge && leftEdge ? radius : 0, topEdge && rightEdge ? radius : 0, bottomEdge && rightEdge ? radius : 0, bottomEdge && leftEdge ? radius : 0]
}

/**
 * Every line to draw: the outline, and the lines between rows and between columns - except where a merged cell spans the
 * border. One line per stretch (neighbouring pieces of a border are joined), so a border is never drawn twice.
 */
export function tableLines(t: TableData, layout: TableLayout): TableLine[] {
  if ((t.style.cellGapX ?? 0) > 0 || (t.style.cellGapY ?? 0) > 0) return []
  const rows = tableRows(t)
  const cols = tableCols(t)
  const owner = ownerGrid(t)
  const same = (a: [number, number], b: [number, number]) => a[0] === b[0] && a[1] === b[1]
  const out: TableLine[] = []
  const s = t.style
  if ((s.cellGapX ?? 0) > 0 || (s.cellGapY ?? 0) > 0) {
    const separated: TableLine[] = []
    const add = (x1: number, y1: number, x2: number, y2: number, stroke: TableStroke | null | undefined) => {
      if (stroke) separated.push({ x1, y1, x2, y2, width: stroke.width, color: stroke.color })
    }
    const rowStrokeAt = (boundary: number) => (boundary === 0 || boundary === rows ? s.rowStroke : (boundary - 1) % 2 === 1 ? s.rowStrokeAlternate ?? s.rowStroke : s.rowStroke)
    const colStrokeAt = (boundary: number) => (boundary === 0 || boundary === cols ? s.colStroke : (boundary - 1) % 2 === 1 ? s.colStrokeAlternate ?? s.colStroke : s.colStroke)
    for (const cell of originsOf(t)) {
      const rect = cellRect(layout, cell)
      const strokes = cell.cell.strokes
      const leftBoundary = t.rtl === false ? cell.c0 : cell.c1 + 1
      const rightBoundary = t.rtl === false ? cell.c1 + 1 : cell.c0
      add(rect.left, rect.top, rect.left + rect.width, rect.top, strokes?.top === undefined ? rowStrokeAt(cell.r0) : strokes.top)
      add(rect.left, rect.top + rect.height, rect.left + rect.width, rect.top + rect.height, strokes?.bottom === undefined ? rowStrokeAt(cell.r1 + 1) : strokes.bottom)
      add(rect.left, rect.top, rect.left, rect.top + rect.height, strokes?.left === undefined ? colStrokeAt(leftBoundary) : strokes.left)
      add(rect.left + rect.width, rect.top, rect.left + rect.width, rect.top + rect.height, strokes?.right === undefined ? colStrokeAt(rightBoundary) : strokes.right)
    }
    if (s.outer) {
      add(0, 0, layout.width, 0, s.outer)
      add(0, layout.height, layout.width, layout.height, s.outer)
      add(0, 0, 0, layout.height, s.outer)
      add(layout.width, 0, layout.width, layout.height, s.outer)
    }
    return separated
  }
  const strokeFor = (base: TableStroke | null, ...overrides: (TableStroke | null | undefined)[]): TableStroke | null => {
    const explicit = overrides.filter((stroke) => stroke !== undefined)
    if (explicit.some((stroke) => stroke === null)) return null
    return (explicit[0] as TableStroke | undefined) ?? base
  }
  const sameStroke = (a: TableStroke | null, b: TableStroke | null) => a?.color === b?.color && a?.width === b?.width

  for (let r = 0; r <= rows; r++) {
    const base = r === 0 || r === rows ? s.outer : (r - 1) % 2 === 1 ? s.rowStrokeAlternate ?? s.rowStroke : s.rowStroke
    const y = r === rows ? layout.height : layout.rowTop[r]
    let from: number | null = null
    let to = 0
    let active: TableStroke | null = null
    const flush = () => {
      if (from !== null && active) out.push({ x1: from, y1: y, x2: to, y2: y, width: active.width, color: active.color })
      from = null
      active = null
    }
    for (let c = 0; c < cols; c++) {
      const drawn = r === 0 || r === rows || !same(owner[r - 1][c], owner[r][c])
      if (!drawn) { flush(); continue }
      const above = r > 0 ? t.cells[owner[r - 1][c][0]][owner[r - 1][c][1]] : null
      const below = r < rows ? t.cells[owner[r][c][0]][owner[r][c][1]] : null
      const stroke = strokeFor(base, above?.strokes?.bottom, below?.strokes?.top)
      if (!stroke) { flush(); continue }
      const left = layout.colLeft[c]
      const right = left + layout.colWidth[c]
      if (from === null || !sameStroke(active, stroke)) { flush(); from = left; to = right; active = stroke }
      else if (Math.abs(left - to) < 0.01) to = right
      else if (Math.abs(right - from) < 0.01) from = left
      else { flush(); from = left; to = right; active = stroke }
    }
    flush()
  }
  for (let k = 0; k <= cols; k++) {
    const base = k === 0 || k === cols ? s.outer : (k - 1) % 2 === 1 ? s.colStrokeAlternate ?? s.colStroke : s.colStroke
    const x = borderX(t, layout, k)
    let from: number | null = null
    let to = 0
    let active: TableStroke | null = null
    const flush = () => {
      if (from !== null && active) out.push({ x1: x, y1: from, x2: x, y2: to, width: active.width, color: active.color })
      from = null
      active = null
    }
    for (let r = 0; r < rows; r++) {
      const drawn = k === 0 || k === cols || !same(owner[r][k - 1], owner[r][k])
      if (!drawn) { flush(); continue }
      let stroke: TableStroke | null
      if (k === 0) {
        const cell = t.cells[owner[r][0][0]][owner[r][0][1]]
        stroke = strokeFor(base, cell.strokes?.[t.rtl === false ? 'left' : 'right'])
      } else if (k === cols) {
        const cell = t.cells[owner[r][cols - 1][0]][owner[r][cols - 1][1]]
        stroke = strokeFor(base, cell.strokes?.[t.rtl === false ? 'right' : 'left'])
      } else {
        const before = t.cells[owner[r][k - 1][0]][owner[r][k - 1][1]]
        const after = t.cells[owner[r][k][0]][owner[r][k][1]]
        stroke = t.rtl === false
          ? strokeFor(base, before.strokes?.right, after.strokes?.left)
          : strokeFor(base, before.strokes?.left, after.strokes?.right)
      }
      if (!stroke) { flush(); continue }
      const top = layout.rowTop[r]
      const bottom = top + layout.rowHeight[r]
      if (from === null || !sameStroke(active, stroke)) { flush(); from = top; to = bottom; active = stroke }
      else to = bottom
    }
    flush()
  }
  return out
}

// ── reading a table back from a file ─────────────────────────────────────────────

const COLOR = /^#[0-9a-fA-F]{6}$/
const isColor = (v: unknown): v is string => typeof v === 'string' && COLOR.test(v)
const num = (v: unknown, min: number, max: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback)
const ALIGNS: TextAlign[] = ['right', 'center', 'left', 'justify', 'justifyCenter']
const VALIGNS: CellVAlign[] = ['top', 'middle', 'bottom']

function readStroke(v: unknown, fallback: TableStroke | null): TableStroke | null {
  if (v === null) return null
  if (!v || typeof v !== 'object') return fallback
  const s = v as Record<string, unknown>
  return isColor(s.color) ? { color: s.color, width: num(s.width, 0.1, 40, 1) } : fallback
}

function readColorOrNull(v: unknown, fallback: string | null): string | null {
  return v === null ? null : isColor(v) ? v : fallback
}

function readStyle(v: unknown): TableStyle {
  const d = defaultTableStyle()
  if (!v || typeof v !== 'object') return d
  const s = v as Record<string, unknown>
  return {
    fontFamily: typeof s.fontFamily === 'string' && s.fontFamily ? s.fontFamily.slice(0, 120) : d.fontFamily,
    fontSize: num(s.fontSize, 1, 500, d.fontSize),
    ...(typeof s.leading === 'number' ? { leading: num(s.leading, 0, 1000, 15) } : {}),
    ...(typeof s.tracking === 'number' ? { tracking: num(s.tracking, -500, 1000, 0) } : {}),
    ...(typeof s.spaceBefore === 'number' ? { spaceBefore: num(s.spaceBefore, 0, 1000, 0) } : {}),
    ...(typeof s.spaceAfter === 'number' ? { spaceAfter: num(s.spaceAfter, 0, 1000, 0) } : {}),
    color: isColor(s.color) ? s.color : d.color,
    weight: num(s.weight, 100, 900, d.weight),
    ...(typeof s.italic === 'boolean' ? { italic: s.italic } : {}),
    align: ALIGNS.includes(s.align as TextAlign) ? (s.align as TextAlign) : d.align,
    valign: VALIGNS.includes(s.valign as CellVAlign) ? (s.valign as CellVAlign) : d.valign,
    insetX: num(s.insetX, 0, 200, d.insetX),
    insetY: num(s.insetY, 0, 200, d.insetY),
    cellGapX: num(s.cellGapX, 0, 200, 0),
    cellGapY: num(s.cellGapY, 0, 200, 0),
    cellRadius: num(s.cellRadius, 0, 100, 0),
    headerContinuous: s.headerContinuous === true,
    outer: readStroke(s.outer, d.outer),
    rowStroke: readStroke(s.rowStroke, d.rowStroke),
    ...(s.rowStrokeAlternate && typeof s.rowStrokeAlternate === 'object' ? { rowStrokeAlternate: readStroke(s.rowStrokeAlternate, d.rowStroke) ?? undefined } : {}),
    colStroke: readStroke(s.colStroke, d.colStroke),
    ...(s.colStrokeAlternate && typeof s.colStrokeAlternate === 'object' ? { colStrokeAlternate: readStroke(s.colStrokeAlternate, d.colStroke) ?? undefined } : {}),
    bodyFill: readColorOrNull(s.bodyFill, d.bodyFill ?? null),
    headerFill: readColorOrNull(s.headerFill, d.headerFill),
    headerWeight: num(s.headerWeight, 100, 900, d.headerWeight),
    footerFill: readColorOrNull(s.footerFill, d.footerFill),
    stripeFill: readColorOrNull(s.stripeFill, d.stripeFill),
  }
}

function readCell(v: unknown): TableCell {
  if (!v || typeof v !== 'object') return blankCell()
  const c = v as Record<string, unknown>
  const cell: TableCell = { text: typeof c.text === 'string' ? c.text.slice(0, 100000) : '' }
  if (typeof c.colSpan === 'number' && c.colSpan > 1) cell.colSpan = Math.min(MAX_TABLE_COLS, Math.round(c.colSpan))
  if (typeof c.rowSpan === 'number' && c.rowSpan > 1) cell.rowSpan = Math.min(MAX_TABLE_ROWS, Math.round(c.rowSpan))
  if (c.fill === null || isColor(c.fill)) cell.fill = c.fill as string | null
  if (typeof c.insetX === 'number') cell.insetX = num(c.insetX, 0, 200, 0)
  if (typeof c.insetY === 'number') cell.insetY = num(c.insetY, 0, 200, 0)
  if (c.strokes && typeof c.strokes === 'object') {
    const rawStrokes = c.strokes as Record<string, unknown>
    const strokes: NonNullable<TableCell['strokes']> = {}
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      if (Object.hasOwn(rawStrokes, side)) strokes[side] = readStroke(rawStrokes[side], null)
    }
    if (Object.keys(strokes).length) cell.strokes = strokes
  }
  if (ALIGNS.includes(c.align as TextAlign)) cell.align = c.align as TextAlign
  if (VALIGNS.includes(c.valign as CellVAlign)) cell.valign = c.valign as CellVAlign
  if (typeof c.fontFamily === 'string' && c.fontFamily) cell.fontFamily = c.fontFamily.slice(0, 120)
  if (typeof c.fontSize === 'number') cell.fontSize = num(c.fontSize, 1, 500, 12)
  if (typeof c.leading === 'number') cell.leading = num(c.leading, 0, 1000, 15)
  if (typeof c.tracking === 'number') cell.tracking = num(c.tracking, -500, 1000, 0)
  if (typeof c.spaceBefore === 'number') cell.spaceBefore = num(c.spaceBefore, 0, 1000, 0)
  if (typeof c.spaceAfter === 'number') cell.spaceAfter = num(c.spaceAfter, 0, 1000, 0)
  if (typeof c.weight === 'number') cell.weight = num(c.weight, 100, 900, 400)
  if (typeof c.italic === 'boolean') cell.italic = c.italic
  if (isColor(c.color)) cell.color = c.color
  return cell
}

/** a table read from a file: anything the program would not have written is repaired or dropped; null if there is no grid at all */
export function sanitizeTable(raw: unknown): TableData | null {
  if (!raw || typeof raw !== 'object') return null
  const t = raw as Record<string, unknown>
  if (!Array.isArray(t.cells) || t.cells.length === 0) return null
  const rows = Math.min(MAX_TABLE_ROWS, t.cells.length)
  const cols = Math.min(MAX_TABLE_COLS, Math.max(1, ...t.cells.slice(0, rows).map((row) => (Array.isArray(row) ? row.length : 0))))
  const cells = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => readCell((t.cells as unknown[][])[r]?.[c])))
  const widths = Array.isArray(t.colWidths) ? t.colWidths : []
  const heights = Array.isArray(t.rowHeights) ? t.rowHeights : []
  const headerRows = Math.round(num(t.headerRows, 0, rows, 0))
  const data: TableData = {
    colWidths: Array.from({ length: cols }, (_, c) => num(widths[c], 1, 100000, 100)),
    rowHeights: Array.from({ length: rows }, (_, r) => num(heights[r], 1, 100000, DEFAULT_ROW_HEIGHT)),
    headerRows,
    footerRows: Math.round(num(t.footerRows, 0, rows - headerRows, 0)),
    cells,
    style: readStyle(t.style),
  }
  if (t.rtl === false) data.rtl = false
  // spans that run past the grid or over each other are cut back to what the grid can hold
  return rebuild(data, rows, cols, originsOf(data), {})
}
