import { useEffect, useRef, useState, type ReactNode } from 'react'
import { DEFAULT_SHADOW_OFFSET, MAX_PAGE_PT, type LineArrow, type LineCap, type Sharpness, type ShapeFrame } from '../document'
import { LINE_ARROWS, LINE_PROFILES, MAX_LINE_WIDTH_MULTIPLE, type LineWidths } from '../lineProfile'
import { lineLook, SHARPNESS_LEVELS } from '../sharpness'
import type { Unit } from '../units'
import { NumberField } from './NumberField'

/** the sharpness level a line is at: blurred is soft, flat ends are sharp, round ones are medium (as the properties panel says it) */
const sharpnessOf = (shape: ShapeFrame): Sharpness => {
  if ((shape.blur ?? 0) > 0) return 'soft'
  return shape.strokeCap === 'round' || shape.strokeCap === 'square' ? 'medium' : 'sharp'
}

const MAX_BLUR_PT = 40

type MenuId = 'style' | 'profile' | 'effects' | 'place'

/**
 * What the Properties panel has for a line, in the top toolbar of the line, as menus that open (the colour and the weight are in
 * the toolbar's own first group): the style (pattern, ends, sharpness), the thickness along the line, the blur and the shadow,
 * and the position and size. One is open at a time; a click elsewhere or Escape closes it.
 */
export function LineToolbarControls({
  shape,
  unit,
  onChange,
  onGeometry,
}: {
  shape: ShapeFrame
  unit: Unit
  onChange: (patch: Partial<ShapeFrame>) => void
  onGeometry: (patch: Partial<ShapeFrame>) => void
}) {
  const [open, setOpen] = useState<MenuId | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: Event) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(null)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null)
    }
    document.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', close, true)
      window.removeEventListener('keydown', escape)
    }
  }, [open])

  const widths: LineWidths = shape.lineWidths ?? [1, 1, 1]
  const sameWidths = (a: LineWidths, b: LineWidths) => a.every((value, index) => Math.abs(value - b[index]!) < 0.005)
  const profileId = LINE_PROFILES.find((preset) => sameWidths(preset.widths, widths))?.id ?? 'custom'
  const setWidth = (index: number, percent: number) => {
    const next = [...widths] as LineWidths
    next[index] = Math.min(MAX_LINE_WIDTH_MULTIPLE, Math.max(0, percent / 100))
    onChange({ lineWidths: sameWidths(next, [1, 1, 1]) ? undefined : next })
  }
  const cap = (shape.strokeCap ?? 'butt') as LineCap
  const sharp = sharpnessOf(shape)
  const arrowKind: LineArrow = shape.arrowEnd ?? shape.arrowStart ?? 'triangle'
  const arrowPlace = shape.arrowStart && shape.arrowEnd ? 'both' : shape.arrowEnd ? 'end' : shape.arrowStart ? 'start' : 'none'
  const setArrows = (place: string, kind: LineArrow) => onChange({ arrowStart: place === 'start' || place === 'both' ? kind : undefined, arrowEnd: place === 'end' || place === 'both' ? kind : undefined })

  const menu = (id: MenuId, label: string, children: ReactNode) => (
    <div className="context-swatch-wrap line-menu">
      <button
        type="button"
        className={'context-command' + (open === id ? ' active' : '')}
        aria-expanded={open === id}
        aria-haspopup="true"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((current) => (current === id ? null : id))}
      >
        {label} <span aria-hidden="true">▾</span>
      </button>
      {open === id && <div className="context-swatch-popover line-menu-panel" role="group" aria-label={label}>{children}</div>}
    </div>
  )
  const row = (label: string, field: ReactNode) => (
    <div className="line-menu-row">
      <span>{label}</span>
      {field}
    </div>
  )
  const numberInput = (value: number, onValue: (value: number) => void, props: { min: number; max: number; step: number }) => (
    <input
      type="number"
      {...props}
      value={value}
      onChange={(event) => {
        const parsed = Number(event.target.value)
        if (event.target.value !== '' && Number.isFinite(parsed)) onValue(parsed)
      }}
    />
  )

  return (
    <div className="context-line-controls" ref={rootRef} role="group" aria-label="הגדרות הקו">
      {menu('style', 'סגנון הקו', (
        <>
          {row('תבנית', (
            <span className="context-seg" role="radiogroup" aria-label="תבנית הקו">
              <button type="button" role="radio" aria-checked={!shape.strokeDash} className={!shape.strokeDash ? 'on' : ''} onClick={() => onChange({ strokeDash: undefined })}>רציף</button>
              <button type="button" role="radio" aria-checked={shape.strokeDash === 'dashed'} className={shape.strokeDash === 'dashed' ? 'on' : ''} onClick={() => onChange({ strokeDash: 'dashed' })}>מקווקו</button>
            </span>
          ))}
          {row('קצוות', (
            <span className="context-seg" role="radiogroup" aria-label="צורת הקצוות">
              {(['butt', 'round', 'square'] as LineCap[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={cap === value}
                  className={cap === value ? 'on' : ''}
                  title={value === 'butt' ? 'קצה חד' : value === 'round' ? 'קצה עגול' : 'קצה מרובע'}
                  onClick={() => onChange({ strokeCap: value === 'butt' ? undefined : value })}
                >
                  {value === 'butt' ? 'חד' : value === 'round' ? 'עגול' : 'מרובע'}
                </button>
              ))}
            </span>
          ))}
          {row('חיצים', (
            <span className="context-seg" role="radiogroup" aria-label="מיקום החיצים">
              {([['none', 'ללא', 'בלי חיצים'], ['end', 'בסוף', 'חץ בסוף הקו'], ['start', 'בהתחלה', 'חץ בתחילת הקו'], ['both', 'שניהם', 'חיצים בשני הקצוות']] as const).map(([place, text, title]) => (
                <button key={place} type="button" role="radio" aria-checked={arrowPlace === place} className={arrowPlace === place ? 'on' : ''} title={title} onClick={() => setArrows(place, arrowKind)}>{text}</button>
              ))}
            </span>
          ))}
          {arrowPlace !== 'none' && row('צורת החץ', (
            <select value={arrowKind} onChange={(event) => setArrows(arrowPlace, event.target.value as LineArrow)}>
              {LINE_ARROWS.map((arrow) => <option key={arrow.id} value={arrow.id}>{arrow.label}</option>)}
            </select>
          ))}
          {row('חדות', (
            <select
              value={sharp}
              title="חד, בינוני (קצוות עגולים) או רך (טשטוש)"
              onChange={(event) => {
                const look = lineLook(event.target.value as Sharpness, shape.strokeWidth)
                onChange({ strokeCap: look.strokeCap === 'butt' ? undefined : look.strokeCap, blur: look.blur })
              }}
            >
              {SHARPNESS_LEVELS.map((level) => <option key={level.id} value={level.id} title={level.hint}>{level.label}</option>)}
            </select>
          ))}
        </>
      ))}
      {menu('profile', 'עובי לאורך הקו', (
        <>
          {row('צורה', (
            <select
              value={profileId}
              onChange={(event) => {
                const preset = LINE_PROFILES.find((item) => item.id === event.target.value)
                if (preset) onChange({ lineWidths: sameWidths(preset.widths, [1, 1, 1]) ? undefined : ([...preset.widths] as LineWidths) })
              }}
            >
              {profileId === 'custom' && <option value="custom">מותאם אישית</option>}
              {LINE_PROFILES.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
            </select>
          ))}
          {(['בהתחלה', 'באמצע', 'בסוף'] as const).map((label, index) =>
            <div key={label}>{row(`${label} (%)`, numberInput(Math.round(widths[index]! * 100), (value) => setWidth(index, value), { min: 0, max: MAX_LINE_WIDTH_MULTIPLE * 100, step: 5 }))}</div>,
          )}
        </>
      ))}
      {menu('effects', 'טשטוש והצללה', (
        <>
          {row('טשטוש (pt)', <NumberField value={shape.blur ?? 0} unit="px" unitLabel="pt" step={0.5} min={0} max={MAX_BLUR_PT} onChange={(value) => onChange({ blur: value > 0 ? value : undefined })} />)}
          {row('צבע הצללה', <input type="color" value={shape.shadowColor ?? '#000000'} onChange={(event) => onChange({ shadowColor: event.target.value })} />)}
          {row('חוזק הצללה (%)', numberInput(Math.round((shape.shadowOpacity ?? 0) * 100), (value) => onChange({ shadowOpacity: Math.min(1, Math.max(0, value / 100)) }), { min: 0, max: 100, step: 5 }))}
          {row('הזזה אופקית (pt)', numberInput(shape.shadowOffsetX ?? 0, (value) => onChange({ shadowOffsetX: value }), { min: -40, max: 40, step: 1 }))}
          {row('הזזה אנכית (pt)', numberInput(shape.shadowOffsetY ?? shape.shadowOffset ?? DEFAULT_SHADOW_OFFSET, (value) => onChange({ shadowOffsetY: value }), { min: -40, max: 40, step: 1 }))}
        </>
      ))}
      {menu('place', 'מיקום וגודל', (
        <>
          {row('מיקום X', <NumberField value={shape.x} unit={unit} min={-MAX_PAGE_PT} max={MAX_PAGE_PT} onChange={(x) => onGeometry({ x })} />)}
          {row('מיקום Y', <NumberField value={shape.y} unit={unit} min={-MAX_PAGE_PT} max={MAX_PAGE_PT} onChange={(y) => onGeometry({ y })} />)}
          {row('רוחב', <NumberField value={shape.w} unit={unit} min={0} max={MAX_PAGE_PT} onChange={(w) => onGeometry({ w })} />)}
          {row('גובה', <NumberField value={shape.h} unit={unit} min={0} max={MAX_PAGE_PT} onChange={(h) => onGeometry({ h })} />)}
        </>
      ))}
    </div>
  )
}
