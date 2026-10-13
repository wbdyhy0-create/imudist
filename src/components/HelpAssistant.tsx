import { useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../i18n'
import { macKeys } from '../platform'
import { getHelpTopicCategory, HELP_TOPICS, type HelpTopic } from './HelpTopics'
import { getHelpSearchTokens, getHelpTopicResults, getStarterHelpTopics, normalizeHelpQuery } from './HelpSearch'

const QUESTION_STARTERS = new Set(['איך', 'מה', 'איפה', 'היכן', 'למה', 'מתי', 'איזה', 'איזו', 'אפשר', 'עזרה', 'אני', 'רוצה', 'כיצד', 'האם'])

export function HelpAssistant() {
  const [query, setQuery] = useState('')
  const [path, setPath] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const normalizedQuery = normalizeHelpQuery(query)
  const queryTokens = normalizedQuery.split(' ').filter(Boolean)
  const hasSearchTerms = getHelpSearchTokens(normalizedQuery).length > 0
  const isQuestionStarter = queryTokens.length > 0 && queryTokens.every((token) => QUESTION_STARTERS.has(token))
  const selected = path.length ? HELP_TOPICS.find((topic) => topic.id === path[path.length - 1]) : undefined
  const results = useMemo(() => {
    if (!normalizedQuery) return []
    if (isQuestionStarter && !hasSearchTerms) {
      return getStarterHelpTopics()
    }
    return getHelpTopicResults(normalizedQuery)
  }, [hasSearchTerms, isQuestionStarter, normalizedQuery])
  const related = selected
    ? selected.related.map((id) => HELP_TOPICS.find((topic) => topic.id === id)).filter((topic): topic is HelpTopic => !!topic)
    : []

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) {
        event.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const chooseTopic = (topic: HelpTopic) => {
    setPath((current) => [...current, topic.id])
    setQuery(topic.title)
    setOpen(true)
  }

  const resetResults = () => {
    setPath([])
    setOpen(true)
    inputRef.current?.focus()
  }

  return (
    <div className="help-assistant" ref={rootRef}>
      <label className="help-search">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="10.8" cy="10.8" r="6.8" />
          <path d="m16 16 4.5 4.5" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder={t('מה תרצו לדעת?')}
          aria-label={t('שאלה לעזרה')}
          aria-expanded={open && !!normalizedQuery}
          aria-controls="help-search-results"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value)
            setPath([])
            setOpen(true)
          }}
        />
      </label>
      {open && normalizedQuery && (
        <div className="help-results" id="help-search-results" role="region" aria-label={t('נושאי עזרה')}>
          {selected ? (
            <>
              <button type="button" className="help-back" onClick={resetResults}>{t('‹ חזרה לנושאים')}</button>
              <article className="help-answer">
                <div className="help-answer-heading">
                  <h2>{selected.title}</h2>
                  <span className="help-topic-category">{getHelpTopicCategory(selected)}</span>
                </div>
                {selected.answer.map((paragraph) => <p key={paragraph}>{macKeys(paragraph)}</p>)}
              </article>
              {related.length > 0 && (
                <div className="help-related">
                  <h3>{t('נושאים קשורים')}</h3>
                  {related.map((topic) => (
                    <button type="button" key={topic.id} onClick={() => chooseTopic(topic)}>{macKeys(topic.title)}</button>
                  ))}
                </div>
              )}
            </>
          ) : results.length > 0 ? (
            <>
              <div className="help-results-heading">{hasSearchTerms ? t('נושאים ותשובות') : t('אפשר להתחיל מאחד הנושאים האלה')}</div>
              {results.map((topic) => (
                <button type="button" className="help-result" key={topic.id} onClick={() => chooseTopic(topic)}>
                  <span className="help-result-title">
                    <strong>{macKeys(topic.title)}</strong>
                    <span className="help-topic-category">{getHelpTopicCategory(topic)}</span>
                  </span>
                  <span className="help-result-preview">{macKeys(topic.answer[0])}</span>
                </button>
              ))}
            </>
          ) : (
            <p className="help-no-results">{t('לא מצאתי נושא מתאים. נסו ניסוח אחר או מילה כללית יותר.')}</p>
          )}
        </div>
      )}
    </div>
  )
}
