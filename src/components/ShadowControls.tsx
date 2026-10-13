import { FillPicker } from './FillPicker'
import { t } from '../i18n'

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
      <label className="field-label">{t('צבע הצללה')}</label>
      <FillPicker label={t('צבע הצללה')} value={color} onChange={(next) => onColorChange(next ?? '#000000')} />
      <label className="field-label">{t('הזזה אופקית: {value} pt', { value: offsetX })}</label>
      <input aria-label={t('הזזה אופקית')} type="range" min="-40" max="40" step="1" value={offsetX} onChange={(event) => onOffsetXChange(Number(event.target.value))} />
      <label className="field-label">{t('הזזה אנכית: {value} pt', { value: offsetY })}</label>
      <input aria-label={t('הזזה אנכית')} type="range" min="-40" max="40" step="1" value={offsetY} onChange={(event) => onOffsetYChange(Number(event.target.value))} />
      <label className="field-label">{t('חוזק הצללה: {percent}%', { percent: Math.round(opacity * 100) })}</label>
      <input aria-label={t('חוזק הצללה')} type="range" min="0" max="100" step="1" value={Math.round(opacity * 100)} onChange={(event) => onOpacityChange(Number(event.target.value) / 100)} />
    </div>
  )
}
