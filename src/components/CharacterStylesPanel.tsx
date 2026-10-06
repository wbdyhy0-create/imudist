import { useEffect, useState, type ReactNode } from 'react'
import type { CharacterStyleRecord, CharacterStyleSettings } from '../document'
import { useFontCatalog, weightName } from '../fonts'
import { FontPicker } from './FontPicker'

interface Props {
  styles: CharacterStyleRecord[]
  /** the character style of the selected text: undefined = no text to give one to, null = it has none */
  activeId: string | null | undefined
  /** a text (or a note's text) is selected, so a style can be applied */
  canApply: boolean
  onApply: (id: string | null) => void
  /** what the selected text looks like beyond its paragraph's own look: the start of a style made from it */
  onSelectionLook: () => CharacterStyleSettings
  /** makes the style, and gives it to the selected text when `apply` */
  onCreate: (name: string, patch: CharacterStyleSettings, apply: boolean) => void
  onChange: (id: string, name: string, patch: CharacterStyleSettings) => void
  onDelete: (id: string) => void
}

const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900]

/** how a style looks as a line of text: its own font, weight, colour */
const sampleCss = (patch: CharacterStyleSettings) => ({
  ...(patch.fontFamily ? { fontFamily: `"${patch.fontFamily}", "Segoe UI", Arial, sans-serif` } : {}),
  ...(patch.weight ? { fontWeight: patch.weight } : {}),
  ...(patch.italic !== undefined ? { fontStyle: patch.italic ? 'italic' : 'normal' } : {}),
  ...(patch.color ? { color: patch.color } : {}),
})

export function CharacterStylesPanel({ styles, activeId, canApply, onApply, onSelectionLook, onCreate, onChange, onDelete }: Props) {
  const [editing, setEditing] = useState<{ id: string | null; name: string; patch: CharacterStyleSettings } | null>(null)
  const newName = () => {
    for (let n = styles.length + 1; ; n++) {
      const name = `סגנון תו ${n}`
      if (!styles.some((style) => style.name === name)) return name
    }
  }
  return (
    <section className="paragraph-styles-panel props-panel character-styles-panel" aria-label="סגנונות תו">
      <div className="styles-panel-head">
        <h2 className="props-title">סגנונות תו</h2>
        <button className="icon-button" aria-label="סגנון תו חדש" title="סגנון תו חדש" onMouseDown={(event) => event.preventDefault()} onClick={() => setEditing({ id: null, name: newName(), patch: {} })}>+</button>
      </div>
      <p className="muted">{canApply ? 'בחר טקסט ולחץ על סגנון. בלי בחירה, הסגנון חל על כל הטקסט שבתיבה.' : 'בחר תיבת טקסט או סמן טקסט כדי להחיל סגנון.'}</p>
      <div className="paragraph-style-list">
        <button
          className={'paragraph-style-row' + (activeId === null ? ' active' : '')}
          disabled={!canApply}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onApply(null)}
        >
          <span className="style-sample">[ללא]</span>
        </button>
        {styles.map((style) => (
          <div key={style.id} className="character-style-row">
            <button
              className={'paragraph-style-row' + (style.id === activeId ? ' active' : '')}
              disabled={!canApply}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onApply(style.id)}
              onDoubleClick={() => setEditing({ id: style.id, name: style.name, patch: style.patch })}
            >
              <span className="style-sample" style={sampleCss(style.patch)}>{style.name}</span>
            </button>
            <button className="icon-button" aria-label={`עריכת ${style.name}`} title="עריכת הסגנון" onMouseDown={(event) => event.preventDefault()} onClick={() => setEditing({ id: style.id, name: style.name, patch: style.patch })}>✎</button>
          </div>
        ))}
      </div>
      <div className="paragraph-style-actions">
        <button className="btn" disabled={!canApply} onMouseDown={(event) => event.preventDefault()} onClick={() => setEditing({ id: null, name: newName(), patch: onSelectionLook() })}>סגנון חדש מהבחירה</button>
      </div>
      {editing && (
        <CharacterStyleDialog
          initial={editing}
          onSave={(name, patch) => {
            if (editing.id) onChange(editing.id, name, patch)
            else onCreate(name, patch, canApply)
            setEditing(null)
          }}
          onDelete={editing.id ? () => { onDelete(editing.id!); setEditing(null) } : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  )
}

interface DialogProps {
  initial: { id: string | null; name: string; patch: CharacterStyleSettings }
  onSave: (name: string, patch: CharacterStyleSettings) => void
  onDelete?: () => void
  onClose: () => void
}

/** a setting row: ticked = the style sets it, unticked = the text keeps the look it has */
function Setting({ label, on, onToggle, children }: { label: string; on: boolean; onToggle: (on: boolean) => void; children: ReactNode }) {
  return (
    <div className="table-dialog-row">
      <label className="dlg-check"><input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} />{label}</label>
      <div className={'character-style-setting' + (on ? '' : ' off')} aria-disabled={!on}>{children}</div>
    </div>
  )
}

function CharacterStyleDialog({ initial, onSave, onDelete, onClose }: DialogProps) {
  const [name, setName] = useState(initial.name)
  const [patch, setPatch] = useState<CharacterStyleSettings>(initial.patch)
  const catalog = useFontCatalog()
  const set = (next: CharacterStyleSettings) => setPatch((current) => ({ ...current, ...next }))
  const unset = (key: keyof CharacterStyleSettings) => setPatch((current) => {
    const next = { ...current }
    delete next[key]
    return next
  })
  const toggle = (key: keyof CharacterStyleSettings, value: CharacterStyleSettings[keyof CharacterStyleSettings]) => (on: boolean) => (on ? set({ [key]: value }) : unset(key))
  const cleanName = name.trim() || initial.name

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop">
      <div className="modal table-dialog wide" role="dialog" aria-modal="true" aria-label="אפשרויות סגנון תו" dir="rtl">
        <h2>{initial.id ? 'אפשרויות סגנון תו' : 'סגנון תו חדש'}</h2>
        <label className="field-label table-dialog-field">שם הסגנון
          <input className="select" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        </label>
        <p className="muted">מה שמסומן הוא מה שהסגנון קובע. מה שלא מסומן נשאר כפי שהוא בטקסט, כלומר כמו בסגנון הפסקה.</p>

        <Setting label="גופן" on={patch.fontFamily !== undefined} onToggle={toggle('fontFamily', catalog.families[0]?.family ?? 'Segoe UI')}>
          <FontPicker value={patch.fontFamily ?? ''} families={catalog.families} onChange={(fontFamily) => set({ fontFamily })} />
        </Setting>
        <Setting label="גודל" on={patch.fontSize !== undefined} onToggle={toggle('fontSize', 14)}>
          <input className="select table-dialog-number" type="number" min={1} max={999} step={0.5} value={patch.fontSize ?? 14} onChange={(e) => set({ fontSize: Math.min(999, Math.max(1, Number(e.target.value) || 1)) })} />
        </Setting>
        <Setting label="משקל" on={patch.weight !== undefined} onToggle={toggle('weight', 700)}>
          <select className="select" value={patch.weight ?? 400} onChange={(e) => set({ weight: Number(e.target.value) })}>
            {WEIGHTS.map((weight) => <option key={weight} value={weight}>{weightName(weight)}</option>)}
          </select>
        </Setting>
        <Setting label="נטוי" on={patch.italic !== undefined} onToggle={toggle('italic', true)}>
          <select className="select" value={patch.italic ? 'yes' : 'no'} onChange={(e) => set({ italic: e.target.value === 'yes' })}>
            <option value="yes">נטוי</option>
            <option value="no">לא נטוי</option>
          </select>
        </Setting>
        <Setting label="מרווח בין אותיות" on={patch.tracking !== undefined} onToggle={toggle('tracking', 0)}>
          <input className="select table-dialog-number" type="number" min={-1000} max={1000} step={5} value={patch.tracking ?? 0} onChange={(e) => set({ tracking: Math.min(1000, Math.max(-1000, Number(e.target.value) || 0)) })} />
        </Setting>
        <Setting label="הסטת קו בסיס (pt)" on={patch.baselineShift !== undefined} onToggle={toggle('baselineShift', 3)}>
          <input className="select table-dialog-number" type="number" min={-99} max={99} step={0.5} value={patch.baselineShift ?? 3} onChange={(e) => set({ baselineShift: Math.min(99, Math.max(-99, Number(e.target.value) || 0)) })} />
        </Setting>
        <Setting label="צבע" on={patch.color !== undefined} onToggle={toggle('color', '#000000')}>
          <input type="color" aria-label="צבע" value={patch.color ?? '#000000'} onChange={(e) => set({ color: e.target.value })} />
        </Setting>
        <Setting label="קו מתאר" on={patch.outlineWidth !== undefined} onToggle={(on) => (on ? set({ outlineWidth: 0.5, outlineColor: patch.outlineColor ?? '#000000' }) : (unset('outlineWidth'), unset('outlineColor')))}>
          <input type="color" aria-label="צבע קו המתאר" value={patch.outlineColor ?? '#000000'} onChange={(e) => set({ outlineColor: e.target.value })} />
          <input className="select table-dialog-number" type="number" min={0} max={100} step={0.25} aria-label="עובי קו המתאר" value={patch.outlineWidth ?? 0.5} onChange={(e) => set({ outlineWidth: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} />
        </Setting>

        <div className="modal-buttons">
          <button className="btn primary" onClick={() => onSave(cleanName, patch)}>אישור</button>
          <button className="btn" onClick={onClose}>ביטול</button>
          {onDelete && <button className="btn danger" onClick={onDelete}>מחיקת הסגנון</button>}
        </div>
      </div>
    </div>
  )
}
