import { MAX_PAGE_PT, customSizeCount, minPageSize, pageSize, type DocSettings } from '../document'
import { PAGE_PRESETS, matchPreset } from '../units'
import { NumberField } from './NumberField'

interface Props {
  doc: DocSettings
  /** the selected page: its size is the one shown and changed (unless `all`) */
  page: number
  /** change every page instead of only the selected one */
  all: boolean
  onAll: (all: boolean) => void
  onSize: (width: number, height: number) => void
}

const CUSTOM = 'custom'

/** The control bar of the Page tool: the size of the selected page, a size preset and the orientation. */
export function PageToolBar({ doc, page, all, onAll, onSize }: Props) {
  const { w: width, h: height } = pageSize(doc, page)
  const landscape = width > height
  const preset = matchPreset(width, height)
  const min = minPageSize(doc)
  const custom = customSizeCount(doc)

  const orient = (toLandscape: boolean) => {
    if (toLandscape !== landscape && width !== height) onSize(height, width)
  }
  const pickPreset = (id: string) => {
    const p = PAGE_PRESETS.find((x) => x.id === id)
    if (p) onSize(landscape ? p.height : p.width, landscape ? p.width : p.height)
  }

  return (
    <div className="page-bar" role="group" aria-label="כלי עמוד">
      <span className="page-bar-badge" title="העמוד שהכלי משנה">
        {all ? 'כל העמודים' : `עמוד ${doc.startPage + page}`}
      </span>
      <label className="page-bar-field">
        <span>רוחב</span>
        <NumberField value={width} unit={doc.unit} min={min.w} max={MAX_PAGE_PT} onChange={(v) => onSize(v, height)} />
      </label>
      <label className="page-bar-field">
        <span>גובה</span>
        <NumberField value={height} unit={doc.unit} min={min.h} max={MAX_PAGE_PT} onChange={(v) => onSize(width, v)} />
      </label>
      <label className="page-bar-field">
        <span>גודל</span>
        <select className="select" value={preset?.id ?? CUSTOM} onChange={(e) => pickPreset(e.target.value)}>
          {PAGE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          <option value={CUSTOM} disabled>
            מותאם אישית
          </option>
        </select>
      </label>
      <div className="place-modes" role="group" aria-label="כיוון העמוד">
        <button className={!landscape ? 'on' : ''} title="עמוד לאורך" onClick={() => orient(false)}>
          <svg className="orient-icon" viewBox="0 0 12 16" aria-hidden="true">
            <rect x="1" y="1" width="10" height="14" rx="1" fill="none" stroke="currentColor" strokeWidth="1.400" />
          </svg>
          לאורך
        </button>
        <button className={landscape ? 'on' : ''} title="עמוד לרוחב" onClick={() => orient(true)}>
          <svg className="orient-icon" viewBox="0 0 16 12" aria-hidden="true">
            <rect x="1" y="1" width="14" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.400" />
          </svg>
          לרוחב
        </button>
      </div>
      <label className="page-bar-check" title="כשהאפשרות פעילה, שינוי הגודל חל על כל עמודי המסמך">
        <input type="checkbox" checked={all} onChange={(e) => onAll(e.target.checked)} />
        החל על כל העמודים
      </label>
      <span className="muted">
        לחיצה על עמוד בוחרת אותו, וגרירת הידיות משנה רק אותו.
        {custom > 0 ? ` ${custom} עמודים בגודל אישי.` : ''}
      </span>
    </div>
  )
}
