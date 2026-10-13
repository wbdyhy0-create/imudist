import { useEffect, useMemo, useState } from 'react'
import type { ParagraphSequence, ParagraphStyleRecord } from '../document'
import { assignSequence, describeSequence, LEARN_LIMIT, learnSequence, MAX_SEQUENCES, MAX_SEQUENCE_STEPS } from '../paragraphSequences'
import { t } from '../i18n'

interface Props {
  sequences: ParagraphSequence[]
  styles: ParagraphStyleRecord[]
  /** the paragraph styles of the paragraphs a sequence is learnt from: the ones selected, else the whole story (empty paragraphs left out) */
  exampleIds: string[]
  /** how many paragraphs the story has (for the preview) */
  storyParagraphs: number
  hasSelection: boolean
  /** keeps the sequences; returns what is wrong, or null when they were kept */
  onSave: (sequences: ParagraphSequence[]) => string | null
  /** keeps the sequences and gives the chosen one to the text; returns what is wrong, or null (the dialog then closes) */
  onApply: (sequences: ParagraphSequence[], sequenceId: string, scope: 'selection' | 'story') => string | null
  onClose: () => void
}

type PartName = 'start' | 'middle' | 'end'

const PARTS: { id: PartName; title: string; hint: string }[] = [
  { id: 'start', get title() { return t('תחילת הרצף') }, get hint() { return t('הפסקה הראשונה מקבלת את הסגנון הראשון, השנייה את השני, וכן הלאה.') } },
  { id: 'middle', get title() { return t('דפוס שחוזר באמצע') }, get hint() { return t('הפסקאות שבין התחלה לסוף עוברות על הסגנונות האלה בתורן, שוב ושוב.') } },
  { id: 'end', get title() { return t('סוף הרצף') }, get hint() { return t('הפסקה האחרונה מקבלת את הסגנון האחרון, שלפניה את זה שלפניו, וכן הלאה.') } },
]

const newId = () => `sequence-${Math.random().toString(36).slice(2, 10)}`

/** the sequences of paragraph styles: define, learn from the text, preview and give to a story or to the paragraphs selected */
export function ParagraphSequenceDialog({ sequences, styles, exampleIds, storyParagraphs, hasSelection, onSave, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<ParagraphSequence[]>(sequences)
  const [currentId, setCurrentId] = useState<string | null>(sequences[0]?.id ?? null)
  const [message, setMessage] = useState<string | null>(null)
  const current = draft.find((sequence) => sequence.id === currentId) ?? null
  const nameOf = (id: string) => styles.find((style) => style.id === id)?.name ?? t('(סגנון שנמחק)')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const change = (patch: Partial<ParagraphSequence>) => {
    setMessage(null)
    setDraft((list) => list.map((sequence) => (sequence.id === currentId ? { ...sequence, ...patch } : sequence)))
  }
  const create = (from?: ParagraphSequence) => {
    if (draft.length >= MAX_SEQUENCES) return
    const sequence: ParagraphSequence = from
      ? { ...from, id: newId(), name: t('{n1} (עותק)', { n1: from.name }) }
      : { id: newId(), name: t('רצף {n1}', { n1: draft.length + 1 }), start: [], middle: [], end: [] }
    setDraft((list) => [...list, sequence])
    setCurrentId(sequence.id)
    setMessage(null)
  }
  const remove = () => {
    if (!current) return
    const rest = draft.filter((sequence) => sequence.id !== current.id)
    setDraft(rest)
    setCurrentId(rest[0]?.id ?? null)
    setMessage(null)
  }
  const setPart = (part: PartName, steps: string[]) => change({ [part]: steps.slice(0, MAX_SEQUENCE_STEPS) } as Partial<ParagraphSequence>)

  const learn = () => {
    if (!current) return
    if (exampleIds.length === 0) {
      setMessage(t('אין טקסט ללמוד ממנו: בחרו תיבת טקסט עם כמה פסקאות, או סמנו כמה פסקאות.'))
      return
    }
    const known = new Set(styles.map((style) => style.id))
    const learnt = learnSequence(exampleIds.filter((id) => known.has(id)))
    change(learnt)
    setMessage(exampleIds.length > LEARN_LIMIT ? t('נקראו {LEARN_LIMIT} הפסקאות הראשונות.', { LEARN_LIMIT }) : t('נלמד מ-{n1} פסקאות.', { n1: exampleIds.length }))
  }

  const preview = useMemo(() => {
    if (!current) return []
    const count = Math.min(14, Math.max(storyParagraphs, 6))
    return assignSequence(Array.from({ length: count }, () => 'x'), current).map((id) => (id ? nameOf(id) : '—'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, styles, storyParagraphs])

  const apply = (scope: 'selection' | 'story') => {
    if (!current) return
    setMessage(onApply(draft, current.id, scope))
  }

  const partEditor = (part: { id: PartName; title: string; hint: string }) => {
    const steps = current?.[part.id] ?? []
    const set = (next: string[]) => setPart(part.id, next)
    return (
      <div key={part.id} className="nested-rule">
        <strong>{part.title}</strong>
        <p className="muted">{part.hint}</p>
        {steps.map((id, index) => (
          <div key={index} className="sequence-step">
            <span className="muted">{index + 1}.</span>
            <select className="select" value={id} onChange={(event) => set(steps.map((step, i) => (i === index ? event.target.value : step)))}>
              {!styles.some((style) => style.id === id) && <option value={id}>{t('(סגנון שנמחק)')}</option>}
              {styles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}
            </select>
            <button type="button" className="icon-button" aria-label={t('הזזה למעלה')} disabled={index === 0} onClick={() => set(steps.map((step, i) => (i === index - 1 ? steps[index] : i === index ? steps[index - 1] : step)))}>↑</button>
            <button type="button" className="icon-button" aria-label={t('הזזה למטה')} disabled={index === steps.length - 1} onClick={() => set(steps.map((step, i) => (i === index + 1 ? steps[index] : i === index ? steps[index + 1] : step)))}>↓</button>
            <button type="button" className="icon-button" aria-label={t('הסרה')} onClick={() => set(steps.filter((_, i) => i !== index))}>×</button>
          </div>
        ))}
        <button type="button" className="btn" disabled={steps.length >= MAX_SEQUENCE_STEPS || styles.length === 0} onClick={() => set([...steps, styles[0].id])}>{t('הוספת סגנון')}</button>
      </div>
    )
  }

  return (
    <div className="modal-backdrop">
      <form
        className="modal table-dialog sequence-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('רצף סגנונות פסקה')}
       
        onSubmit={(event) => {
          event.preventDefault()
          setMessage(onSave(draft))
        }}
      >
        <h2>{t('רצף סגנונות פסקה')}</h2>
        <p className="muted">
          {t('רצף קובע איזה סגנון פסקה מקבלת כל פסקה לפי מקומה: כותרת בראשונה, כותרת משנה בשנייה, אחר כך גוף וציטוט לסירוגין, וחתימה באחרונה. אפשר להגדיר ידנית, או ללמוד מטקסט שכבר מעוצב כך.')}
        </p>
        <div className="modal-buttons">
          <label className="field-label table-dialog-field">{t('רצף')}
            <select className="select" value={currentId ?? ''} disabled={draft.length === 0} onChange={(event) => { setCurrentId(event.target.value || null); setMessage(null) }}>
              {draft.length === 0 && <option value="">{t('(אין רצפים)')}</option>}
              {draft.map((sequence) => <option key={sequence.id} value={sequence.id}>{sequence.name}</option>)}
            </select>
          </label>
          <button type="button" className="btn" disabled={draft.length >= MAX_SEQUENCES} onClick={() => create()}>{t('רצף חדש')}</button>
          <button type="button" className="btn" disabled={!current || draft.length >= MAX_SEQUENCES} onClick={() => current && create(current)}>{t('שכפול')}</button>
          <button type="button" className="btn" disabled={!current} onClick={remove}>{t('מחיקה')}</button>
        </div>
        {current && (
          <>
            <label className="field-label table-dialog-field">{t('שם הרצף')}
              <input className="select" value={current.name} maxLength={80} onChange={(event) => change({ name: event.target.value })} />
            </label>
            {PARTS.map(partEditor)}
            <label className="dlg-check">
              <input type="checkbox" checked={current.skipEmpty !== false} onChange={(event) => change({ skipEmpty: event.target.checked ? undefined : false })} />
              {t('לא לספור פסקאות ריקות (הן נשארות בסגנון שלהן)')}
            </label>
            <div className="modal-buttons">
              <button type="button" className="btn" onClick={learn}>{t('למידה מהטקסט')}</button>
              <span className="muted">{t('קורא את סגנונות הפסקאות של הטקסט שנבחר, או של כל הסיפור, ומזהה התחלה, דפוס חוזר וסוף.')}</span>
            </div>
            <p className="muted" aria-live="polite">
              {describeSequence(current, nameOf) || t('הרצף ריק')}
            </p>
            <p className="muted">{storyParagraphs > 0 ? t('כך ייראו הפסקאות הראשונות ({n1}): ', { n1: preview.length }) : t('תצוגה על 6 פסקאות: ')}{preview.join(' · ')}</p>
          </>
        )}
        {message && <p className="muted" role="alert">{message}</p>}
        <div className="modal-buttons">
          {current && hasSelection && <button type="button" className="btn primary" onClick={() => apply('selection')}>{t('החלה על הפסקאות שנבחרו')}</button>}
          {current && <button type="button" className={hasSelection ? 'btn' : 'btn primary'} onClick={() => apply('story')}>{t('החלה על כל הסיפור')}</button>}
          <button type="submit" className="btn">{t('שמירה')}</button>
          <button type="button" className="btn" onClick={onClose}>{t('סגירה')}</button>
        </div>
      </form>
    </div>
  )
}
