import { GUIDE_COLORS } from '../document'
import { t } from '../i18n'

interface Props {
  /** null = the selected guides have different colors */
  value: string | null
  onChange: (color: string) => void
}

const same = (a: string, b: string | null) => b !== null && a.toLowerCase() === b.toLowerCase()

/** A row of color swatches for guides, plus a free color picker. */
export function GuideColors({ value, onChange }: Props) {
  const inPalette = value === null || GUIDE_COLORS.some((c) => same(c.value, value))
  return (
    <div className="swatch-row" role="radiogroup" aria-label={t('צבע קו עזר')}>
      {GUIDE_COLORS.map((c) => (
        <button
          key={c.value}
          role="radio"
          aria-checked={same(c.value, value)}
          className={'swatch-chip' + (same(c.value, value) ? ' on' : '')}
          style={{ background: c.value }}
          title={c.label}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(c.value)}
        />
      ))}
      <label className={'swatch-chip custom' + (!inPalette ? ' on' : '')} title={t('צבע אחר…')} style={!inPalette ? { background: value } : undefined}>
        <input type="color" value={value ?? '#000000'} onChange={(e) => onChange(e.target.value)} aria-label={t('צבע אחר')} />
      </label>
    </div>
  )
}
