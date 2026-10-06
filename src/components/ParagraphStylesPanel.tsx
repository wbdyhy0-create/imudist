import { useRef, useState } from 'react'
import type { CharacterStyleRecord, ParagraphStyleRecord } from '../document'
import { NestedStylesEditor } from './NestedStylesEditor'
import { NumberField } from './NumberField'
import { ALIGNS, Group, Labeled } from './PropertiesPanel'
import type { Unit } from '../units'
import { FontPicker } from './FontPicker'
import { useFontCatalog } from '../fonts'
import { FillPicker } from './FillPicker'
import { ContextMenu } from './ContextMenu'

export type { ParagraphStyleRecord } from '../document'

interface Props {
  styles: ParagraphStyleRecord[]
  unit: Unit
  onApply: (styleId: string) => void
  onChange: (styleId: string, patch: Partial<ParagraphStyleRecord>) => void
  onCreate: () => void
  onDelete: (styleId: string) => void
  onDeleteMany: (styleIds: string[]) => void
  /** the style of the paragraph the text selection (or caret) is in: shown highlighted. null = the selection spans several styles; missing = nothing selected */
  highlightId?: string | null
  /** the text in the highlighted style carries changes of its own: a small "+" after the style's name (the usual style-override mark) */
  modified?: boolean
  /** accept the pending changes as they are (stop flagging them), without making a new style */
  onConfirmOverrides?: () => void
  /** put the paragraph back exactly as the highlighted style defines it, discarding the pending changes */
  onDiscardOverrides?: () => void
  /** the document's character styles, for the nested styles of a paragraph style */
  characterStyles?: CharacterStyleRecord[]
  /** give the nested styles of a paragraph style to every paragraph that is in it now */
  onApplyNested?: (styleId: string) => void
}

export function ParagraphStylesPanel({ styles, unit, onApply, onChange, onCreate, onDelete, onDeleteMany, highlightId, modified, onConfirmOverrides, onDiscardOverrides, characterStyles = [], onApplyNested }: Props) {
  const [activeId, setActiveId] = useState(styles[0]?.id ?? '')
  // the style being edited or deleted follows the text: moving the selection into another paragraph moves it too
  const [followed, setFollowed] = useState(highlightId)
  const [rangeIds, setRangeIds] = useState<string[]>([])
  const [rangeAnchorId, setRangeAnchorId] = useState<string | null>(null)
  if (highlightId !== followed) {
    setFollowed(highlightId)
    if (highlightId) {
      setActiveId(highlightId)
      setRangeIds([highlightId])
      setRangeAnchorId(highlightId)
    }
  }
  const [editing, setEditing] = useState(false)
  const [category, setCategory] = useState('general')
  const [modalPosition, setModalPosition] = useState<{ x: number; y: number } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ styleId: string; x: number; y: number } | null>(null)
  const modalDrag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const fontCatalog = useFontCatalog()
  const active = styles.find((style) => style.id === activeId) ?? styles[0]
  if (!active) return null
  const shownId = highlightId === undefined ? active.id : highlightId
  const value = <K extends keyof ParagraphStyleRecord['patch']>(key: K, fallback: NonNullable<ParagraphStyleRecord['patch'][K]>) => active.patch[key] ?? fallback
  const selectedFamily = fontCatalog.families.find((family) => family.family === value('fontFamily', 'Segoe UI'))
  const selectedFace = `${value('weight', 400)}|${value('italic', false) ? 1 : 0}`
  const edit = (patch: ParagraphStyleRecord['patch']) => onChange(active.id, { patch })
    const chooseStyle = (styleId: string, extend: boolean) => {
      setActiveId(styleId)
      if (extend) {
        const anchorId = rangeAnchorId && styles.some((style) => style.id === rangeAnchorId) ? rangeAnchorId : activeId
        const anchorIndex = styles.findIndex((style) => style.id === anchorId)
        const targetIndex = styles.findIndex((style) => style.id === styleId)
        if (anchorIndex >= 0 && targetIndex >= 0) {
          const start = Math.min(anchorIndex, targetIndex)
          const end = Math.max(anchorIndex, targetIndex)
          setRangeIds(styles.slice(start, end + 1).map((style) => style.id))
          setRangeAnchorId(anchorId)
          return
        }
      }
      setRangeIds([styleId])
      setRangeAnchorId(styleId)
      if (styleId !== shownId) onApply(styleId)
    }
    const openStyleMenu = (styleId: string, x: number, y: number) => {
      const selectedIds = rangeIds.includes(styleId) ? rangeIds : [styleId]
      setRangeIds(selectedIds)
      setRangeAnchorId(styleId)
      setContextMenu({ styleId, x, y })
    }
  const startModalDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const rect = event.currentTarget.parentElement?.getBoundingClientRect()
    if (!rect) return
    event.preventDefault()
    modalDrag.current = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top }
    const move = (moveEvent: PointerEvent) => { const drag = modalDrag.current; if (drag) setModalPosition({ x: drag.left + moveEvent.clientX - drag.x, y: drag.top + moveEvent.clientY - drag.y }) }
    const stop = () => { modalDrag.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  return (
    <section className="paragraph-styles-panel props-panel" aria-label="סגנונות פסקה">
      <div className="styles-panel-head"><h2 className="props-title">סגנונות פסקה</h2><button className="icon-button" aria-label="סגנון חדש" onMouseDown={(event) => event.preventDefault()} onClick={onCreate}>+</button></div>
      <div className="paragraph-style-list">
        {styles.map((style) => <button key={style.id} className={'paragraph-style-row' + (style.id === shownId ? ' active' : '') + (rangeIds.includes(style.id) ? ' range-selected' : '')} onMouseDown={(event) => { if (event.button === 0) event.preventDefault() }} onContextMenu={(event) => { event.preventDefault(); if (styles.length > 1) { setActiveId(style.id); openStyleMenu(style.id, event.clientX, event.clientY) } }} onClick={(event) => chooseStyle(style.id, event.shiftKey)} onDoubleClick={() => { setActiveId(style.id); setEditing(true) }}><span className="style-sample" style={{ fontWeight: style.patch.weight ?? 400 }}>{style.name}{modified && style.id === shownId && <span className="style-plus" title="בטקסט יש שינויים שאינם חלק מהסגנון — סגנון חדש (+) ייצור מהם סגנון">+</span>}</span><span className="style-meta">{style.basedOnId ? 'מבוסס' : 'בסיס'}</span></button>)}
      </div>
      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} items={[{ label: rangeIds.length > 1 ? `מחק ${rangeIds.length} סגנונות` : 'מחק סגנון', disabled: rangeIds.length >= styles.length, onClick: () => rangeIds.length > 1 ? onDeleteMany(rangeIds) : onDelete(contextMenu.styleId) }]} />}
      {editing && <div className="paragraph-style-modal" role="dialog" aria-label="אפשרויות סגנון פסקה" style={modalPosition ? { left: modalPosition.x, top: modalPosition.y, transform: 'none' } : undefined}><div className="paragraph-style-modal-head" onPointerDown={startModalDrag}><strong>⠿ אפשרויות סגנון פסקה</strong><button className="icon-button" onPointerDown={(event) => event.stopPropagation()} onClick={() => setEditing(false)} aria-label="סגור">×</button></div>
        {modified && active.id === shownId && <div className="paragraph-style-pending"><span>לטקסט שבפסקה יש שינויים שאינם חלק מהסגנון.</span><div className="paragraph-style-pending-actions"><button className="btn small" onMouseDown={(event) => event.preventDefault()} onClick={onDiscardOverrides}>ביטול</button><button className="btn small primary" onMouseDown={(event) => event.preventDefault()} onClick={onConfirmOverrides}>אישור</button></div></div>}
        <div className="paragraph-style-modal-layout"><nav className="paragraph-style-categories" aria-label="קטגוריות סגנון">
        {[['general', 'כללי'], ['basic', 'תווים בסיסיים'], ['middle-east', 'מזרח תיכון'], ['indents', 'הזחות וריווחים'], ['keep', 'שמירה על רצף'], ['nested', 'סגנונות מקוננים'], ['lists', 'תבליטים ומספור'], ['color', 'צבע תו'], ['border', 'מסגרת ורקע']].map(([id, label]) => <button key={id} className={category === id ? 'active' : ''} onClick={() => setCategory(id)}>{label}</button>)}
      </nav><div className="paragraph-style-modal-body">{category === 'general' && <Group title="כללי">
        <Labeled label="שם הסגנון"><input className="select" value={active.name} onChange={(event) => onChange(active.id, { name: event.target.value })} /></Labeled>
        <label className="field-label">מבוסס על</label>
        <select className="select" value={active.basedOnId ?? ''} onChange={(event) => onChange(active.id, { basedOnId: event.target.value || undefined })}><option value="">ללא</option>{styles.filter((style) => style.id !== active.id).map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}</select>
        <label className="field-label">סגנון הבא</label>
        <select className="select" value={active.nextStyleId ?? ''} onChange={(event) => onChange(active.id, { nextStyleId: event.target.value || undefined })} title="הסגנון שפסקה חדשה תקבל בלחיצת Enter בסוף פסקה בסגנון הזה"><option value="">אותו הסגנון</option>{styles.filter((style) => style.id !== active.id).map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}</select>
      </Group>}{category === 'basic' && <Group title="עיצוב תווים">
        <Labeled label="גופן"><FontPicker value={value('fontFamily', 'Segoe UI')} families={fontCatalog.families} onChange={(fontFamily) => edit({ fontFamily })} /></Labeled>
        <Labeled label="משקל וסגנון"><select className="select" value={selectedFace} onChange={(event) => { const [weight, italic] = event.target.value.split('|'); edit({ weight: Number(weight), italic: italic === '1' }) }}>{!selectedFamily?.faces.some((face) => `${face.weight}|${face.italic ? 1 : 0}` === selectedFace) && <option value={selectedFace}>נוכחי</option>}{(selectedFamily?.faces ?? [{ weight: 400, italic: false, style: 'Regular' }]).map((face) => <option key={`${face.weight}|${face.italic}`} value={`${face.weight}|${face.italic ? 1 : 0}`}>{face.style}</option>)}</select></Labeled>
        <div className="grid2"><Labeled label="גודל"><NumberField value={value('fontSize', 14)} unit="px" unitLabel="pt" min={1} max={999} onChange={(v) => edit({ fontSize: v })} /></Labeled><Labeled label="Leading"><NumberField value={value('leading', 17)} unit="px" unitLabel="pt" min={0} max={999} onChange={(v) => edit({ leading: v })} /></Labeled></div>
        <div className="toggle-group"><button className={value('weight', 400) >= 600 ? 'on' : ''} onClick={() => edit({ weight: value('weight', 400) >= 600 ? 400 : 700 })}>B</button><button className={value('italic', false) ? 'on' : ''} onClick={() => edit({ italic: !value('italic', false) })}><i>I</i></button></div>
        <Labeled label="Tracking"><NumberField value={value('tracking', 0)} min={-500} max={500} onChange={(v) => edit({ tracking: v })} /></Labeled>
      </Group>}{category === 'indents' && <Group title="הזחות וריווחים">
        <div className="grid2"><Labeled label="לפני"><NumberField value={value('spaceBefore', 0)} unit={unit} onChange={(v) => edit({ spaceBefore: v })} /></Labeled><Labeled label="אחרי"><NumberField value={value('spaceAfter', 0)} unit={unit} onChange={(v) => edit({ spaceAfter: v })} /></Labeled><Labeled label="ימין"><NumberField value={value('indentRight', 0)} unit={unit} onChange={(v) => edit({ indentRight: v })} /></Labeled><Labeled label="שמאל"><NumberField value={value('indentLeft', 0)} unit={unit} onChange={(v) => edit({ indentLeft: v })} /></Labeled></div>
        <div className="grid2"><Labeled label="מילים מינימום"><NumberField value={value('wordSpacingMin', 90)} min={10} max={100} onChange={(v) => edit({ wordSpacingMin: v })} /></Labeled><Labeled label="מילים מקסימום"><NumberField value={value('wordSpacingMax', 120)} min={100} max={500} onChange={(v) => edit({ wordSpacingMax: v })} /></Labeled></div>
        <Labeled label="שורה ראשונה"><NumberField value={value('firstLineIndent', 0)} unit={unit} onChange={(v) => edit({ firstLineIndent: v })} /></Labeled>
        <div className="toggle-group">{ALIGNS.map((a) => <button key={a.id} className={value('align', 'right') === a.id ? 'on' : ''} title={a.label} aria-label={a.label} onClick={() => edit({ align: a.id })}><svg viewBox="0 0 24 24"><path d={a.icon} /></svg></button>)}</div>
      </Group>}{category === 'nested' && <Group title="סגנונות מקוננים"><NestedStylesEditor rules={active.nested ?? []} characterStyles={characterStyles} onChange={(nested) => onChange(active.id, { nested: nested.length ? nested : undefined })} onApply={() => onApplyNested?.(active.id)} /></Group>}{category === 'middle-east' && <Group title="עיצוב למזרח התיכון"><p className="muted">כיוון פסקה ומספרים יתווספו כאן. כיוון התיבה הנוכחי הוא RTL.</p></Group>}{category === 'keep' && <Group title="אפשרויות שמירה"><label className="page-bar-check" title="פסקה בסגנון הזה (פסוק, כותרת) לא תישאר לבד בתחתית עמוד: היא עוברת לעמוד הבא יחד עם תחילת הפסקה שאחריה"><input type="checkbox" checked={value('keepWithNext', false)} onChange={(event) => edit({ keepWithNext: event.target.checked })} />שמור עם הפסקה הבאה</label><label className="page-bar-check" title="פסקה בסגנון הזה לא תתפצל בין מסגרות: אם היא לא נכנסת כולה, היא עוברת כולה למסגרת הבאה"><input type="checkbox" checked={value('keepLinesTogether', false)} onChange={(event) => edit({ keepLinesTogether: event.target.checked })} />שמור שורות יחד</label></Group>}{category === 'lists' && <Group title="תבליטים ומספור"><select className="select"><option>ללא רשימה</option><option>תבליטים</option><option>מספור</option></select></Group>}{category === 'color' && <Group title="צבע התו"><FillPicker label="צבע טקסט" value={value('color', '#111111')} onChange={(color) => edit({ color: color ?? '#111111' })} /><label className="field-label" htmlFor="style-color-tint">גוון: {value('tint', 100)}%</label><input id="style-color-tint" className="stroke-range" type="range" min="0" max="100" value={value('tint', 100)} onChange={(event) => edit({ tint: Number(event.target.value) })} /><label className="page-bar-check"><input type="checkbox" checked={!!value('overprintFill', false)} onChange={(event) => edit({ overprintFill: event.target.checked })} />הדפסת־על של מילוי</label><label className="page-bar-check"><input type="checkbox" checked={!!value('overprintStroke', false)} onChange={(event) => edit({ overprintStroke: event.target.checked })} />הדפסת־על של סטרוק</label><Labeled label="עובי סטרוק"><NumberField value={value('strokeWidth', 0)} min={0} max={200} step={0.25} onChange={(v) => edit({ strokeWidth: v })} /></Labeled></Group>}{category === 'border' && <Group title="מסגרת ורקע"><label className="page-bar-check"><input type="checkbox" />רקע לפסקה</label><label className="page-bar-check"><input type="checkbox" />מסגרת סביב פסקה</label></Group>}</div></div></div>}
      <div className="paragraph-style-actions"><button className="icon-button" aria-label="סגנון חדש" onMouseDown={(event) => event.preventDefault()} onClick={onCreate}>+</button><button className="icon-button" aria-label="מחק סגנון" disabled={styles.length <= 1} onMouseDown={(event) => event.preventDefault()} onClick={() => onDelete(active.id)}>⌫</button></div>
    </section>
  )
}
