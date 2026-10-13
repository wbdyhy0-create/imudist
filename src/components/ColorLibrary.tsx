import { useState } from 'react'
import type { GradientFill } from '../document'
import { GRADIENT_PRESETS, SOLID_COLORS } from '../colorLibrary'
import { t } from '../i18n'

type LibraryTab = 'solids' | 'gradients'

interface Props {
  onColor?: (color: string) => void
  onGradient: (gradient: GradientFill) => void
  mode?: 'all' | 'gradients' | 'solids'
}

const SOLID_CATEGORIES = ['הכול', 'יסוד', 'פסטל', 'ניאון', 'טבע']
const GRADIENT_CATEGORIES = ['הכול', 'מתכתי', 'חמים', 'קרים', 'בהירים', 'כהים', 'ניטרליים']

export function ColorLibrary({ onColor, onGradient, mode = 'all' }: Props) {
  const [tab, setTab] = useState<LibraryTab>(mode === 'gradients' ? 'gradients' : 'solids')
  const activeTab = mode === 'gradients' ? 'gradients' : mode === 'solids' ? 'solids' : tab
  const [category, setCategory] = useState('הכול')
  const [query, setQuery] = useState('')
  const categories = activeTab === 'solids' ? SOLID_CATEGORIES : GRADIENT_CATEGORIES
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const colors = SOLID_COLORS.filter((color) =>
    (category === 'הכול' || color.category === category) &&
    (!normalizedQuery || `${color.name} ${color.hex}`.toLocaleLowerCase().includes(normalizedQuery)),
  )
  const gradients = GRADIENT_PRESETS.filter((gradient) =>
    (category === 'הכול' || gradient.tags.includes(category)) &&
    (!normalizedQuery || `${gradient.name} ${gradient.stops.map((stop) => stop.color).join(' ')}`.toLocaleLowerCase().includes(normalizedQuery)),
  )

  const selectTab = (next: LibraryTab) => {
    setTab(next)
    setCategory('הכול')
  }

  return (
    <section className="color-library" aria-label={t('ספריית צבעים')}>
      {mode === 'all' && <div className="seg small" role="radiogroup" aria-label={t('סוגי ספריית צבעים')}>
        <button role="radio" aria-checked={activeTab === 'solids'} className={activeTab === 'solids' ? 'on' : ''} onClick={() => selectTab('solids')}>{t('צבעים')}</button>
        <button role="radio" aria-checked={activeTab === 'gradients'} className={activeTab === 'gradients' ? 'on' : ''} onClick={() => selectTab('gradients')}>{t('מעברים')}</button>
      </div>}
      <input className="color-library-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('חיפוש שם או HEX')} aria-label={t('חיפוש בספריית הצבעים')} />
      <select className="select color-library-category" value={category} onChange={(event) => setCategory(event.target.value)} aria-label={t('קטגוריית צבעים')}>
        {categories.map((item) => <option key={item} value={item}>{t(item)}</option>)}
      </select>
      {activeTab === 'solids' ? (
        <div className="color-library-grid">
          {colors.map((color) => (
            <button key={color.name} className="color-library-item" onMouseDown={(event) => event.preventDefault()} onClick={() => onColor?.(color.hex)} title={`${color.name} · ${color.hex}`} aria-label={t('החל {n1}, {n2}', { n1: color.name, n2: color.hex })}>
              <span className="color-library-preview" style={{ background: color.hex }} />
              <span className="color-library-copy"><strong>{color.name}</strong><small dir="ltr">{color.hex}</small></span>
            </button>
          ))}
          {colors.length === 0 && <p className="muted color-library-empty">{t('לא נמצאו צבעים.')}</p>}
        </div>
      ) : (
        <div className="color-library-grid">
          {gradients.map((gradient) => {
            const background = `linear-gradient(90deg, ${gradient.stops.map((stop) => `${stop.color} ${stop.offset * 100}%`).join(', ')})`
            const apply = () => onGradient({
              type: 'linear',
              angle: gradient.angle,
              start: gradient.stops[0].color,
              end: gradient.stops[gradient.stops.length - 1].color,
              stops: gradient.stops,
              reverse: false,
            })
            return <button key={gradient.id} className="color-library-item color-library-gradient" onClick={apply} title={`${gradient.name} · ${gradient.stops.map((stop) => stop.color).join(' · ')}`} aria-label={t('החל מעבר {n1}', { n1: gradient.name })}>
              <span className="color-library-gradient-preview" style={{ background }} />
              <span className="color-library-copy"><strong>{gradient.name}</strong><small>{gradient.source === 'metallic' ? t('מתכתי') : gradient.tags.map((tag) => t(tag)).join(' · ')}</small></span>
            </button>
          })}
          {gradients.length === 0 && <p className="muted color-library-empty">{t('לא נמצאו מעברים.')}</p>}
        </div>
      )}
    </section>
  )
}