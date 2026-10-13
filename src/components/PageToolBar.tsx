import { MAX_PAGE_PT, isFacing, customMarginCount, customSizeCount, marginsOf, maxMargin, minPageSize, pageSize, type DocSettings, type Sides } from '../document'
import { PAGE_PRESETS, matchPreset } from '../units'
import { NumberField } from './NumberField'
import { t } from '../i18n'

interface Props {
  doc: DocSettings
  /** the selected page: its size is the one shown and changed (unless `all`) */
  page: number
  /** change every page instead of only the selected one */
  all: boolean
  onAll: (all: boolean) => void
  onSize: (width: number, height: number) => void
  /** the margins of the whole document */
  onMargins: (margins: Sides) => void
}

const CUSTOM = 'custom'

/** The control bar of the Page tool: the size of the selected page, a size preset and the orientation. */
export function PageToolBar({ doc, page, all, onAll, onSize, onMargins }: Props) {
  const { w: width, h: height } = pageSize(doc, page)
  const landscape = width > height
  const preset = matchPreset(width, height)
  const min = minPageSize(doc, all ? 'all' : page)
  const custom = customSizeCount(doc)
  const customMargins = customMarginCount(doc)
  const margins = marginsOf(doc, page)
  const facing = isFacing(doc)
  // the interface is right-to-left, so the first field of the row is on the right
  const marginFields: { key: keyof Sides; label: string }[] = [
    { key: 'top', get label() { return t('עליון') } },
    { key: 'bottom', get label() { return t('תחתון') } },
    facing ? { key: 'left', get label() { return t('פנימי') } } : { key: 'right', get label() { return t('ימין') } },
    facing ? { key: 'right', get label() { return t('חיצוני') } } : { key: 'left', get label() { return t('שמאל') } },
  ]

  const orient = (toLandscape: boolean) => {
    if (toLandscape !== landscape && width !== height) onSize(height, width)
  }
  const pickPreset = (id: string) => {
    const p = PAGE_PRESETS.find((x) => x.id === id)
    if (p) onSize(landscape ? p.height : p.width, landscape ? p.width : p.height)
  }

  return (
    <div className="page-bar" role="group" aria-label={t('כלי עמוד')}>
      <span className="page-bar-badge" title={t('העמוד שהכלי משנה')}>
        {all ? t('כל העמודים') : t('עמוד {n1}', { n1: doc.startPage + page })}
      </span>
      <label className="page-bar-field">
        <span>{t('רוחב')}</span>
        <NumberField value={width} unit={doc.unit} min={min.w} max={MAX_PAGE_PT} onChange={(v) => onSize(v, height)} />
      </label>
      <label className="page-bar-field">
        <span>{t('גובה')}</span>
        <NumberField value={height} unit={doc.unit} min={min.h} max={MAX_PAGE_PT} onChange={(v) => onSize(width, v)} />
      </label>
      <label className="page-bar-field">
        <span>{t('גודל')}</span>
        <select className="select" value={preset?.id ?? CUSTOM} onChange={(e) => pickPreset(e.target.value)}>
          {PAGE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          <option value={CUSTOM} disabled>
            {t('מותאם אישית')}
          </option>
        </select>
      </label>
      <div className="place-modes" role="group" aria-label={t('כיוון העמוד')}>
        <button className={!landscape ? 'on' : ''} title={t('עמוד לאורך')} onClick={() => orient(false)}>
          <svg className="orient-icon" viewBox="0 0 12 16" aria-hidden="true">
            <rect x="1" y="1" width="10" height="14" rx="1" fill="none" stroke="currentColor" strokeWidth="1.400" />
          </svg>
          {t('לאורך')}
        </button>
        <button className={landscape ? 'on' : ''} title={t('עמוד לרוחב')} onClick={() => orient(true)}>
          <svg className="orient-icon" viewBox="0 0 16 12" aria-hidden="true">
            <rect x="1" y="1" width="14" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.400" />
          </svg>
          {t('לרוחב')}
        </button>
      </div>
      <div className="page-bar-margins" role="group" aria-label={t('שוליים')}>
        <b>{all ? t('שוליים (כל העמודים)') : t('שוליים של עמוד {n1}', { n1: doc.startPage + page })}</b>
        {marginFields.map((f) => (
          <label key={f.key} className="page-bar-field">
            <span>{f.label}</span>
            <NumberField
              value={margins[f.key]}
              unit={doc.unit}
              min={0}
              max={maxMargin(doc, f.key, all ? 'all' : page)}
              onChange={(v) => onMargins({ ...margins, [f.key]: v })}
            />
          </label>
        ))}
      </div>
      <label className="page-bar-check" title={t('כשהאפשרות פעילה, שינוי הגודל חל על כל עמודי המסמך')}>
        <input type="checkbox" checked={all} onChange={(e) => onAll(e.target.checked)} />
        {t('החל על כל העמודים')}
      </label>
      <span className="muted">
        {t('לחיצה על עמוד בוחרת אותו, וגרירת הידיות משנה רק אותו. קווי השוליים הכחולים בתוך העמוד ניתנים לגרירה (Shift = כל הצדדים), והם משנים רק את העמוד הנבחר.')}
        {custom > 0 ? ` ${custom === 1 ? t('עמוד אחד בגודל אישי.') : t('{count} עמודים בגודל אישי.', { count: custom })}` : ''}
        {customMargins > 0 ? ` ${customMargins === 1 ? t('עמוד אחד עם שוליים אישיים.') : t('{count} עמודים עם שוליים אישיים.', { count: customMargins })}` : ''}
      </span>
    </div>
  )
}
