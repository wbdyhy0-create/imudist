import { DEFAULT_SHADOW_OFFSET, MAX_PAGE_PT, MAX_SIDES, MIN_SIDES, type CharStyle, type Feather, type LineCap, type PathSide, type PathText, type Sharpness, type ShapeFrame } from '../document'
import { lineLook, MAX_BLUR, SHARPNESS_LEVELS } from '../sharpness'
import type { Box } from '../frames'
import { SHAPE_NAMES, SIDE_NAMES, fitRadii } from '../shapes'
import type { ArrangeOp } from '../stacking'
import type { Unit } from '../units'
import { ArrangeButtons } from './ArrangeButtons'
import { FillPicker } from './FillPicker'
import { NumberField } from './NumberField'
import { CharControls, Group, Labeled } from './PropertiesPanel'
import { ShadowControls } from './ShadowControls'
import { FeatherControls } from './FeatherControls'
import { LINE_PROFILES, MAX_LINE_WIDTH_MULTIPLE, type LineWidths } from '../lineProfile'
import { t } from '../i18n'

interface Props {
  shape: ShapeFrame
  unit: Unit
  onGeometry: (patch: Partial<Box>) => void
  onChange: (patch: Partial<ShapeFrame>) => void
  onUseFeatherTool: () => void
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
/** the sharpness level a line or a drawn path is at: blurred is soft, flat ends are sharp, round ones are medium */
function sharpnessOf(shape: ShapeFrame): Sharpness {
  if ((shape.blur ?? 0) > 0) return 'soft'
  if (shape.kind === 'line') return shape.strokeCap === 'round' || shape.strokeCap === 'square' ? 'medium' : 'sharp'
  return shape.strokeCap === 'butt' ? 'sharp' : 'medium'
}

export function ShapeProperties({ shape, unit, onGeometry, onChange, onUseFeatherTool, onArrange, onDelete, linked, onLinkedChange, cornersPicked, onPickAllCorners, pathStyle, pathScope, onPathChar, onPathChange, onEditPath, onRemovePath }: Props) {
  const radii: Radii = shape.radii ?? [0, 0, 0, 0]
  const shown = fitRadii(radii, shape.w, shape.h)
  const setRadius = (corner: number, v: number) => {
    const next: Radii = linked ? [v, v, v, v] : (radii.map((r, i) => (i === corner ? v : r)) as Radii)
    onChange({ radii: next })
  }
  const maxR = Math.max(0, Math.min(shape.w, shape.h) / 2)
  // physical positions, right column first (the panel is right-to-left): top-right, top-left, bottom-right, bottom-left
  const cornerFields: { corner: number; label: string }[] = [
    { corner: 1, get label() { return t('ימין למעלה') } },
    { corner: 0, get label() { return t('שמאל למעלה') } },
    { corner: 2, get label() { return t('ימין למטה') } },
    { corner: 3, get label() { return t('שמאל למטה') } },
  ]
  const title = shape.kind === 'rect' ? t('צורות') : shape.kind === 'polygon' ? SIDE_NAMES[shape.sides ?? 6] : SHAPE_NAMES[shape.kind]

  return (
    <aside
      className="props-panel"
      aria-label={t('מאפייני צורה')}
      // buttons must not take the focus away from the text being typed on the outline
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) e.preventDefault()
      }}
    >
      <h2 className="props-title">{title}</h2>

      <Group title={t('מיקום וגודל')}>
        <div className="grid2">
          <Labeled label={t('מיקום X')}>
            <NumberField value={shape.x} unit={unit} min={-MAX_PAGE_PT} max={MAX_PAGE_PT} onChange={(v) => onGeometry({ x: v })} />
          </Labeled>
          <Labeled label={t('מיקום Y')}>
            <NumberField value={shape.y} unit={unit} min={-MAX_PAGE_PT} max={MAX_PAGE_PT} onChange={(v) => onGeometry({ y: v })} />
          </Labeled>
          <Labeled label={t('רוחב')}>
            <NumberField value={shape.w} unit={unit} min={shape.kind === 'line' ? 0 : 6} max={MAX_PAGE_PT} onChange={(v) => onGeometry({ w: v })} />
          </Labeled>
          {shape.kind !== 'table' && (
            <Labeled label={t('גובה')}>
              <NumberField value={shape.h} unit={unit} min={shape.kind === 'line' ? 0 : 6} max={MAX_PAGE_PT} onChange={(v) => onGeometry({ h: v })} />
            </Labeled>
          )}
        </div>
        <p className="muted">
          {shape.kind === 'line'
            ? t('גרור את אחת מנקודות הקצה של הקו כדי להאריך, לקצר או לשנות את זוויתו. Shift שומר על זווית ישרה (קפיצות של 45°).')
            : shape.kind === 'table'
              ? t('גובה הטבלה נקבע לפי הטקסט שבתאים. את רוחב העמודות וגובה השורות משנים בגרירת הקווים שביניהן, והגדרות הקווים והצבעים נמצאות בתפריט טבלה.')
              : t('Shift בגרירת פינה שומר על היחס בין הרוחב לגובה. Alt מותח לשני הצדדים בשווה.')}
        </p>
        {shape.kind === 'path' && (
          <p className="muted">
            {t('בעריכת נקודות: גרירת אמצע צלע עם Alt מוסיפה נקודה כזו גם בצלע הנגדית, והשתיים נגררות במקביל (בהשתקפות). בלי Alt משתנה רק הצלע שנגררה.')}
          </p>
        )}
      </Group>

      {shape.kind === 'polygon' && (
        <Group title={t('מספר פינות')}>
          <div className="place-modes" role="group" aria-label={t('מספר פינות')}>
            {Array.from({ length: MAX_SIDES - MIN_SIDES + 1 }, (_, i) => MIN_SIDES + i).map((n) => (
              <button key={n} className={(shape.sides ?? 6) === n ? 'on' : ''} title={SIDE_NAMES[n]} onClick={() => onChange({ sides: n })}>
                {n}
              </button>
            ))}
          </div>
        </Group>
      )}

      {shape.kind === 'rect' && (
        <Group title={t('עיגול פינות')}>
          <div className="grid2">
            {cornerFields.map((f) => (
              <Labeled key={f.corner} label={f.label}>
                <NumberField value={shown[f.corner]} unit={unit} min={0} max={maxR} onChange={(v) => setRadius(f.corner, v)} />
              </Labeled>
            ))}
          </div>
          <label className="page-bar-check">
            <input type="checkbox" checked={linked} onChange={(e) => onLinkedChange(e.target.checked)} />
            {t('שנה את כל הפינות יחד')}
          </label>
          <p className="muted">
            {linked
              ? t('גרירת אחד הריבועים המסובבים שבפינות מעגלת את כל הפינות. בטל את הסימון כדי לעגל פינות בנפרד.')
              : t('גרור ידית אחת כדי לעגל רק אותה. בזמן הגרירה העבר את הסמן מעל ידיות נוספות כדי לצרף אותן, ואז כולן יתעגלו יחד. כל ארבע הידיות נשארות מוצגות.')}
          </p>
          {!linked && cornersPicked && (
            <button type="button" className="btn small" onClick={onPickAllCorners}>
              {t('בחר את כל הפינות')}
            </button>
          )}
        </Group>
      )}

      {shape.pathText && pathStyle && (
        <Group title={t('טקסט על הקו')}>
          <p className={'scope-hint' + (pathScope === 'selection' ? ' on' : '')}>
            {pathScope === 'selection' ? t('השינויים חלים על הטקסט המסומן') : t('השינויים חלים על כל הטקסט שעל הקו. סמן טקסט כדי לשנות רק חלק ממנו.')}
          </p>
          <CharControls style={pathStyle} onCharStyle={onPathChar} />
          <Labeled label={t('צד הקו')}>
            <div className="seg small" role="radiogroup" aria-label={t('צד הקו')}>
              {(['outside', 'inside'] as PathSide[]).map((side) => (
                <button key={side} role="radio" aria-checked={shape.pathText!.side === side} className={shape.pathText!.side === side ? 'on' : ''} onClick={() => onPathChange({ side })}>
                  {side === 'outside' ? t('מחוץ לצורה') : t('בתוך הצורה')}
                </button>
              ))}
            </div>
          </Labeled>
          <Labeled label={t('צבע הטקסט')}>
            <FillPicker label={t('צבע הטקסט')} value={shape.pathText.color} onChange={(color) => color && onPathChange({ color })} />
          </Labeled>
          <div className="props-buttons" style={{ marginTop: 8 }}>
            <button className="btn small" onClick={onEditPath}>
              {t('ערוך את הטקסט')}
            </button>
            <button className="btn small" onClick={onRemovePath}>
              {t('הסר את הטקסט מהקו')}
            </button>
          </div>
          <p className="muted">{t('היתדות על הקו: הצהוב מזיז את הטקסט, הכחול מקצר או מאריך אותו, והעגול שבאמצע מכניס אותו פנימה או מוציא אותו החוצה.')}</p>
        </Group>
      )}

      {shape.image && (
        <Group title={t('התמונה במסגרת')}>
          <div className="seg small" role="radiogroup" aria-label={t('אופן ההתאמה')}>
            <button role="radio" aria-checked={shape.image.fit !== 'fit'} className={shape.image.fit !== 'fit' ? 'on' : ''} onClick={() => onChange({ image: { assetId: shape.image!.assetId, fit: 'fill' } })}>
              {t('מלא את המסגרת')}
            </button>
            <button role="radio" aria-checked={shape.image.fit === 'fit'} className={shape.image.fit === 'fit' ? 'on' : ''} onClick={() => onChange({ image: { assetId: shape.image!.assetId, fit: 'fit' } })}>
              {t('התמונה כולה')}
            </button>
          </div>
          <p className="muted">
            {shape.image.fit === 'fit'
              ? t('כל התמונה נכנסת בתוך המסגרת, גם אם נשאר רווח בצדדים.')
              : t('התמונה נמתחת למידות המסגרת, כך שלא ייחתך ממנה חלק.')}{' '}
            {t('גרור את העיגול שבאמצע התמונה כדי להזיז אותה, ואת הפינות שלה כדי לשנות את גודלה — עם כלי עריכת הנקודות.')}
          </p>
          <div className="props-buttons" style={{ marginTop: 8 }}>
            <button className="btn small" onClick={() => onChange({ image: undefined })}>
              {t('הסר את התמונה מהמסגרת')}
            </button>
          </div>
        </Group>
      )}

      {shape.kind !== 'line' && (
        <Group title={shape.kind === 'table' ? t('רקע הטבלה') : t('מילוי')}>
          <FillPicker label={shape.kind === 'table' ? t('צבע הרקע') : t('צבע מילוי')} value={shape.fill} onChange={(fill) => onChange({ fill, fillGradient: undefined })} />
        </Group>
      )}

      {shape.kind !== 'table' && <Group title={t('קו')}>
        <FillPicker
          label={t('צבע הקו')}
          value={shape.stroke}
          // adding a line to a shape that has none gives it a visible weight
          onChange={(stroke) => onChange(stroke && shape.strokeWidth === 0 ? { stroke, strokeWidth: 1 } : { stroke })}
        />
        <div style={{ marginTop: 8 }}>
          <Labeled label={t('עובי הקו (נקודות)')}>
            {/* line weights are counted in points, in quarter steps: 0.25, 0.5, 0.75, 1, 1.25 … (Shift = ten steps) */}
            <NumberField value={shape.strokeWidth} unit="px" unitLabel="pt" step={0.25} min={0} max={200} onChange={(v) => onChange({ strokeWidth: v })} />
          </Labeled>
        </div>
      </Group>}

      {shape.kind === 'line' && (
        <Group title={t('סגנון קו')}>
          <Labeled label={t('תבנית')}>
            <div className="seg small" role="radiogroup" aria-label={t('תבנית הקו')}>
              <button role="radio" aria-checked={!shape.strokeDash} className={!shape.strokeDash ? 'on' : ''} onClick={() => onChange({ strokeDash: undefined })}>
                {t('רציף')}
              </button>
              <button role="radio" aria-checked={shape.strokeDash === 'dashed'} className={shape.strokeDash === 'dashed' ? 'on' : ''} onClick={() => onChange({ strokeDash: 'dashed' })}>
                {t('מקווקו')}
              </button>
            </div>
          </Labeled>
          <div style={{ marginTop: 8 }}>
            <Labeled label={t('קצוות')}>
              <div className="seg small" role="radiogroup" aria-label={t('צורת הקצוות')}>
                {(['butt', 'round', 'square'] as LineCap[]).map((cap) => (
                  <button
                    key={cap}
                    role="radio"
                    aria-checked={(shape.strokeCap ?? 'butt') === cap}
                    className={(shape.strokeCap ?? 'butt') === cap ? 'on' : ''}
                    title={cap === 'butt' ? t('קצה חד') : cap === 'round' ? t('קצה עגול') : t('קצה מרובע')}
                    onClick={() => onChange({ strokeCap: cap === 'butt' ? undefined : cap })}
                  >
                    {cap === 'butt' ? t('חד') : cap === 'round' ? t('עגול') : t('מרובע')}
                  </button>
                ))}
              </div>
            </Labeled>
          </div>
        </Group>
      )}

      {shape.kind === 'line' && <LineProfileControls widths={shape.lineWidths ?? [1, 1, 1]} onChange={(lineWidths) => onChange({ lineWidths })} />}

      {(shape.kind === 'line' || shape.kind === 'path') && !!shape.stroke && (
        <Group title={t('חדות הקו')}>
          <div className="seg small" role="radiogroup" aria-label={t('חדות הקו')}>
            {SHARPNESS_LEVELS.map((level) => (
              <button
                key={level.id}
                role="radio"
                aria-checked={sharpnessOf(shape) === level.id}
                className={sharpnessOf(shape) === level.id ? 'on' : ''}
                title={level.hint}
                onClick={() => {
                  const look = lineLook(level.id, shape.strokeWidth)
                  onChange({ strokeCap: shape.kind === 'line' && look.strokeCap === 'butt' ? undefined : look.strokeCap, blur: look.blur })
                }}
              >
                {level.label}
              </button>
            ))}
          </div>
        </Group>
      )}

      <Group title={t('טשטוש הצורה')}>
        <Labeled label={t('עוצמה (נקודות)')}>
          <NumberField value={shape.blur ?? 0} unit="px" unitLabel="pt" step={0.5} min={0} max={MAX_BLUR} onChange={(v) => onChange({ blur: v > 0 ? v : undefined })} />
        </Labeled>
        <p className="muted" style={{ marginTop: 6 }}>
          {t('בקובץ SVG הטשטוש נשמר כמסנן וקטורי. בייצוא PDF צורה מטושטשת נכתבת כתמונה ברזולוציית הייצוא.')}
        </p>
      </Group>

      <Group title={t('סדר שכבות')}>
        <ArrangeButtons onArrange={onArrange} />
      </Group>

      <Group title={t('הצללה')}>
        <ShadowControls
          offsetX={shape.shadowOffsetX ?? 0}
          offsetY={shape.shadowOffsetY ?? shape.shadowOffset ?? DEFAULT_SHADOW_OFFSET}
          opacity={shape.shadowOpacity ?? 0}
          color={shape.shadowColor ?? '#000000'}
          onOffsetXChange={(shadowOffsetX) => onChange({ shadowOffsetX })}
          onOffsetYChange={(shadowOffsetY) => onChange({ shadowOffsetY })}
          onOpacityChange={(shadowOpacity) => onChange({ shadowOpacity })}
          onColorChange={(shadowColor) => onChange({ shadowColor })}
        />
      </Group>

      <Group title={t('טשטוש קצוות (Feather)')}>
        <FeatherControls
          feather={shape.feather}
          onChange={(feather?: Feather) => onChange({ feather })}
          onUseGradientTool={onUseFeatherTool}
        />
      </Group>

      <div className="props-buttons" style={{ marginTop: 10 }}>
        <button className="btn small danger" onClick={onDelete}>
          {t('מחק צורה')}
        </button>
      </div>
    </aside>
  )
}

/** how thick the line is along its length: presets as small pictures, and the three widths for any other shape */
function LineProfileControls({ widths, onChange }: { widths: LineWidths; onChange: (widths: LineWidths | undefined) => void }) {
  const same = (a: LineWidths, b: LineWidths) => a.every((value, i) => Math.abs(value - b[i]!) < 0.005)
  const set = (index: number, percent: number) => {
    const next = [...widths] as LineWidths
    next[index] = Math.min(MAX_LINE_WIDTH_MULTIPLE, Math.max(0, percent / 100))
    onChange(same(next, [1, 1, 1]) ? undefined : next)
  }
  const fields = [
    { index: 0, get label() { return t('בהתחלה') } },
    { index: 1, get label() { return t('באמצע') } },
    { index: 2, get label() { return t('בסוף') } },
  ]
  return (
    <Group title={t('עובי לאורך הקו')}>
      <div className="line-profile-presets" role="group" aria-label={t('צורת העובי לאורך הקו')}>
        {LINE_PROFILES.map((preset) => {
          // a picture of the profile: the outline of a short line with those widths
          const half = (t: number) => {
            const [a, m, e] = preset.widths
            return Math.max(0, a * (1 - t) * (1 - 2 * t) + m * 4 * t * (1 - t) + e * t * (2 * t - 1)) * 6
          }
          const top: string[] = []
          const bottom: string[] = []
          for (let i = 0; i <= 20; i += 1) {
            const t = i / 20
            top.push(`${4 + t * 52} ${10 - half(t)}`)
            bottom.unshift(`${4 + t * 52} ${10 + half(t)}`)
          }
          const selected = same(widths, preset.widths)
          return (
            <button key={preset.id} type="button" title={preset.label} aria-label={preset.label} aria-pressed={selected} className={selected ? 'on' : ''} onClick={() => onChange(preset.id === 'even' ? undefined : preset.widths)}>
              <svg viewBox="0 0 60 20" aria-hidden="true"><path d={`M${top.join('L')}L${bottom.join('L')}Z`} fill="currentColor" /></svg>
            </button>
          )
        })}
      </div>
      <div className="grid2" style={{ marginTop: 8 }}>
        {fields.map((field) => (
          <Labeled key={field.index} label={`${field.label} (%)`}>
            <NumberField value={Math.round(widths[field.index]! * 100)} unit="px" unitLabel="%" step={5} min={0} max={MAX_LINE_WIDTH_MULTIPLE * 100} onChange={(percent) => set(field.index, percent)} />
          </Labeled>
        ))}
      </div>
      <p className="muted">{t('האחוזים הם מעובי הקו שנקבע למעלה. קו שעובהו משתנה נצבע בצבע הקו, ומיוצא כצורה מלאה.')}</p>
    </Group>
  )
}
