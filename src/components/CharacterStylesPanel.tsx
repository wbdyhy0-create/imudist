import { useEffect, useState, type ReactNode } from 'react'
import { canBeBasedOn, resolveCharacterPatch } from '../characterStyleTree'
import type { CharacterStyleRecord, CharacterStyleSettings } from '../document'
import { useFontCatalog, weightName } from '../fonts'
import { ContextMenu } from './ContextMenu'
import { FontPicker } from './FontPicker'

interface Props {
  styles: CharacterStyleRecord[]
  /** the character style of the selected text: undefined = no text to give one to, null = it has none */
  activeId: string | null | undefined
  /** the selected text has changes of its own on top of that style */
  modified?: boolean
  /** a text (or a note's text) is selected, so a style can be applied */
  canApply: boolean
  onApply: (id: string | null) => void
  /** what the selected text looks like beyond its paragraph's own look: the start of a style made from it */
  onSelectionLook: () => CharacterStyleSettings
  /** makes the style, and gives it to the selected text when `apply` */
  onCreate: (name: string, patch: CharacterStyleSettings, apply: boolean, basedOnId?: string) => void
  onChange: (id: string, name: string, patch: CharacterStyleSettings, basedOnId?: string) => void
  onDelete: (id: string) => void
  /** the style becomes what the selected text looks like */
  onRedefine: (id: string) => void
  /** selects the next / previous (direction 0: the first) piece of text that has the style; how many there are comes back */
  onFind: (id: string, direction: -1 | 0 | 1) => number
}

const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900]

const SETTING_NAMES: Record<keyof CharacterStyleSettings, string> = {
  fontFamily: 'גופן',
  fontSize: 'גודל',
  weight: 'משקל',
  italic: 'נטוי',
  tracking: 'מרווח בין אותיות',
  baselineShift: 'קו בסיס',
  color: 'צבע',
  outlineColor: 'קו מתאר',
  outlineWidth: 'קו מתאר',
}

/** how a style looks as a line of text: its own font, weight; always in the panel's own text colour so dark colours stay readable */
const sampleCss = (patch: CharacterStyleSettings) => ({
  ...(patch.fontFamily ? { fontFamily: `"${patch.fontFamily}", "Segoe UI", Arial, sans-serif` } : {}),
  ...(patch.weight ? { fontWeight: patch.weight } : {}),
  ...(patch.italic !== undefined ? { fontStyle: patch.italic ? 'italic' : 'normal' } : {}),
})

type Editing = { id: string | null; name: string; patch: CharacterStyleSettings; basedOnId?: string }

export function CharacterStylesPanel({ styles, activeId, modified, canApply, onApply, onSelectionLook, onCreate, onChange, onDelete, onRedefine, onFind }: Props) {
  const [editing, setEditing] = useState<Editing | null>(null)
  // the style the search buttons are about: the one last clicked, else the one the selected text has
  const [focusId, setFocusId] = useState<string | null>(null)
  const [found, setFound] = useState<{ id: string; count: number } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ styleId: string; x: number; y: number } | null>(null)
  const target = focusId && styles.some((style) => style.id === focusId) ? focusId : activeId ?? null
  const targetStyle = target ? styles.find((style) => style.id === target) : undefined
  const newName = () => {
    for (let n = styles.length + 1; ; n++) {
      const name = `סגנון תו ${n}`
      if (!styles.some((style) => style.name === name)) return name
    }
  }
  const edit = (style: CharacterStyleRecord) => setEditing({ id: style.id, name: style.name, patch: style.patch, basedOnId: style.basedOnId })
  const search = (direction: -1 | 0 | 1) => {
    if (!target) return
    setFound({ id: target, count: onFind(target, direction) })
  }
  return (
    <section className="paragraph-styles-panel props-panel character-styles-panel" aria-label="סגנונות תו">
      <div className="styles-panel-head">
        <h2 className="props-title">סגנונות תו</h2>
        <div className="character-style-head-actions">
          <span title="סגנון חדש מהבחירה&#10;סמנו טקסט ולחצו כאן כדי ליצור סגנון לפי העיצוב של תחילת הבחירה ולהחיל אותו עליה.">
            <button className="icon-button" aria-label="סגנון חדש מהבחירה" aria-description="סמנו טקסט כדי ליצור סגנון מהעיצוב שלו ולהחיל את הסגנון על הבחירה." onMouseDown={(event) => event.preventDefault()} onClick={() => setEditing({ id: null, name: newName(), patch: onSelectionLook() })} disabled={!canApply}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 3.75h9l4 4V12M14 4v4h4M8 12.5h5M8 16h4" />
                <path d="M18 14.5v7M14.5 18h7" />
              </svg>
            </button>
          </span>
          <span title="הגדר מחדש לפי הבחירה&#10;בחרו סגנון וסמנו טקסט המעוצב כרצונכם. הסגנון וכל הטקסט שמשתמש בו יעודכנו לפי הבחירה.">
            <button className="icon-button" aria-label="הגדר מחדש לפי הבחירה" aria-description="עדכנו את הסגנון הנבחר לפי מראה הטקסט המסומן; כל המופעים שלו יתעדכנו." onMouseDown={(event) => event.preventDefault()} onClick={() => activeId && onRedefine(activeId)} disabled={!canApply || !activeId}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 7v5h-5M4.6 9a7.5 7.5 0 0 1 13-2L20 9M4 17v-5h5M19.4 15a7.5 7.5 0 0 1-13 2L4 15" />
              </svg>
            </button>
          </span>
          <span title="סגנון תו חדש&#10;יוצר סגנון ריק. בחלון שנפתח אפשר לתת לו שם ולבחור אילו מאפייני עיצוב לשמור.">
            <button className="icon-button" aria-label="סגנון תו חדש" aria-description="יוצר סגנון ריק שאפשר לתת לו שם ולהגדיר את מאפייני העיצוב שלו." onMouseDown={(event) => event.preventDefault()} onClick={() => setEditing({ id: null, name: newName(), patch: {} })}>
              +
            </button>
          </span>
        </div>
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
          <div
            key={style.id}
            className="character-style-row"
            onContextMenu={(event) => {
              event.preventDefault()
              setFocusId(style.id)
              setFound(null)
              setContextMenu({ styleId: style.id, x: event.clientX, y: event.clientY })
            }}
          >
            <button
              className={'paragraph-style-row' + (style.id === activeId ? ' active' : '') + (style.id === target ? ' focused' : '')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setFocusId(style.id)
                setFound(null)
                if (canApply) onApply(style.id)
              }}
              onDoubleClick={() => edit(style)}
              title={style.basedOnId ? `מבוסס על ${styles.find((s) => s.id === style.basedOnId)?.name ?? ''}` : undefined}
            >
              <span className="style-sample" style={sampleCss(resolveCharacterPatch(styles, style.id))}>
                {style.name}
                {style.id === activeId && modified && <span className="style-modified" title="בטקסט יש שינויים ידניים מעל הסגנון. לחיצה על הסגנון מחילה אותו מחדש.">+</span>}
              </span>
            </button>
            <button className="icon-button" aria-label={`עריכת ${style.name}`} title="עריכת הסגנון" onMouseDown={(event) => event.preventDefault()} onClick={() => edit(style)}>✎</button>
          </div>
        ))}
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[{ label: 'מחק את סגנון התו הנבחר', onClick: () => onDelete(contextMenu.styleId) }]}
        />
      )}
      <div className="character-style-find" aria-label="חיפוש מופעים של הסגנון">
        <span className="muted">{targetStyle ? `מופעים של "${targetStyle.name}"` : 'בחר סגנון כדי לחפש את מופעיו'}</span>
        <div className="character-style-find-buttons">
          <button className="btn" disabled={!targetStyle} onMouseDown={(event) => event.preventDefault()} onClick={() => search(1)} title="המופע הבא">◀</button>
          <button className="btn" disabled={!targetStyle} onMouseDown={(event) => event.preventDefault()} onClick={() => search(-1)} title="המופע הקודם">▶</button>
        </div>
        {found && found.id === target && <span className="muted">{found.count === 0 ? 'אין מופעים' : `${found.count} מופעים`}</span>}
      </div>
      {editing && (
        <CharacterStyleDialog
          styles={styles}
          initial={editing}
          onSave={(name, patch, basedOnId) => {
            if (editing.id) onChange(editing.id, name, patch, basedOnId)
            else onCreate(name, patch, canApply, basedOnId)
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
  styles: CharacterStyleRecord[]
  initial: Editing
  onSave: (name: string, patch: CharacterStyleSettings, basedOnId?: string) => void
  onDelete?: () => void
  onClose: () => void
}

/** a setting row: ticked = the style sets it, unticked = the text keeps the look it has (or the base style's) */
function Setting({ label, on, inherited, onToggle, children }: { label: string; on: boolean; inherited?: boolean; onToggle: (on: boolean) => void; children: ReactNode }) {
  return (
    <div className="table-dialog-row">
      <label className="dlg-check"><input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} />{label}{!on && inherited && <span className="muted"> (יורש)</span>}</label>
      <div className={'character-style-setting' + (on ? '' : ' off')} aria-disabled={!on}>{children}</div>
    </div>
  )
}

function CharacterStyleDialog({ styles, initial, onSave, onDelete, onClose }: DialogProps) {
  const [name, setName] = useState(initial.name)
  const [patch, setPatch] = useState<CharacterStyleSettings>(initial.patch)
  const [basedOnId, setBasedOnId] = useState<string | undefined>(initial.basedOnId)
  const catalog = useFontCatalog()
  const set = (next: CharacterStyleSettings) => setPatch((current) => ({ ...current, ...next }))
  const unset = (key: keyof CharacterStyleSettings) => setPatch((current) => {
    const next = { ...current }
    delete next[key]
    return next
  })
  const toggle = (key: keyof CharacterStyleSettings, value: CharacterStyleSettings[keyof CharacterStyleSettings]) => (on: boolean) => (on ? set({ [key]: value }) : unset(key))
  const cleanName = name.trim() || initial.name
  // what the base gives: shown beside the settings this style does not set itself
  const inherited = basedOnId ? resolveCharacterPatch(styles, basedOnId) : {}
  const has = (key: keyof CharacterStyleSettings) => inherited[key] !== undefined
  const inheritedNames = [...new Set((Object.keys(inherited) as (keyof CharacterStyleSettings)[]).filter((key) => patch[key] === undefined).map((key) => SETTING_NAMES[key]))]
  const candidates = styles.filter((style) => style.id !== initial.id && (!initial.id || canBeBasedOn(styles, initial.id, style.id)))
  const shown = <K extends keyof CharacterStyleSettings>(key: K, fallback: NonNullable<CharacterStyleSettings[K]>): NonNullable<CharacterStyleSettings[K]> => (patch[key] ?? inherited[key] ?? fallback) as NonNullable<CharacterStyleSettings[K]>

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
        <label className="field-label table-dialog-field">מבוסס על
          <select className="select" value={basedOnId ?? ''} onChange={(e) => setBasedOnId(e.target.value || undefined)}>
            <option value="">[ללא]</option>
            {candidates.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}
          </select>
        </label>
        <p className="muted">
          מה שמסומן הוא מה שהסגנון קובע. מה שלא מסומן נשאר כפי שהוא בטקסט, כלומר כמו בסגנון הפסקה
          {basedOnId && inheritedNames.length > 0 ? `, חוץ ממה שהסגנון שהוא מבוסס עליו קובע: ${inheritedNames.join(', ')}.` : '.'}
        </p>

        <Setting label="גופן" on={patch.fontFamily !== undefined} inherited={has('fontFamily')} onToggle={toggle('fontFamily', inherited.fontFamily ?? catalog.families[0]?.family ?? 'Segoe UI')}>
          <FontPicker value={shown('fontFamily', '')} families={catalog.families} onChange={(fontFamily) => set({ fontFamily })} />
        </Setting>
        <Setting label="גודל" on={patch.fontSize !== undefined} inherited={has('fontSize')} onToggle={toggle('fontSize', inherited.fontSize ?? 14)}>
          <input className="select table-dialog-number" type="number" min={1} max={999} step={0.5} value={shown('fontSize', 14)} onChange={(e) => set({ fontSize: Math.min(999, Math.max(1, Number(e.target.value) || 1)) })} />
        </Setting>
        <Setting label="משקל" on={patch.weight !== undefined} inherited={has('weight')} onToggle={toggle('weight', inherited.weight ?? 700)}>
          <select className="select" value={patch.weight === undefined ? '' : String(patch.weight)} onChange={(e) => (e.target.value === '' ? unset('weight') : set({ weight: Number(e.target.value) }))}>
            {patch.weight === undefined && <option value="">{inherited.weight !== undefined ? `יורש: ${weightName(inherited.weight)}` : 'לא מוגדר (הטקסט נשאר כמו שהוא)'}</option>}
            {WEIGHTS.map((weight) => <option key={weight} value={weight}>{weightName(weight)}</option>)}
          </select>
        </Setting>
        <Setting label="נטוי" on={patch.italic !== undefined} inherited={has('italic')} onToggle={toggle('italic', inherited.italic ?? true)}>
          <select className="select" value={patch.italic === undefined ? '' : patch.italic ? 'yes' : 'no'} onChange={(e) => (e.target.value === '' ? unset('italic') : set({ italic: e.target.value === 'yes' }))}>
            {patch.italic === undefined && <option value="">{inherited.italic !== undefined ? `יורש: ${inherited.italic ? 'נטוי' : 'לא נטוי'}` : 'לא מוגדר (הטקסט נשאר כמו שהוא)'}</option>}
            <option value="yes">נטוי</option>
            <option value="no">לא נטוי</option>
          </select>
        </Setting>
        <Setting label="מרווח בין אותיות (% מגודל הגופן)" on={patch.tracking !== undefined} inherited={has('tracking')} onToggle={toggle('tracking', inherited.tracking ?? 0)}>
          <input className="select table-dialog-number" type="number" min={-100} max={100} step={1} value={shown('tracking', 0) / 10} onChange={(e) => set({ tracking: Math.min(1000, Math.max(-1000, Math.round((Number(e.target.value) || 0) * 10))) })} />
        </Setting>
        <Setting label="הסטת קו בסיס (pt)" on={patch.baselineShift !== undefined} inherited={has('baselineShift')} onToggle={toggle('baselineShift', inherited.baselineShift ?? 3)}>
          <input className="select table-dialog-number" type="number" min={-99} max={99} step={0.5} value={shown('baselineShift', 3)} onChange={(e) => set({ baselineShift: Math.min(99, Math.max(-99, Number(e.target.value) || 0)) })} />
        </Setting>
        <Setting label="צבע" on={patch.color !== undefined} inherited={has('color')} onToggle={toggle('color', inherited.color ?? '#000000')}>
          <input type="color" aria-label="צבע" value={shown('color', '#000000')} onChange={(e) => set({ color: e.target.value })} />
        </Setting>
        <Setting label="קו מתאר" on={patch.outlineWidth !== undefined} inherited={has('outlineWidth')} onToggle={(on) => (on ? set({ outlineWidth: inherited.outlineWidth ?? 0.5, outlineColor: patch.outlineColor ?? inherited.outlineColor ?? '#000000' }) : (unset('outlineWidth'), unset('outlineColor')))}>
          <input type="color" aria-label="צבע קו המתאר" value={shown('outlineColor', '#000000')} onChange={(e) => set({ outlineColor: e.target.value })} />
          <input className="select table-dialog-number" type="number" min={0} max={100} step={0.25} aria-label="עובי קו המתאר" value={shown('outlineWidth', 0.5)} onChange={(e) => set({ outlineWidth: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} />
        </Setting>

        <div className="modal-buttons">
          <button className="btn primary" onClick={() => onSave(cleanName, patch, basedOnId)}>אישור</button>
          <button className="btn" onClick={onClose}>ביטול</button>
          {onDelete && <button className="btn danger" onClick={onDelete}>מחיקת הסגנון</button>}
        </div>
      </div>
    </div>
  )
}
