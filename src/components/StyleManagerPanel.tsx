import { useState } from 'react'
import type { TextStyle } from '../document'
import type { ParagraphStyleRecord } from './ParagraphStylesPanel'
import { ALIGNS } from './PropertiesPanel'

interface Props {
  styles: ParagraphStyleRecord[]
  onChange: (id: string, patch: Partial<ParagraphStyleRecord>) => void
  onCreate: (name: string, patch: ParagraphStyleRecord['patch']) => void
  onSwap: (sourceId: string, targetId: string, removeSource: boolean) => void
  onSwapOne: (sourceId: string, targetId: string) => number
  onBatch: (pairs: { sourceId: string; targetId: string }[]) => void
  onFindStyle: (styleId: string, direction?: -1 | 0 | 1) => number
  onTag: (tag: string, styleId: string, removeTag: boolean, all: boolean) => void
  /** selects the next/previous/first occurrence of the tag text and scrolls to it; returns how many exist */
  onFindTag: (tag: string, direction?: -1 | 0 | 1) => number
  /** gives the occurrence the explorer is on the target style (and removes the tag, if asked); returns how many are left */
  onSwapOneTag: (tag: string, styleId: string, removeTag: boolean) => number
  onClean: (emptyParagraphs: boolean) => void
}

type Tab = 'word' | 'swap' | 'create' | 'batch' | 'tools'

const stylePatch = (fontSize: number, leading: number, align: TextStyle['align']): ParagraphStyleRecord['patch'] => ({ fontFamily: 'Segoe UI', fontSize, leading, align, weight: 400, italic: false })

export function StyleManagerPanel({ styles, onChange, onCreate, onSwap, onSwapOne, onBatch, onFindStyle, onTag, onFindTag, onSwapOneTag, onClean }: Props) {
  const [tab, setTab] = useState<Tab>('word')
  const [sourceId, setSourceId] = useState(styles[0]?.id ?? '')
  const [targetId, setTargetId] = useState(styles[1]?.id ?? styles[0]?.id ?? '')
  const [removeSource, setRemoveSource] = useState(false)
  const [tag, setTag] = useState('$')
  const [tagStyleId, setTagStyleId] = useState(styles[0]?.id ?? '')
  const [deleteTag, setDeleteTag] = useState(true)
  const [tagFound, setTagFound] = useState<number | null>(null)
  const [newName, setNewName] = useState('סגנון חדש')
  const [newSize, setNewSize] = useState(14)
  const [newLeading, setNewLeading] = useState(17)
  const [newAlign, setNewAlign] = useState<TextStyle['align']>('right')
  const [editId, setEditId] = useState(styles[0]?.id ?? '')
  const [editName, setEditName] = useState('')
  const [batchPairs, setBatchPairs] = useState(() => Array.from({ length: 4 }, (_, index) => ({ sourceId: styles[index % Math.max(1, styles.length)]?.id ?? '', targetId: styles[(index + 1) % Math.max(1, styles.length)]?.id ?? '' })))
  const [wordSourceId, setWordSourceId] = useState(styles[0]?.id ?? '')
  const [wordTargetId, setWordTargetId] = useState(styles[1]?.id ?? styles[0]?.id ?? '')
  const [wordFound, setWordFound] = useState<number | null>(null)
  const selectedEdit = styles.find((style) => style.id === editId)

  const selectEdit = (id: string) => {
    setEditId(id)
    const style = styles.find((candidate) => candidate.id === id)
    setEditName(style?.name ?? '')
  }
  const optionList = styles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)

  return (
    <section className="style-manager-panel props-panel" aria-label="ניהול סגנונות" dir="rtl">
      <div className="style-manager-head"><div><h2 className="props-title">ניהול סגנונות</h2><p className="muted">כלי עימוד, החלפה וניקוי</p></div><span className="style-manager-mark">Aa</span></div>
      <nav className="style-manager-tabs" aria-label="כלי ניהול סגנונות">
        {([['word', 'ניקוי וורד'], ['swap', 'החלפה'], ['create', 'יצירה ועריכה'], ['batch', 'קבוצתית'], ['tools', 'כלים']] as [Tab, string][]).map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}
      </nav>

      {tab === 'word' && <div className="style-manager-section">
        <label className="field-label">סגנון מקור<select className="select" value={wordSourceId} onChange={(e) => { setWordSourceId(e.target.value); setWordFound(null) }}>{optionList}</select></label>
        <fieldset className="style-manager-explorer"><legend>סייר סגנונות מקור</legend><div className="style-manager-actions"><button className="btn" onClick={() => { const count = onFindStyle(wordSourceId, -1); setWordFound(count) }}>« הקודם</button><button className="btn" onClick={() => { const count = onFindStyle(wordSourceId, 0); setWordFound(count) }}>הצג מופע ראשון</button><button className="btn" onClick={() => { const count = onFindStyle(wordSourceId, 1); setWordFound(count) }}>הבא »</button></div><p className="style-manager-status">{wordFound === null ? 'בחר סגנון ולחץ על הצג מופע ראשון' : wordFound ? `נמצאו ${wordFound} מופעים לסגנון זה.` : 'לא נמצאו מופעים לסגנון זה.'}</p></fieldset>
        <label className="field-label">סגנון יעד<select className="select" value={wordTargetId} onChange={(e) => setWordTargetId(e.target.value)}>{optionList}</select></label>
        <div className="style-manager-actions"><button className="btn" disabled={!wordSourceId || !wordTargetId || wordSourceId === wordTargetId} onClick={() => setWordFound(onSwapOne(wordSourceId, wordTargetId))}>החלף מופע זה</button><button className="btn primary" disabled={!wordSourceId || !wordTargetId || wordSourceId === wordTargetId} onClick={() => { onSwap(wordSourceId, wordTargetId, true); setWordSourceId(wordTargetId); setWordTargetId(styles.find((style) => style.id !== wordSourceId && style.id !== wordTargetId)?.id ?? wordTargetId); setWordFound(null) }}>החלף הכל ומחק סגנון</button></div>
      </div>}

      {tab === 'swap' && <div className="style-manager-section">
        <p className="muted">החלפת כל הפסקאות המקושרות לסגנון, עם ניקוי דריסות עיצוב.</p>
        <label className="field-label">סגנון מקור<select className="select" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>{optionList}</select></label>
        <label className="field-label">סגנון יעד<select className="select" value={targetId} onChange={(e) => setTargetId(e.target.value)}>{optionList}</select></label>
        <label className="dlg-check"><input type="checkbox" checked={removeSource} onChange={(e) => setRemoveSource(e.target.checked)} />מחק את סגנון המקור לאחר ההחלפה</label>
        <button className="btn primary" disabled={!sourceId || !targetId || sourceId === targetId} onClick={() => onSwap(sourceId, targetId, removeSource)}>החלף בכל המסמך</button>
      </div>}

      {tab === 'create' && <div className="style-manager-section">
        <h3>יצירת סגנון חדש</h3>
        <label className="field-label">שם<input className="select" value={newName} onChange={(e) => setNewName(e.target.value)} /></label>
        <div className="grid2"><label className="field-label">גודל<input className="select" type="number" min="1" value={newSize} onChange={(e) => setNewSize(Number(e.target.value))} /></label><label className="field-label">שורה<input className="select" type="number" min="0" value={newLeading} onChange={(e) => setNewLeading(Number(e.target.value))} /></label></div>
        <label className="field-label">יישור</label>
        <div className="toggle-group">{ALIGNS.map((a) => <button key={a.id} className={newAlign === a.id ? 'on' : ''} title={a.label} aria-label={a.label} onClick={() => setNewAlign(a.id)}><svg viewBox="0 0 24 24"><path d={a.icon} /></svg></button>)}</div>
        <button className="btn primary" onClick={() => onCreate(newName.trim() || 'סגנון חדש', stylePatch(newSize || 14, Number.isFinite(newLeading) ? newLeading : 17, newAlign))}>צור סגנון</button>
        <hr />
        <h3>עריכת סגנון קיים</h3>
        <select className="select" value={editId} onChange={(e) => selectEdit(e.target.value)}>{optionList}</select>
        {selectedEdit && <><label className="field-label">שם<input className="select" value={editName || selectedEdit.name} onChange={(e) => setEditName(e.target.value)} /></label><button className="btn" onClick={() => onChange(editId, { name: editName || selectedEdit.name })}>עדכן שם</button></>}
      </div>}

      {tab === 'batch' && <div className="style-manager-section">
        <p className="muted">בחר זוגות של מקור ויעד והפעל אותם ברצף.</p>
        {batchPairs.map((pair, index) => <div className="style-manager-pair" key={index}><select className="select" aria-label={`מקור ${index + 1}`} value={pair.sourceId} onChange={(e) => setBatchPairs((current) => current.map((item, i) => i === index ? { ...item, sourceId: e.target.value } : item))}>{optionList}</select><span>←</span><select className="select" aria-label={`יעד ${index + 1}`} value={pair.targetId} onChange={(e) => setBatchPairs((current) => current.map((item, i) => i === index ? { ...item, targetId: e.target.value } : item))}>{optionList}</select></div>)}
        <button className="btn primary" onClick={() => onBatch(batchPairs.filter((pair) => pair.sourceId && pair.targetId && pair.sourceId !== pair.targetId))}>בצע החלפה קבוצתית</button>
      </div>}

      {tab === 'tools' && <div className="style-manager-section">
        <h3>סגנון לפי תגית</h3>
        <label className="field-label">סימן לחיפוש<input className="select" value={tag} onChange={(e) => { setTag(e.target.value); setTagFound(null) }} /></label>
        <fieldset className="style-manager-explorer"><legend>סייר סימנים</legend><div className="style-manager-actions"><button className="btn" onClick={() => setTagFound(onFindTag(tag, -1))}>« הקודם</button><button className="btn" onClick={() => setTagFound(onFindTag(tag, 0))}>הצג מופע ראשון</button><button className="btn" onClick={() => setTagFound(onFindTag(tag, 1))}>הבא »</button></div><p className="style-manager-status">{tagFound === null ? 'בחר סימן ולחץ על הצג מופע ראשון' : tagFound ? `נמצאו ${tagFound} מופעים לסימן זה.` : 'לא נמצאו מופעים לסימן זה.'}</p></fieldset>
        <label className="field-label">סגנון יעד<select className="select" value={tagStyleId} onChange={(e) => setTagStyleId(e.target.value)}>{optionList}</select></label>
        <label className="dlg-check"><input type="checkbox" checked={deleteTag} onChange={(e) => setDeleteTag(e.target.checked)} />מחק את הסימן לאחר ההמרה</label>
        <div className="style-manager-actions"><button className="btn" disabled={!tag || !tagStyleId} onClick={() => setTagFound(onSwapOneTag(tag, tagStyleId, deleteTag))}>החלף מופע זה</button><button className="btn primary" disabled={!tag || !tagStyleId} onClick={() => { onTag(tag, tagStyleId, deleteTag, true); setTagFound(null) }}>החלף בכל המסמך</button></div>
        <hr />
        <h3>ניקוי מסמך</h3>
        <button className="btn" onClick={() => onClean(false)}>צמצם רווחים כפולים</button><button className="btn danger" onClick={() => onClean(true)}>מחק פסקאות ריקות מיותרות</button>
      </div>}
    </section>
  )
}
