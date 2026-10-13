import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * A group of the top toolbar's settings as a menu that opens under its button, so the toolbar shows the categories and not
 * every field at once. A click elsewhere or Escape closes it.
 */
export function ToolbarMenu({ label, title, highlighted, compact, children }: { label: string; title?: string; highlighted?: boolean; compact?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: Event) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', close, true)
      window.removeEventListener('keydown', escape)
    }
  }, [open])
  return (
    <div className="context-swatch-wrap line-menu" ref={rootRef}>
      <button
        type="button"
        className={'context-command' + (open ? ' active' : '') + (highlighted ? ' filled' : '')}
        title={title}
        aria-expanded={open}
        aria-haspopup="true"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((current) => !current)}
      >
        {label} <span aria-hidden="true">▾</span>
      </button>
      {open && <div className={'context-swatch-popover line-menu-panel' + (compact ? ' compact' : '')} role="group" aria-label={label}>{children}</div>}
    </div>
  )
}

/** a label and its field, one row of a menu */
export function MenuRow({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  return (
    <div className="line-menu-row" title={title}>
      <span>{label}</span>
      {children}
    </div>
  )
}
