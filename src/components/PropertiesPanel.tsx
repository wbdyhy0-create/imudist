import type { ReactNode } from 'react'
import { DEFAULT_SHADOW_OFFSET, effectiveLeading, MAX_PAGE_PT, type CharStyle, type ColorSample, type Feather, type TextAlign, type TextDirection, type TextFrame, type TextStyle } from '../document'
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
import { t } from '../i18n'

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
  onParagraphStyle: (patch: Partial<Pick<TextStyle, 'align' | 'direction' | 'leading' | 'wordSpacingMin' | 'wordSpacingMax' | 'wordSpacing'>>) => void
  onArrange: (op: ArrangeOp) => void
  onLink: () => void
  onUnlink: () => void
}

/** The five alignments, their tooltip and their toolbar icon (a shared source so every place that offers them - the
 * context toolbar, the Properties panel, paragraph styles - shows the same five, the same way). */
export const ALIGNS: { id: TextAlign; label: string; icon: string }[] = [
  { id: 'right', get label() { return t('יישור לימין') }, icon: 'M4 6h16M8 10h12M4 14h16M8 18h12' },
  { id: 'center', get label() { return t('מירכוז') }, icon: 'M4 6h16M7 10h10M4 14h16M7 18h10' },
  { id: 'left', get label() { return t('יישור לשמאל') }, icon: 'M4 6h16M4 10h12M4 14h16M4 18h12' },
  { id: 'justify', get label() { return t('יישור מלא לשני הצדדים') }, icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
  { id: 'justifyCenter', get label() { return t('יישור מלא לשני הצדדים, שורה אחרונה ממורכזת') }, icon: 'M4 6h16M4 10h16M4 14h16M7 18h10' },
]

/** the ways a paragraph can read: from the right, from the left, or by its own first letter */
export const TEXT_DIRECTIONS: { id: TextDirection; short: string; title: string }[] = [
  { id: 'rtl', short: 'RTL', get title() { return t('מימין לשמאל (עברית, ערבית)') } },
  { id: 'ltr', short: 'LTR', get title() { return t('משמאל לימין (אנגלית)') } },
  { id: 'auto', get short() { return t('אוטו׳') }, get title() { return t('אוטומטי: לפי האות הראשונה בכל פסקה') } },
]

export function ParagraphTextControls({
  style,
  onChange,
}: {
  style: TextStyle
  onChange: (patch: Partial<Pick<TextStyle, 'align' | 'direction' | 'wordSpacingMin' | 'wordSpacingMax' | 'wordSpacing'>>) => void
}) {
  return (
    <>
      <Labeled label={t('יישור')}>
        <div className="toggle-group">
          {[...ALIGNS].reverse().map((align) => (
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
      <Labeled label={t('כיוון הטקסט')}>
        <div className="toggle-group" role="radiogroup" aria-label={t('כיוון הטקסט')}>
          {TEXT_DIRECTIONS.map((item) => (
            <button
              key={item.id}
              role="radio"
              className={(style.direction ?? 'rtl') === item.id ? 'on' : ''}
              title={item.title}
              aria-label={item.title}
              aria-checked={(style.direction ?? 'rtl') === item.id}
              onClick={() => onChange({ direction: item.id })}
            >
              {item.short}
            </button>
          ))}
        </div>
      </Labeled>
      {(style.align === 'justify' || style.align === 'justifyCenter') && (
        <>
          <p className="muted">{t('ריווח מילים חל רק ביישור מלא.')}</p>
          <div className="grid2">
            <Labeled label={t('ריווח מילים מינימלי (%)')}>
              <NumberField value={style.wordSpacingMin ?? 90} min={10} max={100} onChange={(wordSpacingMin) => onChange({ wordSpacingMin })} />
            </Labeled>
            <Labeled label={t('ריווח מילים מרבי (%)')}>
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
            <Labeled label={t('גופן')}>
              <FontPicker value={style.fontFamily} families={catalog.families} onChange={pickFamily} />
            </Labeled>

            <Labeled label={t('משקל וסגנון')}>
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
                    {style.italic ? t(' · נטוי') : ''}
                  </option>
                )}
                {(family?.faces ?? []).map((f) => (
                  <option key={`${f.weight}|${f.italic}`} value={`${f.weight}|${f.italic ? 1 : 0}`}>
                    {weightName(f.weight)}
                    {f.italic ? t(' · נטוי') : ''} ({f.style})
                  </option>
                ))}
              </select>
            </Labeled>

            <div className="grid2">
              <Labeled label={t('גודל')}>
                <NumberField value={style.fontSize} unit="px" unitLabel="pt" min={1} max={999} step={1} mixed={sizeMixed} onStep={onSizeStep} onChange={(v) => onCharStyle({ fontSize: v })} />
              </Labeled>
              <Labeled label={t('עיצוב')}>
                <div className="toggle-group">
                  <button
                    className={style.weight >= 600 ? 'on' : ''}
                    title={t('מודגש')}
                    aria-label={t('מודגש')}
                    aria-pressed={style.weight >= 600}
                    onClick={() => onCharStyle({ weight: style.weight >= 600 ? 400 : 700 })}
                  >
                    <b className="glyph">B</b>
                  </button>
                  <button className={style.italic ? 'on' : ''} title={t('נטוי')} aria-label={t('נטוי')} aria-pressed={style.italic} onClick={() => onCharStyle({ italic: !style.italic })}>
                    <i className="glyph">I</i>
                  </button>
                </div>
              </Labeled>
            </div>

            {onLeading && (
              <Labeled label={t('מרווח בין שורות (Leading)')}>
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
            <Labeled label={t('ריווח בין אותיות (Tracking)')}>
              <NumberField value={style.tracking / 10} suffix="%" step={1} min={-50} max={50} onChange={(v) => onCharStyle({ tracking: Math.round(v * 10) })} />
            </Labeled>
            {afterTracking}
            {samples && (
              <Labeled label={t('דוגמיות צבע')}>
                <FillPicker label={t('צבע הטקסט')} value={style.color ?? '#111111'} samples={samples} onChange={(color) => onCharStyle({ color: color ?? '#111111' })} />
              </Labeled>
            )}
            <Labeled label={t('קו מתאר לאותיות')}>
              <div className="outline-controls">
                <FillPicker label={t('צבע קו מתאר')} value={style.outlineColor ?? '#000000'} samples={samples} onChange={(color) => onCharStyle({ outlineColor: color ?? '#000000' })} />
                <NumberField ariaLabel={t('עובי קו מתאר')} value={style.outlineWidth ?? 0} unit="px" unitLabel="pt" step={0.25} min={0} max={100} onChange={(outlineWidth) => onCharStyle({ outlineWidth })} />
              </div>
            </Labeled>
            <p className="muted">{t('0 לטקסט רגיל; ערך שלילי (בערך 5- עד 15-) מקרב את האותיות ונותן מראה צפוף לכותרות.')}</p>
            {onLeading && <p className="muted">{t('ברירת המחדל היא כ־125% מגודל הגופן. השינוי חל על הפסקאות שבבחירה, או על הפסקה שבה נמצא הסמן.')}</p>}
            <Labeled label={t('הסטת קו בסיס (נקודות)')}>
              <NumberField value={style.baselineShift ?? 0} step={0.5} min={-99} max={99} onChange={(v) => onCharStyle({ baselineShift: v === 0 ? undefined : v })} />
            </Labeled>
            <p className="muted">{t('ערך חיובי מגביה את הטקסט מעל השורה, ושלילי מנמיך אותו, בלי לשנות את גובה השורה. מתאים לאותיות זעירות ותלויות.')}</p>
            {showShadow && <TextShadowGroup style={style} onChange={onCharStyle} />}
    </>
  )
}

export function TextShadowGroup({ style, onChange }: { style: CharStyle; onChange: (patch: Partial<CharStyle>) => void }) {
  return (
    <Group title={t('הצללה')}>
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
    <aside className="props-panel" aria-label={t('מאפיינים')} onMouseDown={keepFocus}>
      <h2 className="props-title">{t('מאפיינים')}</h2>
      {!frame || !style ? (
        <p className="muted">{t('בחר תיבת טקסט כדי לערוך את המאפיינים שלה.')}</p>
      ) : (
        <>
          <Group title={t('טקסט')}>
            <p className={'scope-hint' + (scope === 'selection' ? ' on' : '')}>
              {scope === 'selection' ? t('השינויים חלים על הטקסט המסומן') : t('השינויים חלים על כל הטקסט בתיבה. סמן טקסט כדי לשנות רק חלק ממנו.')}
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

          <Group title={t('מיקום וגודל')}>
            <div className="grid2">
              <Labeled label={t('מיקום X')}>
                <NumberField value={frame.x} unit={unit} min={-MAX_PAGE_PT} max={MAX_PAGE_PT} onChange={(v) => onGeometry({ x: v })} />
              </Labeled>
              <Labeled label={t('מיקום Y')}>
                <NumberField value={frame.y} unit={unit} min={-MAX_PAGE_PT} max={MAX_PAGE_PT} onChange={(v) => onGeometry({ y: v })} />
              </Labeled>
              <Labeled label={t('רוחב')}>
                <NumberField value={frame.w} unit={unit} min={6} max={MAX_PAGE_PT} onChange={(v) => onGeometry({ w: v })} />
              </Labeled>
              <Labeled label={t('גובה')}>
                <NumberField value={frame.h} unit={unit} min={6} max={MAX_PAGE_PT} onChange={(v) => onGeometry({ h: v })} />
              </Labeled>
            </div>
          </Group>

          <Group title={t('מתיחת הטקסט')}>
            <div className="grid2">
              <Labeled label={t('רוחב הטקסט')}>
                <NumberField ariaLabel={t('קנה מידה אופקי של הטקסט')} value={Math.round((frame.textScale?.x ?? 1) * 100)} min={10} max={1000} onChange={(value) => onTextScale('x', value)} />
              </Labeled>
              <Labeled label={t('גובה הטקסט')}>
                <NumberField ariaLabel={t('קנה מידה אנכי של הטקסט')} value={Math.round((frame.textScale?.y ?? 1) * 100)} min={10} max={1000} onChange={(value) => onTextScale('y', value)} />
              </Labeled>
            </div>
            <p className="muted">{t('Shift וגרירת כל ידית מגדילים את הטקסט ואת המסגרת באופן אחיד; Alt משנה את גובה האותיות בלבד.')}</p>
          </Group>

          <Group title={t('סדר שכבות')}>
            <ArrangeButtons onArrange={onArrange} />
          </Group>

          <Group title={t('טשטוש קצוות (Feather)')}>
            <FeatherControls feather={frame.feather} onChange={onFeatherChange} onUseGradientTool={onUseFeatherTool} />
          </Group>

          <Group title={t('שרשור טקסט')}>
            {thread && thread.count > 1 && (
              <p className="muted">
                {t('תיבה {index} מתוך {count} בסיפור', { index: thread.index + 1, count: thread.count })}
              </p>
            )}
            {thread?.overflow && <p className="props-warning">{t('יש טקסט שלא נכנס בתיבות. הגדל תיבה או חבר תיבה נוספת.')}</p>}
            <div className="props-buttons">
              {frame.next === null && (
                <button className="btn small" onClick={onLink}>
                  {t('חבר לתיבה הבאה')}
                </button>
              )}
              {thread && thread.index > 0 && (
                <button className="btn small" onClick={onUnlink}>
                  {t('נתק מהתיבה הקודמת')}
                </button>
              )}
            </div>
            {frame.next === null && <p className="muted">{t('לחץ על הכפתור ואז על תיבה אחרת, או על הריבוע בפינת התיבה.')}</p>}
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
