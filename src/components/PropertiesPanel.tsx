import type { ReactNode } from 'react'
import { MAX_PAGE_PT, type CharStyle, type TextAlign, type TextFrame, type TextStyle } from '../document'
import { loadSystemFonts, useFontCatalog, weightName } from '../fonts'
import type { Box } from '../frames'
import type { Unit } from '../units'
import { FontPicker } from './FontPicker'
import { NumberField } from './NumberField'

interface Props {
  frame: TextFrame | null
  /** what the text controls show: the selected text's style, or the story's default */
  style: TextStyle | null
  /** does a change apply to the selected text only, or to the whole story? */
  scope: 'selection' | 'all'
  unit: Unit
  /** position of the frame inside its story, and whether text is left over */
  thread: { index: number; count: number; overflow: boolean } | null
  onGeometry: (patch: Partial<Box>) => void
  onCharStyle: (patch: Partial<CharStyle>) => void
  onAlign: (align: TextAlign) => void
  onLink: () => void
  onUnlink: () => void
}

const ALIGNS: { id: TextAlign; label: string; icon: string }[] = [
  { id: 'right', label: 'יישור לימין', icon: 'M4 6h16M8 10h12M4 14h16M8 18h12' },
  { id: 'center', label: 'מירכוז', icon: 'M4 6h16M7 10h10M4 14h16M7 18h10' },
  { id: 'left', label: 'יישור לשמאל', icon: 'M4 6h16M4 10h12M4 14h16M4 18h12' },
  { id: 'justify', label: 'יישור דו-צדדי', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
]

export function PropertiesPanel({ frame, style, scope, unit, thread, onGeometry, onCharStyle, onAlign, onLink, onUnlink }: Props) {
  const catalog = useFontCatalog()

  // The panel's buttons must not take the focus away from the text being edited.
  const keepFocus = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) e.preventDefault()
  }

  const family = style ? catalog.families.find((f) => f.family === style.fontFamily) : undefined
  const faceKey = style ? `${style.weight}|${style.italic ? 1 : 0}` : ''
  const hasFace = !!family?.faces.some((f) => `${f.weight}|${f.italic ? 1 : 0}` === faceKey)

  // Only the family changes: every piece of text keeps its own weight / italic, and the browser
  // picks the closest face of the new family for it.
  const pickFamily = (name: string) => onCharStyle({ fontFamily: name })

  return (
    <aside className="props-panel" aria-label="מאפיינים" onMouseDown={keepFocus}>
      <h2 className="props-title">מאפיינים</h2>
      {!frame || !style ? (
        <p className="muted">בחר תיבת טקסט כדי לערוך את המאפיינים שלה.</p>
      ) : (
        <>
          <Group title="מיקום וגודל">
            <div className="grid2">
              <Labeled label="מיקום X">
                <NumberField value={frame.x} unit={unit} min={-MAX_PAGE_PT} max={MAX_PAGE_PT} onChange={(v) => onGeometry({ x: v })} />
              </Labeled>
              <Labeled label="מיקום Y">
                <NumberField value={frame.y} unit={unit} min={-MAX_PAGE_PT} max={MAX_PAGE_PT} onChange={(v) => onGeometry({ y: v })} />
              </Labeled>
              <Labeled label="רוחב">
                <NumberField value={frame.w} unit={unit} min={6} max={MAX_PAGE_PT} onChange={(v) => onGeometry({ w: v })} />
              </Labeled>
              <Labeled label="גובה">
                <NumberField value={frame.h} unit={unit} min={6} max={MAX_PAGE_PT} onChange={(v) => onGeometry({ h: v })} />
              </Labeled>
            </div>
          </Group>

          <Group title="טקסט">
            <p className={'scope-hint' + (scope === 'selection' ? ' on' : '')}>
              {scope === 'selection' ? 'השינויים חלים על הטקסט המסומן' : 'השינויים חלים על כל הטקסט בתיבה. סמן טקסט כדי לשנות רק חלק ממנו.'}
            </p>

            <Labeled label="גופן">
              <FontPicker value={style.fontFamily} families={catalog.families} onChange={pickFamily} />
            </Labeled>

            <Labeled label="משקל וסגנון">
              <select
                className="select"
                value={faceKey}
                onChange={(e) => {
                  const [w, i] = e.target.value.split('|')
                  onCharStyle({ weight: Number(w), italic: i === '1' })
                }}
              >
                {!hasFace && (
                  <option value={faceKey}>
                    {weightName(style.weight)}
                    {style.italic ? ' · נטוי' : ''}
                  </option>
                )}
                {(family?.faces ?? []).map((f) => (
                  <option key={`${f.weight}|${f.italic}`} value={`${f.weight}|${f.italic ? 1 : 0}`}>
                    {weightName(f.weight)}
                    {f.italic ? ' · נטוי' : ''} ({f.style})
                  </option>
                ))}
              </select>
            </Labeled>

            <div className="grid2">
              <Labeled label="גודל">
                <NumberField value={style.fontSize} unit="px" unitLabel="pt" min={1} max={999} onChange={(v) => onCharStyle({ fontSize: v })} />
              </Labeled>
              <Labeled label="עיצוב">
                <div className="toggle-group">
                  <button
                    className={style.weight >= 600 ? 'on' : ''}
                    title="מודגש"
                    aria-label="מודגש"
                    aria-pressed={style.weight >= 600}
                    onClick={() => onCharStyle({ weight: style.weight >= 600 ? 400 : 700 })}
                  >
                    <b className="glyph">B</b>
                  </button>
                  <button className={style.italic ? 'on' : ''} title="נטוי" aria-label="נטוי" aria-pressed={style.italic} onClick={() => onCharStyle({ italic: !style.italic })}>
                    <i className="glyph">I</i>
                  </button>
                </div>
              </Labeled>
            </div>

            <Labeled label="יישור">
              <div className="toggle-group">
                {ALIGNS.map((a) => (
                  <button key={a.id} className={style.align === a.id ? 'on' : ''} title={a.label} aria-label={a.label} aria-pressed={style.align === a.id} onClick={() => onAlign(a.id)}>
                    <svg viewBox="0 0 24 24">
                      <path d={a.icon} />
                    </svg>
                  </button>
                ))}
              </div>
            </Labeled>

            <FontSource status={catalog.status} count={catalog.families.length} />
          </Group>

          <Group title="שרשור טקסט">
            {thread && thread.count > 1 && (
              <p className="muted">
                תיבה {thread.index + 1} מתוך {thread.count} בסיפור
              </p>
            )}
            {thread?.overflow && <p className="props-warning">יש טקסט שלא נכנס בתיבות. הגדל תיבה או חבר תיבה נוספת.</p>}
            <div className="props-buttons">
              {frame.next === null && (
                <button className="btn small" onClick={onLink}>
                  חבר לתיבה הבאה
                </button>
              )}
              {thread && thread.index > 0 && (
                <button className="btn small" onClick={onUnlink}>
                  נתק מהתיבה הקודמת
                </button>
              )}
            </div>
            {frame.next === null && <p className="muted">לחץ על הכפתור ואז על תיבה אחרת, או על הריבוע בפינת התיבה.</p>}
          </Group>
        </>
      )}
    </aside>
  )
}

/** Where the font list comes from, and a button to load the fonts installed on this computer. */
function FontSource({ status, count }: { status: string; count: number }) {
  if (status === 'system') return <p className="muted">{count} משפחות גופנים מהמחשב</p>
  if (status === 'loading') return <p className="muted">טוען גופנים מהמחשב…</p>
  if (status === 'unavailable') return <p className="muted">הדפדפן הזה לא מאפשר לקרוא את הגופנים המותקנים (נדרש Chrome או Edge). מוצגת רשימה בסיסית.</p>
  return (
    <>
      {status === 'denied' && <p className="muted">לא ניתנה הרשאה לגופנים. מוצגת רשימה בסיסית.</p>}
      <button className="btn small" onClick={() => void loadSystemFonts()}>
        טען את הגופנים מהמחשב
      </button>
    </>
  )
}

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="props-group">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

export function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      {children}
    </div>
  )
}
