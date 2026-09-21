import { useState } from 'react'
import { MAX_PAGE_PT, MAX_SIDES, MIN_SIDES, type ShapeFrame } from '../document'
import type { Box } from '../frames'
import { SHAPE_NAMES, SIDE_NAMES, fitRadii } from '../shapes'
import type { ArrangeOp } from '../stacking'
import type { Unit } from '../units'
import { ArrangeButtons } from './ArrangeButtons'
import { FillPicker } from './FillPicker'
import { NumberField } from './NumberField'
import { Group, Labeled } from './PropertiesPanel'

interface Props {
  shape: ShapeFrame
  unit: Unit
  onGeometry: (patch: Partial<Box>) => void
  onChange: (patch: Partial<ShapeFrame>) => void
  onArrange: (op: ArrangeOp) => void
  onDelete: () => void
}

type Radii = [number, number, number, number]

/** The properties panel of a selected shape. */
export function ShapeProperties({ shape, unit, onGeometry, onChange, onArrange, onDelete }: Props) {
  const radii: Radii = shape.radii ?? [0, 0, 0, 0]
  const shown = fitRadii(radii, shape.w, shape.h)
  const [linked, setLinked] = useState(radii.every((r) => r === radii[0]))
  const setRadius = (corner: number, v: number) => {
    const next: Radii = linked ? [v, v, v, v] : (radii.map((r, i) => (i === corner ? v : r)) as Radii)
    onChange({ radii: next })
  }
  const maxR = Math.max(0, Math.min(shape.w, shape.h) / 2)
  // physical positions, right column first (the panel is right-to-left): top-right, top-left, bottom-right, bottom-left
  const cornerFields: { corner: number; label: string }[] = [
    { corner: 1, label: 'ימין למעלה' },
    { corner: 0, label: 'שמאל למעלה' },
    { corner: 2, label: 'ימין למטה' },
    { corner: 3, label: 'שמאל למטה' },
  ]
  const title = shape.kind === 'polygon' ? SIDE_NAMES[shape.sides ?? 6] : SHAPE_NAMES[shape.kind]

  return (
    <aside className="props-panel" aria-label="מאפייני צורה">
      <h2 className="props-title">{title}</h2>

      <Group title="מיקום וגודל">
        <div className="grid2">
          <Labeled label="מיקום X">
            <NumberField value={shape.x} unit={unit} min={-MAX_PAGE_PT} max={MAX_PAGE_PT} onChange={(v) => onGeometry({ x: v })} />
          </Labeled>
          <Labeled label="מיקום Y">
            <NumberField value={shape.y} unit={unit} min={-MAX_PAGE_PT} max={MAX_PAGE_PT} onChange={(v) => onGeometry({ y: v })} />
          </Labeled>
          <Labeled label="רוחב">
            <NumberField value={shape.w} unit={unit} min={6} max={MAX_PAGE_PT} onChange={(v) => onGeometry({ w: v })} />
          </Labeled>
          <Labeled label="גובה">
            <NumberField value={shape.h} unit={unit} min={6} max={MAX_PAGE_PT} onChange={(v) => onGeometry({ h: v })} />
          </Labeled>
        </div>
        <p className="muted">Shift בגרירת פינה שומר על היחס בין הרוחב לגובה.</p>
      </Group>

      {shape.kind === 'polygon' && (
        <Group title="מספר פינות">
          <div className="place-modes" role="group" aria-label="מספר פינות">
            {Array.from({ length: MAX_SIDES - MIN_SIDES + 1 }, (_, i) => MIN_SIDES + i).map((n) => (
              <button key={n} className={(shape.sides ?? 6) === n ? 'on' : ''} title={SIDE_NAMES[n]} onClick={() => onChange({ sides: n })}>
                {n}
              </button>
            ))}
          </div>
        </Group>
      )}

      {shape.kind === 'rect' && (
        <Group title="עיגול פינות">
          <div className="grid2">
            {cornerFields.map((f) => (
              <Labeled key={f.corner} label={f.label}>
                <NumberField value={shown[f.corner]} unit={unit} min={0} max={maxR} onChange={(v) => setRadius(f.corner, v)} />
              </Labeled>
            ))}
          </div>
          <label className="page-bar-check">
            <input type="checkbox" checked={linked} onChange={(e) => setLinked(e.target.checked)} />
            שנה את כל הפינות יחד
          </label>
          <p className="muted">אפשר גם לגרור את הריבועים המסובבים שבפינות. גרירה שעוברת מעל פינה נוספת מעגלת גם אותה.</p>
        </Group>
      )}

      <Group title="מילוי">
        <FillPicker label="צבע מילוי" value={shape.fill} onChange={(fill) => onChange({ fill })} />
      </Group>

      <Group title="קו">
        <FillPicker
          label="צבע הקו"
          value={shape.stroke}
          // adding a line to a shape that has none gives it a visible weight
          onChange={(stroke) => onChange(stroke && shape.strokeWidth === 0 ? { stroke, strokeWidth: 1 } : { stroke })}
        />
        <div style={{ marginTop: 8 }}>
          <Labeled label="עובי הקו (נקודות)">
            {/* line weights are counted in points, in quarter steps: 0.25, 0.5, 0.75, 1, 1.25 … (Shift = ten steps) */}
            <NumberField value={shape.strokeWidth} unit="px" unitLabel="pt" step={0.25} min={0} max={200} onChange={(v) => onChange({ strokeWidth: v })} />
          </Labeled>
        </div>
      </Group>

      <Group title="סדר שכבות">
        <ArrangeButtons onArrange={onArrange} />
      </Group>

      <div className="props-buttons" style={{ marginTop: 10 }}>
        <button className="btn small danger" onClick={onDelete}>
          מחק צורה
        </button>
      </div>
    </aside>
  )
}
