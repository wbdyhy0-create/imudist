import type { ColorSample } from '../document'
import { t } from '../i18n'

/** A row of color swatches for the fill or line of a shape: ready colors, document samples, "none", and a free color picker. */

const COLORS: { color: string; label: string }[] = [
  { color: '#ffffff', get label() { return t('נייר') } },
  { color: '#000000', get label() { return t('שחור') } },
  { color: '#00ffff', get label() { return t('ציאן') } },
  { color: '#ff00ff', get label() { return t('מג׳נטה') } },
  { color: '#ffff00', get label() { return t('צהוב') } },
  { color: '#0066ff', get label() { return t('כחול') } },
  { color: '#00a651', get label() { return t('ירוק') } },
  { color: '#ed1c24', get label() { return t('אדום') } },
  { color: '#f5b800', get label() { return t('זהב') } },
]

interface Props {
  /** #rrggbb, or null for "none" */
  value: string | null
  onChange: (color: string | null) => void
  label: string
  samples?: ColorSample[]
  /** the "none" chip is shown (default); false for a colour that has to be one */
  allowNone?: boolean
}

const same = (a: string, b: string | null) => b !== null && a.toLowerCase() === b.toLowerCase()

export function FillPicker({ value, onChange, label, samples = [], allowNone = true }: Props) {
  const inPalette = value === null || COLORS.some((c) => same(c.color, value)) || samples.some((sample) => same(sample.color, value))
  return (
    <div className="swatch-row" role="radiogroup" aria-label={label}>
      {allowNone && (
        <button
          role="radio"
          aria-checked={value === null}
          className={'swatch-chip none' + (value === null ? ' on' : '')}
          title={t('ללא')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(null)}
        />
      )}
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
      {samples.map((sample) => (
        <button
          key={sample.id}
          role="radio"
          aria-checked={same(sample.color, value)}
          className={'swatch-chip' + (same(sample.color, value) ? ' on' : '')}
          style={{ background: sample.color }}
          title={sample.label}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(sample.color)}
        />
      ))}
      <label className={'swatch-chip custom' + (!inPalette ? ' on' : '')} title={t('צבע אחר…')} style={!inPalette && value ? { background: value } : undefined}>
        <input type="color" value={value ?? '#000000'} onChange={(e) => onChange(e.target.value)} aria-label={t('צבע אחר')} />
      </label>
    </div>
  )
}
