import type { DocTab } from '../useDocumentSession'
import type { AutosaveState } from '../useAutosave'
import { t } from '../i18n'

interface Props {
  tabs: DocTab[]
  activeId: number | null
  /** the zoom of the shown document, written on its tab */
  zoomText: string
  /** what autosave is doing with the shown document, written at the end of the tab bar */
  autosave: AutosaveState
  onSelect: (id: number) => void
  onClose: (id: number) => void
  onNew: () => void
}

/** the line about autosave: short, with a longer explanation as its tooltip; nothing at all when autosave has nothing to say */
const AUTOSAVE_TEXT: Record<AutosaveState, { label: string; title: string } | null> = {
  off: null,
  needsFile: { get label() { return t('המסמך עוד לא נשמר') }, get title() { return t('שמרו את המסמך פעם אחת (Ctrl+S) כדי שהשמירה האוטומטית תפעל') } },
  waiting: { get label() { return t('ממתין לשמירה…') }, get title() { return t('השמירה האוטומטית תתבצע כשתפסיקו לעבוד לרגע') } },
  saving: { get label() { return t('שומר אוטומטית…') }, get title() { return t('המסמך נכתב לקובץ') } },
  saved: { get label() { return t('כל השינויים נשמרו') }, get title() { return t('השמירה האוטומטית כתבה את המסמך לקובץ') } },
  error: { get label() { return t('השמירה האוטומטית נכשלה') }, get title() { return t('לא ניתן לכתוב לקובץ (אולי אין הרשאה או שהוא נעול). שמרו ידנית עם Ctrl+S, או בשם אחר') } },
}

/** The open documents as tabs. Click a tab to work on that document; × closes it; + starts a new document next to the others. */
export function DocTabs({ tabs, activeId, zoomText, autosave, onSelect, onClose, onNew }: Props) {
  return (
    <div className="tabs" role="tablist" aria-label={t('מסמכים פתוחים')}>
      {tabs.map((tab) => {
        const on = tab.id === activeId
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={on}
            tabIndex={0}
            className={'doc-tab' + (on ? ' active' : '')}
            title={tab.name}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect(tab.id)
              }
            }}
            // a middle click closes, like in a browser
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault()
                onClose(tab.id)
              }
            }}
          >
            <span className="doc-tab-name">
              {tab.dirty && <i className="doc-tab-dot" aria-label={t('יש שינויים שלא נשמרו')} />}
              <bdi>{tab.name}</bdi>
              {on && (
                <>
                  {' @ '}
                  <bdi dir="ltr">{zoomText}</bdi>
                </>
              )}
            </span>
            <button
              className="doc-tab-close"
              aria-label={t('סגור את {name}', { name: tab.name })}
              onClick={(e) => {
                e.stopPropagation()
                onClose(tab.id)
              }}
            >
              ×
            </button>
          </div>
        )
      })}
      <button className="doc-tab-new" title={t('מסמך חדש')} aria-label={t('מסמך חדש')} onClick={onNew}>
        +
      </button>
      {AUTOSAVE_TEXT[autosave] && (
        <span className={'autosave-status ' + autosave} role="status" title={AUTOSAVE_TEXT[autosave].title}>
          {AUTOSAVE_TEXT[autosave].label}
        </span>
      )}
    </div>
  )
}
