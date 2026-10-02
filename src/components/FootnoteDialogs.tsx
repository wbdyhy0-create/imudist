import { useRef, useState } from 'react'
import { DEFAULT_FOOTNOTE_CONFIG, DEFAULT_TEXT_STYLE, FONT_FAMILIES, type CharStyle, type FootnoteLayoutConfig, type ParagraphStyleRecord, type Run, type TextStyle } from '../document'
import { diffEdit, normalizeRuns, sliceRuns, styleAtChar } from '../story'
import { NumberField } from './NumberField'

function styleRuns(text: string, source: Run[], base: CharStyle, from: number, to: number, patch: Partial<CharStyle>): Run[] {
  const runs = normalizeRuns(text, source, base)
  const result: Run[] = []
  let offset = 0
  for (const run of runs) {
    const end = offset + run.len
    const cuts = [...new Set([offset, end, Math.max(offset, Math.min(end, from)), Math.max(offset, Math.min(end, to))])].sort((a, b) => a - b)
    for (let index = 0; index < cuts.length - 1; index++) {
      const start = cuts[index]
      const stop = cuts[index + 1]
      const style = start < to && stop > from ? { ...run.style, ...patch } : run.style
      const previous = result[result.length - 1]
      if (previous && JSON.stringify(previous.style) === JSON.stringify(style)) previous.len += stop - start
      else result.push({ len: stop - start, style })
    }
    offset = end
  }
  return result
}

function editRuns(oldText: string, newText: string, runs: Run[], base: CharStyle): Run[] {
  const edit = diffEdit(oldText, newText)
  const normalized = normalizeRuns(oldText, runs, base)
  const inherited = styleAtChar(normalized, Math.max(0, edit.from - 1), base)
  const next = [
    ...sliceRuns(normalized, 0, edit.from),
    ...(edit.insert ? [{ len: edit.insert.length, style: inherited }] : []),
    ...sliceRuns(normalized, edit.to, oldText.length),
  ]
  const merged: Run[] = []
  for (const run of next) {
    const previous = merged[merged.length - 1]
    if (previous && JSON.stringify(previous.style) === JSON.stringify(run.style)) previous.len += run.len
    else merged.push({ ...run })
  }
  return merged
}

interface EditorProps {
  title: string
  initial: string
  initialRuns?: Run[]
  baseStyle?: TextStyle
  onSave: (content: string, runs: Run[]) => void
  onDelete?: () => void
  onClose: () => void
}

export function FootnoteEditorDialog({ title, initial, initialRuns = [], baseStyle = DEFAULT_TEXT_STYLE, onSave, onDelete, onClose }: EditorProps) {
  const [content, setContent] = useState(initial)
  const [runs, setRuns] = useState(initialRuns)
  const [editingStyle, setEditingStyle] = useState(() => initialRuns[0]?.style ?? baseStyle)
  const [selection, setSelection] = useState<[number, number]>([initial.length, initial.length])
  const fontSize = editingStyle.fontSize
  const color = editingStyle.color ?? '#111111'
  const area = useRef<HTMLTextAreaElement>(null)
  const format = (patch: Partial<CharStyle>) => {
    const [start, end] = selection[0] === selection[1] ? [0, content.length] : selection
    if (start === end) return
    setRuns(styleRuns(content, runs, editingStyle, start, end, patch))
    area.current?.focus()
  }
  const onRange = () => {
    const field = area.current
    if (field) {
      const [start, end] = [field.selectionStart, field.selectionEnd]
      setSelection([start, end])
      const currentRuns = normalizeRuns(content, runs, baseStyle)
      setEditingStyle(styleAtChar(currentRuns, start === end ? Math.max(0, start - 1) : start, editingStyle))
    }
  }
  const submit = () => onSave(content, normalizeRuns(content, runs, editingStyle))
  return (
    <div className="modal-backdrop">
      <form className="modal footnote-dialog" role="dialog" aria-modal="true" onSubmit={(event) => { event.preventDefault(); submit() }}>
        <h2>{title}</h2>
        <div className="footnote-char-controls" role="toolbar" aria-label="עיצוב טקסט ההערה">
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => format({ weight: 700 })}>B</button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => format({ italic: true })}>I</button>
          <label>גודל<input type="number" min="1" max="999" value={fontSize} onChange={(event) => { const size = Number(event.target.value); setEditingStyle((current) => ({ ...current, fontSize: size })); format({ fontSize: size }) }} /></label>
          <label>צבע<input type="color" value={color} onChange={(event) => { setEditingStyle((current) => ({ ...current, color: event.target.value })); format({ color: event.target.value }) }} /></label>
        </div>
        <label className="footnote-dialog-field">
          <span>תוכן ההערה</span>
          <textarea ref={area} autoFocus rows={6} value={content} onChange={(event) => { setRuns((current) => editRuns(content, event.target.value, current, editingStyle)); setContent(event.target.value) }} onSelect={onRange} onKeyUp={onRange} onMouseUp={onRange} />
        </label>
        <div className="modal-buttons">
          {onDelete && <button type="button" className="btn danger" onClick={onDelete}>מחק הערה</button>}
          <button type="button" className="btn" onClick={onClose}>ביטול</button>
          <button type="submit" className="btn primary">אישור</button>
        </div>
      </form>
    </div>
  )
}

interface OptionsProps {
  value?: FootnoteLayoutConfig
  paragraphStyles: ParagraphStyleRecord[]
  onSave: (value: FootnoteLayoutConfig) => void
  onClose: () => void
}

export function FootnoteOptionsDialog({ value, paragraphStyles, onSave, onClose }: OptionsProps) {
  const [config, setConfig] = useState<FootnoteLayoutConfig>({ ...DEFAULT_FOOTNOTE_CONFIG, ...value })
  const set = <K extends keyof FootnoteLayoutConfig>(key: K, next: FootnoteLayoutConfig[K]) => setConfig((current) => ({ ...current, [key]: next }))
  return (
    <div className="modal-backdrop">
      <form className="modal footnote-dialog footnote-options-dialog" role="dialog" aria-modal="true" onSubmit={(event) => { event.preventDefault(); onSave(config) }}>
        <h2>אפשרויות הערות שוליים</h2>
        <label className="footnote-dialog-field"><span>סידור</span><select value={config.mode} onChange={(event) => set('mode', event.target.value as FootnoteLayoutConfig['mode'])}><option value="vertical">אנכי</option><option value="horizontal">אופקי רציף</option></select></label>
        <label className="footnote-dialog-field"><span>מספר עמודות בטקסט ההערות</span><select value={config.columns} onChange={(event) => set('columns', Number(event.target.value) === 2 ? 2 : 1)}><option value={1}>עמודה אחת</option><option value={2}>שתי עמודות</option></select></label>
        <label className="footnote-dialog-field"><span>גודל מספרי הפניה בטקסט (%)</span><NumberField ariaLabel="גודל מספרי הפניה בטקסט" value={Math.round(config.referenceScale * 100)} min={25} max={100} onChange={(size) => set('referenceScale', size / 100)} /></label>
        <label className="footnote-dialog-field"><span>מרווח בין מספר ההערה לטקסט (pt)</span><input type="number" min="0" max="100" value={config.numberTextGap} onChange={(event) => set('numberTextGap', Number(event.target.value))} /></label>
        <label className="footnote-dialog-field"><span>מרווח בין הערות אופקיות (pt)</span><input type="number" min="0" max="100" value={config.minSpacingBetweenInline} onChange={(event) => set('minSpacingBetweenInline', Number(event.target.value))} /></label>
        <label className="footnote-dialog-field"><span>גובה מרבי (pt)</span><input type="number" min="12" max="1000" value={config.maxFootnoteHeight} onChange={(event) => set('maxFootnoteHeight', Number(event.target.value))} /></label>
        <label className="footnote-dialog-field"><span>מרחק הטקסט הרץ מהקו העליון (pt)</span><input type="number" min="0" max="100" value={config.dividerGap} onChange={(event) => set('dividerGap', Number(event.target.value))} /></label>
        <label className="footnote-dialog-field"><span>מרווח לפני ההערות (pt)</span><input type="number" min="0" max="100" value={config.spaceBefore} onChange={(event) => set('spaceBefore', Number(event.target.value))} /></label>
        <label className="footnote-dialog-field"><span>מספר התחלתי</span><input type="number" min="1" max="9999" value={config.startAt} onChange={(event) => set('startAt', Number(event.target.value))} /></label>
        <label className="footnote-dialog-field"><span>איפוס מספור</span><select value={config.restart} onChange={(event) => set('restart', event.target.value as FootnoteLayoutConfig['restart'])}><option value="continuous">רציף במסמך</option><option value="page">בכל עמוד</option><option value="spread">בכל גיליון</option></select></label>
        <label className="footnote-dialog-field"><span>סוג מספור</span><select value={config.numberStyle} onChange={(event) => set('numberStyle', event.target.value as FootnoteLayoutConfig['numberStyle'])}><option value="arabic">מספרים</option><option value="hebrew">אותיות בעברית</option><option value="roman">ספרות רומיות</option></select></label>
        <label className="footnote-dialog-field"><span>עיצוב המספר בהערה</span><select value={config.noteFormat} onChange={(event) => set('noteFormat', event.target.value as FootnoteLayoutConfig['noteFormat'])}><option value="plain">ללא סימן</option><option value="dotBefore">נקודה לפני</option><option value="dot">נקודה אחרי</option><option value="leftParen">סוגר לפני</option><option value="doubleLeftParen">שני סוגרים לפני</option><option value="rightParen">סוגר אחרי</option><option value="doubleRightParen">שני סוגרים אחרי</option><option value="round">סוגריים עגולים</option><option value="square">סוגריים מרובעים</option></select></label>
        <label className="footnote-dialog-field"><span>יישור הערות אופקיות</span><select value={config.alignment} onChange={(event) => set('alignment', event.target.value as FootnoteLayoutConfig['alignment'])}><option value="right">ימין</option><option value="center">מרכז</option></select></label>
        <label className="footnote-dialog-field"><span>גופן הערות</span><select value={config.fontFamily ?? ''} onChange={(event) => set('fontFamily', event.target.value)}><option value="">לפי סגנון הפסקה</option>{FONT_FAMILIES.map((font) => <option key={font} value={font}>{font}</option>)}</select></label>
        <label className="footnote-dialog-field"><span>סגנון פסקה להערות</span><select value={config.paragraphStyleId ?? ''} onChange={(event) => set('paragraphStyleId', event.target.value || undefined)}><option value="">סגנון גוף הטקסט</option>{paragraphStyles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}</select></label>
        <div className="grid2">
          <label className="footnote-dialog-field"><span>לפני המספר</span><input value={config.markerPrefix} onChange={(event) => set('markerPrefix', event.target.value)} /></label>
          <label className="footnote-dialog-field"><span>אחרי המספר</span><input value={config.markerSuffix} onChange={(event) => set('markerSuffix', event.target.value)} /></label>
        </div>
        <div className="modal-buttons">
          <button type="button" className="btn" onClick={onClose}>ביטול</button>
          <button type="submit" className="btn primary">אישור</button>
        </div>
      </form>
    </div>
  )
}
