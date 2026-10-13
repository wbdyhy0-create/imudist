import { DEFAULT_SHADOW_OFFSET, DEFAULT_WRAP_OFFSET, MAX_PAGE_PT, type Asset, type Feather, type ImageFit, type ImageFrame, type WrapMode } from '../document'
import type { Box } from '../frames'
import type { ArrangeOp } from '../stacking'
import type { Unit } from '../units'
import { ArrangeButtons } from './ArrangeButtons'
import { NumberField } from './NumberField'
import { Group, Labeled } from './PropertiesPanel'
import { ShadowControls } from './ShadowControls'
import { FeatherControls } from './FeatherControls'
import { t } from '../i18n'

interface Props {
  image: ImageFrame
  asset: Asset | undefined
  unit: Unit
  onGeometry: (patch: Partial<Box>) => void
  onFit: (fit: ImageFit) => void
  onWrap: (wrap: WrapMode) => void
  onWrapOffset: (offset: number) => void
  onShadowChange: (patch: Pick<ImageFrame, 'shadowOffsetX' | 'shadowOffsetY' | 'shadowColor' | 'shadowOpacity'>) => void
  onFeatherChange: (feather?: Feather) => void
  onUseFeatherTool: () => void
  onArrange: (op: ArrangeOp) => void
  /** make the frame the same shape as the picture (keeping its width) */
  onMatchShape: () => void
  onRemoveBackground: () => void
  removingBackground: boolean
  /** open the dialog that turns the picture into a vector shape */
  onTraceToVector: () => void
  onDelete: () => void
}

const WRAPS: { id: WrapMode; label: string; hint: string }[] = [
  { id: 'none', get label() { return t('ללא') }, get hint() { return t('הטקסט לא מושפע מהתמונה (הם יכולים לחפוף)') } },
  { id: 'around', get label() { return t('סביב') }, get hint() { return t('הטקסט זורם בצד הרחב של התמונה, מעליה ומתחתיה') } },
  { id: 'jump', get label() { return t('דילוג') }, get hint() { return t('הטקסט נעצר מעל התמונה וממשיך מתחתיה') } },
]

const FITS: { id: ImageFit; label: string; hint: string }[] = [
  { id: 'fill', get label() { return t('מילוי') }, get hint() { return t('התמונה ממלאת את כל המסגרת ונחתכת בקצוות אם צריך') } },
  { id: 'fit', get label() { return t('התאמה') }, get hint() { return t('כל התמונה נראית, ייתכנו שוליים ריקים במסגרת') } },
  { id: 'stretch', get label() { return t('מתיחה') }, get hint() { return t('התמונה נמתחת למסגרת גם אם היחס משתנה') } },
]

/** The properties panel of a selected picture. */
export function ImageProperties({ image, asset, unit, onGeometry, onFit, onWrap, onWrapOffset, onShadowChange, onFeatherChange, onUseFeatherTool, onArrange, onMatchShape, onRemoveBackground, removingBackground, onTraceToVector, onDelete }: Props) {
  const wrap = image.wrap ?? 'none'
  // pixels per inch at the current size: a hint for print quality (72 pt = 1 inch)
  const ppi = asset ? Math.round(asset.width / (image.w / 72)) : null

  return (
    <aside className="props-panel" aria-label={t('מאפייני תמונה')}>
      <h2 className="props-title">{t('תמונה')}</h2>

      <Group title={t('מיקום וגודל')}>
        <div className="grid2">
          <Labeled label={t('מיקום X')}>
            <NumberField value={image.x} unit={unit} min={-MAX_PAGE_PT} max={MAX_PAGE_PT} onChange={(v) => onGeometry({ x: v })} />
          </Labeled>
          <Labeled label={t('מיקום Y')}>
            <NumberField value={image.y} unit={unit} min={-MAX_PAGE_PT} max={MAX_PAGE_PT} onChange={(v) => onGeometry({ y: v })} />
          </Labeled>
          <Labeled label={t('רוחב')}>
            <NumberField value={image.w} unit={unit} min={6} max={MAX_PAGE_PT} onChange={(v) => onGeometry({ w: v })} />
          </Labeled>
          <Labeled label={t('גובה')}>
            <NumberField value={image.h} unit={unit} min={6} max={MAX_PAGE_PT} onChange={(v) => onGeometry({ h: v })} />
          </Labeled>
        </div>
        <p className="muted">{t('גרירת פינה שומרת על היחס. החזק Shift כדי לשנות חופשי. Alt מותח לשני הצדדים בשווה.')}</p>
      </Group>

      <Group title={t('סדר שכבות')}>
        <ArrangeButtons onArrange={onArrange} />
      </Group>

      <Group title={t('עטיפת טקסט')}>
        <div className="place-modes">
          {WRAPS.map((w) => (
            <button key={w.id} className={wrap === w.id ? 'on' : ''} title={w.hint} onClick={() => onWrap(w.id)}>
              {w.label}
            </button>
          ))}
        </div>
        {wrap !== 'none' && (
          <div style={{ marginTop: 8 }}>
            <Labeled label={t('מרווח מהתמונה')}>
              <NumberField value={image.wrapOffset ?? DEFAULT_WRAP_OFFSET} unit={unit} min={0} max={200} onChange={onWrapOffset} />
            </Labeled>
          </div>
        )}
        <p className="muted">{t('העטיפה משפיעה על כל תיבת טקסט שחופפת לתמונה, בלי קשר לסדר השכבות.')}</p>
      </Group>

      <Group title={t('התאמה למסגרת')}>
        <div className="place-modes">
          {FITS.map((f) => (
            <button key={f.id} className={image.fit === f.id ? 'on' : ''} title={f.hint} onClick={() => onFit(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="props-buttons" style={{ marginTop: 8 }}>
          <button className="btn small" onClick={onMatchShape} disabled={!asset}>
            {t('התאם מסגרת ליחס התמונה')}
          </button>
        </div>
      </Group>

      <Group title={t('הסרת רקע')}>
        <button className="btn small" onClick={onRemoveBackground} disabled={!asset || removingBackground}>
          {removingBackground ? t('מסיר רקע…') : t('הסר רקע')}
        </button>
        <p className="muted">{t('העיבוד נעשה במחשב, בזיהוי של 512×512 פיקסלים. התמונה המקורית נשמרת במסמך כדי לאפשר ביטול.')}</p>
      </Group>

      <Group title={t('המרה לווקטור')}>
        <button className="btn small" onClick={onTraceToVector} disabled={!asset}>
          {t('המר תמונה לווקטור…')}
        </button>
        <p className="muted">{t('ללוגו או שרטוט בצבע אחד: הופך את התמונה לצורה חדה בכל גודל ובהדפסה, שאפשר לצבוע.')}</p>
      </Group>

      <Group title={t('הצללה')}>
        <ShadowControls
          offsetX={image.shadowOffsetX ?? 0}
          offsetY={image.shadowOffsetY ?? image.shadowOffset ?? DEFAULT_SHADOW_OFFSET}
          opacity={image.shadowOpacity ?? 0}
          color={image.shadowColor ?? '#000000'}
          onOffsetXChange={(shadowOffsetX) => onShadowChange({ shadowOffsetX })}
          onOffsetYChange={(shadowOffsetY) => onShadowChange({ shadowOffsetY })}
          onOpacityChange={(shadowOpacity) => onShadowChange({ shadowOpacity })}
          onColorChange={(shadowColor) => onShadowChange({ shadowColor })}
        />
      </Group>

      <Group title={t('טשטוש קצוות (Feather)')}>
        <FeatherControls feather={image.feather} onChange={onFeatherChange} onUseGradientTool={onUseFeatherTool} />
      </Group>

      <Group title={t('קובץ')}>
        {asset ? (
          <>
            <p className="file-name">
              <bdi>{asset.name}</bdi>
            </p>
            <p className="muted">
              {t('{width}×{height} פיקסלים', { width: asset.width, height: asset.height })}
              {ppi !== null && (
                <>
                  {' · '}
                  <span className={ppi < 150 ? 'low-res' : undefined}>{t('{ppi} ppi בגודל הנוכחי', { ppi })}</span>
                </>
              )}
            </p>
            {ppi !== null && ppi < 150 && <p className="props-warning">{t('הרזולוציה נמוכה להדפסה (מומלץ 150 ppi ומעלה).')}</p>}
            {asset.link ? (
              <p className="muted" dir="ltr" style={{ textAlign: 'left', wordBreak: 'break-all' }}>
                🔗 {asset.link.path}
              </p>
            ) : (
              <p className="muted">{t('מוטמעת במסמך.')}</p>
            )}
          </>
        ) : (
          <p className="props-warning">{t('נתוני התמונה חסרים בקובץ.')}</p>
        )}
        <div className="props-buttons">
          <button className="btn small danger" onClick={onDelete}>
            {t('מחק תמונה')}
          </button>
        </div>
      </Group>
    </aside>
  )
}
