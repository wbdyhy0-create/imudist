import { cssTextAlign, type ShapeFrame } from './document'
import { cellCornerRadii, cellRect, cellSideStroke, layoutTable, originsOf, resolveCell, tableLines, type CellMeasure, type ResolvedCell, type TableData, type TableLayout } from './table'

/**
 * The browser-dependent half of tables: how tall a cell's text is (asked of a hidden element, the way textLayout.ts asks
 * for the height of a frame's text), and the layout that follows from it. What the view draws and what the PDF export
 * draws both come from `layoutOfShape`, so a table is the same on screen and on paper.
 */

/** the CSS of a cell's text at `scale` (1 = points as pixels); the view, the export and the measurer all use it */
export function cellTextCss(resolved: ResolvedCell, rtl: boolean, scale = 1) {
  const align = cssTextAlign(resolved.align)
  return {
    fontFamily: `"${resolved.fontFamily}", "Segoe UI", Arial, sans-serif`,
    fontSize: `${resolved.fontSize * scale}px`,
    fontWeight: String(resolved.weight),
    fontStyle: resolved.italic ? 'italic' : 'normal',
    lineHeight: `${resolved.leading * scale}px`,
    letterSpacing: `${(resolved.tracking / 1000) * resolved.fontSize * scale}px`,
    color: resolved.color,
    direction: rtl ? 'rtl' : 'ltr',
    textAlign: align.textAlign,
    textAlignLast: align.textAlignLast ?? 'auto',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    textRendering: 'geometricPrecision',
    display: 'flex',
    flexDirection: 'column',
    rowGap: `${Math.max(resolved.spaceBefore, resolved.spaceAfter) * scale}px`,
    paddingBlockStart: `${resolved.spaceBefore * scale}px`,
    paddingBlockEnd: `${resolved.spaceAfter * scale}px`,
  } as const
}

/** what a cell shows for `text`: a last empty line needs a line break of its own to be seen */
export const shownText = (text: string) => (text.endsWith('\n') ? text + '\n' : text)

let measurer: HTMLDivElement | null = null
const heights = new Map<string, number>()

function getMeasurer() {
  if (!measurer || !measurer.isConnected) {
    measurer = document.createElement('div')
    measurer.setAttribute('aria-hidden', 'true')
    Object.assign(measurer.style, { position: 'absolute', left: '-100000px', top: '0', visibility: 'hidden', pointerEvents: 'none', boxSizing: 'border-box', margin: '0', padding: '0' })
    document.body.appendChild(measurer)
  }
  return measurer
}

export const measureCellDom: CellMeasure = (cell, resolved, innerWidth, _style) => {
  const rtl = true
  const key = JSON.stringify([resolved.fontFamily, resolved.fontSize, resolved.leading, resolved.tracking, resolved.spaceBefore, resolved.spaceAfter, resolved.weight, resolved.italic, resolved.align, Math.round(innerWidth * 100), cell.text])
  const known = heights.get(key)
  if (known !== undefined) return known
  const m = getMeasurer()
  Object.assign(m.style, cellTextCss(resolved, rtl))
  m.style.width = `${innerWidth}px`
  m.replaceChildren(...(cell.text || '​').split('\n').map((line) => {
    const paragraph = document.createElement('div')
    paragraph.textContent = line || '​'
    return paragraph
  }))
  const height = m.getBoundingClientRect().height
  m.replaceChildren()
  if (heights.size > 20000) heights.clear()
  heights.set(key, height)
  return height
}

const layouts = new WeakMap<TableData, { width: number; layout: TableLayout }>()

/** the layout of a table shape at its own width, measured once per version of the table */
export function layoutOfShape(shape: Pick<ShapeFrame, 'table' | 'w'>): TableLayout | null {
  const table = shape.table
  if (!table) return null
  const known = layouts.get(table)
  if (known && Math.abs(known.width - shape.w) < 0.001) return known.layout
  const layout = layoutTable(table, shape.w, measureCellDom)
  layouts.set(table, { width: shape.w, layout })
  return layout
}

/**
 * The table as a DOM tree at `scale` 1, every piece placed by the layout - what the PDF export rasterizes. It is built the
 * way TableView draws it (same cell boxes, same text CSS, same lines), with `pad` points of room around so that the half
 * of the outline that sticks out of the table is not cut off.
 */
export function buildTableDom(shape: { table: TableData; fill: string | null }, layout: TableLayout, pad: number): HTMLElement {
  const table = shape.table
  const rtl = table.rtl !== false
  const root = document.createElement('div')
  Object.assign(root.style, { position: 'relative', width: `${layout.width + 2 * pad}px`, height: `${layout.height + 2 * pad}px`, overflow: 'hidden' })
  const body = document.createElement('div')
  Object.assign(body.style, { position: 'absolute', left: `${pad}px`, top: `${pad}px`, width: `${layout.width}px`, height: `${layout.height}px`, background: shape.fill ?? 'transparent' })
  root.appendChild(body)
  for (const o of originsOf(table)) {
    const rect = cellRect(layout, o)
    const resolved = resolveCell(table, o.r0, o.c0)
    const separated = (table.style.cellGapX ?? 0) > 0 || (table.style.cellGapY ?? 0) > 0
    const border = (side: 'top' | 'right' | 'bottom' | 'left') => {
      const stroke = cellSideStroke(table, o, side)
      return separated ? stroke ? `${stroke.width}px solid ${stroke.color}` : 'none' : ''
    }
    const corners = separated ? cellCornerRadii(table, o).map((radius) => Math.min(radius, rect.width / 2, rect.height / 2)) : [0, 0, 0, 0]
    const cell = document.createElement('div')
    Object.assign(cell.style, {
      position: 'absolute',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: resolved.valign === 'middle' ? 'center' : resolved.valign === 'bottom' ? 'flex-end' : 'flex-start',
      overflow: 'hidden',
      padding: `${resolved.insetY}px ${resolved.insetX}px`,
      background: resolved.fill ?? 'transparent',
      borderTop: border('top'),
      borderRight: border('right'),
      borderBottom: border('bottom'),
      borderLeft: border('left'),
      borderTopLeftRadius: `${corners[0]}px`,
      borderTopRightRadius: `${corners[1]}px`,
      borderBottomRightRadius: `${corners[2]}px`,
      borderBottomLeftRadius: `${corners[3]}px`,
    })
    const text = document.createElement('div')
    Object.assign(text.style, cellTextCss(resolved, rtl, 1), { width: '100%', boxSizing: 'border-box', margin: '0' })
    for (const line of o.cell.text.split('\n')) {
      const paragraph = document.createElement('div')
      paragraph.textContent = line || '​'
      text.appendChild(paragraph)
    }
    cell.appendChild(text)
    body.appendChild(cell)
  }
  for (const line of tableLines(table, layout)) {
    const horizontal = line.y1 === line.y2
    const el = document.createElement('div')
    const t = line.width
    Object.assign(el.style, horizontal
      ? { left: `${Math.min(line.x1, line.x2) - t / 2}px`, top: `${line.y1 - t / 2}px`, width: `${Math.abs(line.x2 - line.x1) + t}px`, height: `${t}px` }
      : { left: `${line.x1 - t / 2}px`, top: `${Math.min(line.y1, line.y2) - t / 2}px`, width: `${t}px`, height: `${Math.abs(line.y2 - line.y1) + t}px` },
    { position: 'absolute', background: line.color })
    body.appendChild(el)
  }
  if (((table.style.cellGapX ?? 0) > 0 || (table.style.cellGapY ?? 0) > 0) && table.style.outer) {
    const outline = document.createElement('div')
    Object.assign(outline.style, {
      position: 'absolute',
      left: `${pad}px`,
      top: `${pad}px`,
      width: `${layout.width}px`,
      height: `${layout.height}px`,
      boxSizing: 'border-box',
      border: `${table.style.outer.width}px solid ${table.style.outer.color}`,
      borderRadius: `${Math.min(table.style.cellRadius ?? 0, layout.width / 2, layout.height / 2)}px`,
      pointerEvents: 'none',
    })
    root.appendChild(outline)
  }
  return root
}

/** the text of an editable cell: every block is a line, a line break inside a block too (the browser makes a block of each Enter) */
export function readEditable(root: HTMLElement): string {
  const lines: string[] = []
  let current: string | null = null
  const startLine = () => {
    if (current !== null) lines.push(current)
    current = ''
  }
  const add = (text: string) => {
    if (current === null) current = ''
    current += text
  }
  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        ;(child.nodeValue ?? '').split('\n').forEach((part, i) => {
          if (i > 0) startLine()
          add(part)
        })
      } else if (child instanceof HTMLBRElement) {
        // the placeholder that keeps an empty block open is no line break of its own
        if (child.parentElement && child.parentElement !== root && child.parentElement.childNodes.length === 1) return
        if (current === null) current = ''
        startLine()
      } else if (child instanceof HTMLElement) {
        if (/^(DIV|P|LI)$/.test(child.tagName)) startLine()
        walk(child)
      }
    })
  }
  walk(root)
  if (current !== null) lines.push(current)
  return lines.join('\n')
}
