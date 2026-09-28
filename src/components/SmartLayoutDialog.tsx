import { useEffect, useState, type ReactNode } from 'react'
import { NumberField } from './NumberField'

export interface SmartLayoutRequest {
  scope: 'doc' | 'selection'
  keepLines: boolean
  keepFirst: number
  keepLast: number
  noBreak: boolean
  smartTracking: boolean
  tracking: number
  maxWords: number
}

interface Props {
  /** a text selection or a selected text frame exists right now, so "בחירה בלבד" has something to act on */
  hasSelection: boolean
  onApply: (r: SmartLayoutRequest) => void
  onClose: () => void
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      {children}
    </div>
  )
}

/** טיפוגרפיה > יתומים, אלמנות וכיווץ: three independent text-flow tools in one dialog - keeping a paragraph's own
 *  first/last lines together across a frame break, keeping its last word from breaking off alone, and tightening a
 *  short last line - because the same content (a paragraph's line breaks) decides all three, and the first and
 *  third can work against each other (see the tracking field's own note below). */
export function SmartLayoutDialog({ hasSelection, onApply, onClose }: Props) {
  const [scope, setScope] = useState<'doc' | 'selection'>(hasSelection ? 'selection' : 'doc')
  const [keepLines, setKeepLines] = useState(true)
  const [keepFirst, setKeepFirst] = useState(2)
  const [keepLast, setKeepLast] = useState(2)
  const [noBreak, setNoBreak] = useState(true)
  const [smartTracking, setSmartTracking] = useState(false)
  const [tracking, setTracking] = useState(-15)
  const [maxWords, setMaxWords] = useState(2)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const nothingChosen = !keepLines && !noBreak && !smartTracking

  return (
    <div className="modal-backdrop">
      <div className="modal wide" role="dialog" aria-modal="true" aria-label="יתומים, אלמנות וכיווץ">
        <h2>יתומים, אלמנות וכיווץ</h2>

        <div className="place-modes" role="group" aria-label="טווח ההחלה">
          <button className={scope === 'doc' ? 'on' : ''} onClick={() => setScope('doc')}>
            כל המסמך
          </button>
          <button className={scope === 'selection' ? 'on' : ''} disabled={!hasSelection} onClick={() => setScope('selection')}>
            בחירה בלבד
          </button>
        </div>

        <fieldset className="dlg-block">
          <legend>מניעת יתומים ואלמנות</legend>
          <label className="dlg-check">
            <input type="checkbox" checked={keepLines} onChange={(e) => setKeepLines(e.target.checked)} />
            שמור שורות ראשונות/אחרונות של פסקה יחד בין העברות עמוד
          </label>
          {keepLines && (
            <div className="dlg-cols">
              <Field label="שורות ראשונות (מינימום)">
                <NumberField value={keepFirst} min={1} max={10} onChange={setKeepFirst} />
              </Field>
              <Field label="שורות אחרונות (מינימום)">
                <NumberField value={keepLast} min={1} max={10} onChange={setKeepLast} />
              </Field>
            </div>
          )}
          <label className="dlg-check">
            <input type="checkbox" checked={noBreak} onChange={(e) => setNoBreak(e.target.checked)} />
            מנע ניתוק המילה האחרונה בסוף פסקה לשורה נפרדת
          </label>
        </fieldset>

        <fieldset className="dlg-block">
          <legend>כיווץ שורה אחרונה קצרה</legend>
          <label className="dlg-check">
            <input type="checkbox" checked={smartTracking} onChange={(e) => setSmartTracking(e.target.checked)} />
            כווץ (ריווח אותיות) פסקאות שהשורה האחרונה שלהן קצרה
          </label>
          {smartTracking && (
            <div className="dlg-cols">
              <Field label="כיווץ (1/1000 em)">
                <NumberField value={tracking} min={-100} max={0} onChange={setTracking} />
              </Field>
              <Field label="עד כמה מילים בשורה">
                <NumberField value={maxWords} min={1} max={5} onChange={setMaxWords} />
              </Field>
            </div>
          )}
        </fieldset>

        <p className="dlg-summary" role="status">
          שמירת שורות יחד וכיווץ שורה קצרה עלולים למשוך לכיוונים מנוגדים על אותה פסקה - אם שניהם מסומנים, כדאי לבדוק את התוצאה.
        </p>

        <div className="modal-buttons">
          <button className="btn primary" disabled={nothingChosen} onClick={() => onApply({ scope, keepLines, keepFirst, keepLast, noBreak, smartTracking, tracking, maxWords })}>
            החל
          </button>
          <button className="btn" onClick={onClose}>
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}
