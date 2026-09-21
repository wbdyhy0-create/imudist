import type { DocTab } from '../useDocumentSession'

interface Props {
  tabs: DocTab[]
  activeId: number | null
  /** the zoom of the shown document, written on its tab */
  zoomText: string
  onSelect: (id: number) => void
  onClose: (id: number) => void
  onNew: () => void
}

/** The open documents as tabs. Click a tab to work on that document; × closes it; + starts a new document next to the others. */
export function DocTabs({ tabs, activeId, zoomText, onSelect, onClose, onNew }: Props) {
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
    </div>
  )
}
