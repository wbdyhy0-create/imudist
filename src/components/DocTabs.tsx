import type { DocTab } from '../useDocumentSession'
import type { AutosaveState } from '../useAutosave'

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
  needsFile: { label: 'המסמך עוד לא נשמר', title: 'שמרו את המסמך פעם אחת (Ctrl+S) כדי שהשמירה האוטומטית תפעל' },
  waiting: { label: 'ממתין לשמירה…', title: 'השמירה האוטומטית תתבצע כשתפסיקו לעבוד לרגע' },
  saving: { label: 'שומר אוטומטית…', title: 'המסמך נכתב לקובץ' },
  saved: { label: 'כל השינויים נשמרו', title: 'השמירה האוטומטית כתבה את המסמך לקובץ' },
  error: { label: 'השמירה האוטומטית נכשלה', title: 'לא ניתן לכתוב לקובץ (אולי אין הרשאה או שהוא נעול). שמרו ידנית עם Ctrl+S, או בשם אחר' },
}

/** The open documents as tabs. Click a tab to work on that document; × closes it; + starts a new document next to the others. */
export function DocTabs({ tabs, activeId, zoomText, autosave, onSelect, onClose, onNew }: Props) {
  return (
    <div className="tabs" role="tablist" aria-label="מסמכים פתוחים">
      {tabs.map((t) => {
        const on = t.id === activeId
        return (
          <div
            key={t.id}
            role="tab"
            aria-selected={on}
            tabIndex={0}
            className={'doc-tab' + (on ? ' active' : '')}
            title={t.name}
            onClick={() => onSelect(t.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect(t.id)
              }
            }}
            // a middle click closes, like in a browser
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault()
                onClose(t.id)
              }
            }}
          >
            <span className="doc-tab-name">
              {t.dirty && <i className="doc-tab-dot" aria-label="יש שינויים שלא נשמרו" />}
              <bdi>{t.name}</bdi>
              {on && (
                <>
                  {' @ '}
                  <bdi dir="ltr">{zoomText}</bdi>
                </>
              )}
            </span>
            <button
              className="doc-tab-close"
              aria-label={`סגור את ${t.name}`}
              onClick={(e) => {
                e.stopPropagation()
                onClose(t.id)
              }}
            >
              ×
            </button>
          </div>
        )
      })}
      <button className="doc-tab-new" title="מסמך חדש" aria-label="מסמך חדש" onClick={onNew}>
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
