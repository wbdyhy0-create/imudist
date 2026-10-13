import { useEffect, useMemo, useState } from 'react'
import { designParts, designSummary, MAX_DESIGNS, type DesignGroup, type DesignPartId, type DesignRecord } from '../designs'

export interface DesignResult {
  ok: boolean
  message: string
}

interface Props {
  designs: DesignRecord[]
  /** the name of a paragraph style, for the summary */
  nameOf: (paragraphStyleId: string) => string
  /** what the selection on the page holds: a design is made from it, and a design given now goes to it */
  selection: { object: boolean; text: boolean; table: boolean }
  onCreate: (name: string) => DesignResult
  onUpdate: (id: string) => DesignResult
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onApply: (id: string, parts: DesignPartId[]) => DesignResult
  onClose: () => void
}

const GROUPS: { id: DesignGroup; title: string }[] = [
  { id: 'object', title: 'אובייקט (צורה, קו או תמונה)' },
  { id: 'text', title: 'טקסט' },
  { id: 'table', title: 'טבלה' },
]

/** the library of designs by example: made from what is selected, and given, whole or in parts, to what is selected */
export function DesignLibraryDialog({ designs, nameOf, selection, onCreate, onUpdate, onRename, onDelete, onApply, onClose }: Props) {
  const [currentId, setCurrentId] = useState<string | null>(designs[0]?.id ?? null)
  const [newName, setNewName] = useState('')
  const [unticked, setUnticked] = useState<Record<string, DesignPartId[]>>({})
  const [result, setResult] = useState<DesignResult | null>(null)
  const current = designs.find((design) => design.id === currentId) ?? null

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // a design that was just made is the one shown
  useEffect(() => {
    if (!currentId || !designs.some((design) => design.id === currentId)) setCurrentId(designs[designs.length - 1]?.id ?? null)
  }, [designs, currentId])

  const parts = useMemo(() => (current ? designParts(current) : []), [current])
  const left = current ? unticked[current.id] ?? [] : []
  const chosen = parts.filter((part) => !left.includes(part.id)).map((part) => part.id)
  const toggle = (id: DesignPartId) => {
    if (!current) return
    setUnticked((all) => ({ ...all, [current.id]: left.includes(id) ? left.filter((item) => item !== id) : [...left, id] }))
  }
  const heldNow = [selection.object && 'אובייקט', selection.text && 'טקסט', selection.table && 'טבלה'].filter(Boolean).join(', ')

  return (
    <div className="modal-backdrop">
      <div className="modal table-dialog design-dialog" role="dialog" aria-modal="true" aria-label="ספריית עיצובים" dir="rtl">
        <h2>ספריית עיצובים</h2>
        <p className="muted">
          עיצוב נלקח מדוגמה: מעצבים אובייקט, טקסט או טבלה, בוחרים אותם ויוצרים עיצוב. אחר כך אפשר להחיל אותו על דברים אחרים, כולו או חלק ממנו.
          כל חלק מגיע למה שמתאים לו: מראה האובייקט לצורות ולתמונות, הסגנונות לטקסט, ומראה הטבלה לטבלאות.
        </p>
        <p className="muted">{heldNow ? `בבחירה עכשיו: ${heldNow}.` : 'אין עכשיו בחירה בעמוד.'}</p>
        <div className="modal-buttons">
          <label className="field-label table-dialog-field">עיצוב חדש מהבחירה
            <input className="select" value={newName} maxLength={80} placeholder={`עיצוב ${designs.length + 1}`} onChange={(event) => setNewName(event.target.value)} />
          </label>
          <button
            type="button"
            className="btn primary"
            disabled={designs.length >= MAX_DESIGNS}
            onClick={() => {
              const made = onCreate(newName.trim() || `עיצוב ${designs.length + 1}`)
              setResult(made)
              if (made.ok) setNewName('')
            }}
          >יצירה</button>
        </div>
        {designs.length === 0 ? (
          <p className="muted">אין עדיין עיצובים. בחרו משהו בעמוד ולחצו „יצירה”.</p>
        ) : (
          <div className="design-layout">
            <ul className="design-list" aria-label="העיצובים">
              {designs.map((design) => (
                <li key={design.id}>
                  <button type="button" className={design.id === currentId ? 'active' : ''} onClick={() => { setCurrentId(design.id); setResult(null) }}>{design.name}</button>
                </li>
              ))}
            </ul>
            {current && (
              <div className="design-details">
                <label className="field-label table-dialog-field">שם
                  <input className="select" value={current.name} maxLength={80} onChange={(event) => onRename(current.id, event.target.value)} />
                </label>
                {designSummary(current, nameOf).map((line) => <p key={line} className="muted">{line}</p>)}
                {GROUPS.map((group) => {
                  const inGroup = parts.filter((part) => part.group === group.id)
                  if (inGroup.length === 0) return null
                  return (
                    <fieldset key={group.id} className="design-group">
                      <legend>{group.title}</legend>
                      {inGroup.map((part) => (
                        <label key={part.id} className="dlg-check">
                          <input type="checkbox" checked={!left.includes(part.id)} onChange={() => toggle(part.id)} />{part.label}
                        </label>
                      ))}
                    </fieldset>
                  )
                })}
                <div className="modal-buttons">
                  <button type="button" className="btn primary" disabled={chosen.length === 0} onClick={() => setResult(onApply(current.id, chosen))}>החלה על הבחירה</button>
                  <button type="button" className="btn" disabled={!heldNow} onClick={() => setResult(onUpdate(current.id))} title="מחליף את החלקים שיש בבחירה בעיצוב">עדכון מהבחירה</button>
                  <button type="button" className="btn" onClick={() => { onDelete(current.id); setResult(null) }}>מחיקה</button>
                </div>
              </div>
            )}
          </div>
        )}
        {result && <p className="muted" role={result.ok ? 'status' : 'alert'}>{result.message}</p>}
        <div className="modal-buttons">
          <button type="button" className="btn" onClick={onClose}>סגירה</button>
        </div>
      </div>
    </div>
  )
}
