import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormulaFormat, TableData } from '../table'
import { cellName, columnLabel, FORMULA_FUNCTIONS, formulaProblem, setCellFormula } from '../tableFormulas'
import { t } from '../i18n'

interface Props {
  table: TableData
  /** the cell the formula goes in (the origin of a merged cell) */
  row: number
  col: number
  /** the formula the cell has now */
  formula?: string
  format?: FormulaFormat
  /** returns what is wrong, or null when the formula was put in (the dialog then closes) */
  onApply: (formula: string, format: FormulaFormat | undefined) => string | null
  onRemove: () => void
  onClose: () => void
}

/** a formula for one cell of a table: its text, a result format and a look at the result before it goes in */
export function TableFormulaDialog({ table, row, col, formula, format, onApply, onRemove, onClose }: Props) {
  const [source, setSource] = useState(formula ?? '=')
  const [decimals, setDecimals] = useState<string>(format?.decimals === undefined ? '' : String(format.decimals))
  const [thousands, setThousands] = useState(!!format?.thousands)
  const [prefix, setPrefix] = useState(format?.prefix ?? '')
  const [suffix, setSuffix] = useState(format?.suffix ?? '')
  const [problem, setProblem] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    input.current?.focus()
    input.current?.setSelectionRange(source.length, source.length)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose])

  const chosenFormat = (): FormulaFormat | undefined => {
    const out: FormulaFormat = {}
    if (decimals.trim() !== '' && Number.isFinite(Number(decimals))) out.decimals = Math.min(10, Math.max(0, Math.round(Number(decimals))))
    if (thousands) out.thousands = true
    if (prefix) out.prefix = prefix
    if (suffix) out.suffix = suffix
    return Object.keys(out).length ? out : undefined
  }

  // what the cell would show, so a mistake is seen before the formula goes in
  const preview = useMemo(() => {
    const found = formulaProblem(source, table)
    if (found) return { problem: found, result: '' }
    const out = setCellFormula(table, row, col, source, chosenFormat())
    return out.ok ? { problem: null, result: out.table.cells[row][col].text } : { problem: out.problem, result: '' }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, table, row, col, decimals, thousands, prefix, suffix])

  const insert = (text: string) => {
    const body = source.trim() === '' ? '=' : source
    setSource(body === '=' ? `=${text}` : `${body}${/[(+\-*/^,;:]$/.test(body) ? '' : '+'}${text}`)
    setProblem(null)
    input.current?.focus()
  }

  const name = cellName(row, col)
  const first = Math.min(table.headerRows, row)
  const above = row > first ? `SUM(${columnLabel(col)}${first + 1}:${columnLabel(col)}${row})` : null
  const before = col > 0 ? `SUM(${columnLabel(0)}${row + 1}:${columnLabel(col - 1)}${row + 1})` : null

  return (
    <div className="modal-backdrop">
      <form
        className="modal table-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('נוסחה בתא')}
       
        onSubmit={(event) => {
          event.preventDefault()
          setProblem(onApply(source, chosenFormat()))
        }}
      >
        <h2>{t('נוסחה בתא {name}', { name })}</h2>
        <p className="muted">
          {t('תא נקרא לפי העמודה והשורה: A1 הוא התא הראשון בשורה הראשונה (בטבלה מימין לשמאל, הימני ביותר), B1 הבא אחריו, ו-A2 מתחתיו.')}{' '}
          {t('טווח כותבים בשני קצותיו: A1:A5. הנוסחה מתעדכנת מעצמה כשהתאים משתנים. הקלדה בתא מסירה את הנוסחה.')}
        </p>
        <label className="field-label table-dialog-field">{t('נוסחה')}
          <input
            ref={input}
            className="select"
            dir="ltr"
            value={source}
            spellCheck={false}
            placeholder="=SUM(A1:A5)"
            onChange={(event) => {
              setSource(event.target.value)
              setProblem(null)
            }}
          />
        </label>
        <div className="modal-buttons">
          {above && <button type="button" className="btn" onClick={() => insert(above)}>{t('סכום התאים שמעל')}</button>}
          {before && <button type="button" className="btn" onClick={() => insert(before)}>{t('סכום התאים שלפני')}</button>}
          <label className="field-label table-dialog-field">{t('הוספת פונקציה')}
            <select
              className="select"
              value=""
              onChange={(event) => {
                if (event.target.value) insert(event.target.value)
              }}
            >
              <option value="">{t('בחירה…')}</option>
              {FORMULA_FUNCTIONS.map((fn) => <option key={fn.name} value={fn.sample}>{fn.name} — {t(fn.label)}</option>)}
            </select>
          </label>
        </div>
        <div className="table-dialog-grid">
          <label className="field-label table-dialog-field">{t('ספרות אחרי הנקודה')}
            <input className="select" type="number" min={0} max={10} placeholder={t('אוטומטי')} value={decimals} onChange={(event) => setDecimals(event.target.value)} />
          </label>
          <label className="field-label table-dialog-field">{t('טקסט לפני התוצאה')}
            <input className="select" maxLength={20} value={prefix} placeholder="₪" onChange={(event) => setPrefix(event.target.value)} />
          </label>
          <label className="field-label table-dialog-field">{t('טקסט אחרי התוצאה')}
            <input className="select" maxLength={20} value={suffix} placeholder="%" onChange={(event) => setSuffix(event.target.value)} />
          </label>
        </div>
        <label className="dlg-check"><input type="checkbox" checked={thousands} onChange={(event) => setThousands(event.target.checked)} />{t('מפריד אלפים (1,234)')}</label>
        <p className="muted" aria-live="polite">
          {preview.problem ? t(preview.problem) : t('התוצאה: {result}', { result: preview.result })}
        </p>
        {problem && <p className="muted" role="alert">{t(problem)}</p>}
        <div className="modal-buttons">
          <button type="submit" className="btn primary" disabled={!!preview.problem}>{t('הכנסת הנוסחה')}</button>
          {formula !== undefined && <button type="button" className="btn" onClick={onRemove}>{t('הסרת הנוסחה')}</button>}
          <button type="button" className="btn" onClick={onClose}>{t('ביטול')}</button>
        </div>
      </form>
    </div>
  )
}
