import { useEffect, useState } from 'react'
import { DEFAULT_WINDOW_OPTIONS, loadWindowOptions, saveWindowOptions, WINDOW_MIN_LINES, WINDOW_WORDS, type WindowTextOptions } from '../windowText'
import type { ParagraphStyleRecord } from './ParagraphStylesPanel'
import { t } from '../i18n'

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

const LINE_NAMES: Record<number, string> = {
  get 3() { return t('שלוש שורות') },
  get 4() { return t('ארבע שורות') },
}

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
    const parts = [result.changed ? t('{done}{n2} פסקאות', { done, n2: result.changed }) : t('לא נמצאו פסקאות מתאימות')]
    if (result.skippedShort) parts.push(t('{n1} דולגו: קצרות מדי', { n1: result.skippedShort }))
    if (result.skippedWide) parts.push(t('{n1} דולגו: מילות הפתיחה רחבות מדי', { n1: result.skippedWide }))
    return parts.join(' · ')
  }
  const run = (remove: boolean) => {
    saveWindowOptions(effective)
    setStatus(describe(remove ? onRemove(effective) : onApply(effective), remove ? t('הוסרו חלונות מ-') : t('נוצרו חלונות ב-')))
  }

  return (
    <div className="modal-backdrop">
      <div className="modal window-text-dialog" role="dialog" aria-modal="true" aria-label={t('יצירת חלון בטקסט')}>
        <h2>{t('יצירת חלון בטקסט')}</h2>
        <p className="muted">{t('השורה השנייה של הפסקה מוזחת ברוחב מילות הפתיחה, וכך נוצר חלון מתחתיהן.')}</p>

        <h3 className="window-text-section">{t('סגנון פסקה וטווח')}</h3>
        <label className="field-label">{t('סגנון הפסקאות')}
          <select className="select" value={options.styleId} onChange={(event) => patch({ styleId: event.target.value })}>
            {styles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}
          </select>
        </label>
        <div className="seg" role="radiogroup" aria-label={t('טווח החלה')}>
          <button className={options.scope === 'document' ? 'on' : ''} onClick={() => patch({ scope: 'document' })}>{t('כל המסמך')}</button>
          <button className={options.scope === 'selection' ? 'on' : ''} disabled={!hasSelection} onClick={() => patch({ scope: 'selection' })}>{t('טקסט נבחר בלבד')}</button>
        </div>

        <h3 className="window-text-section">{t('מאפייני החלון')}</h3>
        <label className="field-label">{t('רוחב החלון במילים')}
          <select className="select" value={options.words} onChange={(event) => patch({ words: Number(event.target.value) })}>
            {WINDOW_WORDS.map((words) => <option key={words} value={words}>{words}</option>)}
          </select>
        </label>
        <label className="field-label">{t('מינימום שורות בפסקה')}
          <select className="select" value={options.minLines} onChange={(event) => patch({ minLines: Number(event.target.value) })}>
            {WINDOW_MIN_LINES.map((lines) => <option key={lines} value={lines}>{LINE_NAMES[lines]}</option>)}
          </select>
        </label>
        <label className="dlg-check"><input type="checkbox" checked={useOpeningStyle} onChange={(event) => setUseOpeningStyle(event.target.checked)} />{t('עיצוב מילות הפתיחה בסגנון:')}</label>
        <select className="select" aria-label={t('סגנון מילות הפתיחה')} disabled={!useOpeningStyle} value={options.openingStyleId || styles[0]?.id || ''} onChange={(event) => patch({ openingStyleId: event.target.value })}>
          {styles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}
        </select>

        {status && <p className="window-text-status" role="status">{status}</p>}
        {guide && (
          <ol className="window-text-guide">
            <li>{t('בחרו את סגנון הפסקה שעליו החלון יחול, ואם לפעול על כל המסמך או רק על טקסט שסומן.')}</li>
            <li>{t('קבעו כמה מילות פתיחה החלון רחב כמוהן, ומהו מספר השורות המינימלי בפסקה - פסקאות קצרות יותר לא יקבלו חלון.')}</li>
            <li>{t('אפשר לבחור סגנון שיעצב את מילות הפתיחה (למשל גדולות ומודגשות) לפני מדידת החלון.')}</li>
            <li>{t('לחצו על ״יצירת חלונות״. ״הסרת חלונות״ מחזירה את הפסקאות לטקסט רגיל, ואת העיצוב של מילות הפתיחה משאירה כמות שהוא.')}</li>
            <li>{t('השורה השנייה מתחילה בדיוק מתחת למילה שאחרי מילות הפתיחה בשורה הראשונה. החלון נמדד מחדש מעצמו אחרי כל שינוי שמזיז אותה: הקלדה, שינוי רוחב מסגרת, שינוי יישור או גופן.')}</li>
            <li>{t('ביטול של פעולה אחת: Ctrl+Z.')}</li>
          </ol>
        )}

        <div className="modal-buttons">
          <button className="btn primary" disabled={!options.styleId} onClick={() => run(false)}>{t('יצירת חלונות')}</button>
          <button className="btn danger" disabled={!options.styleId} onClick={() => run(true)}>{t('הסרת חלונות')}</button>
          <button className="btn" onClick={() => setGuide((shown) => !shown)}>{guide ? t('הסתרת המדריך') : t('מדריך')}</button>
          <button className="btn" onClick={onClose}>{t('סגור חלון')}</button>
        </div>
      </div>
    </div>
  )
}
