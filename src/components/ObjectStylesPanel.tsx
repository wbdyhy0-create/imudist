import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { BLEND_MODES, type BlendMode, type Feather, type LineArrow, type ObjectStyleGraphic, type ObjectStyleRecord, type ObjectStyleSettings } from '../document'
import { LINE_ARROWS, LINE_PROFILES } from '../lineProfile'
import { objectStyleVisible } from '../objectStyles'
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
  /** what the first object that follows the style looks like now (null: none does) */
  onFollowerLook: (id: string) => ObjectStyleSettings | null
  /** the drawing of the selected objects (an ornament, a picture, several shapes), for a decoration; missing for one line, one plain rectangle or nothing */
  onSelectionGraphic: () => Promise<ObjectStyleGraphic | undefined>
  onCreate: (name: string, settings: ObjectStyleSettings, apply: boolean, graphic?: ObjectStyleGraphic) => void
  onChange: (id: string, name: string, settings: ObjectStyleSettings, graphic?: ObjectStyleGraphic) => void
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
  feather: 'דהייה וקצוות רכים',
  arrowStart: 'ראש חץ בהתחלה',
  arrowEnd: 'ראש חץ בסוף',
  lineWidths: 'עובי לאורך הקו',
}

/** how a style looks as a small box: its fill, its line, its corners, its shadow and its see-through */
export function objectStyleSwatch(settings: ObjectStyleSettings, graphic?: ObjectStyleGraphic): CSSProperties {
  if (graphic) {
    return { background: `url("data:image/svg+xml,${encodeURIComponent(graphic.svg)}") center / contain no-repeat`, border: '1px solid transparent', opacity: settings.opacity ?? 1 }
  }
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

type Editing = { id: string | null; name: string; settings: ObjectStyleSettings; graphic?: ObjectStyleGraphic }

export function ObjectStylesPanel({ styles, selection, usage, onApply, onSelectionLook, onFollowerLook, onSelectionGraphic, onCreate, onChange, onDelete, onRedefine, onSelectObjects }: Props) {
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
  const fromSelection = async () => {
    const look = onSelectionLook()
    const graphic = look ? await onSelectionGraphic() : undefined
    setEditing({ id: null, name: newName(), settings: look ?? { fill: '#d9dde3', stroke: '#1f2937', strokeWidth: 1 }, graphic })
  }
  return (
    <section className="paragraph-styles-panel props-panel object-styles-panel" aria-label="סגנונות אובייקט" dir="rtl">
      <div className="styles-panel-head">
        <h2 className="props-title">סגנונות אובייקט</h2>
        <div className="character-style-head-actions">
          <button className="icon-button" aria-label="הגדר מחדש לפי האובייקט הנבחר" title="הגדר מחדש לפי האובייקט הנבחר&#10;בחרו סגנון ואובייקט שנראה כמו שרוצים. הסגנון וכל האובייקטים שבו יתעדכנו." disabled={!targetStyle || !canApply} onMouseDown={(event) => event.preventDefault()} onClick={() => targetStyle && onRedefine(targetStyle.id)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4.6 9a7.5 7.5 0 0 1 13-2L20 9M4 17v-5h5M19.4 15a7.5 7.5 0 0 1-13 2L4 15" /></svg>
          </button>
          <button className="icon-button" aria-label="סגנון אובייקט חדש" title="סגנון חדש מהאובייקט הנבחר&#10;בלי בחירה, נפתח סגנון חדש להגדרה." onMouseDown={(event) => event.preventDefault()} onClick={() => void fromSelection()}>+</button>
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
              onDoubleClick={() => setEditing({ id: style.id, name: style.name, settings: style.settings, graphic: style.graphic })}
            >
              <span className="object-style-swatch" style={objectStyleSwatch(style.settings, style.graphic)} aria-hidden="true" />
              <span className="style-sample">
                {style.name}
                {style.id === selection.styleId && selection.modified && <span className="style-modified" title="באובייקט יש שינויים ידניים מעל הסגנון. לחיצה על הסגנון מחילה אותו מחדש."> +</span>}
              </span>
              {!objectStyleVisible(style) && <span className="object-style-empty" title="בסגנון אין מילוי, קו או ציור, ולכן כעיטור הוא לא מצייר כלום. אפשר להגדיר אותו מחדש לפי אובייקט.">ריק</span>}
              <span className="object-style-count" title="כמה אובייקטים במסמך עם הסגנון">{usage[style.id] ?? 0}</span>
            </button>
            <button className="icon-button" aria-label={`עריכת ${style.name}`} title="עריכת הסגנון" onMouseDown={(event) => event.preventDefault()} onClick={() => setEditing({ id: style.id, name: style.name, settings: style.settings, graphic: style.graphic })}>✎</button>
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
            { label: 'עריכת הסגנון…', onClick: () => { const style = styles.find((s) => s.id === menu.id); if (style) setEditing({ id: style.id, name: style.name, settings: style.settings, graphic: style.graphic }) } },
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
          reference={editing.id ? onFollowerLook(editing.id) ?? (canApply ? onSelectionLook() : null) : onSelectionLook()}
          onApply={editing.id ? (name, settings, graphic) => onChange(editing.id!, name, settings, graphic) : undefined}
          onSave={(name, settings, graphic) => {
            if (editing.id) onChange(editing.id, name, settings, graphic)
            else onCreate(name, settings, canApply, graphic)
            setEditing(null)
          }}
          onDelete={editing.id ? () => { onDelete(editing.id!); setEditing(null) } : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  )
}

/**
 * A setting row: ticked = the style sets it, unticked = the object keeps the look it has. Touching what is in an unticked row ticks it:
 * a control that does nothing when it is pressed looks like a dialog that is not connected to the object.
 */
function Setting({ label, on, onToggle, children }: { label: string; on: boolean; onToggle: (on: boolean) => void; children: ReactNode }) {
  return (
    <div className="table-dialog-row">
      <label className="dlg-check"><input type="checkbox" checked={on} onChange={(event) => onToggle(event.target.checked)} />{label}</label>
      <div className={'character-style-setting object-style-setting' + (on ? '' : ' off')} onPointerDownCapture={() => { if (!on) onToggle(true) }} onKeyDownCapture={() => { if (!on) onToggle(true) }}>
        {children}
      </div>
    </div>
  )
}

const pct = (value: number) => Math.round(value * 100)

/** what a feather is, in a few words (it is set on the object with the feather tools; the style holds it as it is) */
const featherText = (feather: Feather | null): string =>
  !feather ? 'ללא' : feather.type === 'basic' ? `קצוות רכים, ${Math.round(feather.radius * 10) / 10} pt מכל צד` : feather.type === 'directional' ? 'קצוות רכים, לפי צד' : 'דהייה (שקיפות מדורגת) לאורך האובייקט'

interface DialogProps {
  initial: Editing
  /** what an object that follows the style (or the selected one, for a new style) looks like now: the values the unticked rows show */
  reference: ObjectStyleSettings | null
  onSave: (name: string, settings: ObjectStyleSettings, graphic?: ObjectStyleGraphic) => void
  /** gives the objects the settings as they are, and keeps the dialog open (only a style that exists) */
  onApply?: (name: string, settings: ObjectStyleSettings, graphic?: ObjectStyleGraphic) => void
  onDelete?: () => void
  onClose: () => void
}

function ObjectStyleDialog({ initial, reference, onSave, onApply, onDelete, onClose }: DialogProps) {
  const [name, setName] = useState(initial.name)
  const [keepGraphic, setKeepGraphic] = useState(true)
  const graphic = keepGraphic ? initial.graphic : undefined
  const [settings, setSettings] = useState<ObjectStyleSettings>(initial.settings)
  const [applied, setApplied] = useState(false)
  const set = (next: ObjectStyleSettings) => {
    setApplied(false)
    setSettings((current) => ({ ...current, ...next }))
  }
  const has = (key: keyof ObjectStyleSettings) => key in settings
  const unset = (key: keyof ObjectStyleSettings) => {
    setApplied(false)
    setSettings((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }
  /** the value a setting shows: the style's own, else what the object has now, else a plain value */
  const shown = <K extends keyof ObjectStyleSettings>(key: K, fallback: NonNullable<ObjectStyleSettings[K]> | null): ObjectStyleSettings[K] =>
    (key in settings ? settings[key] : reference && key in reference ? reference[key] : fallback) as ObjectStyleSettings[K]
  const toggle = <K extends keyof ObjectStyleSettings>(key: K, fallback: NonNullable<ObjectStyleSettings[K]> | null) => (on: boolean) =>
    (on ? set({ [key]: shown(key, fallback) } as ObjectStyleSettings) : unset(key))
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const fill = shown('fill', '#d9dde3')
  const stroke = shown('stroke', '#1f2937')
  const strokeWidth = shown('strokeWidth', 1) ?? 1
  const radius = shown('radius', 0) ?? 0
  const opacity = shown('opacity', 1) ?? 1
  const shadow = shown('shadow', null) ?? null
  const lineWidths = shown('lineWidths', null)
  const profileId = lineWidths ? LINE_PROFILES.find((profile) => profile.widths.every((value, index) => Math.abs(value - lineWidths[index]) < 0.005))?.id ?? '' : 'even'
  const colorCell = (key: 'fill' | 'stroke', value: string | null | undefined, fallback: string) => (
    <>
      <input type="color" aria-label={NAMES[key]} value={value ?? fallback} disabled={value === null} onChange={(event) => set({ [key]: event.target.value })} />
      <label className="dlg-check"><input type="checkbox" checked={value === null} onChange={(event) => set({ [key]: event.target.checked ? null : fallback })} />ללא</label>
    </>
  )
  const arrowSelect = (key: 'arrowStart' | 'arrowEnd') => (
    <select className="select" aria-label={NAMES[key]} value={shown(key, null) ?? ''} onChange={(event) => set({ [key]: (event.target.value || null) as LineArrow | null })}>
      <option value="">ללא</option>
      {LINE_ARROWS.map((arrow) => <option key={arrow.id} value={arrow.id}>{arrow.label}</option>)}
    </select>
  )
  const settingsNow = () => ({ ...settings })

  return (
    <div className="modal-backdrop object-style-floating">
      <div className="modal table-dialog wide" role="dialog" aria-modal="false" aria-label="אפשרויות סגנון אובייקט" dir="rtl">
        <h2>{initial.id ? 'אפשרויות סגנון אובייקט' : 'סגנון אובייקט חדש'}</h2>
        <div className="object-style-preview" aria-hidden="true"><span style={{ ...objectStyleSwatch({ ...settings, fill: settings.fill ?? (fill as string | null | undefined) ?? undefined }, graphic), width: graphic ? 200 : 120, height: 54, display: 'block' }} /></div>
        {initial.graphic && (
          <label className="dlg-check" title="הציור של האובייקטים שממנם נוצר הסגנון: זה מה שמצויר כשהסגנון משמש עיטור בסגנון פסקה">
            <input type="checkbox" checked={keepGraphic} onChange={(event) => { setApplied(false); setKeepGraphic(event.target.checked) }} />
            לשמור את הציור של האובייקט (לעיטור בסגנון פסקה)
          </label>
        )}
        <label className="field-label table-dialog-field">שם הסגנון
          <input className="select" value={name} autoFocus onChange={(event) => setName(event.target.value)} />
        </label>
        <p className="muted">מה שמסומן הוא מה שהסגנון קובע, ושינוי בו מגיע לכל האובייקטים שבו. מה שלא מסומן נשאר באובייקט כפי שהוא. נגיעה בהגדרה שלא מסומנת מסמנת אותה. „החל” מעדכן את האובייקטים בלי לסגור את החלון.</p>
        <fieldset className="object-style-group"><legend>מילוי וקו</legend>
          <Setting label={NAMES.fill} on={has('fill')} onToggle={toggle('fill', '#d9dde3')}>{colorCell('fill', fill as string | null | undefined, '#d9dde3')}</Setting>
          <Setting label={NAMES.stroke} on={has('stroke')} onToggle={toggle('stroke', '#1f2937')}>{colorCell('stroke', stroke as string | null | undefined, '#1f2937')}</Setting>
          <Setting label={`${NAMES.strokeWidth} (pt)`} on={has('strokeWidth')} onToggle={toggle('strokeWidth', 1)}>
            <input className="select table-dialog-number" type="number" min={0} max={200} step={0.25} value={strokeWidth} onChange={(event) => set({ strokeWidth: Math.max(0, Number(event.target.value) || 0) })} />
          </Setting>
          <Setting label={NAMES.strokeDash} on={has('strokeDash')} onToggle={toggle('strokeDash', 'solid')}>
            <select className="select" aria-label={NAMES.strokeDash} value={shown('strokeDash', 'solid') ?? 'solid'} onChange={(event) => set({ strokeDash: event.target.value === 'dashed' ? 'dashed' : 'solid' })}>
              <option value="solid">רציף</option>
              <option value="dashed">מקווקו</option>
            </select>
          </Setting>
          <Setting label={`${NAMES.radius} (pt)`} on={has('radius')} onToggle={toggle('radius', 6)}>
            <input className="select table-dialog-number" type="number" min={0} max={500} step={1} value={radius} onChange={(event) => set({ radius: Math.max(0, Number(event.target.value) || 0) })} />
          </Setting>
        </fieldset>
        <fieldset className="object-style-group"><legend>שקיפות וצללית</legend>
          <Setting label={`${NAMES.opacity} (%)`} on={has('opacity')} onToggle={toggle('opacity', 1)}>
            <input type="range" min={0} max={100} value={pct(opacity)} aria-label={NAMES.opacity} onChange={(event) => set({ opacity: Number(event.target.value) / 100 })} />
            <span className="muted">{pct(opacity)}%</span>
          </Setting>
          <Setting label={NAMES.blendMode} on={has('blendMode')} onToggle={toggle('blendMode', null)}>
            <select className="select" aria-label={NAMES.blendMode} value={shown('blendMode', null) ?? ''} onChange={(event) => set({ blendMode: (event.target.value || null) as BlendMode | null })}>
              <option value="">רגיל</option>
              {BLEND_MODES.map((mode) => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
            </select>
          </Setting>
          <Setting label={NAMES.feather} on={has('feather')} onToggle={toggle('feather', null)}>
            <span className="muted">{featherText(shown('feather', null) ?? null)}</span>
            <label className="dlg-check"><input type="checkbox" checked={!shown('feather', null)} onChange={(event) => set({ feather: event.target.checked ? null : reference?.feather ?? null })} />ללא</label>
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
          <button className="btn primary" onClick={() => onSave(name.trim() || initial.name, settingsNow(), graphic)}>אישור</button>
          {onApply && (
            <button className="btn" title="מעדכן את האובייקטים שבסגנון ומשאיר את החלון פתוח" onClick={() => { onApply(name.trim() || initial.name, settingsNow(), graphic); setApplied(true) }}>{applied ? 'הוחל ✓' : 'החל'}</button>
          )}
          <button className="btn" onClick={onClose}>ביטול</button>
          {onDelete && <button className="btn danger" onClick={onDelete}>מחיקת הסגנון</button>}
        </div>
      </div>
    </div>
  )
}
