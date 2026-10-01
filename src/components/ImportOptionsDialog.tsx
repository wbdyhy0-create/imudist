import { useEffect, useState } from 'react'

interface Props {
  fileName: string
  canReplace: boolean
  onConfirm: (replaceSelected: boolean, includeFootnotes: boolean) => void
  onClose: () => void
}

export function ImportOptionsDialog({ fileName, canReplace, onConfirm, onClose }: Props) {
  const [showOptions, setShowOptions] = useState(true)
  const [replaceSelected, setReplaceSelected] = useState(canReplace)
  const [includeFootnotes, setIncludeFootnotes] = useState(true)

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
          <label className={'dlg-check' + (!canReplace ? ' disabled' : '')}><input type="checkbox" checked={replaceSelected} disabled={!canReplace} onChange={(event) => setReplaceSelected(event.target.checked)} />החלף את הפריט שנבחר</label>
          {!canReplace && <p className="muted">בחר תיבת טקסט במסמך כדי להחליף את תוכנה.</p>}
        </div>}
        <div className="modal-buttons"><button className="btn primary" onClick={() => onConfirm(showOptions && replaceSelected, !showOptions || includeFootnotes)}>ייבוא</button><button className="btn" onClick={onClose}>ביטול</button></div>
      </div>
    </div>
  )
}
