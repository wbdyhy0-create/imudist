import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { DEFAULT_FOOTNOTE_CONFIG, DEFAULT_TEXT_STYLE, FONT_FAMILIES, type CharStyle, type FootnoteLayoutConfig, type ParagraphStyleRecord, type Run, type TextStyle } from '../document'
import { diffEdit, normalizeRuns, sliceRuns, styleAtChar } from '../story'
import { NumberField } from './NumberField'
import { footnoteDividerTextStyle, footnoteReferenceLook } from '../footnoteLayout'
import { isOrnamentDecoration as isOrnament, MAX_ORNAMENT_BYTES, ORNAMENT_STYLES, ornamentPreviewMarkup, type DividerOrnamentImage } from '../footnoteOrnaments'

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
  onPreview: (value: FootnoteLayoutConfig) => void
  onSave: (value: FootnoteLayoutConfig) => void
  onClose: () => void
}

interface FootnoteStyleFieldsProps {
  fontFamily?: string
  paragraphStyleId?: string
  paragraphStyles: ParagraphStyleRecord[]
  onChange: (patch: Pick<FootnoteLayoutConfig, 'fontFamily' | 'paragraphStyleId'>) => void
}

export function FootnoteStyleFields({ fontFamily, paragraphStyleId, paragraphStyles, onChange }: FootnoteStyleFieldsProps) {
  return (
    <>
      <label className="footnote-dialog-field"><span>גופן הערות</span><select value={fontFamily ?? ''} onChange={(event) => onChange({ fontFamily: event.target.value })}><option value="">לפי סגנון הפסקה</option>{FONT_FAMILIES.map((font) => <option key={font} value={font}>{font}</option>)}</select></label>
      <label className="footnote-dialog-field"><span>סגנון פסקה להערות</span><select value={paragraphStyleId ?? ''} onChange={(event) => onChange({ paragraphStyleId: event.target.value || undefined })}><option value="">סגנון גוף הטקסט</option>{paragraphStyles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}</select></label>
    </>
  )
}

const HIDDEN_FOOTNOTE_ORNAMENT_IDS = new Set([
  'curl',
  'wave',
  'circleEnd',
  'starEnd',
  'leafEnd',
  'trioEnd',
  'scrollEnd',
  'scrollFade',
  'scrollBoth',
])

const footnoteRuleDecorations: { value: FootnoteLayoutConfig['dividerHeadingDecoration']; label: string }[] = [
  { value: 'none', label: 'קו ישר' },
  { value: 'outer', label: 'עיטור בקצוות החיצוניים' },
  { value: 'both', label: 'עיטור בכל קצות הקווים' },
  { value: 'needle', label: 'קצוות מחודדים' },
  ...ORNAMENT_STYLES
    .filter((style) => !HIDDEN_FOOTNOTE_ORNAMENT_IDS.has(style.id))
    .map((style) => ({ value: style.id as FootnoteLayoutConfig['dividerHeadingDecoration'], label: style.label })),
]

function FootnoteRuleDecorationPicker({ value, ornament, onChange }: { value: FootnoteLayoutConfig['dividerHeadingDecoration']; ornament?: DividerOrnamentImage; onChange: (value: FootnoteLayoutConfig['dividerHeadingDecoration']) => void }) {
  return (
    <div className="footnote-rule-decoration-picker" role="group" aria-label="עיטור הקווים">
      {ornament && (
        <button type="button" aria-label={`העיטור שיובא: ${ornament.name}`} aria-pressed={value === 'custom'} title={`העיטור שיובא: ${ornament.name}`} className={'ornament-choice' + (value === 'custom' ? ' selected' : '')} onClick={() => onChange('custom')}>
          <span className="ornament-preview" dangerouslySetInnerHTML={{ __html: ornamentPreviewMarkup('custom', ornament) }} />
        </button>
      )}
      {footnoteRuleDecorations.map((decoration) => ORNAMENT_STYLES.some((style) => style.id === decoration.value) ? (
        <button key={decoration.value} type="button" aria-label={decoration.label} aria-pressed={value === decoration.value} title={decoration.label} className={'ornament-choice' + (value === decoration.value ? ' selected' : '')} onClick={() => onChange(decoration.value)}>
          <span className="ornament-preview" dangerouslySetInnerHTML={{ __html: ornamentPreviewMarkup(decoration.value) }} />
        </button>
      ) : (
        <button key={decoration.value} type="button" aria-label={decoration.label} aria-pressed={value === decoration.value} title={decoration.label} className={value === decoration.value ? 'selected' : ''} onClick={() => onChange(decoration.value)}>
          <svg viewBox="0 0 72 24" aria-hidden="true">
            {decoration.value === 'needle' ? (
              <g fill="currentColor">
                <path d="M4 12 9 10 H29 V14 H9 Z" />
                <path d="M43 10 H63 L68 12 63 14 H43 Z" />
              </g>
            ) : (
              <path d="M4 12 H29 M43 12 H68" fill="none" stroke="currentColor" strokeWidth="1.5" />
            )}
            {(decoration.value === 'outer' || decoration.value === 'both') && (
              <g fill="currentColor">
                <path d="M4 8 8 12 4 16 0 12 Z" />
                <path d="M68 8 72 12 68 16 64 12 Z" />
              </g>
            )}
            {decoration.value === 'both' && (
              <g fill="currentColor">
                <path d="M29 8 33 12 29 16 25 12 Z" />
                <path d="M43 8 47 12 43 16 39 12 Z" />
              </g>
            )}
          </svg>
        </button>
      ))}
    </div>
  )
}

/** the file read as a data: URL, and the size of the picture in it */
function readOrnamentFile(file: File): Promise<DividerOrnamentImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read'))
    reader.onload = () => {
      const dataUrl = String(reader.result)
      const image = new Image()
      image.onerror = () => reject(new Error('image'))
      image.onload = () => resolve({ name: file.name, dataUrl, width: image.naturalWidth || 100, height: image.naturalHeight || 40 })
      image.src = dataUrl
    }
    reader.readAsDataURL(file)
  })
}

export function FootnoteOptionsDialog({ value, paragraphStyles, onPreview, onSave, onClose }: OptionsProps) {
  const [config, setConfig] = useState<FootnoteLayoutConfig>({ ...DEFAULT_FOOTNOTE_CONFIG, ...value })
  const [tab, setTab] = useState<'layout' | 'numbering' | 'divider' | 'style'>('layout')
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; offsetX: number; offsetY: number; left: number; right: number; top: number; bottom: number } | null>(null)
  const set = <K extends keyof FootnoteLayoutConfig>(key: K, next: FootnoteLayoutConfig[K]) => {
    const updated = { ...config, [key]: next }
    setConfig(updated)
    onPreview(updated)
  }
  const referenceLook = footnoteReferenceLook(config, paragraphStyles)
  const ornamentInput = useRef<HTMLInputElement>(null)
  const [ornamentError, setOrnamentError] = useState<string | null>(null)
  /** a picture chosen as the ornament of the heading lines: it is kept in the document and used at once */
  const importOrnament = async (file: File) => {
    setOrnamentError(null)
    if (file.size > MAX_ORNAMENT_BYTES) {
      setOrnamentError(`הקובץ גדול מדי (עד ${Math.round(MAX_ORNAMENT_BYTES / 1024)}KB). אפשר לכווץ אותו או להקטין אותו.`)
      return
    }
    try {
      const image = await readOrnamentFile(file)
      // a new picture starts at the size of the heading's font (100%), whatever size the one before it was given
      const updated: FootnoteLayoutConfig = { ...config, dividerOrnament: image, dividerHeadingDecoration: 'custom' }
      delete updated.dividerOrnamentScale
      delete updated.dividerOrnamentOffset
      setConfig(updated)
      onPreview(updated)
    } catch {
      setOrnamentError('לא ניתן לקרוא את הקובץ הזה כתמונה.')
    }
  }
  const startWindowDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    const bounds = event.currentTarget.closest('.footnote-options-dialog')?.getBoundingClientRect()
    if (!bounds) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: dragOffset.x,
      offsetY: dragOffset.y,
      left: bounds.left - dragOffset.x,
      right: bounds.right - dragOffset.x,
      top: bounds.top - dragOffset.y,
      bottom: bounds.bottom - dragOffset.y,
    }
  }
  const moveWindowDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const minX = 8 - drag.left
    const maxX = Math.max(minX, window.innerWidth - 8 - drag.right)
    const minY = 8 - drag.top
    const maxY = Math.max(minY, window.innerHeight - 32 - drag.bottom)
    setDragOffset({
      x: Math.max(minX, Math.min(maxX, drag.offsetX + event.clientX - drag.startX)),
      y: Math.max(minY, Math.min(maxY, drag.offsetY + event.clientY - drag.startY)),
    })
  }
  const endWindowDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  return (
    <div className="modal-backdrop">
      <form
        className="modal footnote-dialog footnote-options-dialog"
        role="dialog"
        aria-modal="true"
        style={{ transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}
        onSubmit={(event) => { event.preventDefault(); onSave(config) }}
        // a NumberField takes Enter for itself (commit and leave the field) instead of submitting like a plain input
        // does: submit once its value has landed in `config`, so typing a size and pressing Enter confirms the dialog
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || !(event.target instanceof HTMLElement) || !event.target.closest('.num-field')) return
          const form = event.currentTarget
          window.setTimeout(() => form.requestSubmit(), 0)
        }}
      >
        <button type="button" className="footnote-window-grip" aria-label="גרור את חלון אפשרויות הערות השוליים" title="גרור להזזת החלון" onPointerDown={startWindowDrag} onPointerMove={moveWindowDrag} onPointerUp={endWindowDrag} onPointerCancel={endWindowDrag}>+</button>
        <h2>אפשרויות הערות שוליים</h2>
        <div className="footnote-options-tabs" role="tablist" aria-label="קטגוריות הגדרות הערות שוליים">
          <button type="button" role="tab" id="footnote-layout-tab" aria-controls="footnote-layout-panel" aria-selected={tab === 'layout'} tabIndex={tab === 'layout' ? 0 : -1} className={tab === 'layout' ? 'on' : ''} onClick={() => setTab('layout')}>פריסה</button>
          <button type="button" role="tab" id="footnote-numbering-tab" aria-controls="footnote-numbering-panel" aria-selected={tab === 'numbering'} tabIndex={tab === 'numbering' ? 0 : -1} className={tab === 'numbering' ? 'on' : ''} onClick={() => setTab('numbering')}>מספור הערות</button>
          <button type="button" role="tab" id="footnote-divider-tab" aria-controls="footnote-divider-panel" aria-selected={tab === 'divider'} tabIndex={tab === 'divider' ? 0 : -1} className={tab === 'divider' ? 'on' : ''} onClick={() => setTab('divider')}>קו הפרדה</button>
          <button type="button" role="tab" id="footnote-style-tab" aria-controls="footnote-style-panel" aria-selected={tab === 'style'} tabIndex={tab === 'style' ? 0 : -1} className={tab === 'style' ? 'on' : ''} onClick={() => setTab('style')}>סגנון הערות</button>
        </div>
        <div id="footnote-layout-panel" role="tabpanel" aria-labelledby="footnote-layout-tab" hidden={tab !== 'layout'}>
        <label className="footnote-dialog-field"><span>מיקום ההערות</span><select value={config.placement} onChange={(event) => set('placement', event.target.value as FootnoteLayoutConfig['placement'])}><option value="footnotes">בתחתית כל עמוד</option><option value="endnotes">בסוף המסמך</option></select></label>
        <label className="footnote-dialog-field"><span>סידור</span><select value={config.mode} onChange={(event) => set('mode', event.target.value as FootnoteLayoutConfig['mode'])}><option value="vertical">אנכי</option><option value="horizontal">אופקי רציף</option></select></label>
        <label className="footnote-dialog-field"><span>מספר עמודות בטקסט ההערות</span><select value={config.columns} onChange={(event) => set('columns', Number(event.target.value) === 2 ? 2 : 1)}><option value={1}>עמודה אחת</option><option value={2}>שתי עמודות</option></select></label>
        <label className="footnote-dialog-field"><span>מרווח בין עמודות אנכיות (ס״מ)</span><NumberField ariaLabel="מרווח בין עמודות אנכיות" value={config.columnGap} unit="cm" unitLabel="ס״מ" min={0} max={100} onChange={(gap) => set('columnGap', gap)} /></label>
        <label className="footnote-dialog-field"><span>גודל מספרי הפניה בטקסט (%)</span><NumberField ariaLabel="גודל מספרי הפניה בטקסט" live value={Math.round(config.referenceScale * 100)} min={25} max={100} onChange={(size) => set('referenceScale', size / 100)} /></label>
        <label className="footnote-dialog-field"><span>סגנון פסקה למספרי ההפניה</span><select value={config.referenceStyleId ?? ''} onChange={(event) => set('referenceStyleId', event.target.value || undefined)}><option value="">ללא סגנון (כמו הטקסט שלפני המספר)</option>{paragraphStyles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}</select>{referenceLook?.fontSize !== undefined ? <small>הגודל נקבע לפי הסגנון ({Math.round(referenceLook.fontSize * 100) / 100} pt), ולכן שדה האחוזים שמעל אינו בשימוש.</small> : <small>הגופן, המשקל, הנטייה והצבע של הסגנון חלים על המספרים. אם הסגנון מגדיר גם גודל, הוא קובע את הגודל במקום האחוזים.</small>}</label>
        <label className="footnote-dialog-field"><span>מרווח בין מספר ההפניה למילה (pt)</span><NumberField ariaLabel="מרווח בין מספר ההפניה למילה" live value={config.referenceGap} unit="px" unitLabel="pt" step={1} min={0} max={72} onChange={(gap) => set('referenceGap', gap)} /></label>
        <label className="footnote-dialog-field"><span>הזזה אנכית של מספר ההפניה (pt)</span><NumberField ariaLabel="הזזה אנכית של מספר ההפניה" live value={config.referenceVerticalOffset} unit="px" unitLabel="pt" step={1} min={-20} max={20} onChange={(offset) => set('referenceVerticalOffset', offset)} /><small>ערך חיובי מעלה את המספר; ערך שלילי מוריד אותו.</small></label>
        <label className="footnote-dialog-field"><span>מרווח בין מספר ההערה לטקסט (pt)</span><input type="number" min="0" max="100" value={config.numberTextGap} onChange={(event) => set('numberTextGap', Number(event.target.value))} /></label>
        <label className="footnote-dialog-field"><span>מרווח בין הערות אופקיות (pt)</span><input type="number" min="0" max="100" value={config.minSpacingBetweenInline} onChange={(event) => set('minSpacingBetweenInline', Number(event.target.value))} /></label>
        <label className="footnote-dialog-field"><span>גובה מרבי (pt)</span><input type="number" min="12" max="1000" value={config.maxFootnoteHeight} onChange={(event) => set('maxFootnoteHeight', Number(event.target.value))} /></label>
        <label className="footnote-dialog-field"><span>מרווח לפני ההערות (pt)</span><input type="number" min="0" max="100" value={config.spaceBefore} onChange={(event) => set('spaceBefore', Number(event.target.value))} /></label>
        {config.mode === 'horizontal' && <label className="footnote-dialog-field"><span>יישור הרצף האופקי</span><select value={config.alignment} onChange={(event) => set('alignment', event.target.value as FootnoteLayoutConfig['alignment'])}><option value="right">לימין</option><option value="center">למרכז העמוד</option></select></label>}
        </div>
        <div id="footnote-numbering-panel" role="tabpanel" aria-labelledby="footnote-numbering-tab" hidden={tab !== 'numbering'}>
          <label className="footnote-dialog-field"><span>מספר התחלתי</span><input type="number" min="1" max="9999" value={config.startAt} onChange={(event) => set('startAt', Number(event.target.value))} /></label>
          <label className="footnote-dialog-field"><span>איפוס מספור</span><select value={config.restart} onChange={(event) => set('restart', event.target.value as FootnoteLayoutConfig['restart'])}><option value="continuous">רציף במסמך</option><option value="page">בכל עמוד</option><option value="spread">בכל גיליון</option></select></label>
          <label className="footnote-dialog-field"><span>סוג מספור</span><select value={config.numberStyle} onChange={(event) => set('numberStyle', event.target.value as FootnoteLayoutConfig['numberStyle'])}><option value="arabic">מספרים</option><option value="hebrew">אותיות בעברית</option><option value="roman">ספרות רומיות</option></select></label>
          <label className="footnote-dialog-field"><span>עיצוב המספר בהערה</span><select value={config.noteFormat} onChange={(event) => set('noteFormat', event.target.value as FootnoteLayoutConfig['noteFormat'])}><option value="plain">ללא סימן</option><option value="dotBefore">נקודה לפני</option><option value="dot">נקודה אחרי</option><option value="leftParen">סוגר לפני</option><option value="doubleLeftParen">שני סוגרים לפני</option><option value="rightParen">סוגר אחרי</option><option value="doubleRightParen">שני סוגרים אחרי</option><option value="round">סוגריים עגולים</option><option value="square">סוגריים מרובעים</option></select></label>
          <div className="grid2">
            <label className="footnote-dialog-field"><span>לפני המספר</span><input value={config.markerPrefix} onChange={(event) => set('markerPrefix', event.target.value)} /></label>
            <label className="footnote-dialog-field"><span>אחרי המספר</span><input value={config.markerSuffix} onChange={(event) => set('markerSuffix', event.target.value)} /></label>
          </div>
        </div>
        <div id="footnote-divider-panel" role="tabpanel" aria-labelledby="footnote-divider-tab" hidden={tab !== 'divider'}>
          <label className="footnote-dialog-field"><span>סוג הפרדה</span><select value={config.dividerMode} onChange={(event) => set('dividerMode', event.target.value as FootnoteLayoutConfig['dividerMode'])}><option value="line">קו</option><option value="heading">כותרת בין קווים</option></select></label>
          {config.dividerMode === 'heading' && (
            <>
              <label className="footnote-dialog-field"><span>טקסט הכותרת</span><input type="text" maxLength={200} value={config.dividerText} onChange={(event) => set('dividerText', event.target.value)} /></label>
              <label className="footnote-dialog-field"><span>סגנון פסקה לכותרת</span><select value={config.dividerHeadingStyleId ?? ''} onChange={(event) => set('dividerHeadingStyleId', event.target.value || undefined)}><option value="">סגנון ברירת מחדל</option>{paragraphStyles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}</select></label>
              <label className="footnote-dialog-checkbox"><input type="checkbox" checked={config.dividerHeadingLines} onChange={(event) => set('dividerHeadingLines', event.target.checked)} /><span>הצג קווים משני צדי הכותרת</span></label>
              {config.dividerHeadingLines && (
                <div className="footnote-rule-decoration-field">
                  <span>עיטור הקווים</span>
                  <FootnoteRuleDecorationPicker value={config.dividerHeadingDecoration} ornament={config.dividerOrnament} onChange={(decoration) => set('dividerHeadingDecoration', decoration)} />
                  <div className="footnote-ornament-import">
                    <button type="button" className="btn small" onClick={() => ornamentInput.current?.click()}>ייבוא עיטור מקובץ…</button>
                    {config.dividerOrnament && (
                      <button type="button" className="btn small" onClick={() => {
                        const { dividerOrnament: _removed, ...rest } = config
                        const next = { ...rest, dividerHeadingDecoration: config.dividerHeadingDecoration === 'custom' ? 'none' as const : config.dividerHeadingDecoration }
                        setConfig(next)
                        onPreview(next)
                      }}>הסר את העיטור שיובא</button>
                    )}
                    <input ref={ornamentInput} type="file" hidden accept="image/svg+xml,image/png,image/jpeg,image/webp,image/gif" onChange={(event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      if (file) void importOrnament(file)
                    }} />
                    {ornamentError && <span className="footnote-ornament-error" role="alert">{ornamentError}</span>}
                  </div>
                  <span className="muted">העיטור המיובא (SVG, PNG או JPG) מוצב בקצה החיצוני של כל קו, ומתהפך בצד השני. גודלו נגזר מגודל הגופן של הכותרת, ולכן משתנה איתו.</span>
                  <label className="footnote-dialog-field"><span>מרווח בין הקווים או העיטורים לכותרת (נק׳)</span><NumberField ariaLabel="מרווח בין הקווים או העיטורים לכותרת" live value={config.dividerHeadingGap ?? Math.round(Math.max(6, footnoteDividerTextStyle(config, paragraphStyles).fontSize * 0.4) * 10) / 10} unit="px" unitLabel="pt" step={1} min={0} max={200} onChange={(gap) => set('dividerHeadingGap', gap)} /></label>
                  {isOrnament(config.dividerHeadingDecoration) && (
                    <>
                    <label className="footnote-dialog-field"><span>גודל העיטור (% מגודל הגופן של הכותרת)</span><NumberField ariaLabel="גודל העיטור באחוזים מגודל הגופן של הכותרת" live value={Math.round(config.dividerOrnamentScale ?? 100)} step={5} min={20} max={500} onChange={(scale) => set('dividerOrnamentScale', scale)} /></label>
                    <label className="footnote-dialog-field"><span>הגבהה או הנמכה של העיטורים לעומת הכותרת (pt)</span><NumberField ariaLabel="הגבהה או הנמכה של העיטורים לעומת הכותרת" live value={config.dividerOrnamentOffset ?? 0} unit="px" unitLabel="pt" step={1} min={-100} max={100} onChange={(offset) => set('dividerOrnamentOffset', offset)} /><small>ערך חיובי מגביה את העיטורים, ערך שלילי מנמיך אותם. באפס הם מיושרים לאמצע האותיות של הכותרת.</small></label>
                    </>
                  )}
                </div>
              )}
            </>
          )}
          <label className="footnote-dialog-field"><span>מרחק הטקסט הרץ מהקו העליון (pt)</span><NumberField ariaLabel="מרחק הטקסט הרץ מהקו העליון" live value={config.dividerGap} unit="px" unitLabel="pt" step={1} min={0} max={100} onChange={(gap) => set('dividerGap', gap)} /></label>
          <label className="footnote-dialog-field"><span>עובי קו ההפרדה (pt)</span><NumberField ariaLabel="עובי קו ההפרדה" live value={config.dividerThickness} unit="px" unitLabel="pt" step={0.1} min={0.1} max={10} onChange={(thickness) => set('dividerThickness', thickness)} /></label>
          {config.dividerMode === 'heading' && <label className="footnote-dialog-field"><span>רוחב אזור הכותרת והקווים (%)</span><NumberField ariaLabel="רוחב אזור הכותרת והקווים באחוזים" live value={Math.round(config.dividerWidth)} min={20} max={100} onChange={(width) => set('dividerWidth', width)} /></label>}
          {config.dividerMode === 'line' && (
            <>
              <label className="footnote-dialog-field"><span>רוחב קו ההפרדה (%)</span><NumberField ariaLabel="רוחב קו ההפרדה באחוזים" live value={Math.round(config.dividerWidth)} min={1} max={100} onChange={(width) => set('dividerWidth', width)} /></label>
              <label className="footnote-dialog-field"><span>יישור קו ההפרדה</span><select value={config.dividerAlignment} onChange={(event) => set('dividerAlignment', event.target.value as FootnoteLayoutConfig['dividerAlignment'])}><option value="right">ימין</option><option value="center">מרכז</option><option value="left">שמאל</option></select></label>
            </>
          )}
        </div>
        <div id="footnote-style-panel" role="tabpanel" aria-labelledby="footnote-style-tab" hidden={tab !== 'style'}>
          <FootnoteStyleFields fontFamily={config.fontFamily} paragraphStyleId={config.paragraphStyleId} paragraphStyles={paragraphStyles} onChange={(patch) => {
            const updated = { ...config, ...patch }
            setConfig(updated)
            onPreview(updated)
          }} />
        </div>
        <div className="modal-buttons">
          <button type="button" className="btn" onClick={onClose}>ביטול</button>
          <button type="submit" className="btn primary">אישור</button>
        </div>
      </form>
    </div>
  )
}
