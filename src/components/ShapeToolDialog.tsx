import { useEffect, useState } from 'react'
import { MAX_PAGE_PT, MAX_SIDES, MIN_SIDES, type DrawKind } from '../document'
import { SHAPE_NAMES, SIDE_NAMES, polygonPoints, type ShapePrefs } from '../shapes'
import type { Unit } from '../units'
import { NumberField } from './NumberField'

interface Props {
  kind: DrawKind
  prefs: ShapePrefs
  unit: Unit
  onApply: (next: ShapePrefs) => void
  onClose: () => void
}

/** The settings of a shape tool (double-click the tool): the size a click makes, and the corners of a polygon. */
export function ShapeToolDialog({ kind, prefs, unit, onApply, onClose }: Props) {
  const [d, setD] = useState<ShapePrefs>(prefs)
  const cur = d[kind]
  const set = (patch: Partial<ShapePrefs[typeof kind]>) => setD((s) => ({ ...s, [kind]: { ...s[kind], ...patch } }))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop">
      <div className="modal wide shape-dialog" role="dialog" aria-modal="true" aria-label={`הגדרות כלי: ${SHAPE_NAMES[kind]}`}>
        <h2>הגדרות כלי: {SHAPE_NAMES[kind]}</h2>
        <p className="dlg-hint">
          לחיצה על הקנבס, בלי לגרור, תיצור {kind === 'rect' ? 'מלבן' : kind === 'ellipse' ? 'אליפסה' : 'מצולע'} בגודל הזה סביב נקודת הלחיצה. גרירה יוצרת צורה בכל גודל אחר.
        </p>

        <p className="dlg-hint">
          בזמן הגרירה: <b>Shift</b> (או Enter) שומר על צורה מדויקת במידות שוות — ריבוע, עיגול או משושה — וגרירת העכבר רק מגדילה או מקטינה אותה. <b>Alt</b> מגדיל את הצורה מנקודת האמצע שלה לכל הצדדים.
        </p>

        <div className="dlg-cols">
          <div className="field">
            <div className="field-label">רוחב</div>
            <NumberField value={cur.w} unit={unit} min={6} max={MAX_PAGE_PT} onChange={(v) => set({ w: v })} />
          </div>
          <div className="field">
            <div className="field-label">גובה</div>
            <NumberField value={cur.h} unit={unit} min={6} max={MAX_PAGE_PT} onChange={(v) => set({ h: v })} />
          </div>
        </div>

        {kind === 'ellipse' && (
          <button className="btn small" onClick={() => set({ h: cur.w })}>
            עיגול מושלם (גובה = רוחב)
          </button>
        )}
        {kind === 'rect' && (
          <>
            <div className="field">
              <div className="field-label">עיגול הפינות</div>
              <NumberField value={d.rect.radius} unit={unit} min={0} max={MAX_PAGE_PT} onChange={(v) => setD((s) => ({ ...s, rect: { ...s.rect, radius: v } }))} />
            </div>
            <button className="btn small" onClick={() => set({ h: cur.w })}>
              ריבוע (גובה = רוחב)
            </button>
          </>
        )}

        {kind === 'polygon' && (
          <div className="field">
            <div className="field-label">מספר פינות</div>
            <div className="row-cards" role="radiogroup" aria-label="מספר פינות">
              {Array.from({ length: MAX_SIDES - MIN_SIDES + 1 }, (_, i) => MIN_SIDES + i).map((n) => {
                const pts = polygonPoints(n, 30, 30)
                return (
                  <button key={n} role="radio" aria-checked={d.polygon.sides === n} className={'row-card' + (d.polygon.sides === n ? ' on' : '')} onClick={() => set({ sides: n })}>
                    <svg viewBox="-2 -2 34 34" width="34" height="34" aria-hidden="true">
                      <polygon points={pts.map((p) => p.join(',')).join(' ')} />
                    </svg>
                    <span>{SIDE_NAMES[n]}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="modal-buttons">
          <button className="btn primary" onClick={() => onApply(d)}>
            שמור הגדרות
          </button>
          <button className="btn" onClick={onClose}>
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}
