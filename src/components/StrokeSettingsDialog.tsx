import { useState } from 'react'
import { formatLength, formatNumber, type Unit } from '../units'

interface Props {
  toolName: string
  value: number
  unit: Unit
  pencil?: PencilSettings
  onPencilChange?: (settings: PencilSettings) => void
  onApply: (value: number) => void
  onClose: () => void
}

export interface PencilSettings {
  fidelity: number
  smoothness: number
  cap: 'butt' | 'round'
  editSelected: boolean
  within: number
}

export function StrokeSettingsDialog({ toolName, value, unit, pencil, onPencilChange, onApply, onClose }: Props) {
  const [width, setWidth] = useState(value)
  const [settings, setSettings] = useState(pencil)
  const updateSettings = (patch: Partial<PencilSettings>) => setSettings((current) => current ? { ...current, ...patch } : current)

  return (
    <div className="modal-backdrop">
      <div className="modal stroke-settings" role="dialog" aria-modal="true" aria-label={`הגדרות כלי ${toolName}`}>
        <h2>הגדרות כלי {toolName}</h2>
        <div className="stroke-preview-wrap">
          <div className="stroke-preview" style={{ height: `${Math.max(1, Math.min(20, width))}px` }} />
        </div>
        <label className="field-label" htmlFor="stroke-width-range">
          עובי קו
        </label>
        <input
          id="stroke-width-range"
          className="stroke-range"
          type="range"
          min="0.25"
          max="20"
          step="0.25"
          value={width}
          onChange={(event) => setWidth(Number(event.target.value))}
        />
        <div className="stroke-values">
          <strong>{formatNumber(width)} px</strong>
          <span>{formatLength(width, unit)}</span>
        </div>
        {settings && (
          <div className="pencil-options">
            <label className="field-label" htmlFor="pencil-fidelity">נאמנות למסלול: {formatNumber(settings.fidelity)} px</label>
            <input id="pencil-fidelity" className="stroke-range" type="range" min="0.5" max="10" step="0.5" value={settings.fidelity} onChange={(event) => updateSettings({ fidelity: Number(event.target.value) })} />
            <label className="field-label" htmlFor="pencil-smoothness">החלקה: {Math.round(settings.smoothness)}%</label>
            <input id="pencil-smoothness" className="stroke-range" type="range" min="0" max="100" step="1" value={settings.smoothness} onChange={(event) => updateSettings({ smoothness: Number(event.target.value) })} />
            <div className="stroke-cap-buttons" role="group" aria-label="סיומת קו">
              <button className={settings.cap === 'butt' ? 'on' : ''} onClick={() => updateSettings({ cap: 'butt' })}>חדה</button>
              <button className={settings.cap === 'round' ? 'on' : ''} onClick={() => updateSettings({ cap: 'round' })}>עגולה</button>
            </div>
            <label className="pencil-check"><input type="checkbox" checked={settings.editSelected} onChange={(event) => updateSettings({ editSelected: event.target.checked })} />ערוך נתיב נבחר</label>
            <label className="field-label" htmlFor="pencil-within">טווח עריכה: {formatNumber(settings.within)} px</label>
            <input id="pencil-within" className="stroke-range" type="range" min="1" max="40" step="1" value={settings.within} onChange={(event) => updateSettings({ within: Number(event.target.value) })} />
          </div>
        )}
        <div className="modal-buttons">
          <button className="btn primary" onClick={() => { onApply(width); if (settings) onPencilChange?.(settings); onClose() }}>
            שמור
          </button>
          <button className="btn" onClick={onClose}>
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}
