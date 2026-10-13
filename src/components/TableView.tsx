import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { ShapeFrame } from '../document'
import { featherMaskStyles } from '../feather'
import {
  borderX, cellCornerRadii, cellRect, cellSideStroke, dragColumnBorder, expandRange, insertRows, originsOf, resolveCell, setCellText, setRowMinHeight, tableCols, tableLines, tableRows,
  type CellRange, type Origin, type TableData, type TableLayout,
} from '../table'
import { cellTextCss, layoutOfShape, readEditable } from '../tableLayout'
import { isTyping } from '../dom'
import { t } from '../i18n'

/** the cells the user has picked in a table: one cell (maybe being typed into) or a range of them */
export interface TableSelection extends CellRange {
  /** the caret is in the cell, as opposed to the cell itself (or a range of cells) being selected */
  editing: boolean
}

interface Props {
  shape: ShapeFrame & { table: TableData }
  layout: TableLayout
  zoom: number
  /** the table is the selected object: its cells can be picked and typed into */
  selected: boolean
  /** outlines and handles are non-printing: hidden in Preview mode */
  showEdge: boolean
  locked?: boolean
  selection: TableSelection | null
  onSelection: (selection: TableSelection | null) => void
  onContextMenu: (selection: CellRange, x: number, y: number) => void
  /** a new version of the table (the size follows from it); the key lets typing in one cell become one undo step */
  onTable: (table: TableData, key?: string) => void
  /** pressing on the table itself: pick it as an object and start moving it */
  onBodyPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
}

/** the editable form of a text: a block per line, so what the browser does with Enter and what is saved agree */
function fillEditable(el: HTMLElement, text: string) {
  el.replaceChildren(...text.split('\n').map((line) => {
    const block = document.createElement('div')
    if (line) block.textContent = line
    else block.appendChild(document.createElement('br'))
    return block
  }))
}

const sameRange = (a: CellRange | null, b: CellRange | null) => !!a && !!b && a.r0 === b.r0 && a.c0 === b.c0 && a.r1 === b.r1 && a.c1 === b.c1

interface EditorProps {
  text: string
  css: CSSProperties
  /** where the pointer went down (screen), so the caret goes there; missing: the end of the text */
  caretAt: { x: number; y: number } | null
  onText: (text: string) => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void
}

function CellEditor({ text, css, caretAt, onText, onKeyDown }: EditorProps) {
  const ref = useRef<HTMLDivElement>(null)
  const emitted = useRef<string | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // what the cell says changed from outside (undo, another way to edit): show it. Typing is never overwritten.
    if (emitted.current !== text) {
      fillEditable(el, text)
      emitted.current = text
      if (document.activeElement === el) {
        // an undo rewrote the text under the caret: it goes to the end of it
        const range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
        window.getSelection()?.removeAllRanges()
        window.getSelection()?.addRange(range)
      }
    }
  }, [text])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus({ preventScroll: true })
    const selection = window.getSelection()
    if (!selection) return
    const range = document.createRange()
    let placed = false
    if (caretAt) {
      const hit = (document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }).caretRangeFromPoint?.(caretAt.x, caretAt.y)
      if (hit && el.contains(hit.startContainer)) {
        selection.removeAllRanges()
        selection.addRange(hit)
        placed = true
      }
    }
    if (!placed) {
      range.selectNodeContents(el)
      range.collapse(false)
      selection.removeAllRanges()
      selection.addRange(range)
    }
    // only when the editor first appears
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div
      ref={ref}
      className="table-cell-editor"
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck={false}
      style={css}
      onInput={() => {
        const el = ref.current
        if (!el) return
        const next = readEditable(el)
        emitted.current = next
        onText(next)
      }}
      onKeyDown={onKeyDown}
      // a click in the text is for the caret, not for the table underneath
      onPointerDown={(e) => e.stopPropagation()}
    />
  )
}

const GRIP = 8

export function TableView({ shape, layout, zoom, selected, showEdge, locked, selection, onSelection, onContextMenu, onTable, onBodyPointerDown }: Props) {
  const table = shape.table
  const rootRef = useRef<HTMLDivElement>(null)
  const caretAt = useRef<{ x: number; y: number } | null>(null)
  const anchor = useRef<[number, number] | null>(null)
    const [equalHeightGuide, setEqualHeightGuide] = useState<{ row: number; reference: number } | null>(null)
  const interactive = selected && !locked && showEdge
  const origins = useMemo(() => originsOf(table), [table])
  const lines = useMemo(() => tableLines(table, layout), [table, layout])
  const rtl = table.rtl !== false
  const rows = tableRows(table)
  const cols = tableCols(table)
  const latest = useRef({ table, selection, layout })
  latest.current = { table, selection, layout }
  const px = (n: number) => n * zoom

  const commit = (next: TableData, key?: string) => onTable(next, key)

  /** the real cell under a screen position, or null */
  const cellAtPoint = (clientX: number, clientY: number): Origin | null => {
    const root = rootRef.current
    if (!root) return null
    const box = root.getBoundingClientRect()
    const x = (clientX - box.left) / zoom
    const y = (clientY - box.top) / zoom
    const { layout: l } = latest.current
    return origins.find((o) => {
      const r = cellRect(l, o)
      return x >= r.left && x < r.left + r.width && y >= r.top && y < r.top + r.height
    }) ?? null
  }

  const pick = (o: CellRange, editing: boolean) => onSelection({ r0: o.r0, c0: o.c0, r1: o.r1, c1: o.c1, editing })

  const onTableContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!showEdge || locked) return
    const origin = cellAtPoint(e.clientX, e.clientY)
    if (!origin) return
    e.preventDefault()
    e.stopPropagation()
    const current = latest.current.selection
    const keepRange = current && !current.editing && origin.r0 >= current.r0 && origin.r1 <= current.r1 && origin.c0 >= current.c0 && origin.c1 <= current.c1
    const area = keepRange ? current : origin
    window.getSelection()?.removeAllRanges()
    pick(area, false)
    onContextMenu(area, e.clientX, e.clientY)
  }

  const onCellPointerDown = (o: Origin) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    if (!interactive) {
      onBodyPointerDown(e)
      return
    }
    e.stopPropagation()
    const current = latest.current.selection
    if (e.shiftKey && current) {
      const from: [number, number] = anchor.current ?? [current.r0, current.c0]
      const area = expandRange(table, { r0: Math.min(from[0], o.r0), c0: Math.min(from[1], o.c0), r1: Math.max(from[0], o.r0), c1: Math.max(from[1], o.c0) })
      e.preventDefault()
      onSelection({ ...area, editing: false })
      return
    }
    anchor.current = [o.r0, o.c0]
    caretAt.current = { x: e.clientX, y: e.clientY }
    const alreadyHere = current && sameRange(current, o) && current.editing
    if (!alreadyHere) pick(o, true)
    // dragging over other cells turns the single cell into a range of cells
    const move = (event: PointerEvent) => {
      const over = cellAtPoint(event.clientX, event.clientY)
      const start = anchor.current
      if (!over || !start || (over.r0 === o.r0 && over.c0 === o.c0)) return
      const area = expandRange(latest.current.table, { r0: Math.min(start[0], over.r0), c0: Math.min(start[1], over.c0), r1: Math.max(start[0], over.r1), c1: Math.max(start[1], over.c1) })
      window.getSelection()?.removeAllRanges()
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      onSelection({ ...area, editing: false })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // ── keyboard ────────────────────────────────────────────────────────────────
  const order = useMemo(() => origins.map((o) => [o.r0, o.c0] as const), [origins])

  const goTo = (r: number, c: number, editing: boolean, within: TableData = latest.current.table) => {
    const o = originsOf(within).find((x) => x.r0 <= r && x.r1 >= r && x.c0 <= c && x.c1 >= c)
    if (o) {
      caretAt.current = null
      anchor.current = [o.r0, o.c0]
      pick(o, editing)
    }
  }

  const step = (from: CellRange, delta: 1 | -1, editing: boolean) => {
    const at = order.findIndex(([r, c]) => r === from.r0 && c === from.c0)
    const next = order[at + delta]
    if (next) {
      goTo(next[0], next[1], editing)
    } else if (delta === 1) {
      // Tab out of the last cell adds a row, like in the programs this one follows
      const grown = insertRows(latest.current.table, rows)
      commit(grown, 'table-structure')
      goTo(rows, 0, editing, grown)
    }
  }

  const onEditorKeyDown = (o: Origin) => (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      step(o, e.shiftKey ? -1 : 1, true)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      pick(o, false)
      ;(e.currentTarget as HTMLElement).blur()
    }
  }

  // with a cell (or several) picked but no caret in it: arrows move, Enter or typing starts editing, Delete clears
  useEffect(() => {
    if (!interactive || !selection || selection.editing) return
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      const sel = latest.current.selection
      if (!sel || sel.editing) return
      const t = latest.current.table
      const forward = rtl ? 'ArrowLeft' : 'ArrowRight'
      const back = rtl ? 'ArrowRight' : 'ArrowLeft'
      const move = (dr: number, dc: number) => {
        e.preventDefault()
        e.stopImmediatePropagation()
        const r = Math.min(tableRows(t) - 1, Math.max(0, (dr > 0 ? sel.r1 : sel.r0) + dr))
        const c = Math.min(tableCols(t) - 1, Math.max(0, (dc > 0 ? sel.c1 : sel.c0) + dc))
        goTo(r, c, false)
      }
      if (e.key === 'ArrowDown') move(1, 0)
      else if (e.key === 'ArrowUp') move(-1, 0)
      else if (e.key === forward) move(0, 1)
      else if (e.key === back) move(0, -1)
      else if (e.key === 'Tab') {
        e.preventDefault()
        e.stopImmediatePropagation()
        step(sel, e.shiftKey ? -1 : 1, false)
      } else if (e.key === 'Enter' || e.key === 'F2') {
        e.preventDefault()
        e.stopImmediatePropagation()
        goTo(sel.r0, sel.c0, true)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        onSelection(null)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        e.stopImmediatePropagation()
        let next = t
        for (const o of originsOf(t)) if (o.r0 >= sel.r0 && o.r1 <= sel.r1 && o.c0 >= sel.c0 && o.c1 <= sel.c1) next = setCellText(next, o.r0, o.c0, '')
        if (next !== t) commit(next, 'table-clear')
      }
    }
    // before the workspace's own Delete / arrow handling, which would move or remove the whole table
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive, selection, rtl, order])

  // ── dragging the borders between columns and rows ──────────────────────────
  const dragBorder = (kind: 'col' | 'row', index: number) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const base = latest.current.table
    const baseLayout = latest.current.layout
    const move = (event: PointerEvent) => {
      if (kind === 'col') {
        const dx = (event.clientX - startX) / zoom
        commit(dragColumnBorder(base, index, rtl ? -dx : dx, shape.w), `table-col:${shape.id}`)
      } else {
        const dy = (event.clientY - startY) / zoom
        const desired = Math.max(1, baseLayout.rowHeight[index] + dy)
        let next = setRowMinHeight(base, index, desired)
        let guide: { row: number; reference: number } | null = null
        const threshold = 5 / Math.max(zoom, 0.01)
        const reference = baseLayout.rowHeight
          .map((height, row) => ({ height, row, distance: Math.abs(height - desired) }))
          .filter((candidate) => candidate.row !== index && candidate.distance <= threshold)
          .sort((a, b) => a.distance - b.distance)[0]
        if (reference) {
          const snapped = setRowMinHeight(base, index, reference.height)
          const snappedLayout = layoutOfShape({ table: snapped, w: shape.w })
          if (snappedLayout && Math.abs(snappedLayout.rowHeight[index] - reference.height) < 0.5) {
            next = snapped
            guide = { row: index, reference: reference.row }
          }
        }
        setEqualHeightGuide(guide)
        commit(next, `table-row:${shape.id}`)
      }
    }
    const up = () => {
      setEqualHeightGuide(null)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const picked = selection ? expandRange(table, selection) : null
  const editingOrigin = selection?.editing ? origins.find((o) => o.r0 === selection.r0 && o.c0 === selection.c0) : undefined

  return (
    <div
      ref={rootRef}
      className="table-body"
      style={{
        width: px(layout.width),
        height: px(layout.height),
        background: shape.fill ?? undefined,
        ...(shape.feather ? featherMaskStyles(shape.feather, px(layout.width), px(layout.height), zoom) : {}),
      }}
      onContextMenu={onTableContextMenu}
    >
      {origins.map((o) => {
        const rect = cellRect(layout, o)
        const resolved = resolveCell(table, o.r0, o.c0)
        const css = cellTextCss(resolved, rtl, zoom)
        const editing = editingOrigin === o
        const justify = resolved.valign === 'middle' ? 'center' : resolved.valign === 'bottom' ? 'flex-end' : 'flex-start'
        const separated = (table.style.cellGapX ?? 0) > 0 || (table.style.cellGapY ?? 0) > 0
        const border = (side: 'top' | 'right' | 'bottom' | 'left') => {
          const stroke = cellSideStroke(table, o, side)
          return separated ? stroke ? `${Math.max(1 / Math.max(1, window.devicePixelRatio || 1), px(stroke.width))}px solid ${stroke.color}` : 'none' : undefined
        }
        const corners = separated ? cellCornerRadii(table, o).map((radius) => px(Math.min(radius, rect.width / 2, rect.height / 2))) : [0, 0, 0, 0]
        return (
          <div
            key={`${o.r0}:${o.c0}`}
            className="table-cell"
            title={o.cell.formula}
            style={{
              left: px(rect.left),
              top: px(rect.top),
              width: px(rect.width),
              height: px(rect.height),
              background: resolved.fill ?? undefined,
              padding: `${px(resolved.insetY)}px ${px(resolved.insetX)}px`,
              justifyContent: justify,
              borderTop: border('top'),
              borderRight: border('right'),
              borderBottom: border('bottom'),
              borderLeft: border('left'),
              borderTopLeftRadius: corners[0] ? `${corners[0]}px` : undefined,
              borderTopRightRadius: corners[1] ? `${corners[1]}px` : undefined,
              borderBottomRightRadius: corners[2] ? `${corners[2]}px` : undefined,
              borderBottomLeftRadius: corners[3] ? `${corners[3]}px` : undefined,
            }}
            onPointerDown={onCellPointerDown(o)}
          >
            {editing ? (
              <CellEditor
                text={o.cell.text}
                css={css}
                caretAt={caretAt.current}
                onText={(text) => commit(setCellText(latest.current.table, o.r0, o.c0, text), `table-text:${shape.id}:${o.r0}:${o.c0}`)}
                onKeyDown={onEditorKeyDown(o)}
              />
            ) : (
              <div className="table-cell-text" style={css}>{o.cell.text.split('\n').map((line, index) => <div key={index}>{line || String.fromCharCode(8203)}</div>)}</div>
            )}
          </div>
        )
      })}

      {lines.map((line, i) => {
        const horizontal = line.y1 === line.y2
        const thickness = Math.max(1 / Math.max(1, window.devicePixelRatio || 1), line.width * zoom)
        return (
          <div
            key={i}
            className="table-line"
            style={horizontal
              ? { left: px(Math.min(line.x1, line.x2)) - thickness / 2, top: px(line.y1) - thickness / 2, width: px(Math.abs(line.x2 - line.x1)) + thickness, height: thickness, background: line.color }
              : { left: px(line.x1) - thickness / 2, top: px(Math.min(line.y1, line.y2)) - thickness / 2, width: thickness, height: px(Math.abs(line.y2 - line.y1)) + thickness, background: line.color }}
          />
        )
      })}

      {equalHeightGuide && [equalHeightGuide.row, equalHeightGuide.reference].map((row) => (
        <div
          key={`equal-height-${row}`}
          className="table-row-height-guide"
          title={t('גובה שורה זהה לשורה {n1}', { n1: equalHeightGuide.reference + 1 })}
          style={{ left: 0, top: px(layout.rowTop[row] + layout.rowHeight[row]), width: px(layout.width) }}
          aria-hidden="true"
        />
      ))}

      {(table.style.cellGapX ?? 0) > 0 || (table.style.cellGapY ?? 0) > 0 ? table.style.outer && <div
        className="table-outer-outline"
        style={{
          position: 'absolute',
          inset: 0,
          width: px(layout.width),
          height: px(layout.height),
          boxSizing: 'border-box',
          border: `${Math.max(1 / Math.max(1, window.devicePixelRatio || 1), px(table.style.outer.width))}px solid ${table.style.outer.color}`,
          borderRadius: `${Math.min(px(table.style.cellRadius ?? 0), px(layout.width / 2), px(layout.height / 2))}px`,
          pointerEvents: 'none',
        }}
      /> : null}

      {showEdge && picked && selected && origins
        .filter((o) => o.r0 >= picked.r0 && o.r1 <= picked.r1 && o.c0 >= picked.c0 && o.c1 <= picked.c1)
        .map((o) => {
          const rect = cellRect(layout, o)
          return <div key={`sel${o.r0}:${o.c0}`} className={'table-cell-mark' + (selection?.editing ? ' editing' : '')} style={{ left: px(rect.left), top: px(rect.top), width: px(rect.width), height: px(rect.height) }} />
        })}

      {interactive && (
        <>
          {Array.from({ length: cols - 1 }, (_, i) => i + 1).map((k) => (
            <div
              key={`col${k}`}
              className="table-grip col"
              title={t('גרור כדי לשנות את רוחב העמודות')}
              style={{ left: px(borderX(table, layout, k)) - GRIP / 2, top: 0, width: GRIP, height: px(layout.height) }}
              onPointerDown={dragBorder('col', k)}
            />
          ))}
          {Array.from({ length: rows }, (_, r) => r).map((r) => (
            <div
              key={`row${r}`}
              className="table-grip row"
              title={t('גרור כדי לשנות את גובה השורה')}
              style={{ left: 0, top: px(layout.rowTop[r] + layout.rowHeight[r]) - GRIP / 2, width: px(layout.width), height: GRIP }}
              onPointerDown={dragBorder('row', r)}
            />
          ))}
        </>
      )}
      {selected && showEdge && !locked && (
        <div className="table-move-grip" title={t('גרור כדי להזיז את הטבלה')} onPointerDown={onBodyPointerDown} />
      )}
    </div>
  )
}
