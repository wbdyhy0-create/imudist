import { useEffect, useState } from 'react'
import type { ParagraphStyleRecord, TocConfig, TocLevelConfig } from '../document'
import { NumberField } from './NumberField'

interface Props {
  styles: ParagraphStyleRecord[]
  initial?: TocConfig
  onConfirm: (config: TocConfig) => boolean
  onClose: () => void
}

export function TocDialog({ styles, initial, onConfirm, onClose }: Props) {
  const firstStyleId = initial?.levels[0]?.sourceStyleId ?? styles.find((style) => style.id === 'heading')?.id ?? styles[0]?.id ?? ''
  const bodyStyleId = styles.find((style) => style.id === 'body')?.id ?? styles[0]?.id ?? ''
  const [levels, setLevels] = useState<TocLevelConfig[]>(initial?.levels.length ? initial.levels.map((level) => ({ ...level, outputStyleId: level.outputStyleId ?? bodyStyleId })) : firstStyleId ? [{ sourceStyleId: firstStyleId, outputStyleId: bodyStyleId, indent: 0 }] : [])
  const [leader, setLeader] = useState(initial?.leader ?? '.')
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const updateLevel = (index: number, patch: Partial<TocLevelConfig>) =>
    setLevels((current) => current.map((level, at) => at === index ? { ...level, ...patch } : level))

  const submit = () => {
    if (levels.length === 0 || levels.some((level) => !level.sourceStyleId || !level.outputStyleId)) {
      setError('בחר סגנון מקור וסגנון תצוגה לכל רמה.')
      return
    }
    if (!onConfirm({ levels, leader: leader || '.' })) setError('לא נמצאו כותרות בסגנונות שנבחרו.')
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal wide toc-dialog" role="dialog" aria-modal="true" aria-label="יצירת תוכן עניינים" dir="rtl">
        <h2>יצירת תוכן עניינים</h2>
        <p className="muted">בחר סגנונות פסקה שייכללו בתוכן העניינים, לפי רמה.</p>
        {levels.map((level, index) => (
          <div className="toc-level-row" key={index}>
            <label className="field">
              <span className="field-label">רמה {index + 1} — כותרת מקור</span>
              <select value={level.sourceStyleId} onChange={(event) => updateLevel(index, { sourceStyleId: event.target.value })}>
                {styles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">סגנון תצוגה ב־TOC</span>
              <select value={level.outputStyleId} onChange={(event) => updateLevel(index, { outputStyleId: event.target.value })}>
                {styles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}
              </select>
            </label>
            <label className="field toc-indent-field">
              <span className="field-label">הזחה (נק׳)</span>
              <NumberField value={level.indent} min={0} max={200} step={6} onChange={(indent) => updateLevel(index, { indent })} />
            </label>
            <button className="icon-button toc-remove-level" aria-label={`הסר רמה ${index + 1}`} title="הסר רמה" disabled={levels.length <= 1} onClick={() => setLevels((current) => current.filter((_, at) => at !== index))}>−</button>
          </div>
        ))}
        <button className="btn toc-add-level" disabled={styles.length === 0 || levels.length >= 6} onClick={() => setLevels((current) => [...current, { sourceStyleId: styles.find((style) => !current.some((level) => level.sourceStyleId === style.id))?.id ?? styles[0].id, outputStyleId: bodyStyleId, indent: current.length * 12 }])}>הוסף רמה</button>
        <label className="field toc-leader-field">
          <span className="field-label">מוביל בין הכותרת למספר העמוד</span>
          <input value={leader} maxLength={4} onChange={(event) => setLeader(event.target.value)} />
        </label>
        {error && <p className="toc-error" role="alert">{error}</p>}
        <div className="modal-buttons">
          <button className="btn primary" disabled={styles.length === 0} onClick={submit}>צור תוכן עניינים</button>
          <button className="btn" onClick={onClose}>ביטול</button>
        </div>
      </div>
    </div>
  )
}