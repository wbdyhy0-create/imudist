import { useEffect, useState } from 'react'
import { useFontCatalog } from '../fonts'
import { setHeaderFooter, tableRows, type CellVAlign, type TableData, type TableStroke, type TableStyle } from '../table'
import { withoutFormulas } from '../tableFormulas'
import type { TextAlign } from '../document'
import { FontPicker } from './FontPicker'
import { t } from '../i18n'

interface Props {
  table: TableData
  /** why the dialog was opened, when it was not by the user asking for the options (a formula was asked for in a table that cannot have one) */
  hint?: string
  onApply: (table: TableData) => void
  onClose: () => void
}

const ALIGNS: { id: TextAlign; label: string }[] = [
  { id: 'right', label: 'ימין' },
  { id: 'center', label: 'מרכז' },
  { id: 'left', label: 'שמאל' },
  { id: 'justify', label: 'מיושר' },
]
const VALIGNS: { id: CellVAlign; label: string }[] = [
  { id: 'top', label: 'למעלה' },
  { id: 'middle', label: 'באמצע' },
  { id: 'bottom', label: 'למטה' },
]

const number = (value: string, fallback: number) => (value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : fallback)

function StrokeField({ label, value, onChange }: { label: string; value: TableStroke | null; onChange: (stroke: TableStroke | null) => void }) {
  const last = value ?? { color: '#000000', width: 0.5 }
  return (
    <div className="table-dialog-row">
      <label className="dlg-check"><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked ? last : null)} />{label}</label>
      <input type="color" aria-label={`${label}: ${t('צבע')}`} disabled={!value} value={last.color} onChange={(e) => onChange({ ...last, color: e.target.value })} />
      <input className="select table-dialog-number" type="number" step={0.25} min={0.1} max={40} aria-label={`${label}: ${t('עובי')}`} disabled={!value} value={last.width} onChange={(e) => onChange({ ...last, width: Math.min(40, Math.max(0.1, number(e.target.value, last.width))) })} />
    </div>
  )
}

function AlternateStrokeField({ label, value, onChange }: { label: string; value?: TableStroke; onChange: (stroke: TableStroke | undefined) => void }) {
  const fallback = value ?? { color: '#000000', width: 0.5 }
  return (
    <div className="table-dialog-row">
      <label className="dlg-check"><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked ? fallback : undefined)} />{label}</label>
      <input type="color" aria-label={`${label}: ${t('צבע')}`} disabled={!value} value={fallback.color} onChange={(e) => onChange({ ...fallback, color: e.target.value })} />
      <input className="select table-dialog-number" type="number" step={0.25} min={0.1} max={40} aria-label={`${label}: ${t('עובי')}`} disabled={!value} value={fallback.width} onChange={(e) => onChange({ ...fallback, width: Math.min(40, Math.max(0.1, number(e.target.value, fallback.width))) })} />
    </div>
  )
}

function FillField({ label, value, onChange }: { label: string; value: string | null; onChange: (fill: string | null) => void }) {
  return (
    <div className="table-dialog-row">
      <label className="dlg-check"><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked ? '#e6e6e6' : null)} />{label}</label>
      <input type="color" aria-label={`${label}: ${t('צבע')}`} disabled={!value} value={value ?? '#e6e6e6'} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

export function TableOptionsDialog({ table, hint, onApply, onClose }: Props) {
  const [calculation, setCalculation] = useState(table.calculation === true)
  const hasFormulas = table.cells.some((row) => row.some((cell) => cell.formula !== undefined))
  const [style, setStyle] = useState<TableStyle>(table.style)
  const [headerRows, setHeaderRows] = useState(table.headerRows)
  const [footerRows, setFooterRows] = useState(table.footerRows)
  const catalog = useFontCatalog()
  const patch = (next: Partial<TableStyle>) => setStyle((current) => ({ ...current, ...next }))

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const apply = () => {
    const sized = setHeaderFooter({ ...table, style }, headerRows, footerRows)
    if (calculation) return onApply({ ...sized, calculation: true })
    // a table that is not a calculation table has no formulas: what they showed stays as text
    const { calculation: _was, ...plain } = sized
    onApply(withoutFormulas(plain))
  }

  return (
    <div className="modal-backdrop">
      <div className="modal table-dialog wide" role="dialog" aria-modal="true" aria-label={t('אפשרויות טבלה')}>
        <h2>{t('אפשרויות טבלה')}</h2>

        {hint && <p className="muted" role="status">{t(hint)}</p>}
        <h3 className="window-text-section">{t('סוג הטבלה')}</h3>
        <label className="dlg-check" title={t('בטבלת חישוב אפשר לכתוב בתאים נוסחאות (סכום, ממוצע ועוד), והתוצאות מתעדכנות מעצמן')}>
          <input type="checkbox" checked={calculation} onChange={(e) => setCalculation(e.target.checked)} />{t('טבלת חישוב (נוסחאות בתאים)')}
        </label>
        {!calculation && hasFormulas && <p className="muted">{t('הנוסחאות שבטבלה יוסרו, והתוצאות שלהן יישארו בתאים כטקסט.')}</p>}

        <h3 className="window-text-section">{t('שורות')}</h3>
        <div className="table-dialog-grid">
          <label className="field-label table-dialog-field">{t('שורות כותרת עליונה')}
            <input className="select" type="number" min={0} max={tableRows(table)} value={headerRows} onChange={(e) => setHeaderRows(Math.max(0, Math.round(number(e.target.value, 0))))} />
          </label>
          <label className="field-label table-dialog-field">{t('שורות כותרת תחתונה')}
            <input className="select" type="number" min={0} max={tableRows(table)} value={footerRows} onChange={(e) => setFooterRows(Math.max(0, Math.round(number(e.target.value, 0))))} />
          </label>
        </div>

        <h3 className="window-text-section">{t('קווים')}</h3>
        <StrokeField label={t('מסגרת חיצונית')} value={style.outer} onChange={(outer) => patch({ outer })} />
        <StrokeField label={t('קווים בין שורות')} value={style.rowStroke} onChange={(rowStroke) => patch({ rowStroke })} />
        <AlternateStrokeField label={t('קו חלופי בין שורות')} value={style.rowStrokeAlternate} onChange={(rowStrokeAlternate) => patch({ rowStrokeAlternate })} />
        <StrokeField label={t('קווים בין עמודות')} value={style.colStroke} onChange={(colStroke) => patch({ colStroke })} />
        <AlternateStrokeField label={t('קו חלופי בין עמודות')} value={style.colStrokeAlternate} onChange={(colStrokeAlternate) => patch({ colStrokeAlternate })} />

        <h3 className="window-text-section">{t('מרווח בין תאים')}</h3>
        <div className="table-dialog-grid">
          <label className="field-label table-dialog-field">{t('אופקי (pt)')}
            <input className="select" type="number" min={0} max={200} step={0.5} value={style.cellGapX ?? 0} onChange={(e) => patch({ cellGapX: Math.min(200, Math.max(0, number(e.target.value, style.cellGapX ?? 0))) })} />
          </label>
          <label className="field-label table-dialog-field">{t('אנכי (pt)')}
            <input className="select" type="number" min={0} max={200} step={0.5} value={style.cellGapY ?? 0} onChange={(e) => patch({ cellGapY: Math.min(200, Math.max(0, number(e.target.value, style.cellGapY ?? 0))) })} />
          </label>
          <label className="field-label table-dialog-field">{t('רדיוס פינות התאים (pt)')}
            <input className="select" type="number" min={0} max={100} step={0.5} value={style.cellRadius ?? 0} onChange={(e) => patch({ cellRadius: Math.min(100, Math.max(0, number(e.target.value, style.cellRadius ?? 0))) })} />
          </label>
        </div>
        <label className="dlg-check">
          <input type="checkbox" checked={!!style.headerContinuous} disabled={(style.cellGapX ?? 0) === 0 && (style.cellGapY ?? 0) === 0 || headerRows === 0} onChange={(e) => patch({ headerContinuous: e.target.checked })} />
          {t('כותרת רציפה, כמו בטבלה רגילה')}
        </label>

        <h3 className="window-text-section">{t('צבעי רקע')}</h3>
        <FillField label={t('שורות כותרת עליונה')} value={style.headerFill} onChange={(headerFill) => patch({ headerFill })} />
        <FillField label={t('שורות כותרת תחתונה')} value={style.footerFill} onChange={(footerFill) => patch({ footerFill })} />
        <FillField label={t('שורות גוף זוגיות')} value={style.bodyFill ?? null} onChange={(bodyFill) => patch({ bodyFill })} />
        <FillField label={t('שורות גוף אי-זוגיות')} value={style.stripeFill} onChange={(stripeFill) => patch({ stripeFill })} />

        <h3 className="window-text-section">{t('טקסט בתאים')}</h3>
        <div className="field-label">{t('גופן')}</div>
        <FontPicker value={style.fontFamily} families={catalog.families} onChange={(fontFamily) => patch({ fontFamily })} />
        <div className="table-dialog-grid">
          <label className="field-label table-dialog-field">{t('גודל')}
            <input className="select" type="number" min={1} max={500} step={0.5} value={style.fontSize} onChange={(e) => patch({ fontSize: Math.min(500, Math.max(1, number(e.target.value, style.fontSize))) })} />
          </label>
          <label className="field-label table-dialog-field">{t('צבע')}
            <input type="color" value={style.color} onChange={(e) => patch({ color: e.target.value })} />
          </label>
          <label className="field-label table-dialog-field">{t('יישור')}
            <select className="select" value={style.align} onChange={(e) => patch({ align: e.target.value as TextAlign })}>
              {ALIGNS.map((a) => <option key={a.id} value={a.id}>{t(a.label)}</option>)}
            </select>
          </label>
          <label className="field-label table-dialog-field">{t('יישור אנכי')}
            <select className="select" value={style.valign} onChange={(e) => patch({ valign: e.target.value as CellVAlign })}>
              {VALIGNS.map((a) => <option key={a.id} value={a.id}>{t(a.label)}</option>)}
            </select>
          </label>
          <label className="field-label table-dialog-field">{t('שוליים אופקיים בתא')}
            <input className="select" type="number" min={0} max={200} step={0.5} value={style.insetX} onChange={(e) => patch({ insetX: Math.min(200, Math.max(0, number(e.target.value, style.insetX))) })} />
          </label>
          <label className="field-label table-dialog-field">{t('שוליים אנכיים בתא')}
            <input className="select" type="number" min={0} max={200} step={0.5} value={style.insetY} onChange={(e) => patch({ insetY: Math.min(200, Math.max(0, number(e.target.value, style.insetY))) })} />
          </label>
        </div>

        <div className="modal-buttons">
          <button className="btn primary" onClick={apply}>{t('אישור')}</button>
          <button className="btn" onClick={onClose}>{t('ביטול')}</button>
        </div>
      </div>
    </div>
  )
}
