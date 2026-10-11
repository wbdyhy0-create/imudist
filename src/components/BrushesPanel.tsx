import { useEffect, useMemo, useRef, useState } from 'react'
import { BRUSH_STYLES, MAX_BRUSH_SIZE, MIN_BRUSH_SIZE, brushPolygons } from '../brushes'
import { customBrushPolygons, isCustomBrushId, MAX_CUSTOM_BRUSHES, previewBrush, type CustomBrush } from '../customBrushes'
import type { ColorSample, Sharpness } from '../document'
import { SHARPNESS_LEVELS } from '../sharpness'
import { FillPicker } from './FillPicker'
import { NumberField } from './NumberField'

/** the line each style is shown on: a gentle wave, long enough for a stroke's body, its ends and what splashes round it */
const PREVIEW_W = 132
const PREVIEW_H = 44
const WAVE: [number, number][] = Array.from({ length: 29 }, (_, i): [number, number] => {
  const t = i / 28
  return [10 + t * (PREVIEW_W - 20), PREVIEW_H / 2 + Math.sin(t * Math.PI * 2) * 9]
})
/** an imported brush is shown at this size whatever the size of the brush in hand is, so that the sliders do not redraw all of them */
const CUSTOM_PREVIEW_SIZE = 9
/** from this many imported brushes the list has a search field */
const SEARCH_FROM = 6

const pathOf = (polygons: [number, number][][][]): string =>
  polygons
    .map((polygon) => polygon.map((ring) => 'M' + ring.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L') + 'Z').join(''))
    .join('')

interface Props {
  /** a brush of the program (`BrushStyleId`) or an imported one (`custom:…`) */
  style: string
  size: number
  color: string
  samples: ColorSample[]
  /** how sharp the stroke is (the same control as on the toolbar above the canvas) */
  sharpness: Sharpness
  onSharpness: (level: Sharpness) => void
  /** the brushes that came from files */
  customs: CustomBrush[]
  /** what the last import said (a problem, or a note), shown under the import button */
  message: string | null
  /** a shape is selected: a brush can be put on its outline */
  canApply: boolean
  /** the brush tool is the tool in hand */
  toolActive: boolean
  onStyle: (id: string) => void
  onSize: (size: number) => void
  onColor: (color: string) => void
  onApply: () => void
  onUseTool: () => void
  onImport: (file: File) => void
  onRemoveCustom: (id: string) => void
  onChangeCustom: (id: string, patch: Partial<CustomBrush>) => void
}

export function BrushesPanel({ style, size, color, samples, sharpness, onSharpness, customs, message, canApply, toolActive, onStyle, onSize, onColor, onApply, onUseTool, onImport, onRemoveCustom, onChangeCustom }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const chosenTile = useRef<HTMLButtonElement | null>(null)
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const matches = (label: string) => needle === '' || label.toLowerCase().includes(needle)

  // the preview is drawn smaller than the brush, so that even the widest one is seen whole on its short line
  const previewSize = Math.round(Math.min(14, Math.max(3, size * 0.5)))
  const builtInPreviews = useMemo(() => new Map(BRUSH_STYLES.map((entry) => [entry.id as string, pathOf(brushPolygons(WAVE, entry.id, previewSize, 7))])), [previewSize])
  // an imported brush is drawn once, with a shape simplified for it, and again only when the way it draws changes
  const customCache = useRef(new Map<string, string>())
  const customPreview = (brush: CustomBrush): string => {
    const key = `${brush.id}|${brush.mode}|${brush.spacing}|${brush.rotate}|${brush.variation}`
    let found = customCache.current.get(key)
    if (found === undefined) {
      found = pathOf(customBrushPolygons(WAVE, previewBrush(brush), CUSTOM_PREVIEW_SIZE, 7))
      customCache.current.set(key, found)
    }
    return found
  }

  const chosen = isCustomBrushId(style) ? customs.find((brush) => brush.id === style) : undefined
  // the one in hand is brought into view when it was picked from outside the list (an import)
  useEffect(() => {
    chosenTile.current?.scrollIntoView?.({ block: 'nearest' })
  }, [style])

  const builtIn = BRUSH_STYLES.filter((entry) => matches(entry.label))
  const imported = customs.filter((brush) => matches(brush.name))

  const tile = (id: string, label: string, hint: string, d: string) => (
    <button
      key={id}
      ref={style === id ? chosenTile : undefined}
      type="button"
      role="radio"
      aria-checked={style === id}
      className={'brush-style' + (style === id ? ' on' : '')}
      title={hint ? `${label} — ${hint}` : label}
      onClick={() => onStyle(id)}
    >
      <svg viewBox={`0 0 ${PREVIEW_W} ${PREVIEW_H}`} aria-hidden="true">
        <path d={d} fill="currentColor" fillRule="evenodd" />
      </svg>
      <span>{label}</span>
    </button>
  )

  return (
    <div className="pages-panel brushes-panel" aria-label="מברשות">
      <h2 className="props-title">מברשות</h2>
      <p className="muted">בחרו סגנון וציירו בכלי המברשת. כל משיכה נשמרת כצורה וקטורית רגילה.</p>
      {customs.length > SEARCH_FROM && (
        <input type="search" className="brush-search" placeholder="חיפוש מברשת…" aria-label="חיפוש מברשת" value={query} onChange={(event) => setQuery(event.target.value)} />
      )}
      <div className="brush-list" role="radiogroup" aria-label="סגנון מברשת">
        {builtIn.length > 0 && (
          <>
            <h3 className="brush-group">מובנות</h3>
            <div className="brush-grid">{builtIn.map((entry) => tile(entry.id, entry.label, entry.hint, builtInPreviews.get(entry.id) ?? ''))}</div>
          </>
        )}
        {customs.length > 0 && imported.length > 0 && (
          <>
            <h3 className="brush-group">
              מקובץ <span className="muted">({imported.length === customs.length ? customs.length : `${imported.length} מתוך ${customs.length}`})</span>
            </h3>
            <div className="brush-grid">{imported.map((brush) => tile(brush.id, brush.name, brush.mode === 'stretch' ? 'נמתחת לאורך הקו' : 'חוזרת על הקו', customPreview(brush)))}</div>
          </>
        )}
        {builtIn.length === 0 && imported.length === 0 && <p className="muted brush-none">לא נמצאו מברשות בשם הזה.</p>}
      </div>

      <input
        ref={fileInput}
        type="file"
        hidden
        accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp,image/gif"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) onImport(file)
        }}
      />
      <button type="button" className="btn small brush-import" disabled={customs.length >= MAX_CUSTOM_BRUSHES} onClick={() => fileInput.current?.click()} title="צורה מקובץ SVG, PNG או JPG הופכת למברשת שחוזרת על הקו או נמתחת לאורכו">
        ייבוא מברשת מקובץ…
      </button>
      {message && (
        <p className="muted brush-message" role="status">
          {message}
        </p>
      )}

      {chosen && (
        <div className="brush-options">
          <div className="brush-name-row">
            <input type="text" className="brush-name" aria-label="שם המברשת" value={chosen.name} maxLength={60} onChange={(event) => onChangeCustom(chosen.id, { name: event.target.value })} />
            <button type="button" className="btn small" title="הסרת המברשת מהרשימה" onClick={() => onRemoveCustom(chosen.id)}>
              הסרה
            </button>
          </div>
          <div className="brush-modes" role="radiogroup" aria-label="אופן הציור">
            <button type="button" role="radio" aria-checked={chosen.mode === 'repeat'} className={'btn small' + (chosen.mode === 'repeat' ? ' on' : '')} onClick={() => onChangeCustom(chosen.id, { mode: 'repeat' })}>
              חוזרת על הקו
            </button>
            <button type="button" role="radio" aria-checked={chosen.mode === 'stretch'} className={'btn small' + (chosen.mode === 'stretch' ? ' on' : '')} onClick={() => onChangeCustom(chosen.id, { mode: 'stretch' })}>
              נמתחת לאורך הקו
            </button>
          </div>
          {chosen.mode === 'repeat' && (
            <>
              <label className="brush-field">
                <span>מרווח</span>
                <input type="range" min={0.2} max={4} step={0.1} value={chosen.spacing} onChange={(event) => onChangeCustom(chosen.id, { spacing: Number(event.target.value) })} aria-label="מרווח בין העותקים" />
              </label>
              <label className="brush-field">
                <span>שונות</span>
                <input type="range" min={0} max={1} step={0.05} value={chosen.variation} onChange={(event) => onChangeCustom(chosen.id, { variation: Number(event.target.value) })} aria-label="שונות בגודל ובסיבוב" />
              </label>
              <label className="brush-check">
                <input type="checkbox" checked={chosen.rotate} onChange={(event) => onChangeCustom(chosen.id, { rotate: event.target.checked })} />
                <span>סיבוב העותקים לכיוון הקו</span>
              </label>
            </>
          )}
        </div>
      )}

      <div className="brush-field brush-sharpness">
        <span>חדות</span>
        <div className="seg small" role="radiogroup" aria-label="חדות המברשת">
          {SHARPNESS_LEVELS.map((level) => (
            <button key={level.id} type="button" role="radio" aria-checked={sharpness === level.id} className={sharpness === level.id ? 'on' : ''} title={level.hint} onClick={() => onSharpness(level.id)}>
              {level.label}
            </button>
          ))}
        </div>
      </div>
      <label className="brush-field">
        <span>גודל</span>
        <input type="range" min={MIN_BRUSH_SIZE} max={MAX_BRUSH_SIZE} step={1} value={size} onChange={(event) => onSize(Number(event.target.value))} aria-label="גודל המברשת" />
        <NumberField ariaLabel="גודל המברשת בנקודות" value={size} unit="px" unitLabel="pt" step={1} min={MIN_BRUSH_SIZE} max={MAX_BRUSH_SIZE} live onChange={onSize} />
      </label>
      <div className="brush-field brush-color">
        <span>צבע</span>
        <FillPicker value={color} label="צבע המברשת" samples={samples} allowNone={false} onChange={(next) => { if (next) onColor(next) }} />
      </div>
      <div className="brush-actions">
        {!toolActive && <button type="button" className="btn small" onClick={onUseTool}>בחירת כלי המברשת</button>}
        <button type="button" className="btn small" disabled={!canApply} onClick={onApply} title="הקו של הצורה הנבחרת מוחלף בקו מברשת בסגנון ובגודל שנבחרו">
          החלת המברשת על הצורה הנבחרת
        </button>
      </div>
    </div>
  )
}
