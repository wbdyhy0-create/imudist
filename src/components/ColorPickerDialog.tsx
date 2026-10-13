import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { cmykToRgb, hexToRgb, labToHex, rgbToCmyk, rgbToHex, rgbToLab } from '../colorModels'

interface Props {
  initial: string
  target: 'fill' | 'stroke'
  onApply: (color: string) => void
  onClose: () => void
}

interface HsvColor { hue: number; saturation: number; brightness: number }
interface HslColor { hue: number; saturation: number; lightness: number }

const rgbToHsv = ({ red, green, blue }: { red: number; green: number; blue: number }): HsvColor => {
  const values = [red, green, blue].map((value) => value / 255)
  const maximum = Math.max(...values)
  const minimum = Math.min(...values)
  const delta = maximum - minimum
  let hue = 0
  if (delta) {
    if (maximum === values[0]) hue = 60 * (((values[1] - values[2]) / delta) % 6)
    else if (maximum === values[1]) hue = 60 * ((values[2] - values[0]) / delta + 2)
    else hue = 60 * ((values[0] - values[1]) / delta + 4)
  }
  return { hue: (hue + 360) % 360, saturation: maximum ? (delta / maximum) * 100 : 0, brightness: maximum * 100 }
}

const hsvToRgb = ({ hue, saturation, brightness }: HsvColor) => {
  const saturationPart = saturation / 100
  const brightnessPart = brightness / 100
  const chroma = brightnessPart * saturationPart
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1))
  const match = brightnessPart - chroma
  const channels = hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x]
  return { red: (channels[0] + match) * 255, green: (channels[1] + match) * 255, blue: (channels[2] + match) * 255 }
}

const rgbToHsl = ({ red, green, blue }: { red: number; green: number; blue: number }): HslColor => {
  const channels = [red, green, blue].map((value) => value / 255)
  const maximum = Math.max(...channels)
  const minimum = Math.min(...channels)
  const delta = maximum - minimum
  const lightness = (maximum + minimum) / 2
  const saturation = !delta ? 0 : delta / (1 - Math.abs(2 * lightness - 1))
  const hsv = rgbToHsv({ red, green, blue })
  return { hue: hsv.hue, saturation: saturation * 100, lightness: lightness * 100 }
}

const hslToRgb = ({ hue, saturation, lightness }: HslColor) => {
  const saturationPart = saturation / 100
  const lightnessPart = lightness / 100
  const chroma = (1 - Math.abs(2 * lightnessPart - 1)) * saturationPart
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1))
  const match = lightnessPart - chroma / 2
  const channels = hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x]
  return { red: (channels[0] + match) * 255, green: (channels[1] + match) * 255, blue: (channels[2] + match) * 255 }
}

export function ColorPickerDialog({ initial, target, onApply, onClose }: Props) {
  const [model, setModel] = useState<'RGB' | 'CMYK' | 'LAB' | 'HSB' | 'HSL'>('RGB')
  const [color, setColorRaw] = useState(initial || '#0066ff')
  // the hue is remembered on its own: a grey / black / white has none of its own, so deriving it from the colour alone
  // made the picker snap back to red whenever the spectrum or a slider passed through zero saturation or brightness
  const [hue, setHue] = useState(() => rgbToHsv(hexToRgb(initial || '#0066ff')).hue)
  const setColor = (next: string) => {
    setColorRaw(next)
    if (/^#[0-9a-fA-F]{6}$/.test(next)) {
      const parts = rgbToHsv(hexToRgb(next))
      if (parts.saturation > 0.5 && parts.brightness > 0.5) setHue(parts.hue)
    }
  }
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null)
  // the hex field may hold a half-typed value while the person types: only a whole #rrggbb is ever applied
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : rgbToHex(hexToRgb(color))
  const rgb = hexToRgb(color)
  const cmyk = rgbToCmyk(rgb)
  const lab = rgbToLab(rgb)
  const hsv = rgbToHsv(rgb)
  const hsl = rgbToHsl(rgb)
  const values = model === 'CMYK'
    ? [{ key: 'cyan', label: 'ציאן', value: cmyk.cyan, min: 0, max: 100 }, { key: 'magenta', label: 'מג׳נטה', value: cmyk.magenta, min: 0, max: 100 }, { key: 'yellow', label: 'צהוב', value: cmyk.yellow, min: 0, max: 100 }, { key: 'black', label: 'שחור', value: cmyk.black, min: 0, max: 100 }]
    : model === 'RGB'
      ? [{ key: 'red', label: 'אדום', value: rgb.red, min: 0, max: 255 }, { key: 'green', label: 'ירוק', value: rgb.green, min: 0, max: 255 }, { key: 'blue', label: 'כחול', value: rgb.blue, min: 0, max: 255 }]
      : model === 'LAB'
        ? [{ key: 'lightness', label: 'בהירות', value: lab.lightness, min: 0, max: 100 }, { key: 'a', label: 'A', value: lab.a, min: -128, max: 128 }, { key: 'b', label: 'B', value: lab.b, min: -128, max: 128 }]
        : model === 'HSB'
          ? [{ key: 'hue', label: 'גוון', value: hue, min: 0, max: 360 }, { key: 'saturation', label: 'רוויה', value: hsv.saturation, min: 0, max: 100 }, { key: 'brightness', label: 'בהירות', value: hsv.brightness, min: 0, max: 100 }]
          : [{ key: 'hue', label: 'גוון', value: hue, min: 0, max: 360 }, { key: 'saturation', label: 'רוויה', value: hsl.saturation, min: 0, max: 100 }, { key: 'lightness', label: 'בהירות', value: hsl.lightness, min: 0, max: 100 }]
  const update = (key: string, value: number) => {
    if (model === 'CMYK') setColor(rgbToHex(cmykToRgb({ cyan: cmyk.cyan, magenta: cmyk.magenta, yellow: cmyk.yellow, black: cmyk.black, [key]: value })))
    else if (model === 'RGB') setColor(rgbToHex({ red: rgb.red, green: rgb.green, blue: rgb.blue, [key]: value }))
    else if (model === 'LAB') setColor(labToHex({ lightness: lab.lightness, a: lab.a, b: lab.b, [key]: value }))
    else if (model === 'HSB') setColor(rgbToHex(hsvToRgb({ hue: key === 'hue' ? value : hue, saturation: key === 'saturation' ? value : hsv.saturation, brightness: key === 'brightness' ? value : hsv.brightness })))
    else setColor(rgbToHex(hslToRgb({ hue: key === 'hue' ? value : hue, saturation: key === 'saturation' ? value : hsl.saturation, lightness: key === 'lightness' ? value : hsl.lightness })))
  }

  const chooseSpectrum = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const saturation = Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100))
    const brightness = Math.max(0, Math.min(100, (1 - (event.clientY - bounds.top) / bounds.height) * 100))
    setColor(rgbToHex(hsvToRgb({ hue: hue, saturation, brightness })))
  }
  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return
    event.preventDefault()
    drag.current = { x: event.clientX, y: event.clientY, originX: position.x, originY: position.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    setPosition({ x: drag.current.originX + event.clientX - drag.current.x, y: drag.current.originY + event.clientY - drag.current.y })
  }
  const endDrag = () => { drag.current = null }

  return (
    <div className="color-dialog-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="color-dialog" role="dialog" aria-modal="true" aria-label="בחירת צבע" style={{ transform: `translate(${position.x}px, ${position.y}px)` }}>
        <div className="color-dialog-head" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}><h2>בחירת צבע</h2><button className="setup-x" onClick={onClose} aria-label="סגור">×</button></div>
        <div className="color-dialog-body">
          <div className="color-dialog-preview">
            <div className="color-preview-large" style={{ background: color }} />
            <label>צבע שנבחר<input type="color" value={safeColor} onChange={(e) => setColor(e.target.value)} /></label>
            <label>ערך הקסדצימלי<input value={color} onChange={(e) => /^#[0-9a-f]{0,6}$/i.test(e.target.value) && setColor(e.target.value)} dir="ltr" /></label>
          </div>
          <div className="color-dialog-controls">
            <div className="color-spectrum" style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hue} 100% 50%))` }} onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); chooseSpectrum(e) }} onPointerMove={(e) => e.buttons === 1 && chooseSpectrum(e)} role="application" aria-label="בחירת צבע חזותית" />
            <input className="hue-slider" type="range" min={0} max={360} value={hue} onChange={(e) => { const next = Number(e.target.value); setHue(next); setColorRaw(rgbToHex(hsvToRgb({ hue: next, saturation: hsv.saturation, brightness: hsv.brightness }))) }} aria-label="גוון" />
            <label className="field-label" htmlFor="dialog-color-model">מודל צבע</label>
            <select id="dialog-color-model" className="select" value={model} onChange={(e) => setModel(e.target.value as typeof model)}>
              <option value="RGB">RGB — מסך</option>
              <option value="CMYK">CMYK — דפוס</option>
              <option value="LAB">LAB — דיוק חזותי</option>
              <option value="HSB">HSB — גוון, רוויה ובהירות</option>
              <option value="HSL">HSL — גוון, רוויה ובהירות</option>
            </select>
            <div className="color-dialog-values">
              {values.map((entry) => <label key={entry.key}>{entry.label}<input type="number" min={entry.min} max={entry.max} value={Math.round(entry.value)} onChange={(e) => update(entry.key, Number(e.target.value))} /></label>)}
            </div>
          </div>
        </div>
        <div className="color-dialog-foot">
          <span className="muted">יעד: {target === 'fill' ? 'מילוי' : 'קו'}</span>
          <div className="modal-buttons"><button className="btn primary" onClick={() => { onApply(safeColor); onClose() }}>אישור</button><button className="btn" onClick={onClose}>ביטול</button></div>
        </div>
      </div>
    </div>
  )
}
