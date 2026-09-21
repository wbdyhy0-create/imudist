import { useState, type KeyboardEvent } from 'react'
import { formatLength, formatNumber, fromPt, parseLength, toPt, type Unit } from '../units'

interface Props {
  id?: string
  ariaLabel?: string
  /** points when `unit` is given, otherwise a plain integer */
  value: number
  onChange: (value: number) => void
  unit?: Unit
  /** replaces the unit's short name in the display (e.g. "pt" for font sizes, which are px == pt) */
  unitLabel?: string
  /** how much the arrows and the up / down keys change the value, in the displayed unit (default: 1 mm, 0.1 cm / in) */
  step?: number
  min?: number
  max?: number
}

const STEP: Record<Unit, number> = { px: 1, mm: 1, cm: 0.1, in: 0.1 }

export function NumberField({ id, ariaLabel, value, onChange, unit, unitLabel, step: stepSize, min = 0, max = Infinity }: Props) {
  // non-null while the user is typing
  const [text, setText] = useState<string | null>(null)
  const display = unit
    ? unitLabel
      ? `${formatNumber(fromPt(value, unit))} ${unitLabel}`
      : formatLength(value, unit)
    : String(value)

  const clamp = (v: number) => Math.min(max, Math.max(min, v))

  const commit = (raw: string) => {
    const parsed = unit ? parseLength(raw, unit) : /^\s*\d+\s*$/.test(raw) ? parseInt(raw, 10) : null
    if (parsed !== null) onChange(clamp(parsed))
  }

  const bump = (dir: 1 | -1, big: boolean) => {
    const step = (stepSize ?? (unit ? STEP[unit] : 1)) * (big ? 10 : 1)
    const next = unit ? toPt(fromPt(value, unit) + dir * step, unit) : value + dir * step
    onChange(clamp(next))
    setText(null)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur()
    else if (e.key === 'Escape') {
      setText(null)
      e.currentTarget.blur()
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      bump(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey)
    }
  }

  return (
    <div className="num-field">
      <div className="steppers">
        <button tabIndex={-1} aria-label="הגדל" onMouseDown={(e) => e.preventDefault()} onClick={() => bump(1, false)}>
          <svg viewBox="0 0 10 6"><path d="M1 5 5 1l4 4" fill="none" stroke="currentColor" strokeWidth="1.400" /></svg>
        </button>
        <button tabIndex={-1} aria-label="הקטן" onMouseDown={(e) => e.preventDefault()} onClick={() => bump(-1, false)}>
          <svg viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.400" /></svg>
        </button>
      </div>
      <input
        id={id}
        aria-label={ariaLabel}
        value={text ?? display}
        onFocus={(e) => {
          setText(display)
          e.currentTarget.select()
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== null) commit(text)
          setText(null)
        }}
        onKeyDown={onKeyDown}
      />
    </div>
  )
}
