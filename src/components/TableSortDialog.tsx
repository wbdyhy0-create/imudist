import { useEffect, useState } from 'react'
import type { CellRange, TableData } from '../table'
import { tableCols, tableRows } from '../table'
import { columnLabel, parseCellNumber } from '../tableFormulas'
import { SORT_LOCALES, type SortKey, type SortOptions, type SortScope } from '../tableSort'

interface Props {
  table: TableData
  /** the cells that are selected, when some are (a single cell is not a selection to sort) */
  selection: CellRange | null
  /** returns what is wrong, or null when the table was sorted (the dialog then closes) */
  onApply: (options: SortOptions) => string | null
  onClose: () => void
}

/** a column as the list shows it: its letter, and the text of its header when the table has one */
const columnName = (table: TableData, col: number) => {
  const header = table.headerRows > 0 ? table.cells[table.headerRows - 1][col].text.trim() : ''
  return header ? `${columnLabel(col)} — ${header.slice(0, 24)}` : `עמודה ${columnLabel(col)}`
}

/** whether most of what a column holds (in the body of the table) is numbers: then it is sorted as numbers by default */
function mostlyNumbers(table: TableData, col: number): boolean {
  let numbers = 0
  let others = 0
  for (let r = table.headerRows; r < tableRows(table) - table.footerRows; r++) {
    const text = table.cells[r][col].text.trim()
    if (!text) continue
    if (parseCellNumber(text) !== null) numbers++
    else others++
  }
  return numbers > others
}

/** the sort dialog of a table: up to three columns, text or numbers, up or down, in the rules of a language */
export function TableSortDialog({ table, selection, onApply, onClose }: Props) {
  const cols = tableCols(table)
  const hasSelection = !!selection && (selection.r1 > selection.r0 || selection.c1 > selection.c0)
  const startColumn = Math.min(cols - 1, Math.max(0, selection?.c0 ?? 0))
  const [scope, setScope] = useState<SortScope>(hasSelection ? 'selection' : 'table')
  const [keys, setKeys] = useState<(SortKey | null)[]>(() => [
    { col: startColumn, type: mostlyNumbers(table, startColumn) ? 'number' : 'text', descending: false },
    null,
    null,
  ])
  const [locale, setLocale] = useState('he')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const setKey = (index: number, next: SortKey | null) => setKeys((current) => current.map((key, i) => (i === index ? next : key)))
  const chosen = keys.filter((key): key is SortKey => !!key)

  const submit = () => {
    if (chosen.length === 0) {
      setProblem('בחרו עמודה למיון')
      return
    }
    setProblem(onApply({
      keys: chosen,
      scope,
      locale,
      caseSensitive,
      ...(scope === 'selection' && selection ? { selection } : {}),
      ...(scope === 'column' ? { column: chosen[0].col } : {}),
    }))
  }

  return (
    <div className="modal-backdrop">
      <form className="modal table-dialog" role="dialog" aria-modal="true" aria-label="מיון הטבלה" dir="rtl" onSubmit={(event) => { event.preventDefault(); submit() }}>
        <h2>מיון הטבלה</h2>
        <p className="muted">שורות הכותרת והסיכום נשארות במקומן. הנוסחאות עוברות עם השורות שלהן.</p>
        <label className="field-label table-dialog-field">מה למיין
          <select className="select" value={scope} onChange={(event) => setScope(event.target.value as SortScope)}>
            <option value="table">כל הטבלה (השורות עוברות שלמות)</option>
            <option value="column">העמודה הראשונה שנבחרה בלבד</option>
            <option value="selection" disabled={!hasSelection}>התאים שנבחרו בלבד</option>
          </select>
        </label>
        {keys.map((key, index) => (
          <div key={index} className="table-dialog-grid">
            <label className="field-label table-dialog-field">{index === 0 ? 'מיין לפי' : index === 1 ? 'ואז לפי' : 'ואז לפי'}
              <select
                className="select"
                value={key ? key.col : ''}
                disabled={index > 0 && !keys[index - 1]}
                onChange={(event) => {
                  if (event.target.value === '') return setKey(index, null)
                  const col = Number(event.target.value)
                  setKey(index, { col, type: key?.type ?? (mostlyNumbers(table, col) ? 'number' : 'text'), descending: key?.descending ?? false })
                }}
              >
                {index > 0 && <option value="">(אין)</option>}
                {Array.from({ length: cols }, (_, col) => <option key={col} value={col}>{columnName(table, col)}</option>)}
              </select>
            </label>
            <label className="field-label table-dialog-field">סוג
              <select className="select" disabled={!key} value={key?.type ?? 'text'} onChange={(event) => key && setKey(index, { ...key, type: event.target.value as SortKey['type'] })}>
                <option value="text">טקסט</option>
                <option value="number">מספרים</option>
              </select>
            </label>
            <label className="field-label table-dialog-field">סדר
              <select className="select" disabled={!key} value={key?.descending ? 'down' : 'up'} onChange={(event) => key && setKey(index, { ...key, descending: event.target.value === 'down' })}>
                <option value="up">עולה (א–ת, 1–9)</option>
                <option value="down">יורד (ת–א, 9–1)</option>
              </select>
            </label>
          </div>
        ))}
        <div className="table-dialog-grid">
          <label className="field-label table-dialog-field">כללי השפה
            <select className="select" value={locale} onChange={(event) => setLocale(event.target.value)}>
              {SORT_LOCALES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
        </div>
        <label className="dlg-check"><input type="checkbox" checked={caseSensitive} onChange={(event) => setCaseSensitive(event.target.checked)} />רגיש לאותיות גדולות וקטנות</label>
        {problem && <p className="muted" role="alert">{problem}</p>}
        <div className="modal-buttons">
          <button type="submit" className="btn primary">מיון</button>
          <button type="button" className="btn" onClick={onClose}>ביטול</button>
        </div>
      </form>
    </div>
  )
}
