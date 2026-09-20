import type { ArrangeOp } from '../stacking'

const OPS: { id: ArrangeOp; label: string; hint: string }[] = [
  { id: 'front', label: 'לחזית', hint: 'הבא לחזית (Ctrl+Shift+])' },
  { id: 'forward', label: 'קדימה', hint: 'הזז שכבה אחת קדימה (Ctrl+])' },
  { id: 'backward', label: 'אחורה', hint: 'הזז שכבה אחת אחורה (Ctrl+[)' },
  { id: 'back', label: 'לרקע', hint: 'שלח לרקע (Ctrl+Shift+[)' },
]

/** The four stacking-order commands of the selected object. */
export function ArrangeButtons({ onArrange }: { onArrange: (op: ArrangeOp) => void }) {
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
