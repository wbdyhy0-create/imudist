/** A row of color swatches for the fill or line of a shape: some ready colors, "none", and a free color picker. */

const COLORS = ['#ffffff', '#dde3ea', '#c8d6ea', '#8a8f98', '#222222', '#0066ff', '#00d1b2', '#f5b800', '#ff5c5c', '#a78bfa']

interface Props {
  /** #rrggbb, or null for "none" */
  value: string | null
  onChange: (color: string | null) => void
  label: string
}

const same = (a: string, b: string | null) => b !== null && a.toLowerCase() === b.toLowerCase()

export function FillPicker({ value, onChange, label }: Props) {
  const inPalette = value === null || COLORS.some((c) => same(c, value))
  return (
    <div className="swatch-row" role="radiogroup" aria-label={label}>
      <button
        role="radio"
        aria-checked={value === null}
        className={'swatch-chip none' + (value === null ? ' on' : '')}
        title="ללא"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onChange(null)}
      />
      {COLORS.map((c) => (
        <button
          key={c}
          role="radio"
          aria-checked={same(c, value)}
          className={'swatch-chip' + (same(c, value) ? ' on' : '')}
          style={{ background: c }}
          title={c}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(c)}
        />
      ))}
      <label className={'swatch-chip custom' + (!inPalette ? ' on' : '')} title="צבע אחר…" style={!inPalette && value ? { background: value } : undefined}>
        <input type="color" value={value ?? '#000000'} onChange={(e) => onChange(e.target.value)} aria-label="צבע אחר" />
      </label>
    </div>
  )
}
