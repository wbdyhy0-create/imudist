import { MAX_PAGE_PT, MAX_SIDES, MIN_SIDES, type CharStyle, type PathSide, type PathText, type ShapeFrame } from '../document'
import type { Box } from '../frames'
import { SHAPE_NAMES, SIDE_NAMES, fitRadii } from '../shapes'
import type { ArrangeOp } from '../stacking'
import type { Unit } from '../units'
import { ArrangeButtons } from './ArrangeButtons'
import { FillPicker } from './FillPicker'
import { NumberField } from './NumberField'
import { CharControls, Group, Labeled } from './PropertiesPanel'

interface Props {
  shape: ShapeFrame
  unit: Unit
  onGeometry: (patch: Partial<Box>) => void
  onChange: (patch: Partial<ShapeFrame>) => void
  onArrange: (op: ArrangeOp) => void
  onDelete: () => void
  /** "change all corners together": one setting for all shapes, kept by the workspace because the rounding handles follow it too */
  linked: boolean
  onLinkedChange: (linked: boolean) => void
  /** only some of the corners are picked (by a sweep over their rounding handles) */
  cornersPicked: boolean
  onPickAllCorners: () => void
  /** the style the text-on-outline controls show: of the selected text, or the text's own */
  pathStyle: CharStyle | null
  /** does a change apply to the selected text only, or to all of it? */
  pathScope: 'selection' | 'all'
  onPathChar: (patch: Partial<CharStyle>) => void
  onPathChange: (patch: Partial<PathText>) => void
  onEditPath: () => void
  onRemovePath: () => void
}

type Radii = [number, number, number, number]

/** The properties panel of a selected shape. */
export function ShapeProperties({ shape, unit, onGeometry, onChange, onArrange, onDelete, linked, onLinkedChange, cornersPicked, onPickAllCorners, pathStyle, pathScope, onPathChar, onPathChange, onEditPath, onRemovePath }: Props) {
  const radii: Radii = shape.radii ?? [0, 0, 0, 0]
  const shown = fitRadii(radii, shape.w, shape.h)
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
    <aside
      className="props-panel"
      aria-label="מאפייני צורה"
      // buttons must not take the focus away from the text being typed on the outline
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) e.preventDefault()
      }}
    >
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
        <p className="muted">Shift בגרירת פינה שומר על היחס בין הרוחב לגובה. Alt מותח לשני הצדדים בשווה.</p>
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
            <input type="checkbox" checked={linked} onChange={(e) => onLinkedChange(e.target.checked)} />
            שנה את כל הפינות יחד
          </label>
          <p className="muted">
            {linked
              ? 'גרירת אחד הריבועים המסובבים שבפינות מעגלת את כל הפינות. בטל את הסימון כדי לעגל פינות בנפרד.'
              : 'כדי לבחור פינות: גרור מסגרת בחירה מחוץ לצורה כך שתיגע בריבועים שבפינות, או לחץ על ריבוע וגרור אותו מעל ריבועים נוספים. אחרי הבחירה נשארים רק הריבועים של הפינות שנבחרו, וגרירה של אחד מהם מעגלת את כולן יחד.'}
          </p>
          {!linked && cornersPicked && (
            <button type="button" className="btn small" onClick={onPickAllCorners}>
              הצג את כל הפינות
            </button>
          )}
        </Group>
      )}

      {shape.pathText && pathStyle && (
        <Group title="טקסט על הקו">
          <p className={'scope-hint' + (pathScope === 'selection' ? ' on' : '')}>
            {pathScope === 'selection' ? 'השינויים חלים על הטקסט המסומן' : 'השינויים חלים על כל הטקסט שעל הקו. סמן טקסט כדי לשנות רק חלק ממנו.'}
          </p>
          <CharControls style={pathStyle} onCharStyle={onPathChar} />
          <Labeled label="צד הקו">
            <div className="seg small" role="radiogroup" aria-label="צד הקו">
              {(['outside', 'inside'] as PathSide[]).map((side) => (
                <button key={side} role="radio" aria-checked={shape.pathText!.side === side} className={shape.pathText!.side === side ? 'on' : ''} onClick={() => onPathChange({ side })}>
                  {side === 'outside' ? 'מחוץ לצורה' : 'בתוך הצורה'}
                </button>
              ))}
            </div>
          </Labeled>
          <Labeled label="צבע הטקסט">
            <FillPicker label="צבע הטקסט" value={shape.pathText.color} onChange={(color) => color && onPathChange({ color })} />
          </Labeled>
          <div className="props-buttons" style={{ marginTop: 8 }}>
            <button className="btn small" onClick={onEditPath}>
              ערוך את הטקסט
            </button>
            <button className="btn small" onClick={onRemovePath}>
              הסר את הטקסט מהקו
            </button>
          </div>
          <p className="muted">היתדות על הקו: הצהוב מזיז את הטקסט, הכחול מקצר או מאריך אותו, והעגול שבאמצע מכניס אותו פנימה או מוציא אותו החוצה.</p>
        </Group>
      )}

      {shape.image && (
        <Group title="התמונה במסגרת">
          <div className="seg small" role="radiogroup" aria-label="אופן ההתאמה">
            <button role="radio" aria-checked={shape.image.fit !== 'fit'} className={shape.image.fit !== 'fit' ? 'on' : ''} onClick={() => onChange({ image: { assetId: shape.image!.assetId, fit: 'fill' } })}>
              מלא את המסגרת
            </button>
            <button role="radio" aria-checked={shape.image.fit === 'fit'} className={shape.image.fit === 'fit' ? 'on' : ''} onClick={() => onChange({ image: { assetId: shape.image!.assetId, fit: 'fit' } })}>
              התמונה כולה
            </button>
          </div>
          <p className="muted">
            {shape.image.fit === 'fit'
              ? 'כל התמונה נכנסת בתוך המסגרת, גם אם נשאר רווח בצדדים.'
              : 'התמונה ממלאת את המסגרת מכל צד; מה שלא נכנס נחתך על ידי המסגרת.'}{' '}
            גרור את העיגול שבאמצע התמונה כדי להזיז אותה, ואת הפינות שלה כדי לשנות את גודלה — עם כלי עריכת הנקודות.
          </p>
          <div className="props-buttons" style={{ marginTop: 8 }}>
            <button className="btn small" onClick={() => onChange({ image: undefined })}>
              הסר את התמונה מהמסגרת
            </button>
          </div>
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
