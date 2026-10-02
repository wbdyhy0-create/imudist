import { FillPicker } from './FillPicker'

interface Props {
  offsetX: number
  offsetY: number
  opacity: number
  color: string
  onOffsetXChange: (value: number) => void
  onOffsetYChange: (value: number) => void
  onOpacityChange: (value: number) => void
  onColorChange: (value: string) => void
}

export function ShadowControls({ offsetX, offsetY, opacity, color, onOffsetXChange, onOffsetYChange, onOpacityChange, onColorChange }: Props) {
  return (
    <div className="shadow-controls">
      <label className="field-label">צבע הצללה</label>
      <FillPicker label="צבע הצללה" value={color} onChange={(next) => onColorChange(next ?? '#000000')} />
      <label className="field-label">הזזה אופקית: {offsetX} pt</label>
      <input aria-label="הזזה אופקית" type="range" min="-40" max="40" step="1" value={offsetX} onChange={(event) => onOffsetXChange(Number(event.target.value))} />
      <label className="field-label">הזזה אנכית: {offsetY} pt</label>
      <input aria-label="הזזה אנכית" type="range" min="-40" max="40" step="1" value={offsetY} onChange={(event) => onOffsetYChange(Number(event.target.value))} />
      <label className="field-label">חוזק הצללה: {Math.round(opacity * 100)}%</label>
      <input aria-label="חוזק הצללה" type="range" min="0" max="100" step="1" value={Math.round(opacity * 100)} onChange={(event) => onOpacityChange(Number(event.target.value) / 100)} />
    </div>
  )
}
