import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { summarizePreflight, type PreflightIssue, type PreflightKind } from '../preflight'
import '../preflight.css'

interface Props {
  issues: PreflightIssue[]
  /** open the place a problem is at: select what it is about and show its page */
  onGoToIssue: (issue: PreflightIssue) => void
}

/** the groups of the list, in the order they are shown */
const GROUPS: { kind: PreflightKind; title: string }[] = [
  { kind: 'overset', title: 'טקסט עודף' },
  { kind: 'footnote-overflow', title: 'הערות שוליים שלא נכנסו' },
  { kind: 'crosses-page', title: 'חריגה מקצה העמוד' },
  { kind: 'outside-page', title: 'מחוץ לעמוד' },
  { kind: 'missing-font', title: 'גופנים חסרים' },
  { kind: 'missing-image', title: 'תמונות חסרות' },
]

const PANEL_WIDTH = 380

const plural = (count: number, one: string, many: string) => (count === 1 ? one : `${count} ${many}`)

/**
 * The status bar's check light and the list behind it: how many problems the document has, what and where, a click on
 * one goes there. The list is kept up to date as the document changes, down to zero.
 */
export function PreflightButton({ issues, onGoToIssue }: Props) {
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<CSSProperties>({})
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const { errors, warnings } = summarizePreflight(issues)
  const level = errors ? 'error' : warnings ? 'warning' : 'ok'
  const label = errors
    ? `${plural(errors, 'שגיאה אחת', 'שגיאות')}${warnings ? ` · ${plural(warnings, 'אזהרה אחת', 'אזהרות')}` : ''}`
    : warnings
      ? plural(warnings, 'אזהרה אחת', 'אזהרות')
      : 'אין שגיאות'

  const toggle = () => {
    if (!open && button.current) {
      // above the button, its right edge on the panel's (the interface runs right to left)
      const rect = button.current.getBoundingClientRect()
      setPlace({ bottom: window.innerHeight - rect.top + 6, left: Math.max(8, Math.min(rect.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 8)) })
    }
    setOpen(!open)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <button ref={button} className={`status-preflight ${level}`} aria-haspopup="dialog" aria-expanded={open} title="בדיקה לפני הדפסה" onClick={toggle}>
        <span className="dot" />
        {label}
      </button>
      {open && (
        <div ref={panel} className="preflight-panel" role="dialog" aria-label="בדיקה לפני הדפסה" style={{ ...place, width: PANEL_WIDTH }}>
          <div className="preflight-head">
            <b>בדיקה לפני הדפסה</b>
            <span className="muted">{issues.length ? `${plural(errors, 'שגיאה אחת', 'שגיאות')} · ${plural(warnings, 'אזהרה אחת', 'אזהרות')}` : 'המסמך מוכן להדפסה'}</span>
          </div>
          {issues.length === 0 && <p className="preflight-empty">לא נמצאו בעיות: אין טקסט עודף, שום דבר לא חורג מהעמוד, והגופנים והתמונות במקומם.</p>}
          {GROUPS.map(({ kind, title }) => {
            const group = issues.filter((issue) => issue.kind === kind)
            if (group.length === 0) return null
            return (
              <section key={kind} className="preflight-group">
                <h4>
                  {title} <span className="muted">({group.length})</span>
                </h4>
                {group.map((issue) => (
                  <button key={issue.id} className="preflight-row" onClick={() => onGoToIssue(issue)}>
                    <span className={`dot ${issue.severity}`} />
                    <span className="preflight-text">
                      <b>{issue.title}</b>
                      <span>{issue.detail}</span>
                    </span>
                  </button>
                ))}
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}
