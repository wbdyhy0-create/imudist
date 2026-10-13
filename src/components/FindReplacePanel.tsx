import { useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_FIND_OPTIONS, type FindMode, type FindOptions } from '../findReplace'
import { t } from '../i18n'

export type FindScope = 'document' | 'selection'

/** how many matches there are for the current pattern, and where (counted by the workspace, which knows the pages) */
export interface FindSummary {
  total: number
  inNotes: number
  pages: number
  error?: string
}

/** everything but the pattern and its replacement that decides what is searched */
export interface FindSearch {
  options: FindOptions
  scope: FindScope
  notes: boolean
}

interface Props {
  /** a short piece of selected text to start from, if the user had one selected when the panel opened */
  seed: string
  hasSelection: boolean
  /** changes whenever the text of the document may have (so the count is made again) */
  revision: unknown
  summarize: (search: FindSearch) => FindSummary
  /** the selection becomes the area "selection only" searches; false when there is none */
  captureSelection: () => boolean
  onStep: (search: FindSearch, direction: 1 | -1) => void
  onReplaceOne: (search: FindSearch) => void
  /** replaces (or, with `remove`, deletes) every match; returns how many */
  onReplaceAll: (search: FindSearch, remove: boolean) => number
  onClose: () => void
}

const STORAGE_KEY = 'imudist.findReplace.v1'

const MODES: { id: FindMode; label: string }[] = [
  { id: 'plain', get label() { return t('טקסט רגיל') } },
  { id: 'special', get label() { return t('תווים מיוחדים: \\n פסקה, \\t טאב') } },
  { id: 'regex', get label() { return t('ביטוי רגולרי') } },
]

/** what was used last time (a per-user convenience: nothing breaks when storage is unavailable) */
function loadSaved(): { options?: Partial<FindOptions>; notes?: boolean } {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!raw || typeof raw !== 'object') return {}
    const o = raw.options ?? {}
    const options: Partial<FindOptions> = {}
    if (typeof o.find === 'string') options.find = o.find
    if (typeof o.replace === 'string') options.replace = o.replace
    if (o.mode === 'plain' || o.mode === 'special' || o.mode === 'regex') options.mode = o.mode
    if (typeof o.matchCase === 'boolean') options.matchCase = o.matchCase
    if (typeof o.wholeWord === 'boolean') options.wholeWord = o.wholeWord
    if (typeof o.ignoreNiqqud === 'boolean') options.ignoreNiqqud = o.ignoreNiqqud
    return { options, notes: typeof raw.notes === 'boolean' ? raw.notes : undefined }
  } catch {
    return {}
  }
}

const countWords = (total: number) => (total === 1 ? t('נמצא מופע אחד') : t('נמצאו {total} מופעים', { total }))

export function FindReplacePanel({ seed, hasSelection, revision, summarize, captureSelection, onStep, onReplaceOne, onReplaceAll, onClose }: Props) {
  const [search, setSearch] = useState<FindSearch>(() => {
    const saved = loadSaved()
    return {
      options: { ...DEFAULT_FIND_OPTIONS, ...saved.options, ...(seed ? { find: seed } : {}) },
      scope: 'document',
      notes: saved.notes ?? true,
    }
  })
  const [done, setDone] = useState<string | null>(null)
  const findInput = useRef<HTMLInputElement>(null)
  const { options } = search
  const patch = (next: Partial<FindOptions>) => {
    setDone(null)
    setSearch((current) => ({ ...current, options: { ...current.options, ...next } }))
  }

  useEffect(() => {
    findInput.current?.focus()
    findInput.current?.select()
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ options: search.options, notes: search.notes }))
    } catch {
      // no storage: the next start simply begins with the defaults
    }
  }, [search.options, search.notes])

  // oxlint-disable-next-line react-hooks/exhaustive-deps -- `summarize` is a new function every render; `revision` says when the document changed
  const summary = useMemo(() => summarize(search), [search, revision])

  const status = summary.error
    ? summary.error
    : !options.find
      ? t('הקלידו מה לחפש')
      : summary.total === 0
        ? t('לא נמצא')
        : `${countWords(summary.total)}${summary.pages ? ` ${t('ב-{pages}', { pages: summary.pages === 1 ? t('עמוד אחד') : t('{n1} עמודים', { n1: summary.pages }) })}` : ''}${summary.inNotes ? ` (${t('{count} בהערות שוליים', { count: summary.inNotes })})` : ''}`

  // the "N replaced" message is about the document as it was just left: any later change of it (an undo, an edit) ends it,
  // except the one change the replacement itself is about to make
  const ownChange = useRef(false)
  useEffect(() => {
    if (ownChange.current) ownChange.current = false
    else setDone(null)
  }, [revision])

  const replaceAll = (remove: boolean) => {
    const count = onReplaceAll(search, remove)
    ownChange.current = count > 0
    setDone(count === 0 ? t('לא נמצא מה להחליף') : remove ? t('נמחקו {count} מופעים', { count }) : t('הוחלפו {count} מופעים', { count }))
  }

  const canRun = summary.total > 0 && !summary.error

  return (
    <div
      className="find-panel"
      role="dialog"
      aria-label={t('חיפוש והחלפה')}
     
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="find-panel-head">
        <h2>{t('חיפוש והחלפה')}</h2>
        <button className="find-panel-close" aria-label={t('סגור')} onClick={onClose}>×</button>
      </div>
      <label className="find-panel-field">
        <span>{t('חפש')}</span>
        <input
          ref={findInput}
          className="select"
          value={options.find}
          onChange={(event) => patch({ find: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              onStep(search, event.shiftKey ? -1 : 1)
            }
          }}
        />
      </label>
      <label className="find-panel-field">
        <span>{t('החלף ב')}</span>
        <input className="select" value={options.replace} placeholder={t('ריק = מחיקה')} onChange={(event) => patch({ replace: event.target.value })} />
      </label>
      <label className="find-panel-field">
        <span>{t('סוג')}</span>
        <select className="select" value={options.mode} onChange={(event) => patch({ mode: event.target.value as FindMode })}>
          {MODES.map((mode) => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
        </select>
      </label>
      {options.mode === 'regex' && <p className="muted find-panel-hint">{t('בהחלפה: ‎$1 קבוצה, ‎$& כל מה שנמצא, ‎\\n פסקה, ‎\\t טאב')}</p>}
      <div className="find-panel-checks">
        <label className="dlg-check"><input type="checkbox" checked={options.matchCase} onChange={(event) => patch({ matchCase: event.target.checked })} />{t('התאם רישיות')}</label>
        <label className="dlg-check"><input type="checkbox" checked={options.wholeWord} onChange={(event) => patch({ wholeWord: event.target.checked })} />{t('מילה שלמה בלבד')}</label>
        <label className="dlg-check"><input type="checkbox" checked={options.ignoreNiqqud} onChange={(event) => patch({ ignoreNiqqud: event.target.checked })} />{t('התעלם מניקוד וטעמים')}</label>
        <label className="dlg-check"><input type="checkbox" checked={search.notes} disabled={search.scope === 'selection'} onChange={(event) => { setDone(null); setSearch((current) => ({ ...current, notes: event.target.checked })) }} />{t('כולל הערות שוליים')}</label>
      </div>
      <div className="seg" role="radiogroup" aria-label={t('טווח')}>
        <button className={search.scope === 'document' ? 'on' : ''} onClick={() => { setDone(null); setSearch((current) => ({ ...current, scope: 'document' })) }}>{t('כל המסמך')}</button>
        <button
          className={search.scope === 'selection' ? 'on' : ''}
          disabled={!hasSelection && search.scope !== 'selection'}
          onClick={() => {
            if (!captureSelection()) return
            setDone(null)
            setSearch((current) => ({ ...current, scope: 'selection' }))
          }}
        >{t('בחירה בלבד')}</button>
      </div>
      <p className={'find-panel-status' + (summary.error ? ' error' : '')} role="status">{done ?? status}</p>
      <div className="find-panel-buttons">
        <button className="btn" disabled={!canRun} onClick={() => onStep(search, -1)}>{t('הקודם')}</button>
        <button className="btn" disabled={!canRun} onClick={() => onStep(search, 1)}>{t('הבא')}</button>
        <button className="btn" disabled={!canRun} onClick={() => onReplaceOne(search)}>{t('החלף')}</button>
      </div>
      <div className="find-panel-buttons">
        <button className="btn primary" disabled={!canRun} onClick={() => replaceAll(false)}>{t('החלף הכול')}</button>
        <button className="btn danger" disabled={!canRun} onClick={() => replaceAll(true)}>{t('מחק הכול')}</button>
      </div>
    </div>
  )
}
