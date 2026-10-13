import { useEffect, useState, type ReactNode } from 'react'
import { NumberField } from './NumberField'
import { t } from '../i18n'

export interface SmartLayoutRequest {
  scope: 'doc' | 'selection'
  /** only the paragraphs in this paragraph style (the running text, say); '' = every paragraph in the scope */
  styleId: string
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
  /** the document's paragraph styles, to limit the tools to one of them */
  styles: { id: string; name: string }[]
  /** how many paragraphs the tools acted on (0: none was in the chosen style, so nothing happened and the dialog stays) */
  onApply: (r: SmartLayoutRequest) => number
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
const STYLE_KEY = 'imudist.smartLayoutStyle'

export function SmartLayoutDialog({ hasSelection, styles, onApply, onClose }: Props) {
  const [scope, setScope] = useState<'doc' | 'selection'>(hasSelection ? 'selection' : 'doc')
  // the style used last time, when it is still there
  const [styleId, setStyleId] = useState(() => {
    try {
      const saved = localStorage.getItem(STYLE_KEY) ?? ''
      return styles.some((style) => style.id === saved) ? saved : ''
    } catch {
      return ''
    }
  })
  const [nothingMatched, setNothingMatched] = useState(false)
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
      <div className="modal wide" role="dialog" aria-modal="true" aria-label={t('יתומים, אלמנות וכיווץ')}>
        <h2>{t('יתומים, אלמנות וכיווץ')}</h2>

        <div className="place-modes" role="group" aria-label={t('טווח ההחלה')}>
          <button className={scope === 'doc' ? 'on' : ''} onClick={() => setScope('doc')}>
            {t('כל המסמך')}
          </button>
          <button className={scope === 'selection' ? 'on' : ''} disabled={!hasSelection} onClick={() => setScope('selection')}>
            {t('בחירה בלבד')}
          </button>
        </div>

        <label className="field-label">{t('החל על פסקאות בסגנון')}
          <select
            className="select"
            value={styleId}
            onChange={(e) => {
              setStyleId(e.target.value)
              setNothingMatched(false)
            }}
          >
            <option value="">{t('כל הפסקאות')}</option>
            {styles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}
          </select>
        </label>
        {nothingMatched && <p className="dlg-summary" role="alert">{t('אין בטווח שבחרת פסקאות בסגנון הזה, ולכן לא שונה כלום.')}</p>}

        <fieldset className="dlg-block">
          <legend>{t('מניעת יתומים ואלמנות')}</legend>
          <label className="dlg-check">
            <input type="checkbox" checked={keepLines} onChange={(e) => setKeepLines(e.target.checked)} />
            {t('שמור שורות ראשונות/אחרונות של פסקה יחד בין העברות עמוד')}
          </label>
          {keepLines && (
            <div className="dlg-cols">
              <Field label={t('שורות ראשונות (מינימום)')}>
                <NumberField value={keepFirst} min={1} max={10} onChange={setKeepFirst} />
              </Field>
              <Field label={t('שורות אחרונות (מינימום)')}>
                <NumberField value={keepLast} min={1} max={10} onChange={setKeepLast} />
              </Field>
            </div>
          )}
          <label className="dlg-check">
            <input type="checkbox" checked={noBreak} onChange={(e) => setNoBreak(e.target.checked)} />
            {t('מנע ניתוק המילה האחרונה בסוף פסקה לשורה נפרדת')}
          </label>
        </fieldset>

        <fieldset className="dlg-block">
          <legend>{t('כיווץ שורה אחרונה קצרה')}</legend>
          <label className="dlg-check">
            <input type="checkbox" checked={smartTracking} onChange={(e) => setSmartTracking(e.target.checked)} />
            {t('כווץ (ריווח אותיות) פסקאות שהשורה האחרונה שלהן קצרה')}
          </label>
          {smartTracking && (
            <div className="dlg-cols">
              <Field label={t('כיווץ (% מגודל הגופן)')}>
                <NumberField value={tracking / 10} suffix="%" step={1} min={-10} max={0} onChange={(v) => setTracking(Math.round(v * 10))} />
              </Field>
              <Field label={t('עד כמה מילים בשורה')}>
                <NumberField value={maxWords} min={1} max={5} onChange={setMaxWords} />
              </Field>
            </div>
          )}
        </fieldset>

        <p className="dlg-summary" role="status">
          {t('שמירת שורות יחד וכיווץ שורה קצרה עלולים למשוך לכיוונים מנוגדים על אותה פסקה - אם שניהם מסומנים, כדאי לבדוק את התוצאה.')}
        </p>

        <div className="modal-buttons">
          <button className="btn primary" disabled={nothingChosen} onClick={() => {
              try { localStorage.setItem(STYLE_KEY, styleId) } catch { /* a convenience only */ }
              setNothingMatched(onApply({ scope, styleId, keepLines, keepFirst, keepLast, noBreak, smartTracking, tracking, maxWords }) === 0)
            }}>
            {t('החל')}
          </button>
          <button className="btn" onClick={onClose}>
            {t('ביטול')}
          </button>
        </div>
      </div>
    </div>
  )
}
