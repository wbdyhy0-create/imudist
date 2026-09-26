import type { ReactNode } from 'react'

export type AlignOp = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom'

const OPS: { id: AlignOp; label: string; icon: ReactNode }[] = [
  { id: 'left', label: 'יישור לשמאל', icon: <path d="M5 4v16M8 7h10M8 12h7M8 17h10" /> },
  { id: 'centerX', label: 'מרכוז אופקי', icon: <path d="M12 4v16M6 7h12M8 12h8M6 17h12" /> },
  { id: 'right', label: 'יישור לימין', icon: <path d="M19 4v16M6 7h10M9 12h7M6 17h10" /> },
  { id: 'top', label: 'יישור למעלה', icon: <path d="M4 5h16M7 8v10M12 8v7M17 8v10" /> },
  { id: 'centerY', label: 'מרכוז אנכי', icon: <path d="M4 12h16M7 6v12M12 8v8M17 6v12" /> },
  { id: 'bottom', label: 'יישור למטה', icon: <path d="M4 19h16M7 6v10M12 9v7M17 6v10" /> },
]

export function AlignButtons({ onAlign }: { onAlign: (op: AlignOp) => void }) {
  return (
    <div className="align-buttons" role="group" aria-label="יישור אובייקטים">
      {OPS.map((op) => (
        <button key={op.id} title={op.label} aria-label={op.label} onClick={() => onAlign(op.id)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {op.icon}
          </svg>
        </button>
      ))}
    </div>
  )
}
