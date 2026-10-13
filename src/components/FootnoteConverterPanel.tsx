import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { FootnotePlacementMode } from '../document'
import { convertedText, NOTE_BRACKETS } from '../footnoteConvert'
import '../footnoteConverter.css'
import { t } from '../i18n'

/** what the converter is asked to do */
export interface FootnoteConvertRequest {
  /** 'toFootnotes': notes in brackets become footnotes; 'toText': footnotes become notes in brackets */
  direction: 'toFootnotes' | 'toText'
  /** which of NOTE_BRACKETS */
  bracket: number
  /** the paragraph style the new footnotes get */
  styleId: string
  /** only the notes in paragraphs of this style (when turning notes into footnotes) or the footnotes in this style (the other way); empty: every style */
  searchStyleId: string
  scope: 'document' | 'selection'
}

export interface FootnoteConvertControl {
  /** how many of the stories are done */
  onProgress: (done: number, total: number) => void
  /** the stop button was pressed */
  shouldStop: () => boolean
}

interface Props {
  styles: { id: string; name: string }[]
  /** the style the footnotes have in this document, offered first */
  defaultStyleId?: string
  footnotePlacement: FootnotePlacementMode
  focusTarget: 'inline' | 'placement'
  focusRequestId: number
  onFootnotePlacementChange: (placement: FootnotePlacementMode) => void
  onConvert: (request: FootnoteConvertRequest, control: FootnoteConvertControl) => Promise<{ converted: number; message?: string }>
  onClose: () => void
}

type ConverterAction = 'inlineToFootnotes' | 'footnotesToInline' | 'footnotesToEndnotes' | 'endnotesToFootnotes'

/** what the search field says when no style is asked for */
const ALL_STYLES = 'כל הסגנונות'

/**
 * "ממיר הערות שוליים": the converter between notes written in brackets inside the text and real footnotes, in both directions.
 * It stays open while the document is worked on (it is a palette, not a dialog), so that a selection can be made and the
 * converter pressed again and again.
 */
export function FootnoteConverterPanel({ styles, defaultStyleId, footnotePlacement, focusTarget, focusRequestId, onFootnotePlacementChange, onConvert, onClose }: Props) {
  const inlineConverterRef = useRef<HTMLElement>(null)
  const placementConverterRef = useRef<HTMLElement>(null)
  const nameOf = (id: string) => styles.find((style) => style.id === id)?.name ?? ''
  // "חפש סגנון": which notes to convert - the ones in paragraphs of this style, or every style
  const [searchId, setSearchId] = useState('')
  const [query, setQuery] = useState(() => t(ALL_STYLES))
  const [popupOpen, setPopupOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  // "בחר סגנון": the style the new footnotes get
  const [footnoteStyleId, setFootnoteStyleId] = useState(defaultStyleId && styles.some((style) => style.id === defaultStyleId) ? defaultStyleId : styles[0]?.id ?? '')
  const [bracket, setBracket] = useState(0)
  const [scope, setScope] = useState<'document' | 'selection'>('document')
  const [status, setStatus] = useState(t('מוכן לפעולה'))
  const [actionSelection, setActionSelection] = useState<{ requestId: number; action: ConverterAction }>(() => ({
    requestId: focusRequestId,
    action: focusTarget === 'placement' ? 'footnotesToEndnotes' : 'inlineToFootnotes',
  }))
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const stopped = useRef(false)
  // the highlighted style was reached with the arrow keys (not with the mouse): the list scrolls to it
  const keyMoved = useRef(false)

  useEffect(() => {
    const target = focusTarget === 'placement' ? placementConverterRef.current : inlineConverterRef.current
    target?.scrollIntoView({ block: 'nearest' })
  }, [focusRequestId, focusTarget])

  const activeAction = actionSelection.requestId === focusRequestId
    ? actionSelection.action
    : focusTarget === 'placement' ? 'footnotesToEndnotes' : 'inlineToFootnotes'
  const selectAction = (action: ConverterAction) => setActionSelection({ requestId: focusRequestId, action })

  // the style asked for (it may be gone from the document since: then every style)
  const searchStyle = styles.some((style) => style.id === searchId) ? searchId : ''
  const searchLabel = searchStyle ? nameOf(searchStyle) : t(ALL_STYLES)
  // while the field holds what it says, every style is listed; once the user types, the ones that match
  const typing = query !== searchLabel
  const choices = [{ id: '', name: t(ALL_STYLES) }, ...styles]
  const options = choices.filter((option) => !typing || query === '' || option.name.toLowerCase().includes(query.toLowerCase()))
  const footnoteStyle = styles.some((style) => style.id === footnoteStyleId) ? footnoteStyleId : styles[0]?.id ?? ''

  const pickSearch = (id: string) => {
    setSearchId(id)
    setQuery(id ? nameOf(id) : t(ALL_STYLES))
    setPopupOpen(false)
  }
  /** leaving the field: a name typed in full is taken as the style; anything else goes back to the style that was asked for */
  const settleSearch = () => {
    setPopupOpen(false)
    if (!typing) return
    const exact = choices.find((option) => option.name.toLowerCase() === query.trim().toLowerCase())
    if (exact) pickSearch(exact.id)
    else setQuery(searchLabel)
  }
  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setPopupOpen(true)
      keyMoved.current = true
      setHighlight((current) => Math.max(0, Math.min(options.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1))))
    } else if (event.key === 'Enter' && popupOpen && options[highlight]) {
      event.preventDefault()
      pickSearch(options[highlight].id)
    } else if (event.key === 'Escape') {
      setPopupOpen(false)
      setQuery(searchLabel)
    }
  }

  const run = async (direction: FootnoteConvertRequest['direction']) => {
    if (busy) return
    if (direction === 'toFootnotes' && !footnoteStyle) {
      setStatus(t('אנא בחר סגנון.'))
      return
    }
    stopped.current = false
    setBusy(true)
    setProgress(0)
    setStatus(t('מבצע המרה…'))
    try {
      const result = await onConvert({ direction, bracket, styleId: footnoteStyle, searchStyleId: searchStyle, scope }, {
        onProgress: (done, total) => setProgress(total > 0 ? (done / total) * 100 : 0),
        shouldStop: () => stopped.current,
      })
      setStatus(result.message ?? t('הסתיים! {n1}', { n1: convertedText(result.converted) }))
    } catch (error) {
      setStatus(t('ההמרה נכשלה: {n1}', { n1: error instanceof Error ? error.message : String(error) }))
    } finally {
      setBusy(false)
      setProgress(0)
    }
  }

  const convertPlacement = (placement: FootnotePlacementMode) => {
    if (footnotePlacement !== placement) onFootnotePlacementChange(placement)
  }

  return (
    <aside className="footnote-converter" aria-label={t('ממיר הערות')}>
      <header className="fc-head">
        <b>{t('ממיר הערות שבטקסט להערות שוליים ולהפך')}</b>
        <button className="fc-close" aria-label={t('סגור')} onClick={onClose}>×</button>
      </header>

      <section ref={inlineConverterRef} className="fc-group" aria-label={t('הגדרות המרה')}>
        <h3>{t('הגדרות המרה')}</h3>
        <div className="fc-row">
          <span>{t('חפש סגנון:')}</span>
          {/* a field and its list in one: a click on it (or on the arrow) shows every paragraph style, typing narrows them. Only what is in paragraphs of the style found is converted */}
          <div className="fc-combo">
            <input
              className="text-input"
              type="text"
              role="combobox"
              aria-expanded={popupOpen}
              aria-controls="fc-style-list"
              aria-label={t('חפש סגנון: המר רק הערות בפסקאות בסגנון הזה')}
              value={query}
              autoComplete="off"
              spellCheck={false}
              onFocus={(event) => {
                event.target.select()
                setHighlight(Math.max(0, options.findIndex((option) => option.id === searchStyle)))
                setPopupOpen(true)
              }}
              onBlur={settleSearch}
              // the field keeps the focus after a style is picked: a click on it shows the list again
              onClick={() => setPopupOpen(true)}
              onChange={(event) => {
                setQuery(event.target.value)
                setHighlight(0)
                setPopupOpen(true)
              }}
              onKeyDown={onSearchKey}
            />
            <button className="fc-arrow" tabIndex={-1} aria-label={t('הצג את הסגנונות')} onMouseDown={(event) => { event.preventDefault(); setPopupOpen((open) => !open) }}>▾</button>
            {popupOpen && options.length > 0 && (
              <ul className="fc-popup" id="fc-style-list" role="listbox" onMouseDown={(event) => event.preventDefault()}>
                {options.map((option, index) => (
                  <li
                    key={option.id || 'all'}
                    role="option"
                    aria-selected={option.id === searchStyle}
                    className={(index === highlight ? 'hot ' : '') + (option.id === searchStyle ? 'on' : '')}
                    ref={(element) => {
                      // the arrow keys move through a list that scrolls
                      if (element && keyMoved.current && index === highlight) element.scrollIntoView({ block: 'nearest' })
                    }}
                    onMouseEnter={() => { keyMoved.current = false; setHighlight(index) }}
                    onClick={() => pickSearch(option.id)}
                  >
                    {option.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="fc-row">
          <span>{t('בחר סגנון:')}</span>
          <select className="select" value={footnoteStyle} aria-label={t('סגנון הפסקה של הערות השוליים החדשות')} onChange={(event) => setFootnoteStyleId(event.target.value)}>
            {styles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}
          </select>
          <button className="btn small" title={t('החזר את החיפוש ל„כל הסגנונות”')} aria-label={t('רענן')} onClick={() => pickSearch('')}>↻</button>
        </div>
        <label className="fc-row">
          <span>{t('סוג סוגריים:')}</span>
          <select className="select" value={bracket} onChange={(event) => setBracket(Number(event.target.value))}>
            {NOTE_BRACKETS.map((item, index) => <option key={item.label} value={index}>{item.label}</option>)}
          </select>
        </label>
        <div className="fc-row" role="radiogroup" aria-label={t('טווח פעולה')}>
          <span>{t('טווח פעולה:')}</span>
          <label><input type="radio" name="fc-scope" checked={scope === 'document'} onChange={() => setScope('document')} /> {t('כל המסמך')}</label>
          <label><input type="radio" name="fc-scope" checked={scope === 'selection'} onChange={() => setScope('selection')} /> {t('בחירה בלבד')}</label>
        </div>
      </section>

      <div className="fc-actions">
        <button className={`btn${activeAction === 'inlineToFootnotes' ? ' primary' : ''}`} aria-pressed={activeAction === 'inlineToFootnotes'} disabled={busy} onClick={() => { selectAction('inlineToFootnotes'); void run('toFootnotes') }}>{t('המר הערות להערות שוליים')}</button>
        <button className={`btn${activeAction === 'footnotesToInline' ? ' primary' : ''}`} aria-pressed={activeAction === 'footnotesToInline'} disabled={busy} onClick={() => { selectAction('footnotesToInline'); void run('toText') }}>{t('המר הערות שוליים להערות פנימיות')}</button>
      </div>

      <progress className="fc-progress" max={100} value={progress} />
      <p className="fc-status" role="status">{status}</p>
      <button className="btn small fc-stop" disabled={!busy} onClick={() => { stopped.current = true }}>{t('עצור פעולה')}</button>

      <section ref={placementConverterRef} className="fc-group" aria-label={t('ממיר הערות שוליים להערות סיום ולהפך')}>
        <h3>{t('ממיר הערות שוליים להערות סיום ולהפך')}</h3>
        <div className="fc-actions fc-placement-actions">
          <button className={`btn${activeAction === 'footnotesToEndnotes' ? ' primary' : ''}`} aria-pressed={activeAction === 'footnotesToEndnotes'} disabled={busy} onClick={() => { selectAction('footnotesToEndnotes'); convertPlacement('endnotes') }}>
            {t('המר הערות שוליים להערות סיום')}
          </button>
          <button className={`btn${activeAction === 'endnotesToFootnotes' ? ' primary' : ''}`} aria-pressed={activeAction === 'endnotesToFootnotes'} disabled={busy} onClick={() => { selectAction('endnotesToFootnotes'); convertPlacement('footnotes') }}>
            {t('המר הערות סיום להערות שוליים')}
          </button>
        </div>
        <p className="fc-status fc-placement-status" role="status">{footnotePlacement === 'endnotes' ? t('ההערות מוצגות כעת בסוף המסמך.') : t('ההערות מוצגות כעת בתחתית כל עמוד.')}</p>
      </section>
    </aside>
  )
}
