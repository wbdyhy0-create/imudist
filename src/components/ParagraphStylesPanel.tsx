import { lookTurnedBy } from '../document'
import { WINDOW_MIN_LINES, WINDOW_WORDS } from '../windowText'
import { useEffect, useRef, useState } from 'react'
import { DEFAULT_SPACE_AFTER, type CharacterStyleRecord, type NestedStyleRule, type ObjectStyleRecord, type ParagraphStyleRecord } from '../document'
import { MAX_GRAPHIC_SVG, objectStyleVisible } from '../objectStyles'
import { NestedStylesEditor } from './NestedStylesEditor'
import { StyleLayersEditor } from './StyleLayersEditor'
import { NumberField } from './NumberField'
import { ALIGNS, alignIcon, Group, Labeled, TEXT_DIRECTIONS } from './PropertiesPanel'
import type { Unit } from '../units'
import { FontPicker } from './FontPicker'
import { MinimumFontHint } from './MinimumFontHint'
import { useFontCatalog } from '../fonts'
import { FillPicker } from './FillPicker'
import { FillStrokeSwatches } from './FillStrokeSwatches'
import { ContextMenu } from './ContextMenu'
import { t } from '../i18n'

export type { ParagraphStyleRecord } from '../document'

interface Props {
  styles: ParagraphStyleRecord[]
  unit: Unit
  /** the panel's tab is the one showing (the dock keeps it mounted while another is): coming back to it shows the list only */
  shown?: boolean
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
  /** the document's object styles: what the decoration of a paragraph style is drawn in */
  objectStyles?: ObjectStyleRecord[]
  /** give the nested styles of a paragraph style to every paragraph that is in it now */
  onApplyNested?: (styleId: string) => void
  /** the nested style rules the paragraphs selected in the text show */
  onDetectNested?: () => { rules: NestedStyleRule[]; paragraphs: number } | null
  /** the style that sets the look of the footnote reference numbers in the text (the footnote options hold it) */
  referenceStyleId?: string
  /** make a style the one for the reference numbers, or (undefined) none */
  onReferenceStyleChange?: (styleId: string | undefined) => void
}

export function ParagraphStylesPanel({ styles, unit, shown = true, onApply, onChange, onCreate, onDelete, onDeleteMany, highlightId, modified, onConfirmOverrides, onDiscardOverrides, characterStyles = [], objectStyles = [], onApplyNested, onDetectNested, referenceStyleId, onReferenceStyleChange }: Props) {
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
  const [styleColorTarget, setStyleColorTarget] = useState<'fill' | 'stroke'>('fill')
  const [category, setCategory] = useState('general')
  const [modalPosition, setModalPosition] = useState<{ x: number; y: number } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ styleId: string; x: number; y: number } | null>(null)
  const modalDrag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const sectionRef = useRef<HTMLElement>(null)

  // the dock keeps a tab's panel mounted while another tab is shown: coming back to this tab shows the list of styles only, with
  // no options window of the style worked on before (which would also open on the tab it was left on)
  const wasShown = useRef(shown)
  useEffect(() => {
    if (shown && !wasShown.current) {
      setEditing(false)
      setCategory('general')
    }
    wasShown.current = shown
  }, [shown])
  const fontCatalog = useFontCatalog()
  const active = styles.find((style) => style.id === activeId) ?? styles[0]
  // before the early return below: a hook after it would be called on some renders and not on others (no styles yet)
  const activeListKind = active?.patch.listKind
  useEffect(() => {
    if (!editing || category !== 'lists') return
    const select = sectionRef.current?.querySelector<HTMLSelectElement>('.paragraph-style-modal-body select')
    if (select) select.selectedIndex = activeListKind === 'bullet' ? 1 : activeListKind === 'number' ? 2 : 0
  }, [editing, category, active?.id, activeListKind])
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
    <section ref={sectionRef} className="paragraph-styles-panel props-panel" aria-label={t('סגנונות פסקה')}>
      <div className="styles-panel-head"><h2 className="props-title">{t('סגנונות פסקה')}</h2><button className="icon-button" aria-label={t('סגנון חדש')} onMouseDown={(event) => event.preventDefault()} onClick={onCreate}>+</button></div>
      <div className="paragraph-style-list">
        {styles.map((style) => <button key={style.id} className={'paragraph-style-row' + (style.id === shownId ? ' active' : '') + (rangeIds.includes(style.id) ? ' range-selected' : '')} onMouseDown={(event) => { if (event.button === 0) event.preventDefault() }} onContextMenu={(event) => { event.preventDefault(); if (styles.length > 1) { setActiveId(style.id); openStyleMenu(style.id, event.clientX, event.clientY) } }} onClick={(event) => chooseStyle(style.id, event.shiftKey)} onDoubleClick={(event) => { if (editing && style.id === active.id) { setEditing(false); return } const row = event.currentTarget.getBoundingClientRect(); const width = Math.min(520, window.innerWidth - 32); setModalPosition({ x: Math.max(8, Math.min(row.left - width - 12, window.innerWidth - width - 8)), y: Math.max(8, Math.min(row.top - 40, window.innerHeight - 560)) }); setActiveId(style.id); setCategory('general'); setEditing(true) }}><span className="style-sample" style={{ fontWeight: style.patch.weight ?? 400 }}>{style.name}{modified && style.id === shownId && <span className="style-dot" role="img" aria-label={t('שינויים בפסקה')} title={t('בפסקה יש שינויים שאינם חלק מהסגנון. אפשר לאשר אותם, להחזיר את הפסקה לסגנון, או ליצור מהם סגנון חדש (+)')} />}</span>{style.id === referenceStyleId && <span className="style-meta style-reference-badge" title={t('הסגנון של מספרי ההפניה בהערות השוליים')}>{t('מספרי הפניה')}</span>}<span className="style-meta">{style.basedOnId ? t('מבוסס') : t('בסיס')}</span></button>)}
      </div>
      {modified && !editing && shownId && <div className="paragraph-style-pending"><span>{t('בפסקה יש שינויים שאינם חלק מהסגנון „{name}”.', { name: styles.find((style) => style.id === shownId)?.name ?? '' })}</span><div className="paragraph-style-pending-actions"><button className="btn small" title={t('להחזיר את הפסקה בדיוק כפי שהסגנון מגדיר אותה')} onMouseDown={(event) => event.preventDefault()} onClick={onDiscardOverrides}>{t('החזר לסגנון')}</button><button className="btn small primary" title={t('לעדכן את הסגנון לפי הפסקה: השינויים נכנסים להגדרות הסגנון, וגם שאר הפסקאות בסגנון הזה מתעדכנות')} onMouseDown={(event) => event.preventDefault()} onClick={onConfirmOverrides}>{t('אישור (עדכון הסגנון)')}</button></div></div>}
      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} items={[{ label: rangeIds.length > 1 ? t('מחק {n1} סגנונות', { n1: rangeIds.length }) : t('מחק את סגנון הפסקה הנבחר'), disabled: rangeIds.length >= styles.length, onClick: () => rangeIds.length > 1 ? onDeleteMany(rangeIds) : onDelete(contextMenu.styleId) }, ...(onReferenceStyleChange ? [{ label: contextMenu.styleId === referenceStyleId ? t('בטל את השימוש בסגנון למספרי ההפניה') : t('השתמש בסגנון הזה למספרי ההפניה של הערות שוליים'), onClick: () => onReferenceStyleChange(contextMenu.styleId === referenceStyleId ? undefined : contextMenu.styleId) }] : [])]} />}
      {editing && <div className="paragraph-style-modal" role="dialog" aria-label={t('אפשרויות סגנון פסקה')} style={modalPosition ? { left: modalPosition.x, top: modalPosition.y, transform: 'none' } : undefined}><div className="paragraph-style-modal-head" onPointerDown={startModalDrag}><strong>{t('⠿ אפשרויות סגנון פסקה')}</strong><button className="icon-button" onPointerDown={(event) => event.stopPropagation()} onClick={() => setEditing(false)} aria-label={t('סגור')}>×</button></div>
        {modified && active.id === shownId && <div className="paragraph-style-pending"><span>{t('לטקסט שבפסקה יש שינויים שאינם חלק מהסגנון.')}</span><div className="paragraph-style-pending-actions"><button className="btn small" onMouseDown={(event) => event.preventDefault()} onClick={onDiscardOverrides}>{t('ביטול')}</button><button className="btn small primary" title={t('לעדכן את הסגנון לפי הפסקה')} onMouseDown={(event) => event.preventDefault()} onClick={onConfirmOverrides}>{t('אישור (עדכון הסגנון)')}</button></div></div>}
        <div className="paragraph-style-modal-layout"><nav className="paragraph-style-categories" aria-label={t('קטגוריות סגנון')}>
        {[['general', t('כללי')], ['basic', t('תווים בסיסיים')], ['indents', t('הזחות וריווחים')], ['keep', t('שמירה על רצף')], ['nested', t('סגנונות מקוננים')], ['layers', t('שכבות סגנון')], ['lists', t('תבליטים ומספור')], ['color', t('צבע תו')], ['border', t('מסגרת ורקע')], ['decoration', t('עיטור')]].map(([id, label]) => <button key={id} className={category === id ? 'active' : ''} onClick={() => setCategory(id)}>{label}</button>)}
      </nav><div className="paragraph-style-modal-body">{category === 'general' && <Group title={t('כללי')}>
        <Labeled label={t('שם הסגנון')}><input className="select" value={active.name} onChange={(event) => onChange(active.id, { name: event.target.value })} /></Labeled>
        <label className="field-label">{t('מבוסס על')}</label>
        <select className="select" value={active.basedOnId ?? ''} onChange={(event) => onChange(active.id, { basedOnId: event.target.value || undefined })}><option value="">{t('ללא')}</option>{styles.filter((style) => style.id !== active.id).map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}</select>
        <label className="field-label">{t('סגנון הבא')}</label>
        <select className="select" value={active.nextStyleId ?? ''} onChange={(event) => onChange(active.id, { nextStyleId: event.target.value || undefined })} title={t('הסגנון שפסקה חדשה תקבל בלחיצת Enter בסוף פסקה בסגנון הזה')}><option value="">{t('אותו הסגנון')}</option>{styles.filter((style) => style.id !== active.id).map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}</select>
        {onReferenceStyleChange && <label className="page-bar-check" title={t('מספרי ההפניה להערות שוליים בטקסט יוצגו בגופן, במשקל, בצבע ובגודל של הסגנון הזה (הגדרה זו קיימת גם באפשרויות הערות שוליים)')}><input type="checkbox" checked={referenceStyleId === active.id} onChange={(event) => onReferenceStyleChange(event.target.checked ? active.id : undefined)} />{t('משמש למספרי ההפניה של הערות שוליים')}</label>}
      </Group>}{category === 'basic' && <Group title={t('עיצוב תווים')}>
        <Labeled label={t('גופן')}><FontPicker value={value('fontFamily', 'Segoe UI')} families={fontCatalog.families} onChange={(fontFamily) => edit({ fontFamily })} /></Labeled>
        <Labeled label={t('משקל וסגנון')}><select className="select" value={selectedFace} onChange={(event) => { const [weight, italic] = event.target.value.split('|'); edit({ weight: Number(weight), italic: italic === '1' }) }}>{!selectedFamily?.faces.some((face) => `${face.weight}|${face.italic ? 1 : 0}` === selectedFace) && <option value={selectedFace}>{t('נוכחי')}</option>}{(selectedFamily?.faces ?? [{ weight: 400, italic: false, style: 'Regular' }]).map((face) => <option key={`${face.weight}|${face.italic}`} value={`${face.weight}|${face.italic ? 1 : 0}`}>{face.style}</option>)}</select></Labeled>
        <div className="grid2"><Labeled label={t('גודל')}><NumberField value={value('fontSize', 14)} unit="px" unitLabel="pt" min={1} max={999} onChange={(v) => edit({ fontSize: v })} /><MinimumFontHint size={value('fontSize', 14)} /></Labeled><Labeled label={t('מרווח בין שורות')}><NumberField value={value('leading', 17)} unit="px" unitLabel="pt" min={0} max={999} onChange={(v) => edit({ leading: v })} /></Labeled></div>
        <div className="toggle-group"><button className={value('weight', 400) >= 600 ? 'on' : ''} onClick={() => edit({ weight: value('weight', 400) >= 600 ? 400 : 700 })}>B</button><button className={value('italic', false) ? 'on' : ''} onClick={() => edit({ italic: !value('italic', false) })}><i>I</i></button></div>
        <Labeled label={t('מרווח בין פסקאות')}><NumberField value={value('spaceAfter', DEFAULT_SPACE_AFTER)} unit={unit} min={0} onChange={(v) => edit({ spaceAfter: v })} /></Labeled>
        <Labeled label={t('ריווח בין אותיות (% מגודל הגופן)')}><NumberField value={value('tracking', 0) / 10} suffix="%" step={1} min={-50} max={50} onChange={(v) => edit({ tracking: Math.round(v * 10) })} /></Labeled>
        <Labeled label={t('ריווח בין מילים (% מהרווח הרגיל)')}><NumberField value={value('wordSpacing', 100)} suffix="%" step={10} min={0} max={500} onChange={(v) => edit({ wordSpacing: v })} /></Labeled>
      </Group>}{category === 'indents' && <Group title={t('הזחות וריווחים')}>
        <Labeled label={t('מרווח בין שורות')}><NumberField value={value('leading', 17)} unit="px" unitLabel="pt" min={0} max={999} onChange={(v) => edit({ leading: v })} /></Labeled>
        <p className="field-subhead">{t('רווח בין פסקאות')}</p>
        <div className="grid2"><Labeled label={t('רווח לפני')}><NumberField value={value('spaceBefore', 0)} unit={unit} onChange={(v) => edit({ spaceBefore: v })} /></Labeled><Labeled label={t('רווח אחרי')}><NumberField value={value('spaceAfter', DEFAULT_SPACE_AFTER)} unit={unit} onChange={(v) => edit({ spaceAfter: v })} /></Labeled></div>
        <p className="field-subhead">{t('הזחות שוליים')}</p>
        <div className="grid2"><Labeled label={t('הזחה מימין')}><NumberField value={value('indentRight', 0)} unit={unit} onChange={(v) => edit({ indentRight: v })} /></Labeled><Labeled label={t('הזחה משמאל')}><NumberField value={value('indentLeft', 0)} unit={unit} onChange={(v) => edit({ indentLeft: v })} /></Labeled></div>
        <Labeled label={t('הזחת שורה ראשונה לשמאל')}><NumberField value={value('firstLineIndent', 0)} unit={unit} onChange={(v) => edit({ firstLineIndent: v })} /></Labeled>
        <p className="field-subhead">{t('חלון בטקסט (מובנה בסגנון)')}</p>
        <label className="page-bar-check" title={t('כל פסקה בסגנון הזה (וגם בסגנון המבוסס עליו) מקבלת חלון מתחת למילות הפתיחה שלה: בפסקה חדשה, בטקסט שהודבק ואחרי כל עריכה')}><input type="checkbox" checked={!!active.window} onChange={(event) => onChange(active.id, { window: event.target.checked ? { words: 1, minLines: 3 } : undefined })} /><span>{t('חלון מובנה בסגנון')}</span></label>
        {active.window && <>
          <Labeled label={t('רוחב החלון במילים')}><select className="select" value={active.window.words} onChange={(event) => onChange(active.id, { window: { ...active.window!, words: Number(event.target.value) } })}>{WINDOW_WORDS.map((words) => <option key={words} value={words}>{words}</option>)}</select></Labeled>
          <Labeled label={t('מינימום שורות בפסקה')}><select className="select" value={active.window.minLines} onChange={(event) => onChange(active.id, { window: { ...active.window!, minLines: Number(event.target.value) } })}>{WINDOW_MIN_LINES.map((lines) => <option key={lines} value={lines}>{lines === 3 ? t('שלוש שורות') : t('ארבע שורות')}</option>)}</select></Labeled>
          <Labeled label={t('עיצוב מילות הפתיחה בסגנון')}><select className="select" value={active.window.openingStyleId ?? ''} onChange={(event) => onChange(active.id, { window: { ...active.window!, openingStyleId: event.target.value || undefined } })}><option value="">{t('ללא (המילים נשארות כמו הטקסט)')}</option>{styles.filter((style) => style.id !== active.id).map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}</select></Labeled>
        </>}
        <p className="muted">{t('השורה השנייה של הפסקה מוזחת ברוחב מילות הפתיחה, וכך נוצר חלון מתחתיהן. החלון נמדד מחדש מעצמו אחרי כל שינוי בטקסט, וגם פסקה שנוספת בסגנון הזה מקבלת אותו. פסקאות קצרות מהמינימום נשארות בלי חלון.')}</p>
        <div className="grid2"><Labeled label={t('ריווח מילים: מינימום')}><NumberField value={value('wordSpacingMin', 90)} suffix="%" min={10} max={100} onChange={(v) => edit({ wordSpacingMin: v })} /></Labeled><Labeled label={t('ריווח מילים: מקסימום')}><NumberField value={value('wordSpacingMax', 120)} suffix="%" min={100} max={500} onChange={(v) => edit({ wordSpacingMax: v })} /></Labeled></div>
        <div className="toggle-group">{ALIGNS.map((a) => <button key={a.id} className={value('align', 'right') === a.id ? 'on' : ''} title={a.label} aria-label={a.label} onClick={() => edit({ align: a.id })}><svg viewBox="0 0 24 24"><path d={alignIcon(a, value('direction', 'rtl'))} /></svg></button>)}</div>
        <Labeled label={t('כיוון הטקסט')}>
          <div className="toggle-group" role="radiogroup" aria-label={t('כיוון הטקסט')}>
            {TEXT_DIRECTIONS.map((d) => <button key={d.id} role="radio" aria-checked={value('direction', 'rtl') === d.id} className={value('direction', 'rtl') === d.id ? 'on' : ''} title={d.title} aria-label={d.title} onClick={() => edit({ direction: d.id, ...lookTurnedBy({ direction: d.id }, { align: value('align', 'right'), direction: value('direction', 'rtl'), indentLeft: active.patch.indentLeft, indentRight: active.patch.indentRight }) })}>{d.short}</button>)}
          </div>
        </Labeled>
      </Group>}{category === 'decoration' && <Group title={t('עיטור לכותרת')}>
        <p className="muted">{t('פס, קו או חץ שמצויר מעל הפסקה או מתחתיה, בעיצוב של סגנון אובייקט. שינוי בסגנון האובייקט מתעדכן בכל הפסקאות שבסגנון הזה.')}</p>
        {(() => {
          const deco = active.patch.decoration
          const record = deco ? objectStyles.find((style) => style.id === deco.objectStyleId) : undefined
          const known = !!record
          // a style made from an ornament, a picture or several shapes is that drawing, as wide as `length` says
          const drawing = !!record?.graphic
          return (
            <>
              <label className="page-bar-check"><input type="checkbox" checked={!!deco} disabled={!deco && objectStyles.length === 0} onChange={(event) => edit({ decoration: event.target.checked ? { objectStyleId: objectStyles[0].id, position: 'above', height: 3, gap: 6, length: 0, align: 'start' } : undefined })} />{t('הצמד עיטור לפסקאות בסגנון')}</label>
              {objectStyles.length === 0 && <p className="muted">{t('אין עדיין סגנונות אובייקט. אפשר ליצור אחד בלשונית „סגנונות אובייקט”: עיצבו פס, קו או חץ ושמרו אותו כסגנון.')}</p>}
              {deco && (
                <>
                  <Labeled label={t('סגנון האובייקט')}>
                    <select className="select" value={deco.objectStyleId} onChange={(event) => edit({ decoration: { ...deco, objectStyleId: event.target.value } })}>
                      {!known && <option value={deco.objectStyleId}>{t('(הסגנון נמחק)')}</option>}
                      {objectStyles.map((style) => <option key={style.id} value={style.id}>{objectStyleVisible(style) ? style.name : t('{n1} (ריק)', { n1: style.name })}</option>)}
                    </select>
                  </Labeled>
                  {!known && <p className="muted">{t('סגנון האובייקט נמחק, ולכן אין עיטור. בחרו סגנון אחר.')}</p>}
                  {record && !objectStyleVisible(record) && (
                    <p className="paragraph-style-pending">
                      <span>{t('בסגנון „{name}” אין מילוי, קו או ציור, ולכן אין מה לצייר בעיטור. בחרו את האובייקט שרוצים לראות ליד הכותרות, ובלשונית „סגנונות אובייקט” סמנו את הסגנון ולחצו „הגדר מחדש לפי האובייקט הנבחר”, או צרו ממנו סגנון חדש.', { name: record.name })}</span>
                    </p>
                  )}
                  {record?.graphic && record.graphic.svg.length > MAX_GRAPHIC_SVG && (
                    <p className="paragraph-style-pending"><span>{t('הציור של הסגנון גדול מדי להצגה כעיטור. צרו את הסגנון מחדש מהאובייקט.')}</span></p>
                  )}
                  <Labeled label={t('מיקום')}>
                    <select className="select" value={deco.position} onChange={(event) => edit({ decoration: { ...deco, position: event.target.value === 'below' ? 'below' : event.target.value === 'behind' ? 'behind' : 'above' } })}>
                      <option value="above">{t('מעל הפסקה')}</option>
                      <option value="below">{t('מתחת לפסקה')}</option>
                      <option value="behind">{t('מאחורי הכותרת (מתחת לטקסט, בגודלו)')}</option>
                    </select>
                  </Labeled>
                  {deco.position === 'behind' ? (
                    <Labeled label={t('שוליים סביב הטקסט')}><NumberField value={deco.gap} unit={unit} min={0} max={500} onChange={(gap) => edit({ decoration: { ...deco, gap } })} /></Labeled>
                  ) : (<>
                  <div className="grid2">
                    {!drawing && <Labeled label={t('עובי הפס')}><NumberField value={deco.height} unit={unit} min={0.25} max={500} onChange={(height) => edit({ decoration: { ...deco, height } })} /></Labeled>}
                    <Labeled label={t('רווח מהטקסט')}><NumberField value={deco.gap} unit={unit} min={0} max={500} onChange={(gap) => edit({ decoration: { ...deco, gap } })} /></Labeled>
                  </div>
                  <div className="grid2">
                    <Labeled label={drawing ? t('רוחב הציור (0 = הרוחב המקורי)') : t('אורך (0 = כל הרוחב)')}><NumberField value={deco.length} unit={unit} min={0} max={5000} onChange={(length) => edit({ decoration: { ...deco, length } })} /></Labeled>
                    <Labeled label={t('יישור')}>
                      <select className="select" value={deco.align} onChange={(event) => edit({ decoration: { ...deco, align: event.target.value === 'center' ? 'center' : event.target.value === 'end' ? 'end' : 'start' } })}>
                        <option value="start">{t('בתחילת השורה')}</option>
                        <option value="center">{t('במרכז')}</option>
                        <option value="end">{t('בסוף השורה')}</option>
                      </select>
                    </Labeled>
                  </div>
                  </>)}
                  <p className="muted">
                    {deco.position === 'behind'
                      ? t('העיטור נמתח על התיבה של הטקסט, אז לכל כותרת יש עיטור בגודל שלה: כותרת צרה או רחבה, שורה אחת או כמה. הוא מצטרף ליישור הכותרת, והשוליים מרחיבים אותו מעבר לטקסט.')
                      : drawing
                      ? t('הסגנון נוצר מציור (קישוט, תמונה או כמה צורות): הוא מצויר ביחס שלו ולא רחב מהעמודה.')
                      : t('עובי הפס משמש לפס רגיל. קו עם ראשי חץ או עובי משתנה מצויר באורך שנקבע כאן (כשהוא 0: 240 נק׳) ובעובי של הקו עצמו.')}
                  </p>
                </>
              )}
            </>
          )
        })()}
      </Group>}{category === 'nested' && <Group title={t('סגנונות מקוננים (שייך לסגנון תו)')}><NestedStylesEditor rules={active.nested ?? []} characterStyles={characterStyles} onChange={(nested) => onChange(active.id, { nested: nested.length ? nested : undefined })} onApply={() => onApplyNested?.(active.id)} onDetect={onDetectNested} /></Group>}{category === 'layers' && <Group title={t('שכבות סגנון (סגנון תו נוסף, מעל הטקסט)')}><StyleLayersEditor rules={active.layers ?? []} characterStyles={characterStyles} onChange={(layers) => onChange(active.id, { layers: layers.length ? layers : undefined })} /></Group>}{category === 'keep' && <Group title={t('אפשרויות שמירה')}><label className="page-bar-check" title={t('פסקה בסגנון הזה (פסוק, כותרת) לא תישאר לבד בתחתית עמוד: היא עוברת לעמוד הבא יחד עם תחילת הפסקה שאחריה. חל רק כשהפסקה שאחריה היא בסגנון אחר')}><input type="checkbox" checked={value('keepWithNext', false)} onChange={(event) => edit({ keepWithNext: event.target.checked })} />{t('שמור עם הפסקה הבאה')}</label><p className="muted">{t('חל רק על פסקה שהפסקה שאחריה בסגנון אחר (למשל פסוק שצמוד לטקסט רץ), ולא בין פסקאות רצופות של אותו סגנון.')}</p><label className="page-bar-check" title={t('כל פסקה בסגנון הזה (למשל תחילת פרק) מתחילה בתיבת הטקסט הבאה, בדרך כלל בעמוד חדש. מה שבא לפניה נשאר בתיבה הקודמת')}><input type="checkbox" checked={value('pageBreakBefore', false)} onChange={(event) => edit({ pageBreakBefore: event.target.checked ? true : undefined })} />{t('התחל בעמוד חדש')}</label><p className="muted">{t('הפסקה עוברת לתיבה הבאה בשרשרת הטקסט (בדרך כלל העמוד הבא). אם אין תיבה כזו, הטקסט שאחריה נשאר כגלישה: הוסיפו עמוד.')}</p></Group>}{category === 'lists' && <Group title={t('תבליטים ומספור')}><select className="select" aria-label={t('סוג רשימה')} value={active.patch.listKind ?? ''} onChange={(event) => { const listKind = event.target.value === 'bullet' ? 'bullet' : event.target.value === 'number' ? 'number' : undefined; edit({ listKind, ...(listKind ? {} : { listGap: undefined }) }) }}><option value="">{t('ללא רשימה')}</option><option value="bullet">{t('תבליטים')}</option><option value="number">{t('מספור')}</option></select>{active.patch.listKind && <Labeled label={t('מרווח בין הסמן לטקסט')}><NumberField value={value('listGap', 4)} unit="px" unitLabel="pt" min={0} max={100} onChange={(listGap) => edit({ listGap })} /></Labeled>}</Group>}{category === 'color' && <Group title={t('צבע התו')}><div className="field"><FillStrokeSwatches kind="text" fill={active.patch.color ?? '#ffffff'} stroke={value('outlineWidth', 0) > 0 ? value('outlineColor', '#000000') : null} strokeWidth={value('outlineWidth', 0)} onWidth={(outlineWidth) => edit({ outlineWidth })} active={styleColorTarget} onSelect={setStyleColorTarget} label={t('החל צבע על טקסט')} /></div>{styleColorTarget === 'fill' ? <><div className="field"><FillPicker label={t('צבע טקסט')} value={value('color', '#111111') === 'transparent' ? null : value('color', '#111111')} onChange={(color) => edit({ color: color ?? 'transparent' })} /></div><div className="field"><label className="field-label" htmlFor="style-color-tint">{t('גוון: {percent}% (100% הוא הצבע המלא, פחות מכך מבהיר אותו)', { percent: value('tint', 100) })}</label><input id="style-color-tint" className="stroke-range" type="range" min="0" max="100" value={value('tint', 100)} onChange={(event) => edit({ tint: Number(event.target.value) })} /></div></> : <><div className="field"><div className="field-label">{t('קו מתאר (סטרוק סביב האותיות)')}</div><FillPicker label={t('צבע קו מתאר')} value={value('outlineWidth', 0) > 0 ? value('outlineColor', '#000000') : null} onChange={(outlineColor) => edit(outlineColor === null ? { outlineWidth: 0 } : { outlineColor, ...(value('outlineWidth', 0) > 0 ? {} : { outlineWidth: 0.5 }) })} /></div></>}</Group>}{category === 'border' && <Group title={t('מסגרת ורקע')}><label className="page-bar-check" style={{ marginBottom: 8 }}><input type="checkbox" checked={!!active.patch.background} onChange={(event) => edit({ background: event.target.checked ? '#fff2a8' : undefined })} />{t('רקע לפסקה')}</label>{active.patch.background && <div className="field"><FillPicker label={t('צבע רקע')} value={active.patch.background} onChange={(background) => edit({ background: background ?? undefined })} /></div>}<label className="page-bar-check" style={{ display: 'flex', marginTop: 30, paddingTop: 20, marginBottom: 12, borderTop: '1px solid var(--border)' }}><input type="checkbox" checked={(active.patch.borderWidth ?? 0) > 0} onChange={(event) => edit(event.target.checked ? { borderWidth: 0.25, borderColor: active.patch.borderColor ?? '#000000' } : { borderWidth: undefined, borderColor: undefined })} />{t('מסגרת סביב פסקה')}</label>{(active.patch.borderWidth ?? 0) > 0 && <><div className="field"><FillPicker label={t('צבע מסגרת')} value={value('borderColor', '#000000')} onChange={(borderColor) => edit({ borderColor: borderColor ?? '#000000' })} /></div><Labeled label={t('עובי מסגרת')}><NumberField value={value('borderWidth', 0.25)} min={0.25} max={50} step={0.25} onChange={(borderWidth) => edit({ borderWidth })} /></Labeled></>}</Group>}</div></div></div>}
      <div className="paragraph-style-actions"><button className="icon-button" aria-label={t('סגנון חדש')} onMouseDown={(event) => event.preventDefault()} onClick={onCreate}>+</button><button className="icon-button" aria-label={t('מחק סגנון')} disabled={styles.length <= 1} onMouseDown={(event) => event.preventDefault()} onClick={() => onDelete(active.id)}>⌫</button></div>
    </section>
  )
}
