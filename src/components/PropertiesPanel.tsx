import type { ReactNode } from 'react'
import { DEFAULT_SHADOW_OFFSET, effectiveLeading, MAX_PAGE_PT, type CharStyle, type ColorSample, type Feather, type TextAlign, type TextFrame, type TextStyle } from '../document'
import { useFontCatalog, weightName } from '../fonts'
import type { Box } from '../frames'
import type { ArrangeOp } from '../stacking'
import type { Unit } from '../units'
import { ArrangeButtons } from './ArrangeButtons'
import { FillPicker } from './FillPicker'
import { FontPicker } from './FontPicker'
import { NumberField } from './NumberField'
import { ShadowControls } from './ShadowControls'
import { FeatherControls } from './FeatherControls'

interface Props {
  frame: TextFrame | null
  /** what the text controls show: the selected text's style, or the story's default */
  style: TextStyle | null
  scope: 'selection' | 'all'
  colorSamples: ColorSample[]
  unit: Unit
  /** position of the frame inside its story, and whether text is left over */
  thread: { index: number; count: number; overflow: boolean } | null
  onGeometry: (patch: Partial<Box>) => void
  onFeatherChange: (feather?: Feather) => void
  onUseFeatherTool: () => void
  onTextScale: (axis: 'x' | 'y', percent: number) => void
  onCharStyle: (patch: Partial<CharStyle>) => void
  sizeMixed?: boolean
  onSizeStep?: (delta: number) => void
  onParagraphStyle: (patch: Partial<Pick<TextStyle, 'align' | 'leading' | 'wordSpacingMin' | 'wordSpacingMax'>>) => void
  onArrange: (op: ArrangeOp) => void
  onLink: () => void
  onUnlink: () => void
}

/** The five alignments, their tooltip and their toolbar icon (a shared source so every place that offers them - the
 * context toolbar, the Properties panel, paragraph styles - shows the same five, the same way). */
export const ALIGNS: { id: TextAlign; label: string; icon: string }[] = [
  { id: 'right', label: 'יישור לימין', icon: 'M4 6h16M8 10h12M4 14h16M8 18h12' },
  { id: 'center', label: 'מירכוז', icon: 'M4 6h16M7 10h10M4 14h16M7 18h10' },
  { id: 'left', label: 'יישור לשמאל', icon: 'M4 6h16M4 10h12M4 14h16M4 18h12' },
  { id: 'justify', label: 'יישור מלא לשני הצדדים', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
  { id: 'justifyCenter', label: 'יישור מלא לשני הצדדים, שורה אחרונה ממורכזת', icon: 'M4 6h16M4 10h16M4 14h16M7 18h10' },
]

export function ParagraphTextControls({
  style,
  onChange,
}: {
  style: TextStyle
  onChange: (patch: Partial<Pick<TextStyle, 'align' | 'wordSpacingMin' | 'wordSpacingMax'>>) => void
}) {
  return (
    <>
      <Labeled label="יישור">
        <div className="toggle-group">
          {ALIGNS.map((align) => (
            <button
              key={align.id}
              className={style.align === align.id ? 'on' : ''}
              title={align.label}
              aria-label={align.label}
              aria-pressed={style.align === align.id}
              onClick={() => onChange({ align: align.id })}
            >
              <svg viewBox="0 0 24 24"><path d={align.icon} /></svg>
            </button>
          ))}
        </div>
      </Labeled>
      {(style.align === 'justify' || style.align === 'justifyCenter') && (
        <>
          <p className="muted">ריווח מילים חל רק ביישור מלא.</p>
          <div className="grid2">
            <Labeled label="ריווח מילים מינימלי (%)">
              <NumberField value={style.wordSpacingMin ?? 90} min={10} max={100} onChange={(wordSpacingMin) => onChange({ wordSpacingMin })} />
            </Labeled>
            <Labeled label="ריווח מילים מרבי (%)">
              <NumberField value={style.wordSpacingMax ?? 120} min={100} max={500} onChange={(wordSpacingMax) => onChange({ wordSpacingMax })} />
            </Labeled>
          </div>
        </>
      )}
    </>
  )
}


/** Font, weight, size and bold / italic of a piece of text: the same controls for text frames and text on a path. */
export function CharControls({ style, onCharStyle, sizeMixed, onSizeStep, onLeading, samples, afterTracking, showShadow = true }: { style: CharStyle; onCharStyle: (patch: Partial<CharStyle>) => void; sizeMixed?: boolean; onSizeStep?: (delta: number) => void; onLeading?: (leading: number) => void; samples?: ColorSample[]; afterTracking?: ReactNode; showShadow?: boolean }) {
  const catalog = useFontCatalog()
  const family = catalog.families.find((f) => f.family === style.fontFamily)
  const faceKey = `${style.weight}|${style.italic ? 1 : 0}`
  const hasFace = !!family?.faces.some((f) => `${f.weight}|${f.italic ? 1 : 0}` === faceKey)
  // Only the family changes: every piece of text keeps its own weight / italic, and the browser
  // picks the closest face of the new family for it.
  const pickFamily = (name: string) => onCharStyle({ fontFamily: name })

  return (
    <>
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
                <NumberField value={style.fontSize} unit="px" unitLabel="pt" min={1} max={999} step={1} mixed={sizeMixed} onStep={onSizeStep} onChange={(v) => onCharStyle({ fontSize: v })} />
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

            {onLeading && (
              <Labeled label="מרווח בין שורות (Leading)">
                <NumberField
                  value={effectiveLeading(style)}
                  unit="px"
                  unitLabel="pt"
                  min={0}
                  max={MAX_PAGE_PT}
                  onChange={(v) => onLeading(Math.round(v))}
                />
              </Labeled>
            )}
            <Labeled label="ריווח בין אותיות (Tracking)">
              <NumberField value={style.tracking} step={5} min={-500} max={500} onChange={(v) => onCharStyle({ tracking: v })} />
            </Labeled>
            {afterTracking}
            {samples && (
              <Labeled label="דוגמיות צבע">
                <FillPicker label="צבע הטקסט" value={style.color ?? '#111111'} samples={samples} onChange={(color) => onCharStyle({ color: color ?? '#111111' })} />
              </Labeled>
            )}
            <Labeled label="קו מתאר לאותיות">
              <div className="outline-controls">
                <FillPicker label="צבע קו מתאר" value={style.outlineColor ?? '#000000'} samples={samples} onChange={(color) => onCharStyle({ outlineColor: color ?? '#000000' })} />
                <NumberField ariaLabel="עובי קו מתאר" value={style.outlineWidth ?? 0} unit="px" unitLabel="pt" step={0.25} min={0} max={100} onChange={(outlineWidth) => onCharStyle({ outlineWidth })} />
              </div>
            </Labeled>
            <p className="muted">0 לטקסט רגיל; ערך שלילי (בערך 5- עד 15-) מקרב את האותיות ונותן מראה צפוף לכותרות.</p>
            {onLeading && <p className="muted">ברירת המחדל היא כ־125% מגודל הגופן. השינוי חל על הפסקאות שבבחירה, או על הפסקה שבה נמצא הסמן.</p>}
            <Labeled label="הסטת קו בסיס (נקודות)">
              <NumberField value={style.baselineShift ?? 0} step={0.5} min={-99} max={99} onChange={(v) => onCharStyle({ baselineShift: v === 0 ? undefined : v })} />
            </Labeled>
            <p className="muted">ערך חיובי מגביה את הטקסט מעל השורה, ושלילי מנמיך אותו, בלי לשנות את גובה השורה. מתאים לאותיות זעירות ותלויות.</p>
            {showShadow && <TextShadowGroup style={style} onChange={onCharStyle} />}
    </>
  )
}

export function TextShadowGroup({ style, onChange }: { style: CharStyle; onChange: (patch: Partial<CharStyle>) => void }) {
  return (
    <Group title="הצללה">
      <ShadowControls
        offsetX={style.shadowOffsetX ?? 0}
        offsetY={style.shadowOffsetY ?? style.shadowOffset ?? DEFAULT_SHADOW_OFFSET}
        opacity={style.shadowOpacity ?? 0}
        color={style.shadowColor ?? '#000000'}
        onOffsetXChange={(shadowOffsetX) => onChange({ shadowOffsetX })}
        onOffsetYChange={(shadowOffsetY) => onChange({ shadowOffsetY })}
        onOpacityChange={(shadowOpacity) => onChange({ shadowOpacity })}
        onColorChange={(shadowColor) => onChange({ shadowColor })}
      />
    </Group>
  )
}

export function PropertiesPanel({ frame, style, scope, colorSamples, unit, thread, onGeometry, onFeatherChange, onUseFeatherTool, onTextScale, onCharStyle, sizeMixed, onSizeStep, onParagraphStyle, onArrange, onLink, onUnlink }: Props) {
  // The panel's buttons must not take the focus away from the text being edited.
  const keepFocus = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) e.preventDefault()
  }

  return (
    <aside className="props-panel" aria-label="מאפיינים" onMouseDown={keepFocus}>
      <h2 className="props-title">מאפיינים</h2>
      {!frame || !style ? (
        <p className="muted">בחר תיבת טקסט כדי לערוך את המאפיינים שלה.</p>
      ) : (
        <>
          <Group title="טקסט">
            <p className={'scope-hint' + (scope === 'selection' ? ' on' : '')}>
              {scope === 'selection' ? 'השינויים חלים על הטקסט המסומן' : 'השינויים חלים על כל הטקסט בתיבה. סמן טקסט כדי לשנות רק חלק ממנו.'}
            </p>
            <CharControls
              style={style}
              onCharStyle={onCharStyle}
              sizeMixed={sizeMixed}
              onSizeStep={onSizeStep}
              onLeading={(leading) => onParagraphStyle({ leading })}
              samples={colorSamples}
              afterTracking={<ParagraphTextControls style={style} onChange={onParagraphStyle} />}
              showShadow={false}
            />
          </Group>

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

          <Group title="מתיחת הטקסט">
            <div className="grid2">
              <Labeled label="רוחב הטקסט">
                <NumberField ariaLabel="קנה מידה אופקי של הטקסט" value={Math.round((frame.textScale?.x ?? 1) * 100)} min={10} max={1000} onChange={(value) => onTextScale('x', value)} />
              </Labeled>
              <Labeled label="גובה הטקסט">
                <NumberField ariaLabel="קנה מידה אנכי של הטקסט" value={Math.round((frame.textScale?.y ?? 1) * 100)} min={10} max={1000} onChange={(value) => onTextScale('y', value)} />
              </Labeled>
            </div>
            <p className="muted">Shift וגרירת כל ידית מגדילים את הטקסט ואת המסגרת באופן אחיד; Alt משנה את גובה האותיות בלבד.</p>
          </Group>

          <Group title="סדר שכבות">
            <ArrangeButtons onArrange={onArrange} />
          </Group>

          <Group title="טשטוש קצוות (Feather)">
            <FeatherControls feather={frame.feather} onChange={onFeatherChange} onUseGradientTool={onUseFeatherTool} />
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
          <TextShadowGroup style={style} onChange={onCharStyle} />
        </>
      )}
    </aside>
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
