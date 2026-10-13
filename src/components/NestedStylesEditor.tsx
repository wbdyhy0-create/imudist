import { useState } from 'react'
import type { CharacterStyleRecord, NestedStyleRule } from '../document'
import { NESTED_UNITS } from '../nestedStyles'

interface Props {
  rules: NestedStyleRule[]
  characterStyles: CharacterStyleRecord[]
  onChange: (rules: NestedStyleRule[]) => void
  /** gives the rules to every paragraph that is in the style now */
  onApply: () => void
  /** the rules the paragraphs selected in the text show (null when no text is selected) */
  onDetect?: () => { rules: NestedStyleRule[]; paragraphs: number } | null
}

/** the nested styles of a paragraph style: character styles given automatically to the opening of its paragraphs */
export function NestedStylesEditor({ rules, characterStyles, onChange, onApply, onDetect }: Props) {
  const [detected, setDetected] = useState<string | null>(null)
  const detect = () => {
    const found = onDetect?.()
    if (!found) return setDetected('בחרו תיבת טקסט, או סמנו פסקאות שהפתיחה שלהן מעוצבת בסגנון תו.')
    const known = new Set(characterStyles.map((style) => style.id))
    const usable = found.rules.filter((rule) => known.has(rule.styleId))
    if (usable.length === 0) return setDetected('לא נמצא סגנון תו בתחילת הפסקאות שנבדקו.')
    onChange(usable)
    setDetected(`זוהו ${usable.length} כללים מ-${found.paragraphs} פסקאות. אפשר לתקן אותם כאן.`)
  }
  const change = (index: number, patch: Partial<NestedStyleRule>) => onChange(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)))
  const add = () => {
    const first = characterStyles[0]
    if (first) onChange([...rules, { styleId: first.id, unit: 'words', count: 1, inclusive: false }])
  }
  return (
    <div className="nested-styles-editor">
      <p className="muted">
        הכללים נקראים לפי הסדר, וכל אחד מתחיל במקום שהקודם נעצר בו. כלל שהפסקה אינה מכילה את מה שהוא מבקש (למשל תו מפריד שלא קיים בה) לא מעצב כלום,
        והכללים שאחריו לא נקראים.
      </p>
      {characterStyles.length === 0 && <p className="muted">אין עדיין סגנונות תו. אפשר ליצור אותם בפאנל "סגנונות תו".</p>}
      {rules.map((rule, index) => {
        const known = characterStyles.some((style) => style.id === rule.styleId)
        return (
          <div key={index} className="nested-rule">
            <div className="table-dialog-grid">
              <label className="field-label table-dialog-field">סגנון תו
                <select className="select" value={rule.styleId} onChange={(e) => change(index, { styleId: e.target.value })}>
                  {!known && <option value={rule.styleId}>(סגנון שנמחק)</option>}
                  {characterStyles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}
                </select>
              </label>
              <label className="field-label table-dialog-field">יחידה
                <select className="select" value={rule.unit} onChange={(e) => change(index, { unit: e.target.value as NestedStyleRule['unit'] })}>
                  {NESTED_UNITS.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}
                </select>
              </label>
              <label className="field-label table-dialog-field">כמות
                <input className="select" type="number" min={1} max={1000} value={rule.count} onChange={(e) => change(index, { count: Math.min(1000, Math.max(1, Math.round(Number(e.target.value) || 1))) })} />
              </label>
              {rule.unit === 'delimiter' && (
                <label className="field-label table-dialog-field">התו
                  <input className="select" maxLength={10} value={rule.delimiter ?? ':'} placeholder=":" onChange={(e) => change(index, { delimiter: e.target.value || undefined })} />
                </label>
              )}
            </div>
            {(rule.unit === 'delimiter' || rule.unit === 'sentences') && (
              <label className="dlg-check"><input type="checkbox" checked={rule.inclusive} onChange={(e) => change(index, { inclusive: e.target.checked })} />{rule.unit === 'delimiter' ? 'כולל התו עצמו' : 'כולל סימן הסיום'}</label>
            )}
            <button className="btn" onClick={() => onChange(rules.filter((_, i) => i !== index))}>הסרת הכלל</button>
          </div>
        )
      })}
      <div className="modal-buttons">
        <button className="btn" disabled={characterStyles.length === 0} onClick={add}>הוספת כלל</button>
        {onDetect && <button className="btn" onClick={detect} title="קורא את סגנונות התו שבתחילת הפסקאות של הטקסט שנבחר ויוצר מהם כללים">זיהוי מהטקסט המסומן</button>}
        <button className="btn primary" disabled={rules.length === 0} onClick={onApply}>החל על כל הפסקאות בסגנון</button>
      </div>
      {detected && <p className="muted" role="status">{detected}</p>}
    </div>
  )
}
