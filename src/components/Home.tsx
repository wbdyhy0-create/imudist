import { AppLogo } from './AppLogo'
import type { RecentEntry } from '../recent'

interface Props {
  appName: string
  recent: RecentEntry[]
  onNew: () => void
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
          <button className="btn primary" onClick={onNew}>
            קובץ חדש
          </button>
          <button className="btn" onClick={onOpen}>
            פתח
          </button>
        </div>

        <h2>התחל מסמך חדש</h2>
        <button className="home-card" onClick={onNew}>
          <svg viewBox="0 0 64 80" aria-hidden="true">
            <rect x="4" y="4" width="56" height="72" rx="2" fill="#fff" />
            <rect x="12" y="12" width="40" height="56" fill="none" stroke="#24a6ff" strokeWidth="1" />
          </svg>
          <span>מסמך…</span>
        </button>

        <h2>אחרונים</h2>
        {recent.length === 0 ? (
          <p className="muted">עדיין אין קבצים אחרונים.</p>
        ) : (
          <ul className="recent-list">
            {recent.map((r) => (
              <li key={r.name + r.at}>
                <button onClick={() => onOpenRecent(r)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M7 3h7l4 4v14H7zM14 3v4h4" />
                  </svg>
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
