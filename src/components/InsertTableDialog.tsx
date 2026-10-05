import { useEffect, useState } from 'react'
import { MAX_TABLE_COLS, MAX_TABLE_ROWS } from '../table'

export interface InsertTableOptions {
  rows: number
  cols: number
  headerRows: number
  footerRows: number
  layout: 'continuous' | 'separated'
  cellGapX: number
  cellGapY: number
  cellRadius: number
  headerContinuous: boolean
}

interface Props {
  onConfirm: (options: InsertTableOptions) => void
  onClose: () => void
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number.isFinite(value) ? value : min)))

export function InsertTableDialog({ onConfirm, onClose }: Props) {
  const [rows, setRows] = useState(4)
  const [cols, setCols] = useState(3)
  const [headerRows, setHeaderRows] = useState(1)
  const [footerRows, setFooterRows] = useState(0)
  const [layout, setLayout] = useState<InsertTableOptions['layout']>('continuous')
  const [cellGapX, setCellGapX] = useState(4)
  const [cellGapY, setCellGapY] = useState(4)
  const [roundedCells, setRoundedCells] = useState(false)
  const [cellRadius, setCellRadius] = useState(6)
  const [headerContinuous, setHeaderContinuous] = useState(true)
  const options = (): InsertTableOptions => {
    const r = clamp(rows, 1, MAX_TABLE_ROWS)
    const header = clamp(headerRows, 0, r)
    const gap = (value: number) => Math.min(200, Math.max(0, Number.isFinite(value) ? value : 4))
    return {
      rows: r,
      cols: clamp(cols, 1, MAX_TABLE_COLS),
      headerRows: header,
      footerRows: clamp(footerRows, 0, r - header),
      layout,
      cellGapX: layout === 'separated' ? gap(cellGapX) : 0,
      cellGapY: layout === 'separated' ? gap(cellGapY) : 0,
      cellRadius: layout === 'separated' && roundedCells ? Math.min(100, Math.max(0, cellRadius)) : 0,
      headerContinuous: layout === 'separated' && headerRows > 0 && headerContinuous,
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const field = (label: string, value: number, set: (n: number) => void, min: number, max: number) => (
    <label className="field-label table-dialog-field">{label}
      <input className="select" type="number" min={min} max={max} value={value} onChange={(e) => set(Number(e.target.value))} onFocus={(e) => e.target.select()} />
    </label>
  )

  return (
    <div className="modal-backdrop">
      <form className="modal table-dialog" role="dialog" aria-modal="true" aria-label="הוספת טבלה" dir="rtl" onSubmit={(e) => { e.preventDefault(); onConfirm(options()) }}>
        <h2>הוספת טבלה</h2>
        <p className="muted">הטבלה נוצרת באמצע העמוד. אפשר להוסיף ולמחוק שורות ועמודות אחר כך, מתפריט טבלה.</p>
        <label className="field-label table-dialog-field">סידור תאים
          <select className="select" value={layout} onChange={(e) => setLayout(e.target.value as InsertTableOptions['layout'])}>
            <option value="continuous">טבלה רגילה, תאים צמודים</option>
            <option value="separated">תאים מופרדים עם רווח</option>
          </select>
        </label>
        {layout === 'separated' && <div className="table-dialog-grid">
          <label className="field-label table-dialog-field">רווח אופקי בין תאים (pt)
            <input className="select" type="number" min={0} max={200} step={0.5} value={cellGapX} onChange={(e) => setCellGapX(Number(e.target.value))} />
          </label>
          <label className="field-label table-dialog-field">רווח אנכי בין תאים (pt)
            <input className="select" type="number" min={0} max={200} step={0.5} value={cellGapY} onChange={(e) => setCellGapY(Number(e.target.value))} />
          </label>
          <label className="field-label table-dialog-field">פינות התאים
            <select className="select" value={roundedCells ? 'rounded' : 'square'} onChange={(e) => setRoundedCells(e.target.value === 'rounded')}>
              <option value="square">זוויתיות</option>
              <option value="rounded">מעוגלות</option>
            </select>
          </label>
          {roundedCells && <label className="field-label table-dialog-field">רדיוס פינה (pt)
            <input className="select" type="number" min={0} max={100} step={0.5} value={cellRadius} onChange={(e) => setCellRadius(Number(e.target.value))} />
          </label>}
          {headerRows > 0 && <label className="dlg-check"><input type="checkbox" checked={headerContinuous} onChange={(e) => setHeaderContinuous(e.target.checked)} />כותרת רציפה, כמו בטבלה רגילה</label>}
        </div>}
        <div className="table-dialog-grid">
          {field('שורות', rows, setRows, 1, MAX_TABLE_ROWS)}
          {field('עמודות', cols, setCols, 1, MAX_TABLE_COLS)}
          {field('שורות כותרת עליונה', headerRows, setHeaderRows, 0, rows)}
          {field('שורות כותרת תחתונה', footerRows, setFooterRows, 0, rows)}
        </div>
        <div className="modal-buttons">
          <button className="btn primary" type="submit" autoFocus>הוספה</button>
          <button className="btn" type="button" onClick={onClose}>ביטול</button>
        </div>
      </form>
    </div>
  )
}
