import { useEffect, useState } from 'react'
import type { ColorUse } from '../colorParagraphs'
import type { ParagraphStyleRecord } from './ParagraphStylesPanel'
import { t } from '../i18n'

interface Props {
  styles: ParagraphStyleRecord[]
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
  /** the colours the text of the document has, with the number of paragraphs in each */
  onListColors: () => ColorUse[]
  /** selects the next/previous/first paragraph in the colour and scrolls to it; returns how many there are */
  onFindColor: (color: string, partial: boolean, direction?: -1 | 0 | 1) => number
  /** gives the paragraph the explorer is on the style (and shows the next one); returns how many are left, and the colours now */
  onSwapOneColor: (color: string, partial: boolean, styleId: string) => { left: number; colors: ColorUse[] }
  /** gives every paragraph in the colour the style; returns how many were changed, and the colours now */
  onSwapColor: (color: string, partial: boolean, styleId: string) => { converted: number; colors: ColorUse[] }
  /** the colour of the text that is selected (or being edited), when there is one */
  sampleColor?: string
}

type Tab = 'word' | 'swap' | 'batch' | 'colors' | 'tools'

export function StyleManagerPanel({ styles, onSwap, onSwapOne, onBatch, onFindStyle, onTag, onFindTag, onSwapOneTag, onClean, onListColors, onFindColor, onSwapOneColor, onSwapColor, sampleColor }: Props) {
  const [tab, setTab] = useState<Tab>('word')
  const [sourceId, setSourceId] = useState(styles[0]?.id ?? '')
  const [targetId, setTargetId] = useState(styles[1]?.id ?? styles[0]?.id ?? '')
  const [removeSource, setRemoveSource] = useState(false)
  const [tag, setTag] = useState('$')
  const [tagStyleId, setTagStyleId] = useState(styles[0]?.id ?? '')
  const [deleteTag, setDeleteTag] = useState(true)
  const [tagFound, setTagFound] = useState<number | null>(null)
  // empty pairs: only the pairs that are chosen run (pairs filled in by themselves would shuffle styles nobody asked about)
  const [batchPairs, setBatchPairs] = useState(() => Array.from({ length: 4 }, () => ({ sourceId: '', targetId: '' })))
  const [wordSourceId, setWordSourceId] = useState(styles[0]?.id ?? '')
  const [wordTargetId, setWordTargetId] = useState(styles[1]?.id ?? styles[0]?.id ?? '')
  const [wordFound, setWordFound] = useState<number | null>(null)
  const [colors, setColors] = useState<ColorUse[]>([])
  const [color, setColor] = useState('')
  const [partialColor, setPartialColor] = useState(false)
  const [colorStyleId, setColorStyleId] = useState(styles[0]?.id ?? '')
  const [colorFound, setColorFound] = useState<number | null>(null)
  const [colorDone, setColorDone] = useState<number | null>(null)
  // the colours are read when the tab opens (and after every change here): scanning the whole text on each render would be slow
  useEffect(() => {
    if (tab === 'colors') setColors(onListColors())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])
  const pickColor = (value: string) => { setColor(value.toLowerCase()); setColorFound(null); setColorDone(null) }
  const colorCount = (use: ColorUse) => (partialColor ? use.any : use.whole)

  const optionList = styles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)

  return (
    <section className="style-manager-panel props-panel" aria-label={t('ניהול סגנונות')}>
      <div className="style-manager-head"><div><h2 className="props-title">{t('ניהול סגנונות')}</h2><p className="muted">{t('כלי עימוד, החלפה וניקוי')}</p></div><span className="style-manager-mark">Aa</span></div>
      <nav className="style-manager-tabs" aria-label={t('כלי ניהול סגנונות')}>
        {([['word', t('ניקוי וורד')], ['swap', t('החלפה')], ['batch', t('קבוצתית')], ['colors', t('צבעים')], ['tools', t('סימן')]] as [Tab, string][]).map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}
      </nav>

      {tab === 'word' && <div className="style-manager-section">
        <label className="field-label">{t('סגנון מקור')}<select className="select" value={wordSourceId} onChange={(e) => { setWordSourceId(e.target.value); setWordFound(null) }}>{optionList}</select></label>
        <fieldset className="style-manager-explorer"><legend>{t('סייר סגנונות מקור')}</legend><div className="style-manager-actions"><button className="btn" onClick={() => { const count = onFindStyle(wordSourceId, -1); setWordFound(count) }}>{t('« הקודם')}</button><button className="btn" onClick={() => { const count = onFindStyle(wordSourceId, 0); setWordFound(count) }}>{t('הצג מופע ראשון')}</button><button className="btn" onClick={() => { const count = onFindStyle(wordSourceId, 1); setWordFound(count) }}>{t('הבא »')}</button></div><p className="style-manager-status">{wordFound === null ? t('בחר סגנון ולחץ על הצג מופע ראשון') : wordFound ? t('נמצאו {wordFound} מופעים לסגנון זה.', { wordFound }) : t('לא נמצאו מופעים לסגנון זה.')}</p></fieldset>
        <label className="field-label">{t('סגנון יעד')}<select className="select" value={wordTargetId} onChange={(e) => setWordTargetId(e.target.value)}>{optionList}</select></label>
        <div className="style-manager-actions"><button className="btn" disabled={!wordSourceId || !wordTargetId || wordSourceId === wordTargetId} onClick={() => setWordFound(onSwapOne(wordSourceId, wordTargetId))}>{t('החלף מופע זה')}</button><button className="btn primary" disabled={!wordSourceId || !wordTargetId || wordSourceId === wordTargetId} onClick={() => { onSwap(wordSourceId, wordTargetId, true); setWordSourceId(wordTargetId); setWordTargetId(styles.find((style) => style.id !== wordSourceId && style.id !== wordTargetId)?.id ?? wordTargetId); setWordFound(null) }}>{t('החלף הכל ומחק סגנון')}</button></div>
      </div>}

      {tab === 'swap' && <div className="style-manager-section">
        <p className="muted">{t('החלפת כל הפסקאות המקושרות לסגנון, עם ניקוי דריסות עיצוב.')}</p>
        <label className="field-label">{t('סגנון מקור')}<select className="select" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>{optionList}</select></label>
        <label className="field-label">{t('סגנון יעד')}<select className="select" value={targetId} onChange={(e) => setTargetId(e.target.value)}>{optionList}</select></label>
        <label className="dlg-check"><input type="checkbox" checked={removeSource} onChange={(e) => setRemoveSource(e.target.checked)} />{t('מחק את סגנון המקור לאחר ההחלפה')}</label>
        <button className="btn primary" disabled={!sourceId || !targetId || sourceId === targetId} onClick={() => onSwap(sourceId, targetId, removeSource)}>{t('החלף בכל המסמך')}</button>
      </div>}

      {tab === 'batch' && <div className="style-manager-section">
        <p className="muted">{t('בחר זוגות של מקור ויעד והפעל אותם ברצף: רק זוגות שנבחרו בהם מקור ויעד שונים יופעלו.')}</p>
        {batchPairs.map((pair, index) => <div className="style-manager-pair" key={index}><select className="select" aria-label={t('מקור {n1}', { n1: index + 1 })} value={pair.sourceId} onChange={(e) => setBatchPairs((current) => current.map((item, i) => i === index ? { ...item, sourceId: e.target.value } : item))}><option value="">—</option>{optionList}</select><span>←</span><select className="select" aria-label={t('יעד {n1}', { n1: index + 1 })} value={pair.targetId} onChange={(e) => setBatchPairs((current) => current.map((item, i) => i === index ? { ...item, targetId: e.target.value } : item))}><option value="">—</option>{optionList}</select></div>)}
        <button className="btn primary" onClick={() => onBatch(batchPairs.filter((pair) => pair.sourceId && pair.targetId && pair.sourceId !== pair.targetId))}>{t('בצע החלפה קבוצתית')}</button>
      </div>}

      {tab === 'colors' && <div className="style-manager-section">
        <p className="muted">{t('טקסט שנצבע ביד הופך לסגנון פסקה: בוחרים צבע שיש במסמך ואת הסגנון שיקבלו הפסקאות שבו.')}</p>
        <div className="style-manager-colors" role="radiogroup" aria-label={t('צבעי הטקסט במסמך')}>
          {colors.length === 0 && <span className="muted">{t('אין טקסט במסמך.')}</span>}
          {colors.map((use) => (
            <button key={use.color} role="radio" aria-checked={use.color === color} className={`style-manager-color${use.color === color ? ' active' : ''}`} title={t('{n1}\n{n2} פסקאות שכולן בצבע, {n3} שיש בהן צבע זה', { n1: use.color, n2: use.whole, n3: use.any })} onClick={() => pickColor(use.color)}>
              <span className="style-manager-color-chip" style={{ background: use.color }} />
              <span className="style-manager-color-name">{use.color}</span>
              <span className="style-manager-color-count">{colorCount(use)}</span>
            </button>
          ))}
        </div>
        <div className="style-manager-actions">
          <button className="btn" disabled={!sampleColor} title={t('בוחר את צבע הטקסט המסומן (או של התיבה הנבחרת)')} onClick={() => sampleColor && pickColor(sampleColor)}>{t('דגום מהטקסט הנבחר')}</button>
          <button className="btn" onClick={() => setColors(onListColors())}>{t('רענן רשימה')}</button>
        </div>
        <label className="dlg-check"><input type="checkbox" checked={partialColor} onChange={(e) => { setPartialColor(e.target.checked); setColorFound(null); setColorDone(null) }} />{t('גם פסקאות שרק חלק מהטקסט בהן בצבע')}</label>
        <fieldset className="style-manager-explorer"><legend>{t('סייר פסקאות בצבע')}</legend>
          <div className="style-manager-actions">
            <button className="btn" disabled={!color} onClick={() => setColorFound(onFindColor(color, partialColor, -1))}>{t('« הקודם')}</button>
            <button className="btn" disabled={!color} onClick={() => setColorFound(onFindColor(color, partialColor, 0))}>{t('הצג פסקה ראשונה')}</button>
            <button className="btn" disabled={!color} onClick={() => setColorFound(onFindColor(color, partialColor, 1))}>{t('הבא »')}</button>
          </div>
          <p className="style-manager-status">{!color ? t('בחרו צבע מהרשימה') : colorDone !== null ? t('הומרו {colorDone} פסקאות.', { colorDone }) : colorFound === null ? t('לחצו על הצג פסקה ראשונה') : colorFound ? t('נמצאו {colorFound} פסקאות בצבע זה.', { colorFound }) : t('לא נמצאו פסקאות בצבע זה.')}</p>
        </fieldset>
        <label className="field-label">{t('סגנון יעד')}<select className="select" value={colorStyleId} onChange={(e) => setColorStyleId(e.target.value)}>{optionList}</select></label>
        <div className="style-manager-actions">
          <button className="btn" disabled={!color || !colorStyleId} onClick={() => { const out = onSwapOneColor(color, partialColor, colorStyleId); setColorFound(out.left); setColorDone(null); setColors(out.colors) }}>{t('החלף פסקה זו והמשך')}</button>
          <button className="btn primary" disabled={!color || !colorStyleId} onClick={() => { const out = onSwapColor(color, partialColor, colorStyleId); setColorDone(out.converted); setColorFound(null); setColors(out.colors) }}>{t('החלף הכל במסמך')}</button>
        </div>
      </div>}

      {tab === 'tools' && <div className="style-manager-section">
        <h3>{t('סגנון לפי תגית')}</h3>
        <label className="field-label">{t('סימן לחיפוש')}<input className="select" value={tag} onChange={(e) => { setTag(e.target.value); setTagFound(null) }} /></label>
        <fieldset className="style-manager-explorer"><legend>{t('סייר סימנים')}</legend><div className="style-manager-actions"><button className="btn" onClick={() => setTagFound(onFindTag(tag, -1))}>{t('« הקודם')}</button><button className="btn" onClick={() => setTagFound(onFindTag(tag, 0))}>{t('הצג מופע ראשון')}</button><button className="btn" onClick={() => setTagFound(onFindTag(tag, 1))}>{t('הבא »')}</button></div><p className="style-manager-status">{tagFound === null ? t('בחר סימן ולחץ על הצג מופע ראשון') : tagFound ? t('נמצאו {tagFound} מופעים לסימן זה.', { tagFound }) : t('לא נמצאו מופעים לסימן זה.')}</p></fieldset>
        <label className="field-label">{t('סגנון יעד')}<select className="select" value={tagStyleId} onChange={(e) => setTagStyleId(e.target.value)}>{optionList}</select></label>
        <label className="dlg-check"><input type="checkbox" checked={deleteTag} onChange={(e) => setDeleteTag(e.target.checked)} />{t('מחק את הסימן לאחר ההמרה')}</label>
        <div className="style-manager-actions"><button className="btn" disabled={!tag || !tagStyleId} onClick={() => setTagFound(onSwapOneTag(tag, tagStyleId, deleteTag))}>{t('החלף מופע זה')}</button><button className="btn primary" disabled={!tag || !tagStyleId} onClick={() => { onTag(tag, tagStyleId, deleteTag, true); setTagFound(null) }}>{t('החלף בכל המסמך')}</button></div>
        <hr />
        <h3>{t('ניקוי מסמך')}</h3>
        <button className="btn" onClick={() => onClean(false)}>{t('צמצם רווחים כפולים')}</button><button className="btn danger" onClick={() => onClean(true)}>{t('מחק פסקאות ריקות מיותרות')}</button>
      </div>}
    </section>
  )
}
