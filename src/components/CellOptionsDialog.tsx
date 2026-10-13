import { useEffect, useState } from 'react'
import type { TextAlign } from '../document'
import type { CellVAlign, TableCell } from '../table'
import { t } from '../i18n'

/** what the dialog can change on the picked cells; a key that is `undefined` takes the setting away (the cell follows the table again) */
export type CellPatch = Partial<Pick<TableCell, 'fill' | 'align' | 'valign' | 'weight' | 'italic' | 'color' | 'insetX' | 'insetY' | 'strokes'>>

interface Props {
  /** the first picked cell, to start from */
  cell: TableCell
  count: number
  onApply: (patch: CellPatch) => void
  onClose: () => void
}

const ALIGNS: { id: TextAlign | ''; label: string }[] = [
  { id: '', get label() { return t('כמו בטבלה') } },
  { id: 'right', get label() { return t('ימין') } },
  { id: 'center', get label() { return t('מרכז') } },
  { id: 'left', get label() { return t('שמאל') } },
  { id: 'justify', get label() { return t('מיושר') } },
]
const VALIGNS: { id: CellVAlign | ''; label: string }[] = [
  { id: '', get label() { return t('כמו בטבלה') } },
  { id: 'top', get label() { return t('למעלה') } },
  { id: 'middle', get label() { return t('באמצע') } },
  { id: 'bottom', get label() { return t('למטה') } },
]
const SIDES = [
  ['top', 'עליון'], ['right', 'ימני'], ['bottom', 'תחתון'], ['left', 'שמאלי'],
] as const

type FillMode = 'table' | 'none' | 'color'

export function CellOptionsDialog({ cell, count, onApply, onClose }: Props) {
  const [fillMode, setFillMode] = useState<FillMode>(cell.fill === undefined ? 'table' : cell.fill === null ? 'none' : 'color')
  const [fill, setFill] = useState(cell.fill ?? '#ffff99')
  const [align, setAlign] = useState<TextAlign | ''>(cell.align ?? '')
  const [valign, setValign] = useState<CellVAlign | ''>(cell.valign ?? '')
  const [bold, setBold] = useState(cell.weight !== undefined && cell.weight >= 600)
  const [italic, setItalic] = useState(!!cell.italic)
  const [useColor, setUseColor] = useState(!!cell.color)
  const [color, setColor] = useState(cell.color ?? '#000000')
  const [insetX, setInsetX] = useState(cell.insetX === undefined ? '' : String(cell.insetX))
  const [insetY, setInsetY] = useState(cell.insetY === undefined ? '' : String(cell.insetY))
  const [hiddenStrokes, setHiddenStrokes] = useState(() => Object.fromEntries(SIDES.map(([side]) => [side, cell.strokes?.[side] === null])) as Record<(typeof SIDES)[number][0], boolean>)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const apply = () => onApply({
    fill: fillMode === 'table' ? undefined : fillMode === 'none' ? null : fill,
    align: align || undefined,
    valign: valign || undefined,
    weight: bold ? 700 : undefined,
    italic: italic ? true : undefined,
    color: useColor ? color : undefined,
    insetX: insetX.trim() ? Math.max(0, Math.min(200, Number(insetX))) : undefined,
    insetY: insetY.trim() ? Math.max(0, Math.min(200, Number(insetY))) : undefined,
    strokes: Object.fromEntries(SIDES.map(([side]) => [side, hiddenStrokes[side] ? null : undefined])),
  })

  return (
    <div className="modal-backdrop">
      <div className="modal table-dialog" role="dialog" aria-modal="true" aria-label={t('אפשרויות תא')}>
        <h2>{t('אפשרויות תא')}</h2>
        <p className="muted">{count > 1 ? t('ההגדרות יחולו על {count} התאים שנבחרו.', { count }) : t('ההגדרות יחולו על התא שנבחר.')}</p>

        <label className="field-label">{t('רקע התא')}
          <select className="select" value={fillMode} onChange={(e) => setFillMode(e.target.value as FillMode)}>
            <option value="table">{t('כמו בטבלה')}</option>
            <option value="none">{t('ללא')}</option>
            <option value="color">{t('צבע')}</option>
          </select>
        </label>
        {fillMode === 'color' && <input type="color" aria-label={t('צבע הרקע')} value={fill} onChange={(e) => setFill(e.target.value)} />}

        <div className="table-dialog-grid">
          <label className="field-label table-dialog-field">{t('יישור')}
            <select className="select" value={align} onChange={(e) => setAlign(e.target.value as TextAlign | '')}>
              {ALIGNS.map((a) => <option key={a.id} value={a.id}>{t(a.label)}</option>)}
            </select>
          </label>
          <label className="field-label table-dialog-field">{t('יישור אנכי')}
            <select className="select" value={valign} onChange={(e) => setValign(e.target.value as CellVAlign | '')}>
              {VALIGNS.map((a) => <option key={a.id} value={a.id}>{t(a.label)}</option>)}
            </select>
          </label>
        </div>
        <h3 className="window-text-section">{t('שוליים פנימיים בתא')}</h3>
        <div className="table-dialog-grid">
          <label className="field-label table-dialog-field">{t('אופקיים')}
            <input className="select" type="number" min={0} max={200} step={0.5} placeholder={t('כמו בטבלה')} value={insetX} onChange={(e) => setInsetX(e.target.value)} />
          </label>
          <label className="field-label table-dialog-field">{t('אנכיים')}
            <input className="select" type="number" min={0} max={200} step={0.5} placeholder={t('כמו בטבלה')} value={insetY} onChange={(e) => setInsetY(e.target.value)} />
          </label>
        </div>
        <label className="dlg-check"><input type="checkbox" checked={bold} onChange={(e) => setBold(e.target.checked)} />{t('מודגש')}</label>
        <label className="dlg-check"><input type="checkbox" checked={italic} onChange={(e) => setItalic(e.target.checked)} />{t('נטוי')}</label>
        <div className="table-dialog-row">
          <label className="dlg-check"><input type="checkbox" checked={useColor} onChange={(e) => setUseColor(e.target.checked)} />{t('צבע טקסט')}</label>
          <input type="color" aria-label={t('צבע הטקסט')} disabled={!useColor} value={color} onChange={(e) => setColor(e.target.value)} />
        </div>

        <h3 className="window-text-section">{t('קווים מסביב לתא')}</h3>
        <div className="table-dialog-grid">
          {SIDES.map(([side, label]) => <label className="field-label table-dialog-field" key={side}>{t(label)}
            <select className="select" value={hiddenStrokes[side] ? 'none' : 'table'} onChange={(e) => setHiddenStrokes((current) => ({ ...current, [side]: e.target.value === 'none' }))}>
              <option value="table">{t('כמו בטבלה')}</option>
              <option value="none">{t('ללא קו')}</option>
            </select>
          </label>)}
        </div>

        <div className="modal-buttons">
          <button className="btn primary" onClick={apply}>{t('אישור')}</button>
          <button className="btn" onClick={onClose}>{t('ביטול')}</button>
        </div>
      </div>
    </div>
  )
}
