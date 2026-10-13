import { useEffect, useRef, useState } from 'react'
import type { Asset, ImageFrame, ShapeFrame } from '../document'
import {
  brightnessField,
  DEFAULT_TRACE,
  otsuLevel,
  suggestedTrace,
  tracedColor,
  traceField,
  visibleRegion,
  workingScale,
  type TraceResult,
} from '../imageTrace'
import { shapePath } from '../shapes'
import { t } from '../i18n'

export interface ImageTraceRequest {
  region: ReturnType<typeof visibleRegion>
  result: TraceResult
  color: string
  /** the picture stays (under the new shape) instead of being replaced */
  keepOriginal: boolean
}

interface Props {
  image: ImageFrame
  asset: Asset
  onApply: (request: ImageTraceRequest) => void
  onClose: () => void
}

/** the picture, read for tracing: the part that shows, at the size it is traced in */
interface Source {
  width: number
  height: number
  /** how many times the picture's pixels are enlarged (a small logo is enlarged so the curves come out smooth) */
  scale: number
  pixels: ImageData
  field: Float32Array
  region: ReturnType<typeof visibleRegion>
}

/** how far the curves may be from the edge of the picture at first (pixels of the original picture): a logo comes out with few points */
const DEFAULT_SIMPLIFY = 0.7

/** how much a thin line has to stand out from what is around it (levels of grey) to be kept, for each position of the slider */
const THIN_LEVELS = [0, 70, 50, 34, 22, 14]
const DEFAULT_THIN_KEEP = 3

/** a number of points past which a trace is more a photograph in vectors than a logo */
const MANY_POINTS = 20000

type View = 'result' | 'source' | 'overlay'
const VIEWS: { id: View; label: string; hint: string }[] = [
  { id: 'result', get label() { return t('התוצאה') }, get hint() { return t('הצורה שנוצרה, בצבע שנבחר') } },
  { id: 'source', get label() { return t('המקור') }, get hint() { return t('התמונה כפי שהיא') } },
  { id: 'overlay', get label() { return t('קו מעל המקור') }, get hint() { return t('קו הצורה מצויר באדום מעל התמונה, כדי לראות איפה הוא סוטה') } },
]
const ZOOMS = [
  { zoom: 1, get label() { return t('התאם לחלון') } },
  { zoom: 2, label: '200%' },
  { zoom: 4, label: '400%' },
]

/**
 * Object > "המר תמונה לווקטור…": a picture of a logo or a drawing (one colour on a plain ground) traced into a vector shape that stays
 * sharp at any size and in print. The picture is read for its brightness; what is darker (or lighter) than the chosen level becomes
 * the shape, and what is inside it, as the inside of an O, a hole.
 */
export function ImageTraceDialog({ image, asset, onApply, onClose }: Props) {
  const [source, setSource] = useState<Source | null>(null)
  const [failed, setFailed] = useState(false)
  const [trace, setTrace] = useState<'dark' | 'light'>(DEFAULT_TRACE.trace)
  const [level, setLevel] = useState(DEFAULT_TRACE.level)
  /** the smoothing of the line, in pixels of the original picture (the blur taken out of the grain of a JPEG) */
  const [smooth, setSmooth] = useState(1)
  /** specks smaller than this (in pixels of the original picture) are left out */
  const [speck, setSpeck] = useState(2)
  /** how far (in pixels of the original picture) the curves may go from the edge: the more, the fewer the points */
  const [simplify, setSimplify] = useState(DEFAULT_SIMPLIFY)
  /** how much of the thin and faint lines is kept: 0 is none, 5 is the faintest */
  const [thinKeep, setThinKeep] = useState(DEFAULT_THIN_KEEP)
  const [color, setColor] = useState('#000000')
  const [keepOriginal, setKeepOriginal] = useState(false)
  const [result, setResult] = useState<TraceResult | null>(null)
  const [view, setView] = useState<View>('result')
  const [zoom, setZoom] = useState(1)
  const picture = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // the picture is read once: the part of it that shows in its frame, enlarged when it is small
  useEffect(() => {
    let cancelled = false
    const element = new Image()
    element.onload = () => {
      if (cancelled) return
      const naturalWidth = element.naturalWidth || asset.width
      const naturalHeight = element.naturalHeight || asset.height
      const region = visibleRegion(image.fit, image.w, image.h, naturalWidth, naturalHeight)
      const scale = workingScale(region.src.w, region.src.h)
      const width = Math.max(1, Math.round(region.src.w * scale))
      const height = Math.max(1, Math.round(region.src.h * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) {
        setFailed(true)
        return
      }
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(element, region.src.x, region.src.y, region.src.w, region.src.h, 0, 0, width, height)
      const pixels = context.getImageData(0, 0, width, height)
      const field = brightnessField(pixels.data, width, height)
      const autoLevel = otsuLevel(field)
      const autoTrace = suggestedTrace(field, autoLevel)
      setSource({ width, height, scale, pixels, field, region })
      setLevel(autoLevel)
      setTrace(autoTrace)
      setColor(tracedColor(pixels.data, field, autoLevel, autoTrace))
    }
    element.onerror = () => {
      if (!cancelled) setFailed(true)
    }
    element.src = asset.dataUrl
    return () => {
      cancelled = true
    }
  }, [asset, image.fit, image.w, image.h])

  // the shape is found again, a moment after a slider has stopped
  useEffect(() => {
    if (!source) return
    const timer = window.setTimeout(() => {
      setResult(
        traceField(source.field, source.width, source.height, {
          ...DEFAULT_TRACE,
          trace,
          level,
          smooth: Math.round(smooth * source.scale),
          minArea: speck * source.scale * source.scale,
          tolerance: Math.max(0.2, simplify * source.scale),
          thin: THIN_LEVELS[thinKeep] ?? 0,
          thinReach: Math.max(2, Math.min(10, Math.round(3 * source.scale))),
        }),
      )
    }, 60)
    return () => window.clearTimeout(timer)
  }, [source, trace, level, smooth, speck, simplify, thinKeep])

  // a magnified preview opens on the middle of the picture
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = scroller.current
    if (!element || !source) return
    element.scrollLeft = (element.scrollWidth - element.clientWidth) / 2
    element.scrollTop = (element.scrollHeight - element.clientHeight) / 2
  }, [source, zoom])

  // the picture on the screen (the source view, and under the line in the overlay view)
  useEffect(() => {
    const target = picture.current
    if (!target || !source) return
    target.width = source.width
    target.height = source.height
    target.getContext('2d')?.putImageData(source.pixels, 0, 0)
  }, [source, view])

  const autoDetect = () => {
    if (!source) return
    const autoLevel = otsuLevel(source.field)
    const autoTrace = suggestedTrace(source.field, autoLevel)
    setLevel(autoLevel)
    setTrace(autoTrace)
    setColor(tracedColor(source.pixels.data, source.field, autoLevel, autoTrace))
  }

  const pathData = source && result
    ? shapePath({ id: 'trace', kind: 'path', x: 0, y: 0, w: source.width, h: source.height, geom: result.geom, fill: null, stroke: null, strokeWidth: 0 } as ShapeFrame, 1)
    : ''
  const paneStyle = zoom === 1 ? { width: '100%' } : { width: `${zoom * 100}%`, maxWidth: 'none' }
  const nothing = !!result && result.shapes === 0

  return (
    <div className="modal-backdrop">
      <div className="modal wide image-trace" role="dialog" aria-modal="true" aria-label={t('המרת תמונה לווקטור')}>
        <h2>{t('המרת תמונה לווקטור')}</h2>

        {failed ? (
          <p className="error">{t('לא ניתן לקרוא את התמונה הזאת.')}</p>
        ) : (
          <>
            <div className="dlg-cols">
              <div className="field">
                <div className="field-label">{t('מה הופך לצורה')}</div>
                <div className="seg small" role="radiogroup" aria-label={t('מה הופך לצורה')}>
                  <button role="radio" aria-checked={trace === 'dark'} className={trace === 'dark' ? 'on' : ''} onClick={() => setTrace('dark')} title={t('מה שכהה מהסף הוא הצורה (לוגו כהה על רקע בהיר)')}>{t('הכהה')}</button>
                  <button role="radio" aria-checked={trace === 'light'} className={trace === 'light' ? 'on' : ''} onClick={() => setTrace('light')} title={t('מה שבהיר מהסף הוא הצורה (לוגו בהיר על רקע כהה)')}>{t('הבהיר')}</button>
                </div>
              </div>
              <div className="field">
                <div className="field-label">{t('צבע הצורה')}</div>
                <div className="trace-color">
                  <input type="color" value={color} onChange={(event) => setColor(event.target.value)} aria-label={t('צבע הצורה')} />
                  <bdi dir="ltr">{color}</bdi>
                </div>
              </div>
            </div>

            <label className="color-brush-size trace-slider">
              <span>{t('סף בהירות')}</span>
              <input type="range" min={1} max={254} value={level} onChange={(event) => setLevel(Number(event.target.value))} aria-label={t('סף בהירות')} />
              <output>{level}</output>
              <button className="btn small" onClick={autoDetect} disabled={!source}>{t('זיהוי אוטומטי')}</button>
            </label>
            <label className="color-brush-size trace-slider">
              <span>{t('חלקות הקו')}</span>
              <input type="range" min={0} max={3} step={0.25} value={smooth} onChange={(event) => setSmooth(Number(event.target.value))} aria-label={t('חלקות הקו')} />
              <output>{smooth}</output>
            </label>
            <label className="color-brush-size trace-slider">
              <span>{t('פישוט (פחות נקודות)')}</span>
              <input type="range" min={0.2} max={3} step={0.1} value={simplify} onChange={(event) => setSimplify(Number(event.target.value))} aria-label={t('פישוט הקו')} />
              <output>{simplify.toFixed(1)}</output>
            </label>
            <label className="color-brush-size trace-slider" title={t('קווים דקים וחלשים (כמו קצה של סלסול רך) נשארים גם כשהם בהירים מהסף. ככל שגבוה יותר נשמרים גם קווים חלשים יותר, ואם נוצרים כתמים מיותרים מורידים.')}>
              <span>{t('שימור קווים דקים')}</span>
              <input type="range" min={0} max={5} step={1} value={thinKeep} onChange={(event) => setThinKeep(Number(event.target.value))} aria-label={t('שימור קווים דקים')} />
              <output>{thinKeep}</output>
            </label>
            <label className="color-brush-size trace-slider">
              <span>{t('הסרת כתמים קטנים')}</span>
              <input type="range" min={0} max={60} step={1} value={speck} onChange={(event) => setSpeck(Number(event.target.value))} aria-label={t('הסרת כתמים קטנים')} />
              <output>{speck}</output>
            </label>

            <div className="dlg-cols">
              <div className="field">
                <div className="field-label">{t('תצוגה')}</div>
                <div className="seg small" role="radiogroup" aria-label={t('תצוגה')}>
                  {VIEWS.map((choice) => (
                    <button key={choice.id} role="radio" aria-checked={view === choice.id} className={view === choice.id ? 'on' : ''} title={choice.hint} onClick={() => setView(choice.id)}>{choice.label}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                <div className="field-label">{t('גודל')}</div>
                <div className="seg small" role="radiogroup" aria-label={t('גודל התצוגה')}>
                  {ZOOMS.map((choice) => (
                    <button key={choice.zoom} role="radio" aria-checked={zoom === choice.zoom} className={zoom === choice.zoom ? 'on' : ''} onClick={() => setZoom(choice.zoom)}>{choice.label}</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="trace-preview" ref={scroller}>
              {!source && <p className="muted">{t('קורא את התמונה…')}</p>}
              {source && (
                <div className="trace-stage" style={{ ...paneStyle, aspectRatio: `${source.width} / ${source.height}` }}>
                  {view !== 'result' && <canvas ref={picture} aria-label={t('התמונה המקורית')} />}
                  {view !== 'source' && result && (
                    <svg viewBox={`0 0 ${source.width} ${source.height}`} preserveAspectRatio="none" aria-label={t('הצורה שנוצרה')}>
                      {view === 'result' ? (
                        <path d={pathData} fill={color} fillRule="evenodd" />
                      ) : (
                        <path d={pathData} fill="none" stroke="#ff2d55" strokeWidth={Math.max(1, source.scale * 0.6)} vectorEffect="non-scaling-stroke" />
                      )}
                    </svg>
                  )}
                </div>
              )}
            </div>

            {result && (
              <p className={nothing || result.points > MANY_POINTS ? 'separation-warn' : 'muted'}>
                {nothing
                  ? t('לא נמצאה צורה. הזיזו את סף הבהירות, או החליפו בין ״הכהה״ ל״הבהיר״.')
                  : `${t('{shapes} צורות, {holes} חורים, {points} נקודות עיגון.', { shapes: result.shapes, holes: result.holes, points: result.points })}${result.points > MANY_POINTS ? t(' יש הרבה נקודות — הגדילו את החלקות או את הסרת הכתמים.') : ''}`}
              </p>
            )}
            <p className="muted">
              {t('ההמרה מפרידה לפי בהירות ומציירת צבע אחד, ולכן מתאימה ללוגו או לשרטוט בצבע אחד על רקע פשוט. התוצאה היא צורה רגילה: אפשר לצבוע אותה, לשנות את גודלה בלי לאבד חדות, ולערוך את נקודותיה בכלי עריכת הנקודות.')}
            </p>

            <label className="page-bar-check">
              <input type="checkbox" checked={keepOriginal} onChange={(event) => setKeepOriginal(event.target.checked)} />
              {t('השאר גם את התמונה המקורית (מתחת לצורה)')}
            </label>
          </>
        )}

        <div className="modal-buttons">
          <button className="btn primary" disabled={!source || !result || nothing} onClick={() => source && result && onApply({ region: source.region, result, color, keepOriginal })}>
            {t('המר לווקטור')}
          </button>
          <button className="btn" onClick={onClose}>{t('ביטול')}</button>
        </div>
      </div>
    </div>
  )
}
