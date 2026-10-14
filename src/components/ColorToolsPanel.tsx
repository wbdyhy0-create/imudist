import { useEffect, useRef, useState, type DragEvent as ReactDragEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { CharStyle, ColorSample, GradientFill, ShapeFrame } from '../document'
import { cmykToRgb, hexToRgb, labToHex, rgbToCmyk, rgbToHex, rgbToLab, tintHex, type ColorModel } from '../colorModels'
import { FillPicker } from './FillPicker'
import { FillStrokeSwatches } from './FillStrokeSwatches'
import { ColorLibrary } from './ColorLibrary'
import { Group } from './PropertiesPanel'
import { t } from '../i18n'

interface Props {
  tool: 'color' | 'gradient' | 'swatches'
  shape: ShapeFrame | null
  selectedShapes?: ShapeFrame[]
  textStyle?: CharStyle | null
  textId?: string | null
  onShape: (patch: Partial<ShapeFrame>) => void
  onTextColor?: (color: string) => void
  onTextOutlineColor?: (color: string) => void
  onTextOutlineWidth?: (width: number) => void
  textColorTarget?: 'fill' | 'outline'
  onTextColorTarget?: (target: 'fill' | 'outline') => void
  target: 'fill' | 'stroke'
  onTarget: (target: 'fill' | 'stroke') => void
  samples: ColorSample[]
  onStartSampler: () => void
  onDeleteSample: (id: string) => void
  onSelectBrushColor: (color: string) => void
  brushColor?: string | null
  brushRadius?: number
  onBrushRadiusChange?: (radius: number) => void
  brushStrength?: number
  onBrushStrengthChange?: (strength: number) => void
  onExitBrush?: () => void
}

interface Swatch { name: string; color: string | null; kind: 'תהליך' | 'ספוט'; global: boolean }

const INITIAL_SWATCHES: Swatch[] = [
  { name: 'ללא', color: null, kind: 'תהליך', global: false },
  { name: 'סימון התאמה', color: '#000000', kind: 'ספוט', global: true },
  { name: 'נייר', color: '#ffffff', kind: 'תהליך', global: true },
  { name: 'שחור', color: '#000000', kind: 'תהליך', global: true },
  { name: 'ציאן', color: '#00ffff', kind: 'תהליך', global: true },
  { name: 'מג׳נטה', color: '#ff00ff', kind: 'תהליך', global: true },
  { name: 'צהוב', color: '#ffff00', kind: 'תהליך', global: true },
  { name: 'כחול', color: '#0066ff', kind: 'תהליך', global: false },
  { name: 'ירוק', color: '#00a651', kind: 'תהליך', global: false },
  { name: 'אדום', color: '#ed1c24', kind: 'תהליך', global: false },
]

const DEFAULT_GRADIENT: GradientFill = { type: 'linear', start: '#ffffff', end: '#0066ff', stops: [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#0066ff' }] }
const normalizedGradient = (value: GradientFill): GradientFill => value.stops?.length ? value : { ...value, stops: [{ offset: 0, color: value.start }, { offset: 1, color: value.end }] }

export function ColorToolsPanel({ tool, shape, selectedShapes, textStyle, textId, onShape, onTextColor, onTextOutlineColor, onTextOutlineWidth, textColorTarget = 'fill', onTextColorTarget, target, onTarget, samples, onStartSampler, onDeleteSample, onSelectBrushColor, brushColor, brushRadius = 12, onBrushRadiusChange, brushStrength = 100, onBrushStrengthChange, onExitBrush }: Props) {
  const shapeTargets = selectedShapes?.length ? selectedShapes : shape ? [shape] : []
  const targetShape = shapeTargets[0] ?? null
  const shapeSelectionKey = shapeTargets.map((item) => item.id).join('|')
  const [model, setModel] = useState<ColorModel>('CMYK')
  const isTextTarget = !!textId && !!onTextColor
  const textTargetColor = textColorTarget === 'outline' ? textStyle?.outlineColor ?? '#000000' : textStyle?.color ?? '#111111'
  const initialColor = isTextTarget ? textTargetColor : targetShape?.fill ?? '#0066ff'
  const [color, setColor] = useState(initialColor)
  const [baseColor, setBaseColor] = useState<string | null>(initialColor)
  const baseColors = useRef({ fill: targetShape?.fill ?? '#0066ff', stroke: targetShape?.stroke ?? '#000000' })
  const [tint, setTint] = useState(100)
  const [opacity, setOpacity] = useState(targetShape?.opacity ?? 1)
  const [gradient, setGradient] = useState<GradientFill>(normalizedGradient(targetShape?.fillGradient ?? DEFAULT_GRADIENT))
  const [swatches, setSwatches] = useState(INITIAL_SWATCHES)
  const activeStopDrag = useRef<{ index: number; pointerId: number; startY: number } | null>(null)
  const deleteStopCandidate = useRef<number | null>(null)
  const [deleteStopIndex, setDeleteStopIndex] = useState<number | null>(null)
  const [dragOverRamp, setDragOverRamp] = useState(false)

  useEffect(() => {
    baseColors.current = { fill: targetShape?.fill ?? '#0066ff', stroke: targetShape?.stroke ?? '#000000' }
    // the panel stays open while the selection moves to another shape: show that shape's colours, not the last one's
    const selectedColor = isTextTarget ? textTargetColor : baseColors.current[target]
    setBaseColor(selectedColor)
    setColor(selectedColor)
    setOpacity(targetShape?.opacity ?? 1)
    setTint(100)
    if (targetShape?.fillGradient) setGradient(normalizedGradient(targetShape.fillGradient))
  }, [shapeSelectionKey, targetShape?.id, textId, textTargetColor, textColorTarget])

  useEffect(() => {
    const targetColor = isTextTarget ? textTargetColor : baseColors.current[target]
    setBaseColor(targetColor)
    setColor(targetColor)
  }, [target, textTargetColor, textColorTarget])

  const title = tool === 'color' ? t('צבע') : tool === 'gradient' ? t('מעבר צבע') : t('דוגמיות צבע')
  const applyColor = (next: string | null, tintValue = tint) => {
    setBaseColor(next)
    setColor(next ?? '#000000')
    baseColors.current[target] = next ?? '#000000'
    if (isTextTarget) {
      const applied = next ? tintHex(next, tintValue) : '#000000'
      if (textColorTarget === 'outline') onTextOutlineColor?.(applied)
      else onTextColor?.(applied)
      return
    }
    onShape(target === 'fill' ? { fill: next ? tintHex(next, tintValue) : null, fillGradient: undefined } : { stroke: next ? tintHex(next, tintValue) : null })
  }
  const applyTint = (value: number) => {
    setTint(value)
    if (!baseColor) return
    const tinted = tintHex(baseColor, value)
    if (isTextTarget && textColorTarget === 'outline') onTextOutlineColor?.(tinted)
    else if (isTextTarget) onTextColor?.(tinted)
    else if (targetShape) onShape(target === 'fill' ? { fill: tinted } : { stroke: tinted })
  }
  const updateGradient = (patch: Partial<GradientFill>) => {
    const next = { ...gradient, ...patch }
    setGradient(next)
    if (targetShape) onShape({ fill: null, fillGradient: next })
  }
  const updateStop = (index: number, patch: Partial<{ offset: number; color: string }>) => {
    const stops = (gradient.stops ?? [{ offset: 0, color: gradient.start }, { offset: 1, color: gradient.end }]).map((stop, stopIndex) => stopIndex === index ? { ...stop, ...patch } : stop)
    updateGradient({ stops, start: stops[0].color, end: stops[stops.length - 1].color })
  }
  const moveStop = (index: number, event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.parentElement?.getBoundingClientRect()
    if (!bounds || bounds.width === 0) return
    const stops = gradient.stops ?? [{ offset: 0, color: gradient.start }, { offset: 1, color: gradient.end }]
    const minimum = index === 0 ? 0 : stops[index - 1].offset
    const maximum = index === stops.length - 1 ? 1 : stops[index + 1].offset
    const offset = Math.max(minimum, Math.min(maximum, (event.clientX - bounds.left) / bounds.width))
    updateStop(index, { offset })
  }
  const moveStopByKey = (index: number, event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const stops = gradient.stops ?? [{ offset: 0, color: gradient.start }, { offset: 1, color: gradient.end }]
    const minimum = index === 0 ? 0 : stops[index - 1].offset
    const maximum = index === stops.length - 1 ? 1 : stops[index + 1].offset
    const step = event.shiftKey ? 0.05 : 0.01
    const offset = event.key === 'Home'
      ? minimum
      : event.key === 'End'
        ? maximum
        : Math.max(minimum, Math.min(maximum, stops[index].offset + (event.key === 'ArrowRight' ? step : -step)))
    updateStop(index, { offset })
  }
  const addStop = () => {
    const stops = [...(gradient.stops ?? [{ offset: 0, color: gradient.start }, { offset: 1, color: gradient.end }])]
    stops.splice(Math.max(1, stops.length - 1), 0, { offset: 0.5, color: '#888888' })
    updateGradient({ stops })
  }
  const removeStop = (index: number) => {
    const stops = (gradient.stops ?? []).filter((_, stopIndex) => stopIndex !== index)
    if (stops.length < 2) return
    updateGradient({ stops, start: stops[0].color, end: stops[stops.length - 1].color })
  }
  const colorFromDrop = (event: ReactDragEvent<HTMLElement>) => {
    const color = event.dataTransfer.getData('application/x-imudist-color') || event.dataTransfer.getData('text/plain')
    return /^#[\dA-F]{6}$/i.test(color) ? color : null
  }
  const addSampleStop = (color: string, offset: number) => {
    const stops = [...(gradient.stops ?? [{ offset: 0, color: gradient.start }, { offset: 1, color: gradient.end }]), { offset, color }]
      .sort((a, b) => a.offset - b.offset)
    updateGradient({ stops, start: stops[0].color, end: stops[stops.length - 1].color })
  }
  const startStopDrag = (index: number, event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    activeStopDrag.current = { index, pointerId: event.pointerId, startY: event.clientY }
    deleteStopCandidate.current = null
    setDeleteStopIndex(null)
  }
  const dragStop = (index: number, event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = activeStopDrag.current
    if (!drag || drag.index !== index || drag.pointerId !== event.pointerId || event.buttons !== 1) return
    event.stopPropagation()
    const canRemove = (gradient.stops?.length ?? 0) > 2
    const deleteCandidate = canRemove && event.clientY - drag.startY >= 24
    if (deleteCandidate) {
      deleteStopCandidate.current = index
      setDeleteStopIndex(index)
      return
    }
    deleteStopCandidate.current = null
    setDeleteStopIndex(null)
    moveStop(index, event)
  }
  const finishStopDrag = (index: number, event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const drag = activeStopDrag.current
    if (!drag || drag.index !== index || drag.pointerId !== event.pointerId) return
    const deleteStop = !cancelled && deleteStopCandidate.current === index
    activeStopDrag.current = null
    deleteStopCandidate.current = null
    setDeleteStopIndex(null)
    if (deleteStop) removeStop(index)
  }
  const addSwatch = () => setSwatches((current) => [...current, { name: t('צבע {n1}', { n1: current.length + 1 }), color, kind: 'תהליך', global: false }])
  const applySwatch = (swatch: Swatch) => applyColor(swatch.color)

  const rgb = hexToRgb(color)
  const cmyk = rgbToCmyk(rgb)
  const lab = rgbToLab(rgb)
  const setModelValue = (field: string, value: number) => {
    if (model === 'CMYK') {
      const next = { cyan: cmyk.cyan, magenta: cmyk.magenta, yellow: cmyk.yellow, black: cmyk.black, [field]: value }
      applyColor(rgbToHex(cmykToRgb(next)))
    } else if (model === 'RGB') {
      const next = { red: rgb.red, green: rgb.green, blue: rgb.blue, [field]: value }
      applyColor(rgbToHex(next))
    } else {
      const next = { lightness: lab.lightness, a: lab.a, b: lab.b, [field]: value }
      applyColor(labToHex(next))
    }
  }
  const values = model === 'CMYK'
    ? [{ key: 'cyan', get label() { return t('ציאן') }, value: cmyk.cyan, max: 100 }, { key: 'magenta', get label() { return t('מג׳נטה') }, value: cmyk.magenta, max: 100 }, { key: 'yellow', get label() { return t('צהוב') }, value: cmyk.yellow, max: 100 }, { key: 'black', get label() { return t('שחור') }, value: cmyk.black, max: 100 }]
    : model === 'RGB'
      ? [{ key: 'red', get label() { return t('אדום') }, value: rgb.red, max: 255 }, { key: 'green', get label() { return t('ירוק') }, value: rgb.green, max: 255 }, { key: 'blue', get label() { return t('כחול') }, value: rgb.blue, max: 255 }]
      : [{ key: 'lightness', get label() { return t('בהירות') }, value: lab.lightness, max: 100 }, { key: 'a', label: 'A', value: lab.a, max: 128 }, { key: 'b', label: 'B', value: lab.b, max: 128 }]

  return (
    <aside className="props-panel color-tools-panel" aria-label={title}>
      <h2 className="props-title">{title}</h2>
      <Group title={t('דגימות שנדגמו')}>
        <button className="btn small color-sample-start" onClick={onStartSampler}>{brushColor ? t('דגום צבע אחר') : t('דגום צבע')}</button>
        {brushColor && (
          <div className="color-brush-active">
            <span className="color-sample-chip" style={{ background: brushColor }} />
            <span>{t('מברשת פעילה — גרור על תמונה')}</span>
            <button className="btn small" onClick={onExitBrush}>{t('סיום')}</button>
          </div>
        )}
        {brushColor && onBrushRadiusChange && (
          <label className="color-brush-size">
            <span>{t('גודל המברשת')}</span>
            <input aria-label={t('גודל המברשת')} type="range" min="1" max="400" value={Math.min(400, brushRadius)} onChange={(event) => onBrushRadiusChange(Number(event.currentTarget.value))} />
            <output>{brushRadius}</output>
          </label>
        )}
        {brushColor && onBrushStrengthChange && (
          <label className="color-brush-size">
            <span>{t('חוזק הצבע')}</span>
            <input aria-label={t('חוזק הצבע')} type="range" min="0" max="100" value={brushStrength} onChange={(event) => onBrushStrengthChange(Number(event.currentTarget.value))} />
            <output>{brushStrength}%</output>
          </label>
        )}
        {samples.length === 0 ? <p className="muted color-samples-empty">{t('אין דגימות במסמך.')}</p> : (
          <div className="color-samples-list">
            {samples.map((sample) => (
              <div className="color-sample-row" key={sample.id}>
                <button className={`color-sample-apply${brushColor === sample.color ? ' brush-selected' : ''}`} aria-pressed={brushColor === sample.color} draggable onDragStart={(event) => { event.dataTransfer.setData('application/x-imudist-color', sample.color); event.dataTransfer.setData('text/plain', sample.color); event.dataTransfer.effectAllowed = 'copy' }} onClick={() => {
                  if (brushColor) onSelectBrushColor(sample.color)
                  else { setTint(100); applyColor(sample.color, 100) }
                }} title={brushColor ? t('בחר {n1} למברשת', { n1: sample.color }) : t('החל {n1}', { n1: sample.color })}>
                  <span className="color-sample-chip" style={{ background: sample.color }} />
                  <span className="color-sample-label">{sample.label}</span>
                  <bdi className="color-sample-hex" dir="ltr">{sample.color}</bdi>
                </button>
                <button className="icon-button color-sample-delete" aria-label={t('מחק דגימה {n1}', { n1: sample.label })} title={t('מחק דגימה')} onClick={() => onDeleteSample(sample.id)}>×</button>
              </div>
            ))}
          </div>
        )}
      </Group>
      {shapeTargets.length > 1 && <p className="muted">{t('השינוי יחול על {count} הצורות שנבחרו.', { count: shapeTargets.length })}</p>}
      {!targetShape && !isTextTarget && tool !== 'gradient' ? <p className="muted">{t('צבע שנבחר יחול על הצורה הבאה שתיצור.')}</p> : tool === 'gradient' && isTextTarget ? (
        <Group title={t('מעבר צבע')}><p className="muted">{t('מעבר צבע זמין לצורות; צבע הטקסט הנבחר הוא אחיד.')}</p></Group>
      ) : tool === 'gradient' ? (
        <>
        <Group title={t('מעבר צבע')}>
          <label className="field-label" htmlFor="gradient-type">{t('סוג מעבר')}</label>
          <select id="gradient-type" className="select" value={gradient.type} onChange={(e) => updateGradient({ type: e.target.value as GradientFill['type'] })}>
            <option value="linear">{t('קווי')}</option>
            <option value="radial">{t('מעגלי')}</option>
          </select>
          <div className="gradient-preview" style={{ background: gradient.type === 'radial'
            ? `radial-gradient(${(gradient.stops ?? []).map((stop) => `${stop.color} ${stop.offset * 100}%`).join(', ')})`
            : `linear-gradient(${90 - (gradient.angle ?? 0) + (gradient.reverse ? 180 : 0)}deg, ${(gradient.stops ?? []).map((stop) => `${stop.color} ${stop.offset * 100}%`).join(', ')})` }} />
          {gradient.type === 'linear' && <label className="field-label" htmlFor="gradient-angle">{t('זווית: {angle}°', { angle: gradient.angle ?? 0 })}</label>}
          {gradient.type === 'linear' && <input id="gradient-angle" type="range" min={0} max={359} value={((gradient.angle ?? 0) + 360) % 360} onChange={(e) => updateGradient({ angle: Number(e.target.value) })} aria-label={t('זווית מעבר הצבע')} />}
          <div
            className={'gradient-ramp' + (dragOverRamp ? ' drag-over' : '')}
            style={{ background: `linear-gradient(90deg, ${(gradient.stops ?? []).map((stop) => `${stop.color} ${stop.offset * 100}%`).join(', ')})` }}
            aria-label={t('רמפת מעבר צבע')}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes('application/x-imudist-color') && !event.dataTransfer.types.includes('text/plain')) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
              setDragOverRamp(true)
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOverRamp(false)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setDragOverRamp(false)
              const droppedColor = colorFromDrop(event)
              const bounds = event.currentTarget.getBoundingClientRect()
              if (droppedColor && bounds.width > 0) addSampleStop(droppedColor, Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)))
            }}
          >
            {(gradient.stops ?? []).map((stop, index) => (
              <div
                key={index}
                className={'gradient-stop' + (deleteStopIndex === index ? ' delete-armed' : '')}
                style={{ left: `${stop.offset * 100}%`, background: stop.color }}
                title={deleteStopIndex === index ? t('שחרר כדי למחוק עצירה') : t('עצירה {n1} · {n2}%', { n1: index + 1, n2: Math.round(stop.offset * 100) })}
                role="slider"
                tabIndex={0}
                aria-label={t('מיקום עצירה {n1}', { n1: index + 1 })}
                aria-valuemin={Math.round((gradient.stops?.[index - 1]?.offset ?? 0) * 100)}
                aria-valuemax={Math.round((gradient.stops?.[index + 1]?.offset ?? 1) * 100)}
                aria-valuenow={Math.round(stop.offset * 100)}
                aria-orientation="horizontal"
                onPointerDown={(event) => startStopDrag(index, event)}
                onPointerMove={(event) => dragStop(index, event)}
                onPointerUp={(event) => finishStopDrag(index, event)}
                onPointerCancel={(event) => finishStopDrag(index, event, true)}
                onKeyDown={(event) => moveStopByKey(index, event)}
                onDragOver={(event) => {
                  if (!event.dataTransfer.types.includes('application/x-imudist-color') && !event.dataTransfer.types.includes('text/plain')) return
                  event.preventDefault()
                  event.stopPropagation()
                  event.dataTransfer.dropEffect = 'copy'
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setDragOverRamp(false)
                  const droppedColor = colorFromDrop(event)
                  if (droppedColor) updateStop(index, { color: droppedColor })
                }}
              />
            ))}
          </div>
          <div className="gradient-stop-list">
            {(gradient.stops ?? []).map((stop, index) => (
              <div className="gradient-stop-editor" key={`${index}-editor`}>
                <input type="color" value={stop.color} onChange={(e) => updateStop(index, { color: e.target.value })} aria-label={t('צבע עצירה {n1}', { n1: index + 1 })} />
                <input type="number" min={0} max={100} value={Math.round(stop.offset * 100)} onChange={(e) => updateStop(index, { offset: Number(e.target.value) / 100 })} aria-label={t('מיקום עצירה {n1}', { n1: index + 1 })} />
                {(gradient.stops?.length ?? 0) > 2 && <button className="icon-button" onClick={() => removeStop(index)} aria-label={t('מחק עצירה')}>×</button>}
              </div>
            ))}
          </div>
          <div className="props-buttons"><button className="btn small" onClick={addStop}>{t('הוסף עצירה')}</button></div>
          <label className="page-bar-check"><input type="checkbox" checked={!!gradient.reverse} onChange={(e) => updateGradient({ reverse: e.target.checked })} />{t('הפוך מעבר')}</label>
        </Group>
        <Group title={t('ספריית מעברים')}>
          <ColorLibrary mode="gradients" onGradient={(next) => updateGradient(next)} />
        </Group>
        </>
      ) : (
        <>
          <Group title={isTextTarget ? t('יעד צבע') : t('מילוי וקו')}>
            {isTextTarget
              ? <FillStrokeSwatches kind="text" fill={textStyle?.color ?? '#ffffff'} stroke={textStyle?.outlineColor ?? '#000000'} strokeWidth={textStyle?.outlineWidth ?? 0} onWidth={onTextOutlineWidth} active={textColorTarget === 'outline' ? 'stroke' : 'fill'} onSelect={(next) => onTextColorTarget?.(next === 'stroke' ? 'outline' : 'fill')} label={t('החל צבע על טקסט')} />
              : <FillStrokeSwatches kind="shape" fill={targetShape?.fill ?? null} stroke={targetShape?.stroke ?? null} strokeWidth={targetShape?.strokeWidth ?? 0} onWidth={targetShape ? (strokeWidth) => onShape({ strokeWidth }) : undefined} active={target} onSelect={onTarget} label={t('החל צבע על')} />}
          </Group>
          <Group title={t('דוגמיות צבע')}>
            <FillPicker label={t('דוגמיות צבע')} value={isTextTarget ? textTargetColor : target === 'fill' ? targetShape?.fill ?? null : targetShape?.stroke ?? null} onChange={applyColor} />
          </Group>
          <Group title={t('מודל צבע')}>
            <select className="select" value={model} onChange={(e) => setModel(e.target.value as ColorModel)}>
              <option value="CMYK">{t('CMYK — דפוס')}</option>
              <option value="RGB">{t('RGB — מסך')}</option>
              <option value="LAB">{t('LAB — דיוק חזותי')}</option>
            </select>
            <div className="color-values">
              {values.map((entry) => <label key={entry.key}>{entry.label}<input type="number" min={-128} max={entry.max} value={Math.round(entry.value)} onChange={(e) => setModelValue(entry.key, Number(e.target.value))} /></label>)}
            </div>
            <label className="color-hex">{t('ערך מסך')} <input type="color" value={color} onChange={(e) => applyColor(e.target.value)} /></label>
            <label className="field-label" htmlFor="color-tint">{t('גוון: {percent}%', { percent: tint })}</label>
            <input id="color-tint" type="range" min={0} max={100} value={tint} onChange={(e) => applyTint(Number(e.target.value))} />
            {!isTextTarget && <><label className="field-label" htmlFor="color-opacity">{t('שקיפות: {percent}%', { percent: Math.round(opacity * 100) })}</label>
            <input id="color-opacity" type="range" min={0} max={100} value={Math.round(opacity * 100)} onChange={(e) => { const next = Number(e.target.value) / 100; setOpacity(next); onShape({ opacity: next }) }} /></>}
          </Group>
        </>
      )}
      {tool === 'swatches' && (targetShape || isTextTarget) && <>
        <Group title={t('ספריית צבעים')}>
          <ColorLibrary mode={isTextTarget ? 'solids' : 'all'} onColor={(next) => applyColor(next)} onGradient={(next) => { onTarget('fill'); updateGradient(next) }} />
        </Group>
        <Group title={t('דוגמיות המסמך')}>
          <div className="swatches-manager">
            {swatches.map((swatch) => <button key={swatch.name} className="managed-swatch" title={`${t(swatch.kind)}${swatch.global ? t(' · גלובלי') : ''}`} onClick={() => applySwatch(swatch)}><span style={{ background: swatch.color ?? 'transparent' }} />{t(swatch.name)}</button>)}
          </div>
          <button className="btn small" onClick={addSwatch}>{t('הוסף את הצבע הנוכחי')}</button>
        </Group>
      </>}
    </aside>
  )
}
