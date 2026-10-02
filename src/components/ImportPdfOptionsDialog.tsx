import { useEffect, useMemo, useState } from 'react'
import { parsePageRange } from '../pdfPageRange'

interface Props {
  fileName: string
  pageCount: number
  onConfirm: (pages: number[]) => void
  onClose: () => void
}

type PageMode = 'all' | 'first' | 'range'

export function ImportPdfOptionsDialog({ fileName, pageCount, onConfirm, onClose }: Props) {
  const [mode, setMode] = useState<PageMode>('all')
  const [range, setRange] = useState('1')
  const allPages = useMemo(() => Array.from({ length: pageCount }, (_, index) => index + 1), [pageCount])
  const rangePages = useMemo(() => parsePageRange(range, pageCount), [range, pageCount])
  const selectedPages = mode === 'all' ? allPages : mode === 'first' ? [1] : rangePages

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal import-pdf-options-dialog" role="dialog" aria-modal="true" aria-label="אפשרויות ייבוא PDF" dir="rtl">
        <h2>ייבוא PDF כתמונות</h2>
        <p className="file-name"><bdi>{fileName}</bdi> · {pageCount} עמודים</p>
        <div className="seg small" role="radiogroup" aria-label="עמודי PDF לייבוא">
          <button role="radio" aria-checked={mode === 'all'} className={mode === 'all' ? 'on' : ''} onClick={() => setMode('all')}>כל העמודים</button>
          <button role="radio" aria-checked={mode === 'first'} className={mode === 'first' ? 'on' : ''} onClick={() => setMode('first')}>עמוד ראשון</button>
          <button role="radio" aria-checked={mode === 'range'} className={mode === 'range' ? 'on' : ''} onClick={() => setMode('range')}>טווח</button>
        </div>
        <div className="field import-pdf-range-field">
          <label className="field-label" htmlFor="import-pdf-range">טווח עמודים</label>
          <input
            id="import-pdf-range"
            className="import-pdf-range"
            type="text"
            inputMode="numeric"
            value={range}
            disabled={mode !== 'range'}
            placeholder="3-8, 12"
            aria-invalid={mode === 'range' && rangePages.length === 0}
            onChange={(event) => setRange(event.target.value)}
          />
          {mode === 'range' && rangePages.length === 0 && <p className="import-pdf-range-error" role="alert">הזן עמודים או טווח תקין בין 1 ל-{pageCount}, לדוגמה: 3-8, 12.</p>}
        </div>
        <div className="modal-buttons">
          <button className="btn primary" disabled={selectedPages.length === 0} onClick={() => onConfirm(selectedPages)}>ייבוא {selectedPages.length > 0 ? `(${selectedPages.length})` : ''}</button>
          <button className="btn" onClick={onClose}>ביטול</button>
        </div>
      </div>
    </div>
  )
}