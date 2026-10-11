import { useEffect, useState } from 'react'
import type { FlowMode } from '../placeText'

interface Props {
  fileName: string
  canReplace: boolean
  /** `flow` is how the text is poured in (undefined when the options were hidden: the text cursor keeps its mode) */
  onConfirm: (replaceSelected: boolean, includeFootnotes: boolean, flow?: FlowMode) => void
  onClose: () => void
}

export function ImportOptionsDialog({ fileName, canReplace, onConfirm, onClose }: Props) {
  const [showOptions, setShowOptions] = useState(true)
  const [replaceSelected, setReplaceSelected] = useState(canReplace)
  const [includeFootnotes, setIncludeFootnotes] = useState(true)
  const [flow, setFlow] = useState<FlowMode>('auto')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal import-options-dialog" role="dialog" aria-modal="true" aria-label="אפשרויות ייבוא Word" dir="rtl">
        <h2>אפשרויות ייבוא Word</h2>
        <p className="file-name"><bdi>{fileName}</bdi></p>
        <label className="dlg-check"><input type="checkbox" checked={showOptions} onChange={(event) => setShowOptions(event.target.checked)} />הצג אפשרויות ייבוא</label>
        {showOptions && <div className="import-options-body">
          <p>הטקסט ייובא עם זיהוי סגנונות הפסקה והעיצוב הבסיסי מתוך Word.</p>
          <label className="dlg-check"><input type="checkbox" checked={includeFootnotes} onChange={(event) => setIncludeFootnotes(event.target.checked)} />ייבא הערות שוליים</label>
          <fieldset className="import-flow">
            <legend>אופן הצבת הטקסט</legend>
            <label className="dlg-check"><input type="radio" name="import-flow" checked={flow === 'auto'} onChange={() => setFlow('auto')} />זרימה אוטומטית: ממלא את כל העמודים ומוסיף עמודים לפי הצורך</label>
            <label className="dlg-check"><input type="radio" name="import-flow" checked={flow === 'semi'} onChange={() => setFlow('semi')} />חצי-אוטומטית: ממלא תיבה ומחכה ללחיצה הבאה</label>
            <label className="dlg-check"><input type="radio" name="import-flow" checked={flow === 'single'} onChange={() => setFlow('single')} />תיבה אחת: מה שלא נכנס נשאר כגלישה</label>
          </fieldset>
          <label className={'dlg-check' + (!canReplace ? ' disabled' : '')}><input type="checkbox" checked={replaceSelected} disabled={!canReplace} onChange={(event) => setReplaceSelected(event.target.checked)} />התחל בתיבת הטקסט שנבחרה (אחרת הטקסט נטען לסמן, ולוחצים בעמוד להצבתו)</label>
          {!canReplace && <p className="muted">בחר תיבת טקסט במסמך כדי להתחיל בה.</p>}
        </div>}
        <div className="modal-buttons"><button className="btn primary" onClick={() => onConfirm(showOptions && replaceSelected, !showOptions || includeFootnotes, showOptions ? flow : undefined)}>ייבוא</button><button className="btn" onClick={onClose}>ביטול</button></div>
      </div>
    </div>
  )
}
