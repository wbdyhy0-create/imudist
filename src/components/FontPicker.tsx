import { useEffect, useRef, useState } from 'react'
import type { FontFamily } from '../fonts'

interface Props {
  value: string
  families: FontFamily[]
  onChange: (family: string) => void
  className?: string
}

/** Show at most this many rows; the search box narrows the list down. */
const MAX_ROWS = 250

const stack = (family: string) => `"${family}", "Segoe UI", Arial, sans-serif`

/** A searchable font list where every name is drawn in its own font. */
export function FontPicker({ value, families, onChange, className }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const q = query.trim().toLowerCase()
  const matches = q ? families.filter((f) => f.family.toLowerCase().includes(q)) : families

  return (
    <div className={'font-picker' + (className ? ` ${className}` : '')} ref={root}>
      <button className="font-picker-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span style={{ fontFamily: stack(value) }}>{value}</span>
        <svg viewBox="0 0 10 6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
      {open && (
        <div className="font-picker-pop">
          <input
            autoFocus
            className="font-picker-search"
            placeholder="חיפוש גופן…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false)
              else if (e.key === 'Enter' && matches[0]) {
                onChange(matches[0].family)
                setOpen(false)
              }
            }}
          />
          <ul role="listbox" className="font-picker-list">
            {matches.slice(0, MAX_ROWS).map((f) => (
              <li key={f.family} role="option" aria-selected={f.family === value}>
                <button
                  className={f.family === value ? 'on' : ''}
                  style={{ fontFamily: stack(f.family) }}
                  onClick={() => {
                    onChange(f.family)
                    setOpen(false)
                  }}
                >
                  {f.family}
                </button>
              </li>
            ))}
            {matches.length === 0 && <li className="font-picker-empty">לא נמצא גופן</li>}
            {matches.length > MAX_ROWS && <li className="font-picker-empty">מוצגים {MAX_ROWS} מתוך {matches.length} — הקלד כדי לצמצם</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
