import { useState } from 'react'
import type { ParagraphStyleRecord } from './ParagraphStylesPanel'

interface Props {
  styles: ParagraphStyleRecord[]
  onApply: (sourceId: string, targetId: string, scope: 'document' | 'selection') => void
  hasSelection: boolean
  onClose: () => void
}

export function FirstWordStylerDialog({ styles, onApply, hasSelection, onClose }: Props) {
  const [sourceId, setSourceId] = useState(styles[0]?.id ?? '')
  const [targetId, setTargetId] = useState(styles[1]?.id ?? styles[0]?.id ?? '')
  const [scope, setScope] = useState<'document' | 'selection'>(hasSelection ? 'selection' : 'document')
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label="עיצוב מילה ראשונה" dir="rtl">
        <h2>עיצוב מילה ראשונה</h2>
        <label className="field-label">החל על פסקאות בסגנון<select className="select" value={sourceId} onChange={(event) => setSourceId(event.target.value)}>{styles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}</select></label>
        <label className="field-label">סגנון תו למילה הראשונה<select className="select" value={targetId} onChange={(event) => setTargetId(event.target.value)}>{styles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}</select></label>
        <div className="seg" role="radiogroup" aria-label="טווח החלה"><button className={scope === 'document' ? 'on' : ''} onClick={() => setScope('document')}>כל המסמך</button><button className={scope === 'selection' ? 'on' : ''} disabled={!hasSelection} onClick={() => setScope('selection')}>בחירה בלבד</button></div>
        <div className="modal-buttons"><button className="btn primary" disabled={!sourceId || !targetId} onClick={() => onApply(sourceId, targetId, scope)}>החל עיצוב</button><button className="btn" onClick={onClose}>סגור חלון</button></div>
      </div>
    </div>
  )
}
