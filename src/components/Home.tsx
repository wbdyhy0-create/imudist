import { AppLogo } from './AppLogo'

export function Home({ appName, onNew }: { appName: string; onNew: () => void }) {
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
          <button className="btn" disabled title="עדיין לא זמין">
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
        <p className="muted">עדיין אין קבצים אחרונים.</p>
      </div>
    </div>
  )
}
