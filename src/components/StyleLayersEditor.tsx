import type { CharacterStyleRecord, StyleLayerRule, StyleLayerWhen } from '../document'
import { layerProblem, MAX_LAYER_PATTERN, MAX_STYLE_LAYERS, STYLE_LAYER_KINDS } from '../styleLayers'

interface Props {
  rules: StyleLayerRule[]
  characterStyles: CharacterStyleRecord[]
  onChange: (rules: StyleLayerRule[]) => void
}

/** the style layers of a paragraph style: a character style given, on top, to what is of a kind (Latin letters in Hebrew text...) */
export function StyleLayersEditor({ rules, characterStyles, onChange }: Props) {
  const change = (index: number, patch: Partial<StyleLayerRule>) => onChange(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)))
  const add = () => {
    const first = characterStyles[0]
    if (first) onChange([...rules, { styleId: first.id, when: 'latin' }])
  }
  const known = (id: string) => characterStyles.some((style) => style.id === id)
  return (
    <div className="nested-styles-editor">
      <p className="muted">
        שכבה נותנת סגנון תו נוסף, מעל הטקסט, לכל מה שבפסקאות הסגנון הזה מסוג מסוים: למשל לאותיות לטיניות בתוך עברית, כדי שיקבלו גופן אנגלי.
        השכבה לא נכתבת לתוך הטקסט אלא מחושבת בכל תצוגה וייצוא, ולכן היא עוקבת אחרי כל הקלדה, ולא דורסת סגנונות תו שהטקסט כבר מחזיק:
        רק ההגדרות שהסגנון שלה קובע מתווספות. כמה שכבות נקראות לפי הסדר, והמאוחרת גוברת.
      </p>
      {characterStyles.length === 0 && <p className="muted">אין עדיין סגנונות תו. אפשר ליצור אותם בפאנל "סגנונות תו".</p>}
      {rules.map((rule, index) => {
        const problem = layerProblem(rule)
        return (
          <div key={index} className="nested-rule">
            <div className="table-dialog-grid">
              <label className="field-label table-dialog-field">מה לזהות
                <select className="select" value={rule.when} onChange={(e) => change(index, { when: e.target.value as StyleLayerWhen })}>
                  {STYLE_LAYER_KINDS.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
                </select>
              </label>
              <label className="field-label table-dialog-field">סגנון התו שמתווסף
                <select className="select" value={rule.styleId} onChange={(e) => change(index, { styleId: e.target.value })}>
                  {!known(rule.styleId) && <option value={rule.styleId}>(סגנון שנמחק)</option>}
                  {characterStyles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}
                </select>
              </label>
              <label className="field-label table-dialog-field">רק היכן שחל סגנון תו
                <select className="select" value={rule.onlyWithStyleId ?? ''} onChange={(e) => change(index, { onlyWithStyleId: e.target.value || undefined })}>
                  <option value="">(בכל מקום)</option>
                  {rule.onlyWithStyleId && !known(rule.onlyWithStyleId) && <option value={rule.onlyWithStyleId}>(סגנון שנמחק)</option>}
                  {characterStyles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}
                </select>
              </label>
              {rule.when === 'custom' && (
                <label className="field-label table-dialog-field">תבנית (ביטוי רגולרי)
                  <input
                    className="select"
                    dir="ltr"
                    maxLength={MAX_LAYER_PATTERN}
                    value={rule.pattern ?? ''}
                    placeholder="\d+"
                    spellCheck={false}
                    onChange={(e) => change(index, { pattern: e.target.value })}
                  />
                </label>
              )}
            </div>
            {problem && <p className="muted" role="alert">{problem}: השכבה לא פועלת.</p>}
            <button className="btn" onClick={() => onChange(rules.filter((_, i) => i !== index))}>הסרת השכבה</button>
          </div>
        )
      })}
      <div className="modal-buttons">
        <button className="btn" disabled={characterStyles.length === 0 || rules.length >= MAX_STYLE_LAYERS} onClick={add}>הוספת שכבה</button>
      </div>
    </div>
  )
}
