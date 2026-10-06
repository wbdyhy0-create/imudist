import { AppLogo } from './AppLogo'
import type { RecentEntry } from '../recent'
import { PAGE_PRESETS } from '../units'

interface Props {
  appName: string
  recent: RecentEntry[]
  onNew: (preset?: (typeof PAGE_PRESETS)[number]) => void
  onOpen: () => void
  onOpenRecent: (entry: RecentEntry) => void
}

const formatDate = (ms: number) =>
  new Date(ms).toLocaleString('he-IL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export function Home({ appName, recent, onNew, onOpen, onOpenRecent }: Props) {
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
        <div className="home-presets">
          {PAGE_PRESETS.map((preset) => {
            const height = 56
            const width = (preset.width / preset.height) * height
            return (
              <button key={preset.id} className="home-card" onClick={() => onNew(preset)}>
                <span className="home-page-preview" style={{ width, height }} aria-hidden="true" />
                <span>{preset.label}</span>
              </button>
            )
          })}
          <button className="home-card" onClick={() => onNew()}>
            <span className="home-page-preview custom" aria-hidden="true" />
            <span>מותאם אישית</span>
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
