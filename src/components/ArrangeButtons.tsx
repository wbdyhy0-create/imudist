import { useEffect, useRef, useState } from 'react'
import type { ArrangeOp } from '../stacking'

const OPS: { id: ArrangeOp; label: string; hint: string }[] = [
  { id: 'front', label: 'לחזית', hint: 'הבא לחזית (Ctrl+Shift+])' },
  { id: 'forward', label: 'קדימה', hint: 'הזז שכבה אחת קדימה (Ctrl+])' },
  { id: 'backward', label: 'אחורה', hint: 'הזז שכבה אחת אחורה (Ctrl+[)' },
  { id: 'back', label: 'לרקע', hint: 'שלח לרקע (Ctrl+Shift+[)' },
]

/** The four stacking-order commands of the selected object. */
export function ArrangeButtons({ onArrange, compact = false }: { onArrange: (op: ArrangeOp) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  if (compact) {
    return (
      <div className="arrange-dropdown" ref={rootRef}>
        <button className="context-command arrange-trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <span>סדר</span><span className="arrange-chevron" aria-hidden="true">⌄</span>
        </button>
        {open && <div className="arrange-menu" role="menu" aria-label="סדר שכבות">
          {OPS.map((op) => <button key={op.id} role="menuitem" title={op.hint} onClick={() => { onArrange(op.id); setOpen(false) }}>{op.label}</button>)}
        </div>}
      </div>
    )
  }

  return (
    <div className="place-modes arrange" role="group" aria-label="סדר שכבות">
      {OPS.map((o) => (
        <button key={o.id} title={o.hint} onClick={() => onArrange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
