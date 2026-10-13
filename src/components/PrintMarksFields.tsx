import { formatNumber, fromPt, toPt, type Unit } from '../units'
import type { PrintMarks } from '../printSheet'
import { NumberField } from './NumberField'
import { t } from '../i18n'

interface Props {
  value: PrintMarks
  onChange: (next: PrintMarks) => void
  unit: Unit
  disabled?: boolean
}

/** The three printing-shop choices of a PDF, each its own: crop marks, bleed, and the slug with the information in it. */
export function PrintMarksFields({ value, onChange, unit, disabled }: Props) {
  const set = (patch: Partial<PrintMarks>) => onChange({ ...value, ...patch })
  const size = (points: number) => `${formatNumber(fromPt(points, unit))} ${unit === 'mm' ? t('מ״מ') : unit}`
  const anything = value.bleedOn || value.slugOn || value.cropMarks || value.registrationMarks || value.colorBars
  const note = anything
    ? t('דף ה-PDF יהיה גדול מהעמוד הסופי') +
      (value.bleedOn ? `: ${t('שולי הגלישה ({size}) מוסיפים שטח סביב העמוד כדי שרקעים ותמונות שמגיעים לקצה ימשיכו מעבר לקו החיתוך', { size: size(value.bleedPt) })}` : '') +
      (value.slugOn ? `, ${t('ואזור המידע ({size} מקצה העמוד) משאיר שטח ריק מחוץ לגלישה להערות לבית הדפוס', { size: size(value.slugPt) })}` : '') +
      (value.cropMarks ? `. ${t('סימני החיתוך מצוירים בפינות, מחוץ לגלישה, ומראים היכן לחתוך')}` : '') +
      (value.registrationMarks ? `. ${t('סימני המרשם הם מטרות באמצע כל צד, ליישור הצבעים בדפוס')}` : '') +
      (value.colorBars ? `. ${t('סרגל הצבעים הוא שורת ריבועים של הצבעים והאפורים, לבדיקת הצבע')}` : '') +
      '.'
    : t('בלי אף אחד מהשלושה, דף ה-PDF הוא בדיוק העמוד הסופי.')
  return (
    <div className="print-marks" role="group" aria-label={t('סימני דפוס')}>
      <div className="field-label">{t('סימני דפוס')}</div>

      <label className="page-bar-check">
        <input type="checkbox" checked={value.cropMarks} onChange={(event) => set({ cropMarks: event.target.checked })} disabled={disabled} />
        {t('סימני חיתוך (Crop Marks)')}
      </label>

      <label className="page-bar-check">
        <input type="checkbox" checked={value.registrationMarks} onChange={(event) => set({ registrationMarks: event.target.checked })} disabled={disabled} />
        {t('סימני מרשם (Registration Marks)')}
      </label>
      <label className="page-bar-check">
        <input type="checkbox" checked={value.colorBars} onChange={(event) => set({ colorBars: event.target.checked })} disabled={disabled} />
        {t('סרגל צבעים (Color Bars)')}
      </label>

      <label className="page-bar-check">
        <input type="checkbox" checked={value.bleedOn} onChange={(event) => set({ bleedOn: event.target.checked })} disabled={disabled} />
        {t('שולי גלישה (Bleed)')}
      </label>
      {value.bleedOn && (
        <div className="field">
          <div className="field-label">{t('גודל שולי הגלישה')}</div>
          <NumberField value={value.bleedPt} onChange={(bleedPt) => set({ bleedPt })} unit={unit} min={0} max={toPt(50, 'mm')} />
        </div>
      )}

      <label className="page-bar-check">
        <input type="checkbox" checked={value.slugOn} onChange={(event) => set({ slugOn: event.target.checked, ...(event.target.checked ? { pageInfo: true } : {}) })} disabled={disabled} />
        {t('אזור מידע (Slug)')}
      </label>
      {value.slugOn && (
        <>
          <div className="field">
            <div className="field-label">{t('גודל אזור המידע, מקצה העמוד')}</div>
            <NumberField value={value.slugPt} onChange={(slugPt) => set({ slugPt })} unit={unit} min={0} max={toPt(100, 'mm')} />
          </div>
          <label className="page-bar-check">
            <input type="checkbox" checked={value.pageInfo} onChange={(event) => set({ pageInfo: event.target.checked })} disabled={disabled} />
            {t('כתוב באזור המידע את שם הקובץ, מספר העמוד והתאריך')}
          </label>
        </>
      )}

      <p className="muted">{note}</p>
    </div>
  )
}
