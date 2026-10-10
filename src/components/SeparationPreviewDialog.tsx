import { useEffect, useMemo, useRef, useState } from 'react'
import type { Assets, DocSettings, ImageFrame, PageSection, ParagraphStyleRecord, ShapeFrame, TextFrame } from '../document'
import { prepareExport, renderPage } from '../pdfExport'
import { composeInkWarning, composeSeparations, INK_COLOR, INKS, inkReport, separate, type Ink, type InkSelection } from '../separations'
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
  /** the page shown first (0-based) */
  initialPage: number
  onClose: () => void
}

/** the sharpness the page is looked at in: at 100 an A4 page is about 800 by 1100 pixels (quick, to judge the inks by); at 300 it is the sharpness of the export */
const DPI_CHOICES = [
  { dpi: 100, label: 'מהירה (100)' },
  { dpi: 200, label: 'בינונית (200)' },
  { dpi: 300, label: 'כמו בייצוא (300)' },
]
/** the ink a press takes, added up (cyan + magenta + yellow + black), in per cent */
const DEFAULT_INK_LIMIT = 300

const swatch = (ink: Ink) => {
  const [r, g, b] = INK_COLOR[ink]
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`
}

/**
 * View > "תצוגת הפרדת צבעים…": the page as the four inks of a press, each of them shown or hidden (what Separation Preview does), and a mode
 * that paints red the places where the inks add up to more than the press takes. It is the page as the export draws it, separated
 * with the same plain conversion the CMYK export uses (there is no colour profile in it, so it is a check of how the inks are shared,
 * not a proof of the colours).
 */
export function SeparationPreviewDialog({ doc, frames, images, shapes, layerOrder, assets, paragraphStyles, sections, initialPage, onClose }: Props) {
  const [page, setPage] = useState(Math.min(Math.max(0, initialPage), Math.max(0, doc.pages - 1)))
  const [show, setShow] = useState<InkSelection>({ cyan: true, magenta: true, yellow: true, black: true })
  const [mode, setMode] = useState<'inks' | 'total'>('inks')
  const [limit, setLimit] = useState(DEFAULT_INK_LIMIT)
  const [dpi, setDpi] = useState(100)
  /** the page fitted to the window, or its pixels one to one (scrolled): the thin lines of a logo are judged at the second */
  const [fit, setFit] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [separated, setSeparated] = useState<{ width: number; height: number; cmyk: Uint8Array } | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)

  // the page is laid out once (the text and the footnotes of the whole document), and drawn again when another page is asked for
  const prepared = useMemo(
    () => prepareExport({ doc, frames, images, shapes, layerOrder, assets, paragraphStyles, sections }),
    [doc, frames, images, shapes, layerOrder, assets, paragraphStyles, sections],
  )
  const pageCount = prepared.rects.length

  useEffect(() => {
    let cancelled = false
    setBusy(true)
    setError(null)
    const rect = prepared.rects[page]
    if (!rect) {
      setSeparated(null)
      setBusy(false)
      return
    }
    void renderPage(prepared.content, prepared.flows, rect, 0, dpi)
      .then((picture) => {
        if (cancelled) return
        const context = picture.getContext('2d', { willReadFrequently: true })
        if (!context) throw new Error('canvas')
        const data = context.getImageData(0, 0, picture.width, picture.height)
        setSeparated({ width: picture.width, height: picture.height, cmyk: separate(data.data) })
        setBusy(false)
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        console.error('Separation preview failed:', reason)
        setError('לא ניתן להכין את תצוגת ההפרדות לעמוד הזה.')
        setBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [prepared, page, dpi])

  // what is on the screen: the inks that are on, or the warning of too much ink
  useEffect(() => {
    const target = canvas.current
    if (!target || !separated) return
    target.width = separated.width
    target.height = separated.height
    const context = target.getContext('2d')
    if (!context) return
    const image = context.createImageData(separated.width, separated.height)
    if (mode === 'inks') composeSeparations(separated.cmyk, show, image.data)
    else composeInkWarning(separated.cmyk, limit, image.data)
    context.putImageData(image, 0, 0)
  }, [separated, show, mode, limit])

  const report = useMemo(() => (separated ? inkReport(separated.cmyk, limit) : null), [separated, limit])
  const percent = (value: number) => `${Math.round(value)}%`

  return (
    <div className="modal-backdrop">
      <div className="modal wide separation-preview" role="dialog" aria-modal="true" aria-label="תצוגת הפרדת צבעים">
        <h2>תצוגת הפרדת צבעים</h2>

        <div className="dlg-cols">
          <div className="field">
            <div className="field-label">עמוד</div>
            <div className="seg small" role="group" aria-label="עמוד">
              <button onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page <= 0 || busy} aria-label="העמוד הקודם">›</button>
              <span className="separation-page-number" dir="ltr">{page + 1} / {pageCount}</span>
              <button onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} disabled={page >= pageCount - 1 || busy} aria-label="העמוד הבא">‹</button>
            </div>
          </div>
          <div className="field">
            <div className="field-label">מצב</div>
            <div className="seg small" role="radiogroup" aria-label="מצב התצוגה">
              <button role="radio" aria-checked={mode === 'inks'} className={mode === 'inks' ? 'on' : ''} onClick={() => setMode('inks')}>הפרדות דיו</button>
              <button role="radio" aria-checked={mode === 'total'} className={mode === 'total' ? 'on' : ''} onClick={() => setMode('total')}>כיסוי דיו כולל</button>
            </div>
          </div>
        </div>

        <div className="dlg-cols">
          <div className="field">
            <div className="field-label">חדות התצוגה (DPI)</div>
            <div className="seg small" role="radiogroup" aria-label="חדות התצוגה">
              {DPI_CHOICES.map((choice) => (
                <button key={choice.dpi} role="radio" aria-checked={dpi === choice.dpi} className={dpi === choice.dpi ? 'on' : ''} onClick={() => setDpi(choice.dpi)} disabled={busy}>{choice.label}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <div className="field-label">גודל</div>
            <div className="seg small" role="radiogroup" aria-label="גודל התצוגה">
              <button role="radio" aria-checked={fit} className={fit ? 'on' : ''} onClick={() => setFit(true)}>התאם לחלון</button>
              <button role="radio" aria-checked={!fit} className={!fit ? 'on' : ''} onClick={() => setFit(false)}>פיקסל לפיקסל</button>
            </div>
          </div>
        </div>

        {mode === 'inks' ? (
          <div className="separation-inks" role="group" aria-label="הדיו המוצגים">
            {INKS.map((ink) => (
              <label key={ink.id} className="page-bar-check">
                <input type="checkbox" checked={show[ink.id]} onChange={(event) => setShow((current) => ({ ...current, [ink.id]: event.target.checked }))} />
                <span className="separation-swatch" style={{ background: swatch(ink.id) }} aria-hidden="true" />
                {ink.label}
                {report && <span className="muted"> · ממוצע {percent(report.average[ink.id])}</span>}
              </label>
            ))}
            <div className="separation-quick">
              <button className="btn small" onClick={() => setShow({ cyan: true, magenta: true, yellow: true, black: true })}>הצג הכול</button>
              {INKS.map((ink) => (
                <button key={ink.id} className="btn small" onClick={() => setShow({ cyan: ink.id === 'cyan', magenta: ink.id === 'magenta', yellow: ink.id === 'yellow', black: ink.id === 'black' })}>רק {ink.label.split(' ')[0]}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="separation-total">
            <div className="field">
              <div className="field-label">גבול הדיו הכולל (%)</div>
              <NumberField value={limit} onChange={(value) => setLimit(Math.max(100, Math.min(400, Math.round(value))))} min={100} max={400} step={10} />
            </div>
            {report && (
              <p className={report.overLimit > 0 ? 'separation-warn' : 'muted'}>
                {report.overLimit > 0
                  ? `הדיו עולה על ${limit}% ב-${report.overLimit < 0.1 ? 'פחות מ-0.1' : report.overLimit.toFixed(1)}% מהעמוד (מסומן באדום). הכי הרבה בנקודה אחת: ${Math.round(report.maxTotal)}%.`
                  : `אין בעמוד מקום שעולה על ${limit}%. הכי הרבה בנקודה אחת: ${Math.round(report.maxTotal)}%.`}
              </p>
            )}
          </div>
        )}

        <div className="separation-canvas">
          {busy && <p className="muted">מכין את העמוד…</p>}
          {error && <p className="error">{error}</p>}
          <canvas ref={canvas} aria-label="העמוד בהפרדת צבעים" style={{ display: busy || error ? 'none' : 'block', ...(fit ? {} : { maxWidth: 'none', width: separated?.width, height: separated?.height }) }} />
        </div>

        <p className="muted">
          ההפרדה היא המרה פשוטה מ-RGB ל-CMYK, בלי פרופיל צבע (כמו ייצוא ה-CMYK). היא מראה איך הדיו מתחלק בין הצלחות, לא את הצבע המדויק שיודפס.
        </p>

        <div className="modal-buttons">
          <button className="btn" onClick={onClose}>סגור</button>
        </div>
      </div>
    </div>
  )
}
