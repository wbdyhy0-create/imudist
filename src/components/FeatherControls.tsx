import type { Feather, GradientFeather } from '../document'

interface Props {
  feather?: Feather
  onChange: (feather?: Feather) => void
  onUseGradientTool: () => void
}

const DEFAULT_RADIUS = 12

function defaultGradient(): GradientFeather {
  return {
    type: 'gradient',
    x0: 0.5,
    y0: 0,
    x1: 0.5,
    y1: 1,
    points: [{ offset: 0, opacity: 1 }, { offset: 1, opacity: 0 }],
  }
}

export function FeatherControls({ feather, onChange, onUseGradientTool }: Props) {
  const mode = feather?.type ?? (feather ? 'gradient' : 'none')
  const selectMode = (next: 'none' | 'basic' | 'directional' | 'gradient') => {
    if (next === mode) return
    if (next === 'none') {
      if (feather) onChange(undefined)
    } else if (next === 'basic') {
      onChange(feather?.type === 'basic' ? feather : { type: 'basic', radius: feather?.type === 'directional' ? Math.max(feather.top, feather.right, feather.bottom, feather.left) : DEFAULT_RADIUS })
    } else if (next === 'directional') {
      onChange(feather?.type === 'directional'
        ? feather
        : { type: 'directional', top: feather?.type === 'basic' ? feather.radius : DEFAULT_RADIUS, right: feather?.type === 'basic' ? feather.radius : DEFAULT_RADIUS, bottom: feather?.type === 'basic' ? feather.radius : DEFAULT_RADIUS, left: feather?.type === 'basic' ? feather.radius : DEFAULT_RADIUS })
    } else {
      onChange(feather && mode === 'gradient' ? feather : defaultGradient())
    }
  }
  const setRadius = (radius: number) => {
    if (feather?.type === 'basic') onChange({ ...feather, radius })
  }
  const setEdge = (side: 'top' | 'right' | 'bottom' | 'left', value: number) => {
    if (feather?.type === 'directional') onChange({ ...feather, [side]: value })
  }

  return (
    <div className="feather-controls">
      <div className="place-modes" role="group" aria-label="סוג טשטוש הקצוות">
        <button type="button" className={mode === 'none' ? 'on' : ''} aria-pressed={mode === 'none'} onClick={() => selectMode('none')}>ללא</button>
        <button type="button" className={mode === 'basic' ? 'on' : ''} aria-pressed={mode === 'basic'} onClick={() => selectMode('basic')}>בסיסי</button>
        <button type="button" className={mode === 'directional' ? 'on' : ''} aria-pressed={mode === 'directional'} onClick={() => selectMode('directional')}>כיווני</button>
        <button type="button" className={mode === 'gradient' ? 'on' : ''} aria-pressed={mode === 'gradient'} onClick={() => selectMode('gradient')}>הדרגתי</button>
      </div>
      {feather?.type === 'basic' && (
        <label className="feather-range">
          <span>רדיוס טשטוש: {feather.radius} נק׳</span>
          <input aria-label="רדיוס טשטוש" type="range" min="0" max="100" step="1" value={feather.radius} onChange={(event) => setRadius(Number(event.target.value))} />
        </label>
      )}
      {feather?.type === 'directional' && (
        <div className="feather-edges">
          {([
            ['top', 'למעלה'],
            ['right', 'ימין'],
            ['bottom', 'למטה'],
            ['left', 'שמאל'],
          ] as const).map(([side, label]) => (
            <label key={side} className="feather-range">
              <span>טשטוש {label}: {feather[side]} נק׳</span>
              <input aria-label={`טשטוש ${label}`} type="range" min="0" max="100" step="1" value={feather[side]} onChange={(event) => setEdge(side, Number(event.target.value))} />
            </label>
          ))}
        </div>
      )}
      {mode === 'gradient' && (
        <>
          <p className="muted">גרור את כלי ההחלקה מהצד האטום אל הצד השקוף כדי לקבוע את הכיוון והמרחק.</p>
          <button type="button" className="btn small" onClick={onUseGradientTool}>עריכת כיוון המעבר</button>
        </>
      )}
    </div>
  )
}
