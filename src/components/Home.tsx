export function Home({ appName, onNew }: { appName: string; onNew: () => void }) {
  return (
    <div className="home">
      <div className="home-inner">
        <h1>Welcome to {appName}</h1>
        <div className="home-actions">
          <button className="btn primary" onClick={onNew}>
            New file
          </button>
          <button className="btn" disabled title="Not available yet">
            Open
          </button>
        </div>

        <h2>Start a new document</h2>
        <button className="home-card" onClick={onNew}>
          <svg viewBox="0 0 64 80" aria-hidden="true">
            <rect x="4" y="4" width="56" height="72" rx="2" fill="#fff" />
            <rect x="12" y="12" width="40" height="56" fill="none" stroke="#ff00ff" strokeWidth="1" />
          </svg>
          <span>Document…</span>
        </button>

        <h2>Recent</h2>
        <p className="muted">No recent files yet.</p>
      </div>
    </div>
  )
}
