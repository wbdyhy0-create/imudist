import { useState } from 'react'
import type { CharacterStyleRecord } from '../document'
import type { ParagraphStyleRecord } from './ParagraphStylesPanel'

/** what the first word is given: a character style (the word stays tied to it), or only the look of a paragraph style */
export type FirstWordTarget = { kind: 'character' | 'paragraph'; id: string }

interface Props {
  styles: ParagraphStyleRecord[]
  characterStyles: CharacterStyleRecord[]
  onApply: (sourceId: string, target: FirstWordTarget, scope: 'document' | 'selection') => void
  hasSelection: boolean
  onClose: () => void
}

const encode = (target: FirstWordTarget) => `${target.kind === 'character' ? 'c' : 'p'}:${target.id}`
const decode = (value: string): FirstWordTarget => ({ kind: value.startsWith('c:') ? 'character' : 'paragraph', id: value.slice(2) })

export function FirstWordStylerDialog({ styles, characterStyles, onApply, hasSelection, onClose }: Props) {
  const [sourceId, setSourceId] = useState(styles[0]?.id ?? '')
  const [target, setTarget] = useState(() => (characterStyles[0] ? encode({ kind: 'character', id: characterStyles[0].id }) : encode({ kind: 'paragraph', id: styles[1]?.id ?? styles[0]?.id ?? '' })))
  const [scope, setScope] = useState<'document' | 'selection'>(hasSelection ? 'selection' : 'document')
  const chosen = decode(target)
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label="עיצוב מילה ראשונה">
        <h2>עיצוב מילה ראשונה</h2>
        <label className="field-label">החל על פסקאות בסגנון
          <select className="select" value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
            {styles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}
          </select>
        </label>
        <label className="field-label">סגנון תו למילה הראשונה
          <select className="select" value={target} onChange={(event) => setTarget(event.target.value)}>
            {characterStyles.length > 0 && (
              <optgroup label="סגנונות תו">
                {characterStyles.map((style) => <option key={style.id} value={encode({ kind: 'character', id: style.id })}>{style.name}</option>)}
              </optgroup>
            )}
            <optgroup label="עיצוב לפי סגנון פסקה (בלי קישור)">
              {styles.map((style) => <option key={style.id} value={encode({ kind: 'paragraph', id: style.id })}>{style.name}</option>)}
            </optgroup>
          </select>
        </label>
        {characterStyles.length === 0 && <p className="muted">אפשר ליצור סגנון תו בפאנל "סגנונות תו". מילה שעוצבה בסגנון תו נשארת קשורה אליו, ושינוי הסגנון משנה אותה.</p>}
        <div className="seg" role="radiogroup" aria-label="טווח החלה">
          <button className={scope === 'document' ? 'on' : ''} onClick={() => setScope('document')}>כל המסמך</button>
          <button className={scope === 'selection' ? 'on' : ''} disabled={!hasSelection} onClick={() => setScope('selection')}>בחירה בלבד</button>
        </div>
        <div className="modal-buttons">
          <button className="btn primary" disabled={!sourceId || !chosen.id} onClick={() => onApply(sourceId, chosen, scope)}>החל עיצוב</button>
          <button className="btn" onClick={onClose}>סגור חלון</button>
        </div>
      </div>
    </div>
  )
}
