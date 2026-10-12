import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { BLEND_MODES, type BlendMode, type LineArrow, type ObjectStyleRecord, type ObjectStyleSettings } from '../document'
import { LINE_ARROWS, LINE_PROFILES } from '../lineProfile'
import { ContextMenu } from './ContextMenu'

interface Props {
  styles: ObjectStyleRecord[]
  /** the selected pictures and shapes: how many, and the style they follow (null = none, undefined = they follow different ones) */
  selection: { count: number; styleId: string | null | undefined; modified: boolean }
  /** how many objects follow each style, by the style's id */
  usage: Record<string, number>
  /** gives the selected objects the style (null: they let go of theirs and keep the look they have) */
  onApply: (id: string | null) => void
  /** what the first selected object looks like, in the terms of a style; null when no picture or shape is selected */
  onSelectionLook: () => ObjectStyleSettings | null
  onCreate: (name: string, settings: ObjectStyleSettings, apply: boolean) => void
  onChange: (id: string, name: string, settings: ObjectStyleSettings) => void
  onDelete: (id: string) => void
  /** the style becomes what the first selected object looks like (the settings it already holds) */
  onRedefine: (id: string) => void
  /** selects every object that follows the style; how many there are comes back */
  onSelectObjects: (id: string) => number
}

const NAMES: Record<keyof ObjectStyleSettings, string> = {
  fill: 'מילוי',
  fillGradient: 'מעבר צבע',
  stroke: 'קו מתאר',
  strokeWidth: 'עובי קו',
  strokeDash: 'קו מקווקו',
  strokeCap: 'קצה הקו',
  radius: 'פינות מעוגלות',
  opacity: 'שקיפות',
  blendMode: 'מצב מיזוג',
  shadow: 'צללית',
  arrowStart: 'ראש חץ בהתחלה',
  arrowEnd: 'ראש חץ בסוף',
  lineWidths: 'עובי לאורך הקו',
}

/** how a style looks as a small box: its fill, its line, its corners, its shadow and its see-through */
export function objectStyleSwatch(settings: ObjectStyleSettings): CSSProperties {
  const gradient = settings.fillGradient
  const shadow = settings.shadow
  const lineOnly = settings.fill === undefined && settings.stroke === undefined && !gradient && settings.arrowEnd !== undefined
  return {
    background: gradient
      ? gradient.type === 'radial'
        ? `radial-gradient(${gradient.start}, ${gradient.end})`
        : `linear-gradient(${90 - (gradient.angle ?? 0)}deg, ${gradient.start}, ${gradient.end})`
      : settings.fill ?? (lineOnly ? 'transparent' : '#d9dde3'),
    border: settings.stroke ? `${Math.min(4, Math.max(1, (settings.strokeWidth ?? 1) / 2))}px ${settings.strokeDash === 'dashed' ? 'dashed' : 'solid'} ${settings.stroke}` : '1px solid transparent',
    borderRadius: settings.radius ? Math.min(14, settings.radius) : 2,
    opacity: settings.opacity ?? 1,
    boxShadow: shadow && shadow.opacity > 0 ? `${Math.max(-6, Math.min(6, shadow.offsetX))}px ${Math.max(-6, Math.min(6, shadow.offsetY))}px ${Math.max(1, 5 * (1 - shadow.opacity))}px ${shadow.color}` : undefined,
  }
}

type Editing = { id: string | null; name: string; settings: ObjectStyleSettings }

export function ObjectStylesPanel({ styles, selection, usage, onApply, onSelectionLook, onCreate, onChange, onDelete, onRedefine, onSelectObjects }: Props) {
  const [editing, setEditing] = useState<Editing | null>(null)
  const [query, setQuery] = useState('')
  const [focusId, setFocusId] = useState<string | null>(null)
  const [found, setFound] = useState<{ id: string; count: number } | null>(null)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const canApply = selection.count > 0
  const shown = useMemo(() => {
    const wanted = query.trim().toLowerCase()
    return wanted ? styles.filter((style) => style.name.toLowerCase().includes(wanted)) : styles
  }, [styles, query])
  const target = focusId && styles.some((style) => style.id === focusId) ? focusId : typeof selection.styleId === 'string' ? selection.styleId : null
  const targetStyle = target ? styles.find((style) => style.id === target) : undefined
  const newName = () => {
    for (let n = styles.length + 1; ; n++) {
      const name = `סגנון אובייקט ${n}`
      if (!styles.some((style) => style.name === name)) return name
    }
  }
  const fromSelection = () => {
    const look = onSelectionLook()
    setEditing({ id: null, name: newName(), settings: look ?? { fill: '#d9dde3', stroke: '#1f2937', strokeWidth: 1 } })
  }
  return (
    <section className="paragraph-styles-panel props-panel object-styles-panel" aria-label="סגנונות אובייקט" dir="rtl">
      <div className="styles-panel-head">
        <h2 className="props-title">סגנונות אובייקט</h2>
        <div className="character-style-head-actions">
          <button className="icon-button" aria-label="הגדר מחדש לפי האובייקט הנבחר" title="הגדר מחדש לפי האובייקט הנבחר&#10;בחרו סגנון ואובייקט שנראה כמו שרוצים. הסגנון וכל האובייקטים שבו יתעדכנו." disabled={!targetStyle || !canApply} onMouseDown={(event) => event.preventDefault()} onClick={() => targetStyle && onRedefine(targetStyle.id)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4.6 9a7.5 7.5 0 0 1 13-2L20 9M4 17v-5h5M19.4 15a7.5 7.5 0 0 1-13 2L4 15" /></svg>
          </button>
          <button className="icon-button" aria-label="סגנון אובייקט חדש" title="סגנון חדש מהאובייקט הנבחר&#10;בלי בחירה, נפתח סגנון חדש להגדרה." onMouseDown={(event) => event.preventDefault()} onClick={fromSelection}>+</button>
        </div>
      </div>
      <p className="muted">
        {canApply
          ? `נבחרו ${selection.count} ${selection.count === 1 ? 'אובייקט' : 'אובייקטים'}. לחיצה על סגנון נותנת אותו להם.`
          : 'בחרו צורה, קו או תמונה כדי לתת להם סגנון, או כדי ליצור ממנה סגנון חדש.'}
      </p>
      {styles.length > 6 && (
        <input className="select style-search" type="search" placeholder="חיפוש סגנון…" aria-label="חיפוש סגנון אובייקט" value={query} onChange={(event) => setQuery(event.target.value)} />
      )}
      <div className="paragraph-style-list object-style-list">
        <button
          className={'paragraph-style-row' + (selection.styleId === null && canApply ? ' active' : '')}
          disabled={!canApply}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onApply(null)}
          title="האובייקטים משתחררים מהסגנון ושומרים את המראה שיש להם"
        >
          <span className="style-sample">[ללא]</span>
        </button>
        {shown.map((style) => (
          <div
            key={style.id}
            className="character-style-row"
            onContextMenu={(event) => {
              event.preventDefault()
              setFocusId(style.id)
              setFound(null)
              setMenu({ id: style.id, x: event.clientX, y: event.clientY })
            }}
          >
            <button
              className={'paragraph-style-row' + (style.id === selection.styleId ? ' active' : '') + (style.id === target ? ' focused' : '')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setFocusId(style.id)
                setFound(null)
                if (canApply) onApply(style.id)
              }}
              onDoubleClick={() => setEditing({ id: style.id, name: style.name, settings: style.settings })}
            >
              <span className="object-style-swatch" style={objectStyleSwatch(style.settings)} aria-hidden="true" />
              <span className="style-sample">
                {style.name}
                {style.id === selection.styleId && selection.modified && <span className="style-modified" title="באובייקט יש שינויים ידניים מעל הסגנון. לחיצה על הסגנון מחילה אותו מחדש."> +</span>}
              </span>
              <span className="object-style-count" title="כמה אובייקטים במסמך עם הסגנון">{usage[style.id] ?? 0}</span>
            </button>
            <button className="icon-button" aria-label={`עריכת ${style.name}`} title="עריכת הסגנון" onMouseDown={(event) => event.preventDefault()} onClick={() => setEditing({ id: style.id, name: style.name, settings: style.settings })}>✎</button>
          </div>
        ))}
        {shown.length === 0 && styles.length > 0 && <span className="muted">אין סגנון בשם הזה.</span>}
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'עריכת הסגנון…', onClick: () => { const style = styles.find((s) => s.id === menu.id); if (style) setEditing({ id: style.id, name: style.name, settings: style.settings }) } },
            { label: 'בחר את כל האובייקטים בסגנון', onClick: () => setFound({ id: menu.id, count: onSelectObjects(menu.id) }) },
            { separator: true },
            { label: 'מחק את הסגנון', onClick: () => onDelete(menu.id) },
          ]}
        />
      )}
      <div className="character-style-find" aria-label="אובייקטים בסגנון">
        <span className="muted">{targetStyle ? `„${targetStyle.name}”: ${usage[targetStyle.id] ?? 0} אובייקטים` : 'בחרו סגנון כדי לראות אילו אובייקטים משתמשים בו'}</span>
        <div className="character-style-find-buttons">
          <button className="btn" disabled={!targetStyle || !(usage[targetStyle.id] ?? 0)} onMouseDown={(event) => event.preventDefault()} onClick={() => targetStyle && setFound({ id: targetStyle.id, count: onSelectObjects(targetStyle.id) })}>בחר אותם</button>
        </div>
        {found && found.id === target && <span className="muted">{found.count === 0 ? 'אין אובייקטים' : `נבחרו ${found.count}`}</span>}
      </div>
      {editing && (
        <ObjectStyleDialog
          initial={editing}
          onSave={(name, settings) => {
            if (editing.id) onChange(editing.id, name, settings)
            else onCreate(name, settings, canApply)
            setEditing(null)
          }}
          onDelete={editing.id ? () => { onDelete(editing.id!); setEditing(null) } : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  )
}

/** a setting row: ticked = the style sets it, unticked = the object keeps the look it has */
function Setting({ label, on, onToggle, children }: { label: string; on: boolean; onToggle: (on: boolean) => void; children: ReactNode }) {
  return (
    <div className="table-dialog-row">
      <label className="dlg-check"><input type="checkbox" checked={on} onChange={(event) => onToggle(event.target.checked)} />{label}</label>
      <div className={'character-style-setting' + (on ? '' : ' off')} aria-disabled={!on}>{children}</div>
    </div>
  )
}

const pct = (value: number) => Math.round(value * 100)

function ObjectStyleDialog({ initial, onSave, onDelete, onClose }: { initial: Editing; onSave: (name: string, settings: ObjectStyleSettings) => void; onDelete?: () => void; onClose: () => void }) {
  const [name, setName] = useState(initial.name)
  const [settings, setSettings] = useState<ObjectStyleSettings>(initial.settings)
  const set = (next: ObjectStyleSettings) => setSettings((current) => ({ ...current, ...next }))
  const has = (key: keyof ObjectStyleSettings) => key in settings
  const unset = (key: keyof ObjectStyleSettings) => setSettings((current) => {
    const next = { ...current }
    delete next[key]
    return next
  })
  const toggle = <K extends keyof ObjectStyleSettings>(key: K, value: ObjectStyleSettings[K]) => (on: boolean) => (on ? set({ [key]: value }) : unset(key))
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const shadow = settings.shadow
  const profileId = settings.lineWidths ? LINE_PROFILES.find((profile) => profile.widths.every((value, index) => Math.abs(value - settings.lineWidths![index]) < 0.005))?.id ?? '' : 'even'
  const colorCell = (key: 'fill' | 'stroke', fallback: string) => {
    const value = settings[key]
    return (
      <>
        <input type="color" aria-label={NAMES[key]} value={value ?? fallback} disabled={value === null} onChange={(event) => set({ [key]: event.target.value })} />
        <label className="dlg-check"><input type="checkbox" checked={value === null} onChange={(event) => set({ [key]: event.target.checked ? null : fallback })} />ללא</label>
      </>
    )
  }
  const arrowSelect = (key: 'arrowStart' | 'arrowEnd') => (
    <select className="select" aria-label={NAMES[key]} value={settings[key] ?? ''} onChange={(event) => set({ [key]: (event.target.value || null) as LineArrow | null })}>
      <option value="">ללא</option>
      {LINE_ARROWS.map((arrow) => <option key={arrow.id} value={arrow.id}>{arrow.label}</option>)}
    </select>
  )

  return (
    <div className="modal-backdrop">
      <div className="modal table-dialog wide" role="dialog" aria-modal="true" aria-label="אפשרויות סגנון אובייקט" dir="rtl">
        <h2>{initial.id ? 'אפשרויות סגנון אובייקט' : 'סגנון אובייקט חדש'}</h2>
        <div className="object-style-preview" aria-hidden="true"><span style={{ ...objectStyleSwatch(settings), width: 120, height: 54, display: 'block' }} /></div>
        <label className="field-label table-dialog-field">שם הסגנון
          <input className="select" value={name} autoFocus onChange={(event) => setName(event.target.value)} />
        </label>
        <p className="muted">מה שמסומן הוא מה שהסגנון קובע, ושינוי בו מגיע לכל האובייקטים שבו. מה שלא מסומן נשאר באובייקט כפי שהוא.</p>
        <fieldset className="object-style-group"><legend>מילוי וקו</legend>
          <Setting label={NAMES.fill} on={has('fill')} onToggle={toggle('fill', '#d9dde3')}>{colorCell('fill', '#d9dde3')}</Setting>
          <Setting label={NAMES.stroke} on={has('stroke')} onToggle={toggle('stroke', '#1f2937')}>{colorCell('stroke', '#1f2937')}</Setting>
          <Setting label={`${NAMES.strokeWidth} (pt)`} on={has('strokeWidth')} onToggle={toggle('strokeWidth', 1)}>
            <input className="select table-dialog-number" type="number" min={0} max={200} step={0.25} value={settings.strokeWidth ?? 1} onChange={(event) => set({ strokeWidth: Math.max(0, Number(event.target.value) || 0) })} />
          </Setting>
          <Setting label={NAMES.strokeDash} on={has('strokeDash')} onToggle={toggle('strokeDash', 'solid')}>
            <select className="select" aria-label={NAMES.strokeDash} value={settings.strokeDash ?? 'solid'} onChange={(event) => set({ strokeDash: event.target.value === 'dashed' ? 'dashed' : 'solid' })}>
              <option value="solid">רציף</option>
              <option value="dashed">מקווקו</option>
            </select>
          </Setting>
          <Setting label={`${NAMES.radius} (pt)`} on={has('radius')} onToggle={toggle('radius', 6)}>
            <input className="select table-dialog-number" type="number" min={0} max={500} step={1} value={settings.radius ?? 0} onChange={(event) => set({ radius: Math.max(0, Number(event.target.value) || 0) })} />
          </Setting>
        </fieldset>
        <fieldset className="object-style-group"><legend>שקיפות וצללית</legend>
          <Setting label={`${NAMES.opacity} (%)`} on={has('opacity')} onToggle={toggle('opacity', 1)}>
            <input type="range" min={0} max={100} value={pct(settings.opacity ?? 1)} aria-label={NAMES.opacity} onChange={(event) => set({ opacity: Number(event.target.value) / 100 })} />
            <span className="muted">{pct(settings.opacity ?? 1)}%</span>
          </Setting>
          <Setting label={NAMES.blendMode} on={has('blendMode')} onToggle={toggle('blendMode', null)}>
            <select className="select" aria-label={NAMES.blendMode} value={settings.blendMode ?? ''} onChange={(event) => set({ blendMode: (event.target.value || null) as BlendMode | null })}>
              <option value="">רגיל</option>
              {BLEND_MODES.map((mode) => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
            </select>
          </Setting>
          <Setting label={NAMES.shadow} on={has('shadow')} onToggle={toggle('shadow', null)}>
            <label className="dlg-check"><input type="checkbox" checked={!!shadow} onChange={(event) => set({ shadow: event.target.checked ? { offsetX: 0, offsetY: 6, color: '#000000', opacity: 0.4 } : null })} />יש צללית</label>
            {shadow && (
              <div className="object-style-shadow">
                <label>אופקי <input className="select table-dialog-number" type="number" step={1} value={shadow.offsetX} onChange={(event) => set({ shadow: { ...shadow, offsetX: Number(event.target.value) || 0 } })} /></label>
                <label>אנכי <input className="select table-dialog-number" type="number" step={1} value={shadow.offsetY} onChange={(event) => set({ shadow: { ...shadow, offsetY: Number(event.target.value) || 0 } })} /></label>
                <input type="color" aria-label="צבע הצללית" value={shadow.color} onChange={(event) => set({ shadow: { ...shadow, color: event.target.value } })} />
                <label>עוצמה <input type="range" min={5} max={100} value={pct(shadow.opacity)} onChange={(event) => set({ shadow: { ...shadow, opacity: Number(event.target.value) / 100 } })} /></label>
              </div>
            )}
          </Setting>
        </fieldset>
        <fieldset className="object-style-group"><legend>קווים</legend>
          <Setting label={NAMES.arrowStart} on={has('arrowStart')} onToggle={toggle('arrowStart', null)}>{arrowSelect('arrowStart')}</Setting>
          <Setting label={NAMES.arrowEnd} on={has('arrowEnd')} onToggle={toggle('arrowEnd', null)}>{arrowSelect('arrowEnd')}</Setting>
          <Setting label={NAMES.lineWidths} on={has('lineWidths')} onToggle={toggle('lineWidths', null)}>
            <select className="select" aria-label={NAMES.lineWidths} value={profileId} onChange={(event) => {
              const profile = LINE_PROFILES.find((candidate) => candidate.id === event.target.value)
              set({ lineWidths: profile && profile.id !== 'even' ? profile.widths : null })
            }}>
              {LINE_PROFILES.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
            </select>
          </Setting>
        </fieldset>
        <div className="modal-buttons">
          <button className="btn primary" onClick={() => onSave(name.trim() || initial.name, settings)}>אישור</button>
          <button className="btn" onClick={onClose}>ביטול</button>
          {onDelete && <button className="btn danger" onClick={onDelete}>מחיקת הסגנון</button>}
        </div>
      </div>
    </div>
  )
}
