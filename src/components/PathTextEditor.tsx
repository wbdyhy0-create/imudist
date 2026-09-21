import type { Run } from '../document'
import { RichEditor, type SelRequest } from './RichEditor'

interface Props {
  text: string
  runs: Run[]
  request: SelRequest | null
  onEdit: (from: number, to: number, insert: string) => void
  onSelect: (a: number, b: number) => void
  onStop: () => void
}

const noop = () => {}

/**
 * The box where text on a path is typed or pasted. A caret cannot sit on a curved line, so the text is written here and
 * appears on the outline of the shape at once. Select text here to give only that part another size or font.
 */
export function PathTextEditor({ text, runs, request, onEdit, onSelect, onStop }: Props) {
  return (
    <div className="pathtext-editor" role="group" aria-label="עריכת טקסט על הקו">
      <div className="pathtext-editor-head">
        <span>טקסט על הקו</span>
        <span className="muted">הקלד או הדבק כאן — הטקסט מופיע על קו הצורה. סמן חלק מהטקסט כדי לשנות רק אותו. Esc = סיום.</span>
      </div>
      <div className="pathtext-editor-body">
        <RichEditor text={text} runs={runs} scale={1} floats={[]} hasPrev={false} request={request} onEdit={onEdit} onSelect={onSelect} onBackspaceAtStart={noop} onCopyText={() => null} onStop={onStop} />
      </div>
    </div>
  )
}
