import { useEffect, useState } from 'react'
import { DEFAULT_WINDOW_OPTIONS, loadWindowOptions, saveWindowOptions, WINDOW_MIN_LINES, WINDOW_WORDS, type WindowTextOptions } from '../windowText'
import type { ParagraphStyleRecord } from './ParagraphStylesPanel'

/** what an apply / remove run did, for the line under the buttons */
export interface WindowTextResult {
  changed: number
  /** matching paragraphs left alone: fewer lines than asked for, or an opening too wide to leave a line beside it */
  skippedShort: number
  skippedWide: number
}

interface Props {
  styles: ParagraphStyleRecord[]
  hasSelection: boolean
  onApply: (options: WindowTextOptions) => WindowTextResult
  onRemove: (options: WindowTextOptions) => WindowTextResult
  onClose: () => void
}

const LINE_NAMES: Record<number, string> = { 3: 'שלוש שורות', 4: 'ארבע שורות' }

export function WindowTextDialog({ styles, hasSelection, onApply, onRemove, onClose }: Props) {
  const [options, setOptions] = useState<WindowTextOptions>(() => {
    const saved = { ...DEFAULT_WINDOW_OPTIONS, ...loadWindowOptions() }
    const known = (id: string) => styles.some((style) => style.id === id)
    return {
      ...saved,
      styleId: known(saved.styleId) ? saved.styleId : styles[0]?.id ?? '',
      openingStyleId: known(saved.openingStyleId) ? saved.openingStyleId : '',
      scope: saved.scope === 'selection' && !hasSelection ? 'document' : saved.scope,
    }
  })
  const [useOpeningStyle, setUseOpeningStyle] = useState(() => !!options.openingStyleId)
  const [status, setStatus] = useState<string | null>(null)
  const [guide, setGuide] = useState(false)
  const patch = (next: Partial<WindowTextOptions>) => setOptions((current) => ({ ...current, ...next }))
  // the style behind "style the opening words" is only used while its box is ticked
  const effective: WindowTextOptions = { ...options, openingStyleId: useOpeningStyle ? options.openingStyleId || styles[0]?.id || '' : '' }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const describe = (result: WindowTextResult, done: string) => {
    const parts = [result.changed ? `${done}${result.changed} פסקאות` : 'לא נמצאו פסקאות מתאימות']
    if (result.skippedShort) parts.push(`${result.skippedShort} דולגו: קצרות מדי`)
    if (result.skippedWide) parts.push(`${result.skippedWide} דולגו: מילות הפתיחה רחבות מדי`)
    return parts.join(' · ')
  }
  const run = (remove: boolean) => {
    saveWindowOptions(effective)
    setStatus(describe(remove ? onRemove(effective) : onApply(effective), remove ? 'הוסרו חלונות מ-' : 'נוצרו חלונות ב-'))
  }

  return (
    <div className="modal-backdrop">
      <div className="modal window-text-dialog" role="dialog" aria-modal="true" aria-label="יצירת חלון בטקסט" dir="rtl">
        <h2>יצירת חלון בטקסט</h2>
        <p className="muted">השורה השנייה של הפסקה מוזחת ברוחב מילות הפתיחה, וכך נוצר חלון מתחתיהן.</p>

        <h3 className="window-text-section">סגנון פסקה וטווח</h3>
        <label className="field-label">סגנון הפסקאות
          <select className="select" value={options.styleId} onChange={(event) => patch({ styleId: event.target.value })}>
            {styles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}
          </select>
        </label>
        <div className="seg" role="radiogroup" aria-label="טווח החלה">
          <button className={options.scope === 'document' ? 'on' : ''} onClick={() => patch({ scope: 'document' })}>כל המסמך</button>
          <button className={options.scope === 'selection' ? 'on' : ''} disabled={!hasSelection} onClick={() => patch({ scope: 'selection' })}>טקסט נבחר בלבד</button>
        </div>

        <h3 className="window-text-section">מאפייני החלון</h3>
        <label className="field-label">רוחב החלון במילים
          <select className="select" value={options.words} onChange={(event) => patch({ words: Number(event.target.value) })}>
            {WINDOW_WORDS.map((words) => <option key={words} value={words}>{words}</option>)}
          </select>
        </label>
        <label className="field-label">מינימום שורות בפסקה
          <select className="select" value={options.minLines} onChange={(event) => patch({ minLines: Number(event.target.value) })}>
            {WINDOW_MIN_LINES.map((lines) => <option key={lines} value={lines}>{LINE_NAMES[lines]}</option>)}
          </select>
        </label>
        <label className="dlg-check"><input type="checkbox" checked={useOpeningStyle} onChange={(event) => setUseOpeningStyle(event.target.checked)} />עיצוב מילות הפתיחה בסגנון:</label>
        <select className="select" aria-label="סגנון מילות הפתיחה" disabled={!useOpeningStyle} value={options.openingStyleId || styles[0]?.id || ''} onChange={(event) => patch({ openingStyleId: event.target.value })}>
          {styles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}
        </select>

        {status && <p className="window-text-status" role="status">{status}</p>}
        {guide && (
          <ol className="window-text-guide">
            <li>בחרו את סגנון הפסקה שעליו החלון יחול, ואם לפעול על כל המסמך או רק על טקסט שסומן.</li>
            <li>קבעו כמה מילות פתיחה החלון רחב כמוהן, ומהו מספר השורות המינימלי בפסקה - פסקאות קצרות יותר לא יקבלו חלון.</li>
            <li>אפשר לבחור סגנון שיעצב את מילות הפתיחה (למשל גדולות ומודגשות) לפני מדידת החלון.</li>
            <li>לחצו על ״יצירת חלונות״. ״הסרת חלונות״ מחזירה את הפסקאות לטקסט רגיל, ואת העיצוב של מילות הפתיחה משאירה כמות שהוא.</li>
            <li>השורה השנייה מתחילה בדיוק מתחת למילה שאחרי מילות הפתיחה בשורה הראשונה. החלון נמדד מחדש מעצמו אחרי כל שינוי שמזיז אותה: הקלדה, שינוי רוחב מסגרת, שינוי יישור או גופן.</li>
            <li>ביטול של פעולה אחת: Ctrl+Z.</li>
          </ol>
        )}

        <div className="modal-buttons">
          <button className="btn primary" disabled={!options.styleId} onClick={() => run(false)}>יצירת חלונות</button>
          <button className="btn danger" disabled={!options.styleId} onClick={() => run(true)}>הסרת חלונות</button>
          <button className="btn" onClick={() => setGuide((shown) => !shown)}>{guide ? 'הסתרת המדריך' : 'מדריך'}</button>
          <button className="btn" onClick={onClose}>סגור חלון</button>
        </div>
      </div>
    </div>
  )
}
