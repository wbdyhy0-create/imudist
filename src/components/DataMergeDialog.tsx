import { useMemo, useState } from 'react'
import { MAX_PAGE_PT } from '../document'
import { buildMerge, decodeCsvBytes, imposeGrid, parseCsv, recordsFromRows, tokensIn, type FieldType, type MergeData, type MergeField, type PictureSource } from '../dataMerge'
import { exportPdf, type ExportContent } from '../pdfExport'
import { pageRects } from '../pages'
import { PAGE_PRESETS, fromPt, toPt } from '../units'
import { readImageFile } from '../importImage'
import { rowsFromXlsx } from '../xlsx'
import { frameFits } from '../mergeFit'
import { isTauri } from '../fileio'
import { NumberField } from './NumberField'
import { directionOf, t } from '../i18n'

interface Props {
  /** the document: its first page is the card */
  template: ExportContent
  /** puts a text frame with the mark of a field on the card */
  onAddField: (field: MergeField) => void
  onClose: () => void
}

const baseName = (value: string) => (value.split(/[?#]/)[0].split(/[\\/]/).pop() ?? value).toLowerCase()

/** Window > מיזוג נתונים…: a table of records and the card of the document become a PDF with a card for each record, laid out on sheets. */
export function DataMergeDialog({ template, onAddField, onClose }: Props) {
  const [fileName, setFileName] = useState('')
  const [data, setData] = useState<MergeData | null>(null)
  const [types, setTypes] = useState<Record<string, FieldType>>({})
  const [pictureFiles, setPictureFiles] = useState<Map<string, File>>(new Map())
  const [presetId, setPresetId] = useState('A4')
  const [landscape, setLandscape] = useState(false)
  const [margin, setMargin] = useState(toPt(15, 'mm'))
  const [spacing, setSpacing] = useState(toPt(5, 'mm'))
  const [cropMarks, setCropMarks] = useState(true)
  const [autoShrink, setAutoShrink] = useState(true)
  const [dpi, setDpi] = useState(300)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ cards: number; pages: number; missing: number; unknown: string[]; shrunk: number } | null>(null)

  const effective = useMemo<MergeData | null>(() => (data ? { ...data, fields: data.fields.map((field) => ({ ...field, type: types[field.name] ?? field.type })) } : null), [data, types])
  const card = pageRects(template.doc)[0]
  const preset = PAGE_PRESETS.find((candidate) => candidate.id === presetId) ?? PAGE_PRESETS[0]
  const pageWidth = landscape ? preset.height : preset.width
  const pageHeight = landscape ? preset.width : preset.height
  const grid = useMemo(
    () => (card ? imposeGrid({ pageWidth, pageHeight, itemWidth: card.w, itemHeight: card.h, marginTop: margin, marginRight: margin, marginBottom: margin, marginLeft: margin, columnSpacing: spacing, rowSpacing: spacing }) : null),
    [card, pageWidth, pageHeight, margin, spacing],
  )
  const names = new Set((effective?.fields ?? []).flatMap((field) => [field.name, field.name.toLowerCase()]))
  const asked = [...new Set(template.frames.flatMap((frame) => tokensIn(frame.text)))]
  const missing = asked.filter((name) => !names.has(name) && !names.has(name.toLowerCase()))
  const records = effective?.records.length ?? 0
  const sheets = grid && records > 0 ? Math.ceil(records / grid.perPage) : 0
  const marksFit = spacing >= toPt(4, 'mm') - 1e-6

  const load = async (file: File) => {
    setError(null)
    setDone(null)
    const lower = file.name.toLowerCase()
    // an old Excel file (XLS) and any other kind of file: said plainly, not read
    if (!/\.(csv|txt|xlsx)$/.test(lower)) {
      setError(t('קובץ לא נתמך, אנא שמרו כ-XLSX או CSV'))
      return
    }
    try {
      const rows = lower.endsWith('.xlsx') ? await rowsFromXlsx(await file.arrayBuffer()) : parseCsv(decodeCsvBytes(new Uint8Array(await file.arrayBuffer())))
      const next = recordsFromRows(rows)
      if (next.records.length === 0) {
        setError(t('בקובץ אין רשומות: השורה הראשונה היא שמות השדות, ומתחתיה השורות של הנתונים.'))
        return
      }
      setData(next)
      setTypes({})
      setFileName(file.name)
    } catch {
      setError(t('לא ניתן לקרוא את קובץ הנתונים. אפשר לבחור קובץ CSV או XLSX.'))
    }
  }

  const pictures = async (value: string): Promise<PictureSource | null> => {
    let file: File | undefined
    if (/^https?:\/\//i.test(value)) {
      const response = await fetch(value)
      if (!response.ok) return null
      file = new File([await response.blob()], baseName(value))
    } else file = pictureFiles.get(baseName(value))
    return file ? readImageFile(file) : null
  }

  const run = async () => {
    if (!effective || !grid) return
    setError(null)
    setDone(null)
    const viewWindow = isTauri ? null : window.open('', '_blank')
    if (viewWindow) {
      viewWindow.document.title = t('מייצא PDF…')
      viewWindow.document.documentElement.dir = directionOf()
      viewWindow.document.body.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#1e1e1e;color:#ccc;font:14px sans-serif'
      viewWindow.document.body.textContent = t('מייצא PDF, נא להמתין…')
    }
    setBusy(true)
    try {
      const baseFile = (template.doc.name.replace(/[\\/:*?"<>|]/g, '_').trim() || t('ללא שם')) + ' - ' + t('מיזוג')
      const merged = await buildMerge(
        template,
        effective,
        { pageWidth, pageHeight, itemWidth: card.w, itemHeight: card.h, marginTop: margin, marginRight: margin, marginBottom: margin, marginLeft: margin, columnSpacing: spacing, rowSpacing: spacing, cropMarks, markOffset: toPt(2, 'mm'), markLength: toPt(2, 'mm'), name: baseFile, autoShrink, fits: frameFits(template.paragraphStyles) },
        pictures,
      )
      if (!merged) throw new Error(t('אי אפשר ליצור את המיזוג: אין רשומות, או שהכרטיס גדול מהשטח שבין השוליים.'))
      const exported = await exportPdf(merged.content, { range: null, bleed: false, bleedPt: 0, cropMarks: false, dpi, vectorText: true, colorMode: 'rgb' }, baseFile, undefined, viewWindow)
      if (exported) setDone({ cards: merged.cards, pages: merged.pages, missing: merged.missingPictures, unknown: merged.unknownFields, shrunk: merged.shrunk })
      else viewWindow?.close()
    } catch (failure) {
      viewWindow?.close()
      console.error('Data merge failed:', failure)
      const reason = failure instanceof Error ? failure.message : String(failure)
      setError(reason ? t('המיזוג נכשל: {reason}', { reason }) : t('המיזוג נכשל. נסה שוב.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal wide data-merge-dialog" role="dialog" aria-modal="true" aria-label={t('מיזוג נתונים')}>
        <h2>{t('מיזוג נתונים')}</h2>
        <p className="muted">{t('עמוד 1 של המסמך הוא הכרטיס. בתיבות הטקסט שלו כותבים סימן של שדה, למשל {example}, ובמיזוג בא במקומו הערך של כל רשומה. תיבה שיש בה רק סימן של שדה תמונה הופכת לתמונה.', { example: '{{full_name}}' })}</p>

        <div className="field">
          <div className="field-label">{t('קובץ נתונים (CSV או XLSX)')}</div>
          <input type="file" accept=".csv,.txt,.xlsx,text/csv" aria-label={t('קובץ נתונים (CSV או XLSX)')} disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void load(file); event.target.value = '' }} />
          {fileName && <p className="muted">{t('{name}: {count} רשומות', { name: fileName, count: records })}</p>}
        </div>

        {effective && (
          <>
            <div className="field">
              <div className="field-label">{t('שדות')}</div>
              <table className="merge-fields">
                <tbody>
                  {effective.fields.map((field) => (
                    <tr key={field.name}>
                      <td><bdi dir="ltr">{`{{${field.name}}}`}</bdi></td>
                      <td>
                        <select className="select" value={field.type} aria-label={t('סוג השדה {name}', { name: field.name })} disabled={busy} onChange={(event) => setTypes((current) => ({ ...current, [field.name]: event.target.value as FieldType }))}>
                          <option value="text">{t('טקסט')}</option>
                          <option value="image">{t('תמונה')}</option>
                        </select>
                      </td>
                      <td className="muted"><bdi>{field.sample.slice(0, 40)}</bdi></td>
                      <td>
                        <button type="button" className="btn small" disabled={busy} onClick={() => onAddField(field)}>{t('הוסף לכרטיס')}</button>
                        <span className="merge-info" tabIndex={0} role="img" aria-label={t('לחצו על הוסף, ומקמו את התיבה בכרטיס')} data-tip={t('לחצו על הוסף, ומקמו את התיבה בכרטיס')}>i</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {missing.length > 0 && <p className="muted" style={{ color: '#e5a000' }}>{t('בכרטיס יש סימנים שאין להם שדה בנתונים: {names}. הם לא יודפסו: במקומם לא יופיע כלום.', { names: missing.join(', ') })}</p>}
            </div>

            {effective.fields.some((field) => field.type === 'image') && (
              <div className="field">
                <div className="field-label">{t('קבצי התמונות')}</div>
                <input type="file" accept="image/*" multiple aria-label={t('קבצי התמונות')} disabled={busy} onChange={(event) => { const files = [...(event.target.files ?? [])]; setPictureFiles(new Map(files.map((file) => [file.name.toLowerCase(), file]))); event.target.value = '' }} />
                <p className="muted">{pictureFiles.size > 0 ? t('נבחרו {count} תמונות. הן נמצאות לפי שם הקובץ שבנתונים.', { count: pictureFiles.size }) : t('תמונות שהנתונים נותנים להן קישור (כתובת אינטרנט) נטענות מהאינטרנט. לתמונות שיש להן רק שם קובץ: בחרו כאן את הקבצים.')}</p>
              </div>
            )}

            <div className="dlg-cols">
              <div className="field">
                <div className="field-label">{t('גודל הדף')}</div>
                <select className="select" value={presetId} disabled={busy} onChange={(event) => setPresetId(event.target.value)}>
                  {PAGE_PRESETS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
                <label className="page-bar-check"><input type="checkbox" checked={landscape} disabled={busy} onChange={(event) => setLandscape(event.target.checked)} />{t('לרוחב')}</label>
              </div>
              <div className="field">
                <div className="field-label">{t('שוליים')}</div>
                <NumberField value={margin} unit="mm" min={0} max={MAX_PAGE_PT} onChange={setMargin} />
              </div>
              <div className="field">
                <div className="field-label">{t('מרווח בין כרטיסים')}</div>
                <NumberField value={spacing} unit="mm" min={0} max={MAX_PAGE_PT} onChange={setSpacing} />
              </div>
            </div>

            <label className="page-bar-check"><input type="checkbox" checked={cropMarks} disabled={busy} onChange={(event) => setCropMarks(event.target.checked)} />{t('כולל סימני חיתוך')}</label>
            {cropMarks && !marksFit && <p className="muted" style={{ color: '#e5a000' }}>{t('המרווח בין הכרטיסים קטן מ-4 מ״מ: סימני החיתוך של כרטיסים סמוכים ייגעו זה בזה.')}</p>}
            <label className="page-bar-check" title={t('טקסט שאינו נכנס לתיבה שלו מוקטן, ברשומה הזו בלבד, עד שהוא נכנס (עד חצי מהגודל)')}><input type="checkbox" checked={autoShrink} disabled={busy} onChange={(event) => setAutoShrink(event.target.checked)} />{t('הקטנת גופן אוטומטית')}</label>
            <p className="muted">{t('טקסט שארוך מדי לתיבה שלו, למשל שם ארוך, מוקטן ברשומה הזו בלבד, עד שהוא נכנס במלואו (עד חצי מהגודל). שאר הרשומות והטקסטים בכרטיס נשארים בגודל המקורי.')}</p>

            <div className="field">
              <div className="field-label">{t('איכות תמונות')}</div>
              <div className="seg small" role="radiogroup" aria-label={t('איכות תמונות')}>
                {[300, 150].map((value) => (
                  <button key={value} role="radio" aria-checked={dpi === value} className={dpi === value ? 'on' : ''} disabled={busy} onClick={() => setDpi(value)}>{value === 300 ? t('איכות גבוהה להדפסה (300 DPI)') : t('איכות מסך / שליחה דיגיטלית (150 DPI)')}</button>
                ))}
              </div>
            </div>

            {card && (
              <p className="muted">
                {grid
                  ? t('כרטיס בגודל {width} × {height} מ״מ. בדף {perPage} כרטיסים ({columns} בשורה, {rows} שורות): {cards} כרטיסים ייצאו על {pages} דפים.', { width: Math.round(fromPt(card.w, 'mm') * 10) / 10, height: Math.round(fromPt(card.h, 'mm') * 10) / 10, perPage: grid.perPage, columns: grid.columns, rows: grid.rows, cards: records, pages: sheets })
                  : t('הכרטיס ({width} × {height} מ״מ) גדול מהשטח שבין השוליים.', { width: Math.round(fromPt(card.w, 'mm') * 10) / 10, height: Math.round(fromPt(card.h, 'mm') * 10) / 10 })}
              </p>
            )}
          </>
        )}

        {error && <p className="muted" style={{ color: '#e5484d' }}>{error}</p>}
        {done && (
          <p className="muted">
            {t('נוצר PDF: {cards} כרטיסים על {pages} דפים.', { cards: done.cards, pages: done.pages })}
            {done.shrunk > 0 ? ` ${t('{count} טקסטים הוקטנו כדי להיכנס לתיבה שלהם.', { count: done.shrunk })}` : ''}
            {done.missing > 0 ? ` ${t('{count} תמונות לא נמצאו או לא נקראו, והמקום שלהן ריק.', { count: done.missing })}` : ''}
            {done.unknown.length > 0 ? ` ${t('סימנים שאין להם שדה לא הודפסו: {names}', { names: done.unknown.join(', ') })}` : ''}
          </p>
        )}

        <div className="modal-buttons">
          <button className="btn primary" onClick={() => void run()} disabled={busy || !effective || !grid}>
            {busy ? t('מייצא…') : t('צור PDF')}
          </button>
          <button className="btn" onClick={onClose} disabled={busy}>{done ? t('סגור') : t('ביטול')}</button>
        </div>
      </div>
    </div>
  )
}
