import { t } from '../i18n'

/** One step of the outline width arrows: a quarter of a point up or down (the first step up from none is a quarter), at most 200. */
export function stepOutlineWidth(current: number, direction: -1 | 1): number {
  const next = direction > 0
    ? current === 0 ? 0.25 : (Math.floor(current * 4 + 1e-9) + 1) / 4
    : Math.max(0, (Math.ceil(current * 4 - 1e-9) - 1) / 4)
  return Math.min(200, next)
}

/** The width of the outline with its two arrows, as the top toolbar has it. */
export function OutlineWidthStepper({ value, onChange }: { value: number; onChange: (width: number) => void }) {
  return (
    <div className="context-outline-stepper" role="group" aria-label={t('עובי קו מתאר')}>
      <span>{Number(value.toFixed(2))}</span>
      <button type="button" aria-label={t('הגדל עובי קו מתאר')} title={t('הגדל עובי קו מתאר')} onMouseDown={(event) => event.preventDefault()} onClick={() => onChange(stepOutlineWidth(value, 1))}><svg viewBox="0 0 8 7" aria-hidden="true"><path d="M1 5 4 2 7 5" /></svg></button>
      <button type="button" aria-label={t('הקטן עובי קו מתאר')} title={t('הקטן עובי קו מתאר')} onMouseDown={(event) => event.preventDefault()} onClick={() => onChange(stepOutlineWidth(value, -1))}><svg viewBox="0 0 8 7" aria-hidden="true"><path d="m1 2 3 3 3-3" /></svg></button>
    </div>
  )
}

/**
 * The two squares of the top toolbar, fill and outline, as a switch between what the next colour is applied to: a click on a
 * square makes it the target. A text shows the letter (the outline one drawn hollow: a white line round a black inside), a shape
 * shows a square in its fill and a square with its line. With `onWidth`, the outline width arrows follow them.
 */
export function FillStrokeSwatches({
  kind,
  fill,
  stroke,
  strokeWidth = 0,
  active,
  onSelect,
  onWidth,
  label,
}: {
  kind: 'text' | 'shape'
  fill: string | null
  stroke: string | null
  strokeWidth?: number
  active: 'fill' | 'stroke'
  onSelect: (target: 'fill' | 'stroke') => void
  onWidth?: (width: number) => void
  label: string
}) {
  return (
    <div className="context-object-colors fill-stroke-swatches" role="radiogroup" aria-label={label}>
      <button
        type="button"
        role="radio"
        aria-checked={active === 'fill'}
        className={'context-color-preview context-fill-preview' + (active === 'fill' ? ' active' : '') + (kind === 'text' && fill === 'transparent' ? ' none' : '')}
        aria-label={t('צבע מילוי')}
        title={t('צבע מילוי')}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onSelect('fill')}
      >
        {kind === 'shape'
          ? <span className="context-shape-preview context-shape-fill" style={fill ? { backgroundColor: fill } : undefined} />
          : <span style={{ color: fill ?? '#ffffff' }}>{t('א')}</span>}
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={active === 'stroke'}
        className={'context-color-preview context-outline-preview' + (active === 'stroke' ? ' active' : '')}
        aria-label={t('צבע קו מתאר')}
        title={t('צבע קו מתאר')}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onSelect('stroke')}
      >
        {kind === 'shape'
          ? <span className="context-shape-preview context-shape-outline" style={{ borderColor: stroke ?? '#ffffff', borderWidth: `${Math.min(6, Math.max(1, (strokeWidth || 0.25) * 96 / 72))}px` }} />
          : <span>{t('א')}</span>}
      </button>
      {onWidth && <OutlineWidthStepper value={strokeWidth} onChange={onWidth} />}
    </div>
  )
}
