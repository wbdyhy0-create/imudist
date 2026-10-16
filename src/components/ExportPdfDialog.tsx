import { useEffect, useRef, useState } from 'react'
import type { Assets, DocSettings, ImageFrame, PageSection, ParagraphStyleRecord, ShapeFrame, TextFrame } from '../document'
import { exportPdf, isExportCancelled } from '../pdfExport'
import { emptyReport, PICTURE_REASONS, type PictureReason, type VectorReport } from '../vectorText'
import { SHAPE_PICTURE_REASONS, type ShapePictureReason } from '../vectorShapes'
import { isTauri } from '../fileio'
import { linkStatus } from '../imageLinks'
import type { Unit } from '../units'
import { NumberField } from './NumberField'
import { initialPrintMarks, printMarksOptions } from '../printSheet'
import { PrintMarksFields } from './PrintMarksFields'
import { directionOf, t } from '../i18n'

interface Props {
  doc: DocSettings
  frames: TextFrame[]
  images: ImageFrame[]
  shapes: ShapeFrame[]
  layerOrder: string[]
  assets: Assets
  paragraphStyles: ParagraphStyleRecord[]
  sections: PageSection[]
  onClose: () => void
}

type ExportTab = 'general' | 'marks' | 'color' | 'vector'
const TABS: { id: ExportTab; label: string }[] = [
  { id: 'general', get label() { return t('כללי') } },
  { id: 'marks', get label() { return t('סימני דפוס') } },
  { id: 'color', get label() { return t('צבע') } },
  { id: 'vector', get label() { return t('טקסט וצורות') } },
]

const DPI_OPTIONS = [
  { dpi: 300, get label() { return t('איכות גבוהה להדפסה (300 DPI)') } },
  { dpi: 150, get label() { return t('איכות מסך / שליחה דיגיטלית (150 DPI)') } },
  { dpi: 600, get label() { return t('איכות גבוהה במיוחד (600 DPI, קובץ גדול)') } },
]
const HIGH_DPI_NOTE = 'ב-600 DPI כל עמוד גדול פי ארבעה מ-300 DPI: הייצוא איטי והקובץ גדול (וצורך הרבה זיכרון). כדאי להשתמש בזה לעמודים בודדים או לטווח קטן, למשל לעמוד עם טקסט מנוקד שצריך להיות חד בדפוס.'
const COLOR_MODES = [
  { mode: 'rgb' as const, get label() { return t('RGB — למסך ולשליחה דיגיטלית') } },
  { mode: 'cmyk' as const, get label() { return t('CMYK — להדפסה בדפוס') } },
]
const CMYK_NOTE = 'הצבעים מומרים ל-CMYK בהמרה פשוטה, בלי פרופיל צבע: שחור ואפור יוצאים בדיו שחור בלבד. בית דפוס שמתאים את הצבעים לפרופיל של המכונה שלו יצטרך להמיר אותם בעצמו.'

/** File > ייצוא ל-PDF…: every page rendered as a sharp image (see pdfExport.ts for why — this is a deliberate
 *  choice, not a shortcut: it's what actually guarantees the Hebrew text can never come out scrambled), with the
 *  print-shop essentials — page range, bleed + crop marks, picture resolution — and opens the result once it's done. */
export function ExportPdfDialog({ doc, frames, images, shapes, layerOrder, assets, paragraphStyles, sections, onClose }: Props) {
  const [tab, setTab] = useState<ExportTab>('general')
  const [rangeMode, setRangeMode] = useState<'all' | 'range'>('all')
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(doc.pages)
  const [marks, setMarks] = useState(() => initialPrintMarks(doc))
  const [dpi, setDpi] = useState(300)
  const [colorMode, setColorMode] = useState<'rgb' | 'cmyk'>('rgb')
  const [vectorText, setVectorText] = useState(false)
  /** what the export did with the frames of text, shown when it is done (only when the text was to be written as text) */
  const [result, setResult] = useState<VectorReport | null>(null)
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null)
  /** the export that is running, which the cancel button stops */
  const running = useRef<AbortController | null>(null)
  const [cancelling, setCancelling] = useState(false)
  // the window goes away while an export runs: the export stops
  useEffect(() => () => running.current?.abort(), [])
  const [error, setError] = useState<string | null>(null)
  const unit: Unit = doc.unit
  const staleLinks = new Set(
    [...images.map((im) => im.assetId), ...shapes.flatMap((sh) => (sh.image ? [sh.image.assetId] : []))].filter((id) => {
      const link = assets[id]?.link
      return link && linkStatus(link) !== 'ok'
    }),
  ).size

  const clampedFrom = Math.min(Math.max(1, from), doc.pages)
  const clampedTo = Math.min(Math.max(clampedFrom, to), doc.pages)

  const run = async () => {
    setError(null)
    // opened synchronously, still inside the click's own user-gesture, so navigating it to the PDF once the
    // (async, multi-page) render below finishes isn't caught by the popup blocker
    const viewWindow = isTauri ? null : window.open('', '_blank')
    if (viewWindow) {
      viewWindow.document.title = t('מייצא PDF…')
      viewWindow.document.documentElement.dir = directionOf()
      viewWindow.document.body.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#1e1e1e;color:#ccc;font:14px sans-serif'
      viewWindow.document.body.textContent = t('מייצא PDF, נא להמתין…')
    }
    setBusy({ done: 0, total: rangeMode === 'all' ? doc.pages : clampedTo - clampedFrom + 1 })
    const controller = new AbortController()
    running.current = controller
    const vectorReport = vectorText ? emptyReport() : undefined
    try {
      const exported = await exportPdf(
        { doc, frames, images, shapes, layerOrder, assets, paragraphStyles, sections },
        {
          range: rangeMode === 'all' ? null : { from: clampedFrom, to: clampedTo },
          ...printMarksOptions(marks),
          dpi,
          colorMode,
          vectorText,
          vectorReport,
        },
        doc.name.replace(/[\\/:*?"<>|]/g, '_').trim() || t('ללא שם'),
        (done, total) => setBusy({ done, total }),
        viewWindow,
        controller.signal,
      )
      if (exported) {
        // when the text was to be written as text, say what became of each frame before the dialog goes
        if (vectorReport) setResult(vectorReport)
        else onClose()
      }
    } catch (error) {
      viewWindow?.close()
      // cancelled by the person: nothing was saved, and there is nothing to report
      if (isExportCancelled(error)) return
      console.error('PDF export failed:', error)
      const reason = error instanceof Error ? error.message || error.name : String(error)
      setError(reason && reason !== '[object Object]' ? t('הייצוא נכשל: {reason}', { reason }) : t('הייצוא נכשל. נסה שוב.'))
    } finally {
      running.current = null
      setCancelling(false)
      setBusy(null)
    }
  }

  /** the cancel button while an export runs: it stops at the next object it would draw, and the dialog stays as it was */
  const cancelExport = () => {
    setCancelling(true)
    running.current?.abort()
  }

  return (
    <div className="modal-backdrop">
      <div className="modal wide" role="dialog" aria-modal="true" aria-label={t('ייצוא ל-PDF')}>
        <h2>{t('ייצוא ל-PDF')}</h2>

        {!result && (
          <>
            <div className="export-tabs" role="tablist" aria-label={t('קטגוריות ייצוא')}>
              {TABS.map((item) => (
                <button key={item.id} type="button" role="tab" id={`export-tab-${item.id}`} aria-controls={`export-panel-${item.id}`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} className={tab === item.id ? 'on' : ''} onClick={() => setTab(item.id)}>
                  {t(item.label)}
                </button>
              ))}
            </div>

            <div className="export-pane" role="tabpanel" id={`export-panel-${tab}`} aria-labelledby={`export-tab-${tab}`}>
              {tab === 'general' && (
                <>
                  <div className="field">
                    <div className="field-label">{t('טווח עמודים')}</div>
                    <div className="seg small" role="radiogroup" aria-label={t('טווח עמודים')}>
                      <button role="radio" aria-checked={rangeMode === 'all'} className={rangeMode === 'all' ? 'on' : ''} onClick={() => setRangeMode('all')}>
                        {t('כל המסמך')}
                      </button>
                      <button role="radio" aria-checked={rangeMode === 'range'} className={rangeMode === 'range' ? 'on' : ''} onClick={() => setRangeMode('range')}>
                        {t('טווח עמודים')}
                      </button>
                    </div>
                  </div>
                  {rangeMode === 'range' && (
                    <div className="dlg-cols">
                      <div className="field">
                        <div className="field-label">{t('מעמוד')}</div>
                        <NumberField value={from} onChange={setFrom} min={1} max={doc.pages} step={1} />
                      </div>
                      <div className="field">
                        <div className="field-label">{t('עד עמוד')}</div>
                        <NumberField value={to} onChange={setTo} min={1} max={doc.pages} step={1} />
                      </div>
                    </div>
                  )}

                  <div className="field">
                    <div className="field-label">{t('איכות תמונות')}</div>
                    <div className="seg small" role="radiogroup" aria-label={t('איכות תמונות')}>
                      {DPI_OPTIONS.map((o) => (
                        <button key={o.dpi} role="radio" aria-checked={dpi === o.dpi} className={dpi === o.dpi ? 'on' : ''} onClick={() => setDpi(o.dpi)}>
                          {t(o.label)}
                        </button>
                      ))}
                    </div>
                  </div>
                  {dpi === 600 && <p className="muted">{t(HIGH_DPI_NOTE)}</p>}

                  <p className="muted">
                    {t('כל עמוד נשמר כתמונה חדה ברזולוציה שנבחרה, בדיוק כפי שהוא נראה במסמך — כך שאין תלות בגופנים בזמן ההדפסה, והטקסט העברי לעולם לא יתעוות אצל בית הדפוס.')}
                  </p>
                </>
              )}

              {tab === 'marks' && <PrintMarksFields value={marks} onChange={setMarks} unit={unit} disabled={!!busy} />}

              {tab === 'color' && (
                <>
                  <div className="field">
                    <div className="field-label">{t('מצב צבע')}</div>
                    <div className="seg small" role="radiogroup" aria-label={t('מצב צבע')}>
                      {COLOR_MODES.map((o) => (
                        <button key={o.mode} role="radio" aria-checked={colorMode === o.mode} className={colorMode === o.mode ? 'on' : ''} onClick={() => setColorMode(o.mode)} disabled={!!busy}>
                          {t(o.label)}
                        </button>
                      ))}
                    </div>
                  </div>
                  {colorMode === 'cmyk' && <p className="muted">{t(CMYK_NOTE)}</p>}
                </>
              )}

              {tab === 'vector' && (
                <>
                  <label className="page-bar-check">
                    <input type="checkbox" checked={vectorText} onChange={(e) => setVectorText(e.target.checked)} disabled={!!busy} />
                    {t('ייצוא וקטורי: טקסט, צורות ותמונות')}
                  </label>
                  <p className="muted">
                    {t('טקסט פשוט נכתב ל-PDF כטקסט אמיתי, חד בכל הגדלה, עם הגופן בתוך הקובץ; צורות וקווים נכתבים כצורות, ותמונות מוצבות כתמונות נפרדות (ב-CMYK גם הצבעים האלה נכתבים ב-CMYK, ושחור בדיו שחור בלבד). תיבת טקסט שיש בה משהו נוסף (ניקוד, צל, מסגרת לאות, הערת שוליים, תוכן עניינים, רשימה) או שהגופן שלה לא נמצא במחשב, וצורה עם מילוי מעבר צבעים, צל או תמונה, נשארות כתמונה, כמו קודם.')}
                  </p>
                </>
              )}
            </div>
          </>
        )}

        {error && <p className="muted" style={{ color: '#e5484d' }}>{error}</p>}
        {result && <VectorSummary report={result} />}
        {staleLinks > 0 && (
          <p className="muted" style={{ color: '#e5a000' }}>
            {staleLinks === 1 ? t('תמונה מקושרת אחת חסרה או שונתה') : t('{count} תמונות מקושרות חסרות או שונו', { count: staleLinks })}{' '}
            {t('בדיסק. הייצוא ישתמש במה שנטען במסמך (לתמונה חסרה - בתצוגה מקדימה באיכות נמוכה). כדאי לעדכן או לקשר מחדש בלוח הקישורים לפני הייצוא.')}
          </p>
        )}

        <div className="modal-buttons">
          {result ? (
            <button className="btn primary" onClick={onClose}>
              {t('סגור')}
            </button>
          ) : (
            <>
              <button className="btn primary" onClick={() => void run()} disabled={!!busy || doc.pages === 0}>
                {busy ? t('מייצא… ({done}/{total})', { done: busy.done, total: busy.total }) : t('ייצוא')}
              </button>
              <button className="btn" onClick={busy ? cancelExport : onClose} disabled={cancelling}>
                {cancelling ? t('מבטל…') : t('ביטול')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** What the export did with the frames of text, the shapes and the pictures: how many are real text, shapes and pictures in the file, and what stayed a part of the page picture and why. */
export function VectorSummary({ report }: { report: VectorReport }) {
  const total = report.text + report.picture
  const reasons = Object.entries(report.reasons) as [PictureReason, number][]
  const shapeReasons = Object.entries(report.shapeReasons) as [ShapePictureReason, number][]
  /** a whole sentence for one and another for many, so that each language agrees as it needs to */
  const counted = (count: number, one: string, many: string) => (count === 1 ? t(one) : t(many, { count }))
  const boxes = (count: number) => counted(count, t('תיבה אחת'), t('{count} תיבות'))
  const shapes = (count: number) => counted(count, t('צורה אחת'), t('{count} צורות'))
  const shapesText = [
    report.shapes > 0 ? counted(report.shapes, t('צורה אחת יצאה כצורה'), t('{count} צורות יצאו כצורות')) : t('אף צורה לא יצאה כצורה'),
    report.shapesPicture > 0 ? counted(report.shapesPicture, t('צורה אחת נשארה כתמונה'), t('{count} צורות נשארו כתמונה')) : '',
  ].filter(Boolean).join(', ')
  const imagesText = [
    report.images > 0 ? counted(report.images, t('תמונה אחת הוכנסה כתמונה נפרדת'), t('{count} תמונות הוכנסו כתמונות נפרדות')) : t('אף תמונה לא הוכנסה כתמונה נפרדת'),
    report.imagesPicture > 0
      ? `${counted(report.imagesPicture, 'תמונה אחת נשארה חלק מתמונת העמוד', '{count} תמונות נשארו חלק מתמונת העמוד')} ${t('(צל או טשטוש קצוות)')}`
      : '',
  ].filter(Boolean).join(', ')
  return (
    <div role="status" className="muted" style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
      <strong>{t('הייצוא הסתיים.')}</strong>
      <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
        {total === 0 ? (
          <li>{t('לא היו תיבות טקסט בעמודים שיוצאו.')}</li>
        ) : report.picture === 0 ? (
          <li>{t('כל תיבות הטקסט ({total}) יצאו כטקסט אמיתי.', { total })}</li>
        ) : (
          <li>
            {t('טקסט: {text} מתוך {total} תיבות יצאו כטקסט אמיתי, ו-{picture} נשארו כתמונה.', { text: report.text, total, picture: report.picture })}
            <ul style={{ margin: 0, paddingInlineStart: 18 }}>
              {reasons.map(([reason, count]) => (
                <li key={reason}>
                  {t(PICTURE_REASONS[reason])}: {boxes(count)}
                </li>
              ))}
            </ul>
          </li>
        )}
        {report.shapes + report.shapesPicture > 0 && (
          <li>
            {t('צורות וקווים')}: {shapesText}.
            {shapeReasons.length > 0 && (
              <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                {shapeReasons.map(([reason, count]) => (
                  <li key={reason}>
                    {t(SHAPE_PICTURE_REASONS[reason])}: {shapes(count)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        )}
        {report.images + report.imagesPicture > 0 && (
          <li>
            {t('תמונות מוצבות')}: {imagesText}.
          </li>
        )}
      </ul>
    </div>
  )
}
