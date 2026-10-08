import { useState } from 'react'
import type { Assets, DocSettings, ImageFrame, PageSection, ParagraphStyleRecord, ShapeFrame, TextFrame } from '../document'
import { exportPdf } from '../pdfExport'
import { emptyReport, PICTURE_REASONS, type PictureReason, type VectorReport } from '../vectorText'
import { SHAPE_PICTURE_REASONS, type ShapePictureReason } from '../vectorShapes'
import { isTauri } from '../fileio'
import { linkStatus } from '../imageLinks'
import { formatNumber, fromPt, toPt, type Unit } from '../units'
import { NumberField } from './NumberField'

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

const DPI_OPTIONS = [
  { dpi: 300, label: 'איכות גבוהה להדפסה (300 DPI)' },
  { dpi: 150, label: 'איכות מסך / שליחה דיגיטלית (150 DPI)' },
  { dpi: 600, label: 'איכות גבוהה במיוחד (600 DPI, קובץ גדול)' },
]
const HIGH_DPI_NOTE = 'ב-600 DPI כל עמוד גדול פי ארבעה מ-300 DPI: הייצוא איטי והקובץ גדול (וצורך הרבה זיכרון). כדאי להשתמש בזה לעמודים בודדים או לטווח קטן, למשל לעמוד עם טקסט מנוקד שצריך להיות חד בדפוס.'
const COLOR_MODES = [
  { mode: 'rgb' as const, label: 'RGB — למסך ולשליחה דיגיטלית' },
  { mode: 'cmyk' as const, label: 'CMYK — להדפסה בדפוס' },
]
const CMYK_NOTE = 'הצבעים מומרים ל-CMYK בהמרה פשוטה, בלי פרופיל צבע: שחור ואפור יוצאים בדיו שחור בלבד. בית דפוס שמתאים את הצבעים לפרופיל של המכונה שלו יצטרך להמיר אותם בעצמו.'
const DEFAULT_BLEED_MM = 3

/** File > ייצוא ל-PDF…: every page rendered as a sharp image (see pdfExport.ts for why — this is a deliberate
 *  choice, not a shortcut: it's what actually guarantees the Hebrew text can never come out scrambled), with the
 *  print-shop essentials — page range, bleed + crop marks, picture resolution — and opens the result once it's done. */
export function ExportPdfDialog({ doc, frames, images, shapes, layerOrder, assets, paragraphStyles, sections, onClose }: Props) {
  const [rangeMode, setRangeMode] = useState<'all' | 'range'>('all')
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(doc.pages)
  const [bleedOn, setBleedOn] = useState(doc.bleed.top > 0 || doc.bleed.right > 0)
  const [bleedPt, setBleedPt] = useState(doc.bleed.top > 0 ? doc.bleed.top : toPt(DEFAULT_BLEED_MM, 'mm'))
  const [cropMarks, setCropMarks] = useState(false)
  const [dpi, setDpi] = useState(300)
  const [colorMode, setColorMode] = useState<'rgb' | 'cmyk'>('rgb')
  const [vectorText, setVectorText] = useState(false)
  /** what the export did with the frames of text, shown when it is done (only when the text was to be written as text) */
  const [result, setResult] = useState<VectorReport | null>(null)
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null)
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
      viewWindow.document.title = 'מייצא PDF…'
      viewWindow.document.documentElement.dir = 'rtl'
      viewWindow.document.body.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#1e1e1e;color:#ccc;font:14px sans-serif'
      viewWindow.document.body.textContent = 'מייצא PDF, נא להמתין…'
    }
    setBusy({ done: 0, total: rangeMode === 'all' ? doc.pages : clampedTo - clampedFrom + 1 })
    const vectorReport = vectorText ? emptyReport() : undefined
    try {
      const exported = await exportPdf(
        { doc, frames, images, shapes, layerOrder, assets, paragraphStyles, sections },
        {
          range: rangeMode === 'all' ? null : { from: clampedFrom, to: clampedTo },
          bleed: bleedOn,
          bleedPt,
          cropMarks: bleedOn && cropMarks,
          dpi,
          colorMode,
          vectorText,
          vectorReport,
        },
        doc.name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'ללא שם',
        (done, total) => setBusy({ done, total }),
        viewWindow,
      )
      if (exported) {
        // when the text was to be written as text, say what became of each frame before the dialog goes
        if (vectorReport) setResult(vectorReport)
        else onClose()
      }
    } catch (error) {
      viewWindow?.close()
      console.error('PDF export failed:', error)
      const reason = error instanceof Error ? error.message || error.name : String(error)
      setError(reason && reason !== '[object Object]' ? `הייצוא נכשל: ${reason}` : 'הייצוא נכשל. נסה שוב.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal wide" role="dialog" aria-modal="true" aria-label="ייצוא ל-PDF">
        <h2>ייצוא ל-PDF</h2>

        <div className="field">
          <div className="field-label">טווח עמודים</div>
          <div className="seg small" role="radiogroup" aria-label="טווח עמודים">
            <button role="radio" aria-checked={rangeMode === 'all'} className={rangeMode === 'all' ? 'on' : ''} onClick={() => setRangeMode('all')}>
              כל המסמך
            </button>
            <button role="radio" aria-checked={rangeMode === 'range'} className={rangeMode === 'range' ? 'on' : ''} onClick={() => setRangeMode('range')}>
              טווח עמודים
            </button>
          </div>
        </div>
        {rangeMode === 'range' && (
          <div className="dlg-cols">
            <div className="field">
              <div className="field-label">מעמוד</div>
              <NumberField value={from} onChange={setFrom} min={1} max={doc.pages} step={1} />
            </div>
            <div className="field">
              <div className="field-label">עד עמוד</div>
              <NumberField value={to} onChange={setTo} min={1} max={doc.pages} step={1} />
            </div>
          </div>
        )}

        <label className="page-bar-check">
          <input type="checkbox" checked={bleedOn} onChange={(e) => setBleedOn(e.target.checked)} />
          כלול שולי גלישה (Bleed) וסימני חיתוך
        </label>
        {bleedOn && (
          <div className="dlg-cols">
            <div className="field">
              <div className="field-label">גודל שולי הגלישה</div>
              <NumberField value={bleedPt} onChange={setBleedPt} unit={unit} min={0} max={toPt(50, 'mm')} />
            </div>
            <label className="page-bar-check" style={{ alignSelf: 'end', marginBottom: 6 }}>
              <input type="checkbox" checked={cropMarks} onChange={(e) => setCropMarks(e.target.checked)} />
              הצג סימני חיתוך
            </label>
          </div>
        )}
        <p className="muted">
          שולי הגלישה מוסיפים {formatNumber(fromPt(bleedPt, unit))} {unit === 'mm' ? 'מ״מ' : ''} סביב כל עמוד, כדי שרקעים ותמונות שמגיעים עד קצה העמוד יודפסו בלי פס לבן אחרי החיתוך.
        </p>

        <div className="field">
          <div className="field-label">איכות תמונות</div>
          <div className="seg small" role="radiogroup" aria-label="איכות תמונות">
            {DPI_OPTIONS.map((o) => (
              <button key={o.dpi} role="radio" aria-checked={dpi === o.dpi} className={dpi === o.dpi ? 'on' : ''} onClick={() => setDpi(o.dpi)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        {dpi === 600 && <p className="muted">{HIGH_DPI_NOTE}</p>}

        <div className="field">
          <div className="field-label">מצב צבע</div>
          <div className="seg small" role="radiogroup" aria-label="מצב צבע">
            {COLOR_MODES.map((o) => (
              <button key={o.mode} role="radio" aria-checked={colorMode === o.mode} className={colorMode === o.mode ? 'on' : ''} onClick={() => setColorMode(o.mode)} disabled={!!busy}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        {colorMode === 'cmyk' && <p className="muted">{CMYK_NOTE}</p>}

        <label className="page-bar-check">
          <input type="checkbox" checked={vectorText} onChange={(e) => setVectorText(e.target.checked)} disabled={!!busy} />
          ייצוא וקטורי: טקסט, צורות ותמונות
        </label>
        <p className="muted">
          טקסט פשוט נכתב ל-PDF כטקסט אמיתי, חד בכל הגדלה, עם הגופן בתוך הקובץ; צורות וקווים נכתבים כצורות, ותמונות מוצבות כתמונות נפרדות (ב-CMYK גם הצבעים האלה נכתבים ב-CMYK, ושחור בדיו שחור בלבד). תיבת טקסט שיש בה משהו נוסף (ניקוד, צל, מסגרת לאות, הערת שוליים, תוכן עניינים, רשימה) או שהגופן שלה לא נמצא במחשב, וצורה עם מילוי מעבר צבעים, צל או תמונה, נשארות כתמונה, כמו קודם.
        </p>

        <p className="muted">
          כל עמוד נשמר כתמונה חדה ברזולוציה שנבחרה, בדיוק כפי שהוא נראה במסמך — כך שאין תלות בגופנים בזמן ההדפסה, והטקסט העברי לעולם לא יתעוות אצל בית הדפוס.
        </p>

        {error && <p className="muted" style={{ color: '#e5484d' }}>{error}</p>}
        {result && <VectorSummary report={result} />}
        {staleLinks > 0 && (
          <p className="muted" style={{ color: '#e5a000' }}>
            {staleLinks === 1 ? 'תמונה מקושרת אחת חסרה או שונתה' : `${staleLinks} תמונות מקושרות חסרות או שונו`} בדיסק. הייצוא ישתמש במה שנטען במסמך (לתמונה חסרה - בתצוגה מקדימה באיכות נמוכה). כדאי לעדכן או לקשר מחדש בלוח הקישורים לפני הייצוא.
          </p>
        )}

        <div className="modal-buttons">
          {result ? (
            <button className="btn primary" onClick={onClose}>
              סגור
            </button>
          ) : (
            <>
              <button className="btn primary" onClick={() => void run()} disabled={!!busy || doc.pages === 0}>
                {busy ? `מייצא… (${busy.done}/${busy.total})` : 'ייצוא'}
              </button>
              <button className="btn" onClick={onClose} disabled={!!busy}>
                ביטול
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
  const boxes = (count: number) => (count === 1 ? 'תיבה אחת' : `${count} תיבות`)
  const shapes = (count: number) => (count === 1 ? 'צורה אחת' : `${count} צורות`)
  /** "one shape came out as a shape" / "3 shapes came out as shapes", with the verb agreeing */
  const shapesWere = (count: number, done: string, doneMany: string) => (count === 1 ? `צורה אחת ${done}` : `${count} צורות ${doneMany}`)
  const picturesWere = (count: number, done: string, doneMany: string) => (count === 1 ? `תמונה אחת ${done}` : `${count} תמונות ${doneMany}`)
  return (
    <div role="status" className="muted" style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
      <strong>הייצוא הסתיים.</strong>
      <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
        {total === 0 ? (
          <li>לא היו תיבות טקסט בעמודים שיוצאו.</li>
        ) : report.picture === 0 ? (
          <li>כל תיבות הטקסט ({total}) יצאו כטקסט אמיתי.</li>
        ) : (
          <li>
            טקסט: {report.text} מתוך {total} תיבות יצאו כטקסט אמיתי, ו-{report.picture} נשארו כתמונה.
            <ul style={{ margin: 0, paddingInlineStart: 18 }}>
              {reasons.map(([reason, count]) => (
                <li key={reason}>
                  {PICTURE_REASONS[reason]}: {boxes(count)}
                </li>
              ))}
            </ul>
          </li>
        )}
        {report.shapes + report.shapesPicture > 0 && (
          <li>
            צורות וקווים: {report.shapes > 0 ? shapesWere(report.shapes, 'יצאה כצורה', 'יצאו כצורות') : 'אף צורה לא יצאה כצורה'}
            {report.shapesPicture > 0 ? `, ${shapesWere(report.shapesPicture, 'נשארה כתמונה', 'נשארו כתמונה')}` : ''}.
            {shapeReasons.length > 0 && (
              <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                {shapeReasons.map(([reason, count]) => (
                  <li key={reason}>
                    {SHAPE_PICTURE_REASONS[reason]}: {shapes(count)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        )}
        {report.images + report.imagesPicture > 0 && (
          <li>
            תמונות מוצבות: {report.images > 0 ? picturesWere(report.images, 'הוכנסה כתמונה נפרדת', 'הוכנסו כתמונות נפרדות') : 'אף תמונה לא הוכנסה כתמונה נפרדת'}
            {report.imagesPicture > 0 ? `, ${picturesWere(report.imagesPicture, 'נשארה חלק מתמונת העמוד', 'נשארו חלק מתמונת העמוד')} (צל או טשטוש קצוות)` : ''}.
          </li>
        )}
      </ul>
    </div>
  )
}
