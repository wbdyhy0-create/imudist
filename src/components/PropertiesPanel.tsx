import type { ReactNode } from 'react'
import { FONT_FAMILIES, MAX_PAGE_PT, type TextAlign, type TextFrame, type TextStyle } from '../document'
import type { Box } from '../frames'
import type { Unit } from '../units'
import { NumberField } from './NumberField'

interface Props {
  frame: TextFrame | null
  /** style of the frame's whole story */
  style: TextStyle | null
  unit: Unit
  /** position of the frame inside its story, and whether text is left over */
  thread: { index: number; count: number; overflow: boolean } | null
  onGeometry: (patch: Partial<Box>) => void
  onStyle: (patch: Partial<TextStyle>) => void
  onLink: () => void
  onUnlink: () => void
}

const ALIGNS: { id: TextAlign; label: string; icon: string }[] = [
  { id: 'right', label: 'יישור לימין', icon: 'M4 6h16M8 10h12M4 14h16M8 18h12' },
  { id: 'center', label: 'מירכוז', icon: 'M4 6h16M7 10h10M4 14h16M7 18h10' },
  { id: 'left', label: 'יישור לשמאל', icon: 'M4 6h16M4 10h12M4 14h16M4 18h12' },
  { id: 'justify', label: 'יישור דו-צדדי', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
]

export function PropertiesPanel({ frame, style, unit, thread, onGeometry, onStyle, onLink, onUnlink }: Props) {
  return (
    <aside className="props-panel" aria-label="מאפיינים">
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
            <Labeled label="גופן">
              <select className="select" value={style.fontFamily} onChange={(e) => onStyle({ fontFamily: e.target.value })}>
                {!FONT_FAMILIES.includes(style.fontFamily) && <option value={style.fontFamily}>{style.fontFamily}</option>}
                {FONT_FAMILIES.map((f) => (
                  <option key={f} value={f} style={{ fontFamily: f }}>
                    {f}
                  </option>
                ))}
              </select>
            </Labeled>
            <div className="grid2">
              <Labeled label="גודל">
                <NumberField value={style.fontSize} unit="px" unitLabel="pt" min={1} max={999} onChange={(v) => onStyle({ fontSize: v })} />
              </Labeled>
              <Labeled label="עיצוב">
                <div className="toggle-group">
                  <button className={style.bold ? 'on' : ''} title="מודגש" aria-label="מודגש" aria-pressed={style.bold} onClick={() => onStyle({ bold: !style.bold })}>
                    <b className="glyph">B</b>
                  </button>
                  <button className={style.italic ? 'on' : ''} title="נטוי" aria-label="נטוי" aria-pressed={style.italic} onClick={() => onStyle({ italic: !style.italic })}>
                    <i className="glyph">I</i>
                  </button>
                </div>
              </Labeled>
            </div>
            <Labeled label="יישור">
              <div className="toggle-group">
                {ALIGNS.map((a) => (
                  <button key={a.id} className={style.align === a.id ? 'on' : ''} title={a.label} aria-label={a.label} aria-pressed={style.align === a.id} onClick={() => onStyle({ align: a.id })}>
                    <svg viewBox="0 0 24 24">
                      <path d={a.icon} />
                    </svg>
                  </button>
                ))}
              </div>
            </Labeled>
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

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="props-group">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      {children}
    </div>
  )
}
