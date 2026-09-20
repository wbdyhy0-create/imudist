import { MAX_PAGE_PT, type Asset, type ImageFit, type ImageFrame } from '../document'
import type { Box } from '../frames'
import type { Unit } from '../units'
import { NumberField } from './NumberField'
import { Group, Labeled } from './PropertiesPanel'

interface Props {
  image: ImageFrame
  asset: Asset | undefined
  unit: Unit
  onGeometry: (patch: Partial<Box>) => void
  onFit: (fit: ImageFit) => void
  /** make the frame the same shape as the picture (keeping its width) */
  onMatchShape: () => void
  onDelete: () => void
}

const FITS: { id: ImageFit; label: string; hint: string }[] = [
  { id: 'fill', label: 'מילוי', hint: 'התמונה ממלאת את כל המסגרת ונחתכת בקצוות אם צריך' },
  { id: 'fit', label: 'התאמה', hint: 'כל התמונה נראית, ייתכנו שוליים ריקים במסגרת' },
  { id: 'stretch', label: 'מתיחה', hint: 'התמונה נמתחת למסגרת גם אם היחס משתנה' },
]

/** The properties panel of a selected picture. */
export function ImageProperties({ image, asset, unit, onGeometry, onFit, onMatchShape, onDelete }: Props) {
  // pixels per inch at the current size: a hint for print quality (72 pt = 1 inch)
  const ppi = asset ? Math.round(asset.width / (image.w / 72)) : null

  return (
    <aside className="props-panel" aria-label="מאפייני תמונה">
      <h2 className="props-title">תמונה</h2>

      <Group title="מיקום וגודל">
        <div className="grid2">
          <Labeled label="מיקום X">
            <NumberField value={image.x} unit={unit} min={-MAX_PAGE_PT} max={MAX_PAGE_PT} onChange={(v) => onGeometry({ x: v })} />
          </Labeled>
          <Labeled label="מיקום Y">
            <NumberField value={image.y} unit={unit} min={-MAX_PAGE_PT} max={MAX_PAGE_PT} onChange={(v) => onGeometry({ y: v })} />
          </Labeled>
          <Labeled label="רוחב">
            <NumberField value={image.w} unit={unit} min={6} max={MAX_PAGE_PT} onChange={(v) => onGeometry({ w: v })} />
          </Labeled>
          <Labeled label="גובה">
            <NumberField value={image.h} unit={unit} min={6} max={MAX_PAGE_PT} onChange={(v) => onGeometry({ h: v })} />
          </Labeled>
        </div>
        <p className="muted">גרירת פינה שומרת על היחס. החזק Alt כדי לשנות חופשי.</p>
      </Group>

      <Group title="התאמה למסגרת">
        <div className="place-modes">
          {FITS.map((f) => (
            <button key={f.id} className={image.fit === f.id ? 'on' : ''} title={f.hint} onClick={() => onFit(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="props-buttons" style={{ marginTop: 8 }}>
          <button className="btn small" onClick={onMatchShape} disabled={!asset}>
            התאם מסגרת ליחס התמונה
          </button>
        </div>
      </Group>

      <Group title="קובץ">
        {asset ? (
          <>
            <p className="file-name">
              <bdi>{asset.name}</bdi>
            </p>
            <p className="muted">
              {asset.width}×{asset.height} פיקסלים
              {ppi !== null && (
                <>
                  {' · '}
                  <span className={ppi < 150 ? 'low-res' : undefined}>{ppi} ppi בגודל הנוכחי</span>
                </>
              )}
            </p>
            {ppi !== null && ppi < 150 && <p className="props-warning">הרזולוציה נמוכה להדפסה (מומלץ 150 ppi ומעלה).</p>}
          </>
        ) : (
          <p className="props-warning">נתוני התמונה חסרים בקובץ.</p>
        )}
        <div className="props-buttons">
          <button className="btn small danger" onClick={onDelete}>
            מחק תמונה
          </button>
        </div>
      </Group>
    </aside>
  )
}
