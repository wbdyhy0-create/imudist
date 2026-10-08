import { useState } from 'react'
import type { Assets, DocSettings, ImageFrame, PageSection, ParagraphStyleRecord, ShapeFrame, TextFrame } from '../document'
import { exportPdf } from '../pdfExport'
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
]
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
          vectorText: vectorText && colorMode === 'rgb',
        },
        doc.name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'ללא שם',
        (done, total) => setBusy({ done, total }),
        viewWindow,
      )
      if (exported) onClose()
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
          <input type="checkbox" checked={vectorText && colorMode === 'rgb'} onChange={(e) => setVectorText(e.target.checked)} disabled={!!busy || colorMode === 'cmyk'} />
          טקסט וקטורי (ניסיוני, ב-RGB בלבד)
        </label>
        <p className="muted">
          טקסט פשוט נכתב ל-PDF כטקסט אמיתי, חד בכל הגדלה, עם הגופן בתוך הקובץ. תיבה שיש בה משהו נוסף (ניקוד, קו תחתון, צל, מסגרת לאות, הערת שוליים, תוכן עניינים, רשימה) או שהגופן שלה לא נמצא במחשב נשארת כתמונה, כמו קודם.
        </p>

        <p className="muted">
          כל עמוד נשמר כתמונה חדה ברזולוציה שנבחרה, בדיוק כפי שהוא נראה במסמך — כך שאין תלות בגופנים בזמן ההדפסה, והטקסט העברי לעולם לא יתעוות אצל בית הדפוס.
        </p>

        {error && <p className="muted" style={{ color: '#e5484d' }}>{error}</p>}
        {staleLinks > 0 && (
          <p className="muted" style={{ color: '#e5a000' }}>
            {staleLinks === 1 ? 'תמונה מקושרת אחת חסרה או שונתה' : `${staleLinks} תמונות מקושרות חסרות או שונו`} בדיסק. הייצוא ישתמש במה שנטען במסמך (לתמונה חסרה - בתצוגה מקדימה באיכות נמוכה). כדאי לעדכן או לקשר מחדש בלוח הקישורים לפני הייצוא.
          </p>
        )}

        <div className="modal-buttons">
          <button className="btn primary" onClick={() => void run()} disabled={!!busy || doc.pages === 0}>
            {busy ? `מייצא… (${busy.done}/${busy.total})` : 'ייצוא'}
          </button>
          <button className="btn" onClick={onClose} disabled={!!busy}>
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}
