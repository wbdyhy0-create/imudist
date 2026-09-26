/** A row of color swatches for the fill or line of a shape: some ready colors, "none", and a free color picker. */

const COLORS: { color: string; label: string }[] = [
  { color: '#ffffff', label: 'נייר' },
  { color: '#000000', label: 'שחור' },
  { color: '#00ffff', label: 'ציאן' },
  { color: '#ff00ff', label: 'מג׳נטה' },
  { color: '#ffff00', label: 'צהוב' },
  { color: '#0066ff', label: 'כחול' },
  { color: '#00a651', label: 'ירוק' },
  { color: '#ed1c24', label: 'אדום' },
  { color: '#f5b800', label: 'זהב' },
]

interface Props {
  /** #rrggbb, or null for "none" */
  value: string | null
  onChange: (color: string | null) => void
  label: string
}

const same = (a: string, b: string | null) => b !== null && a.toLowerCase() === b.toLowerCase()

export function FillPicker({ value, onChange, label }: Props) {
  const inPalette = value === null || COLORS.some((c) => same(c.color, value))
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
      {COLORS.map((entry) => (
        <button
          key={entry.label}
          role="radio"
          aria-checked={same(entry.color, value)}
          className={'swatch-chip' + (same(entry.color, value) ? ' on' : '')}
          style={{ background: entry.color }}
          title={entry.label}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(entry.color)}
        />
      ))}
      <label className={'swatch-chip custom' + (!inPalette ? ' on' : '')} title="צבע אחר…" style={!inPalette && value ? { background: value } : undefined}>
        <input type="color" value={value ?? '#000000'} onChange={(e) => onChange(e.target.value)} aria-label="צבע אחר" />
      </label>
    </div>
  )
}
