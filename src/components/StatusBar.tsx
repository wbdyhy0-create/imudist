import { useEffect, useState } from 'react'
import type { PreflightIssue } from '../preflight'
import { PreflightButton } from './PreflightPanel'

interface Props {
  /** what the check found, kept up to date as the document changes */
  issues: PreflightIssue[]
  onGoToIssue: (issue: PreflightIssue) => void
  zoom: number
  onZoomTo: (zoom: number) => void
  onFitPage: () => void
  onFitSpread: () => void
  spreadLabel: string
  spreadIndex: number
  spreadCount: number
  onGo: (index: number) => void
  onGoToPage: (pageNumber: number) => void
}

const ZOOM_PRESETS = [12.5, 25, 50, 75, 100, 200, 400, 800]

export const formatZoom = (zoom: number) => `${parseFloat((zoom * 100).toFixed(2))}%`

export function StatusBar(p: Props) {
  return (
    <div className="statusbar">
      <ZoomField zoom={p.zoom} onZoomTo={p.onZoomTo} onFitPage={p.onFitPage} onFitSpread={p.onFitSpread} />
      <div className="page-nav">
        <button aria-label="עמוד ראשון" disabled={p.spreadIndex <= 0} onClick={() => p.onGo(0)}>
          <svg viewBox="0 0 12 12"><path d="M3 2v8M9 2 5 6l4 4" /></svg>
        </button>
        <button aria-label="עמוד קודם" disabled={p.spreadIndex <= 0} onClick={() => p.onGo(p.spreadIndex - 1)}>
          <svg viewBox="0 0 12 12"><path d="M8 2 4 6l4 4" /></svg>
        </button>
        <PageInput label={p.spreadLabel} onCommit={p.onGoToPage} />
        <button aria-label="עמוד הבא" disabled={p.spreadIndex >= p.spreadCount - 1} onClick={() => p.onGo(p.spreadIndex + 1)}>
          <svg viewBox="0 0 12 12"><path d="m4 2 4 4-4 4" /></svg>
        </button>
        <button aria-label="עמוד אחרון" disabled={p.spreadIndex >= p.spreadCount - 1} onClick={() => p.onGo(p.spreadCount - 1)}>
          <svg viewBox="0 0 12 12"><path d="M9 2v8M3 2l4 4-4 4" /></svg>
        </button>
      </div>
      <PreflightButton issues={p.issues} onGoToIssue={p.onGoToIssue} />
    </div>
  )
}

function PageInput({ label, onCommit }: { label: string; onCommit: (n: number) => void }) {
  const [text, setText] = useState<string | null>(null)
  return (
    <input
      className="page-input"
      aria-label="עמוד" dir="ltr"
      value={text ?? label}
      onFocus={(e) => {
        setText(label)
        e.currentTarget.select()
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const n = parseInt(text ?? '', 10)
        if (text !== null && Number.isFinite(n)) onCommit(n)
        setText(null)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setText(null)
          e.currentTarget.blur()
        }
      }}
    />
  )
}

function ZoomField({ zoom, onZoomTo, onFitPage, onFitSpread }: Pick<Props, 'zoom' | 'onZoomTo' | 'onFitPage' | 'onFitSpread'>) {
  const [text, setText] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    // defer so the click that opened the list doesn't close it right away
    const t = setTimeout(() => window.addEventListener('mousedown', close), 0)
    return () => {
      clearTimeout(t)
      window.removeEventListener('mousedown', close)
    }
  }, [open])

  const commit = (raw: string) => {
    const n = parseFloat(raw.replace(',', '.'))
    if (Number.isFinite(n) && n > 0) onZoomTo(n / 100)
  }

  return (
    <div className="zoom-field">
      <input
        aria-label="זום" dir="ltr"
        value={text ?? formatZoom(zoom)}
        onFocus={(e) => {
          setText(formatZoom(zoom))
          e.currentTarget.select()
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== null) commit(text)
          setText(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setText(null)
            e.currentTarget.blur()
          }
        }}
      />
      <button aria-label="רמות זום" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" /></svg>
      </button>
      {open && (
        <ul className="zoom-list" onMouseDown={(e) => e.stopPropagation()}>
          {ZOOM_PRESETS.map((z) => (
            <li key={z}>
              <button
                onClick={() => {
                  onZoomTo(z / 100)
                  setOpen(false)
                }}
              >
                {z}%
              </button>
            </li>
          ))}
          <li className="sep" />
          <li>
            <button onClick={() => { onFitPage(); setOpen(false) }}>התאם עמוד לחלון</button>
          </li>
          <li>
            <button onClick={() => { onFitSpread(); setOpen(false) }}>התאם דף כפול לחלון</button>
          </li>
        </ul>
      )}
    </div>
  )
}
