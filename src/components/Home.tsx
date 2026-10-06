import { useState } from 'react'
import { AppLogo } from './AppLogo'
import type { RecentEntry } from '../recent'
import { DIGITAL_PRESETS, fromPt, PAGE_PRESETS, type PagePreset, type Unit } from '../units'

interface Props {
  appName: string
  recent: RecentEntry[]
  onNew: (preset?: PagePreset, unit?: Unit) => void
  onOpen: () => void
  onOpenRecent: (entry: RecentEntry) => void
}

type PresetCategory = 'print' | 'digital'

const formatDate = (ms: number) =>
  new Date(ms).toLocaleString('he-IL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export function Home({ appName, recent, onNew, onOpen, onOpenRecent }: Props) {
  const [category, setCategory] = useState<PresetCategory>('print')
  const presets = category === 'print' ? PAGE_PRESETS : DIGITAL_PRESETS

  return (
    <div className="home">
      <div className="home-inner">
        <div className="home-title">
          <AppLogo size={44} />
          <h1>ברוכים הבאים אל {appName}</h1>
        </div>
        <div className="home-actions">
          <button className="btn primary" onClick={onOpen}>
            ייבוא קובץ
          </button>
        </div>

        <h2>התחל מסמך חדש</h2>
        <div className="home-preset-tabs" role="tablist" aria-label="קטגוריית גודל מסמך">
          <button id="home-preset-print-tab" role="tab" aria-selected={category === 'print'} aria-controls="home-preset-panel" className={category === 'print' ? 'on' : ''} onClick={() => setCategory('print')}>
            הדפסה
          </button>
          <button id="home-preset-digital-tab" role="tab" aria-selected={category === 'digital'} aria-controls="home-preset-panel" className={category === 'digital' ? 'on' : ''} onClick={() => setCategory('digital')}>
            דיגיטל ורשתות חברתיות
          </button>
        </div>
        <div id="home-preset-panel" className={'home-presets ' + category} role="tabpanel" aria-labelledby={`home-preset-${category}-tab`}>
          {presets.map((preset) => {
            const scale = Math.min(68 / preset.width, 56 / preset.height)
            const width = preset.width * scale
            const height = preset.height * scale
            const dimensions =
              preset.unit === 'px'
                ? `${preset.width} × ${preset.height} px`
                : `${Math.round(fromPt(preset.width, 'mm'))} × ${Math.round(fromPt(preset.height, 'mm'))} מ״מ`
            return (
              <button
                key={preset.id}
                className="home-card"
                title={`${preset.label} — ${dimensions}`}
                onClick={() => onNew(preset, preset.unit ?? 'mm')}
              >
                <span className="home-page-preview" style={{ width, height }} aria-hidden="true" />
                <span className="home-card-label">{preset.label}</span>
                <span className="home-card-size">{dimensions}</span>
              </button>
            )
          })}
          <button className="home-card" onClick={() => onNew(undefined, category === 'print' ? 'mm' : 'px')}>
            <span className={'home-page-preview custom' + (category === 'digital' ? ' custom-web' : '')} aria-hidden="true" />
            <span className="home-card-label">{category === 'print' ? 'מידה מותאמת' : 'אתר / מידה מותאמת'}</span>
            <span className="home-card-size">{category === 'print' ? 'הזנת מידות' : 'רוחב התחלתי: 1200 px'}</span>
          </button>
        </div>

        <h2>אחרונים</h2>
        {recent.length === 0 ? (
          <p className="muted">עדיין אין קבצים אחרונים.</p>
        ) : (
          <ul className="recent-list">
            {recent.map((r) => (
              <li key={r.name + r.at}>
                <button onClick={() => onOpenRecent(r)}>
                  <img className="recent-app-icon" src="/icons/icon-192.png" alt="" />
                  <span className="recent-name">{r.name}</span>
                  <span className="recent-date">{formatDate(r.at)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
