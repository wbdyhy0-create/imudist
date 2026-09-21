import { Fragment, type ReactNode } from 'react'

export type ToolId =
  | 'select' | 'direct' | 'page' | 'pathtype' | 'gap' | 'collector' | 'type' | 'line' | 'pen' | 'pencil'
  | 'rect' | 'ellipse' | 'polygon' | 'scissors' | 'transform' | 'gradient' | 'feather' | 'note' | 'eyedropper'
  | 'hand' | 'zoom'

interface ToolDef {
  id: ToolId
  label: string
  /** tools with the same group number sit together; groups are separated by a thin line */
  group: number
  /** keyboard shortcut shown in the tooltip */
  key?: string
  /** KeyboardEvent.code, so the shortcut also works on a Hebrew keyboard layout */
  code?: string
  /** the shortcut needs Shift */
  shift?: boolean
  enabled: boolean
  icon: ReactNode
}

// Groups: 1 navigate & select · 2 content · 3 shapes & lines · 4 edit & transform · 5 helpers
export const TOOLS: ToolDef[] = [
  { id: 'select', label: 'בחירה', group: 1, key: 'V', code: 'KeyV', enabled: true, icon: <path d="M5 3v16l4.300-3.700L12 21.500l2.700-1.200-2.700-6.100 6-.2z" fill="currentColor" stroke="none" /> },
  { id: 'direct', label: 'עריכת נקודות', group: 1, key: 'A', enabled: false, icon: <><path d="M4.500 17.500C8 17.500 8 6.500 12 6.500s4 11 7.500 11" /><path d="M3 16h3v3H3zM10.500 5h3v3h-3zM18 16h3v3h-3z" fill="currentColor" stroke="none" /></> },
  { id: 'hand', label: 'יד', group: 1, key: 'H', code: 'KeyH', enabled: true, icon: <path d="M8 13V6.500a1.500 1.500 0 0 1 3 0V11M11 10V4.500a1.500 1.500 0 0 1 3 0V10M14 10V6a1.500 1.500 0 0 1 3 0v8.500c0 3.500-2 6-6 6-3 0-4.500-1.500-6-4.500l-1.500-3a1.500 1.500 0 0 1 2.600-1.400L8 14" /> },
  { id: 'zoom', label: 'זום', group: 1, key: 'Z', code: 'KeyZ', enabled: true, icon: <><circle cx="10.500" cy="10.500" r="6" /><path d="m15 15 6 6" /></> },

  { id: 'type', label: 'טקסט', group: 2, key: 'T', code: 'KeyT', enabled: true, icon: <path d="M6 5h12M12 5v14M9 19h6" /> },
  { id: 'pathtype', label: 'טקסט על קו', group: 2, key: 'Shift+T', code: 'KeyT', shift: true, enabled: true, icon: <><path d="M3.500 19C6 8 18 8 20.500 19" /><path d="M9.500 4.500h5M12 4.500v6" /></> },
  { id: 'page', label: 'עמוד', group: 2, key: 'Shift+P', code: 'KeyP', shift: true, enabled: true, icon: <path d="M7 3h7l4 4v14H7zM14 3v4h4" /> },
  { id: 'collector', label: 'אוסף תוכן', group: 2, key: 'B', enabled: false, icon: <path d="M4 4h10v10H4zM10 10h10v10H10z" /> },

  { id: 'rect', label: 'מלבן', group: 3, key: 'M', code: 'KeyM', enabled: true, icon: <rect x="4" y="6" width="16" height="12" rx="1.500" /> },
  { id: 'ellipse', label: 'אליפסה', group: 3, key: 'L', code: 'KeyL', enabled: true, icon: <ellipse cx="12" cy="12" rx="8" ry="6" /> },
  { id: 'polygon', label: 'מצולע', group: 3, key: 'Y', code: 'KeyY', enabled: true, icon: <path d="M12 3.500 19 8v8l-7 4.500L5 16V8z" /> },
  { id: 'line', label: 'קו', group: 3, key: '\\', enabled: false, icon: <path d="M5 19 19 5" /> },
  { id: 'pen', label: 'עט', group: 3, key: 'P', enabled: false, icon: <><path d="M12 3l6 10-6 8-6-8z" /><circle cx="12" cy="11" r="1.500" /></> },
  { id: 'pencil', label: 'עיפרון', group: 3, key: 'N', enabled: false, icon: <path d="m4 20 1-4.500L16.500 4a2 2 0 0 1 3 3L8 18.500zM14 6.500 17.500 10" /> },

  { id: 'scissors', label: 'מספריים', group: 4, key: 'C', enabled: false, icon: <><circle cx="6.500" cy="6.500" r="2.500" /><circle cx="6.500" cy="17.500" r="2.500" /><path d="M8.300 8.300 20 17M8.300 15.700 20 7" /></> },
  { id: 'transform', label: 'שינוי צורה חופשי', group: 4, key: 'E', enabled: false, icon: <><path d="M5 5h14v14H5z" /><path d="M3 3h4v4H3zM17 3h4v4h-4zM3 17h4v4H3zM17 17h4v4h-4z" fill="currentColor" /></> },
  { id: 'gap', label: 'רווח', group: 4, key: 'U', enabled: false, icon: <path d="M4 4v16M20 4v16M9 12h6M11 9.500 8.500 12l2.500 2.500M13 9.500l2.500 2.500-2.500 2.500" /> },
  { id: 'gradient', label: 'דוגמית מעבר צבע', group: 4, key: 'G', enabled: false, icon: <path d="M4 6h16v12H4zM8 6v12M12 6v12M16 6v12" /> },
  { id: 'feather', label: 'החלקת מעבר צבע', group: 4, key: 'Shift+G', enabled: false, icon: <path d="M4 6h16v12H4zM8 9v6M12 9v6M16 9v6" strokeDasharray="2 2" /> },

  { id: 'eyedropper', label: 'טפטפת', group: 5, key: 'I', enabled: false, icon: <path d="m15 4 5 5-2.500 2.500-5-5zM12.500 8.500 4 17v3h3l8.500-8.500" /> },
  { id: 'note', label: 'הערה', group: 5, enabled: false, icon: <path d="M4 5h16v11h-9l-4 4v-4H4z" /> },
]

/** tools that have a settings window (double click) */
const SETTINGS_TOOLS: ToolId[] = ['rect', 'ellipse', 'polygon']

interface ToolboxProps {
  tool: ToolId
  onSelect: (id: ToolId) => void
  /** double click on a tool: its settings */
  onSettings?: (id: ToolId) => void
  previewMode: boolean
  onPreviewMode: (on: boolean) => void
}

export function Toolbox({ tool, onSelect, onSettings, previewMode, onPreviewMode }: ToolboxProps) {
  return (
    <div className="toolbox" role="toolbar" aria-orientation="vertical" aria-label="כלים">
      {TOOLS.map((t, i) => (
        <Fragment key={t.id}>
          {i > 0 && TOOLS[i - 1].group !== t.group && <div className="tool-sep" />}
          <button
            className={'tool' + (tool === t.id ? ' active' : '') + (t.enabled ? '' : ' off')}
            title={t.enabled ? `${t.label}${t.key ? ` (${t.key})` : ''}${SETTINGS_TOOLS.includes(t.id) ? ' · לחיצה כפולה להגדרות' : ''}` : `${t.label} — עדיין לא זמין`}
            aria-disabled={!t.enabled}
            aria-pressed={tool === t.id}
            onClick={() => t.enabled && onSelect(t.id)}
            onDoubleClick={() => t.enabled && SETTINGS_TOOLS.includes(t.id) && onSettings?.(t.id)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.600" strokeLinecap="round" strokeLinejoin="round">
              {t.icon}
            </svg>
          </button>
        </Fragment>
      ))}
      <div className="swatches">
        <span className="swatch-fill" title="צבע מילוי" />
        <span className="swatch-stroke" title="צבע קו" />
      </div>
      <div className="screen-modes" role="group" aria-label="מצב מסך">
        <button
          className={'tool' + (!previewMode ? ' active' : '')}
          title="מצב רגיל (W)"
          aria-pressed={!previewMode}
          onClick={() => onPreviewMode(false)}
        >
          {/* monitor with guide lines: the working view */}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.600" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4.500" width="18" height="12" rx="1.500" />
            <path d="M9 20h6M12 16.500V20" />
            <path d="M6.500 8.500h11M6.500 12.500h11" strokeWidth="1" strokeDasharray="2 2" />
          </svg>
        </button>
        <button
          className={'tool' + (previewMode ? ' active' : '')}
          title="מצב תצוגה מקדימה (W)"
          aria-pressed={previewMode}
          onClick={() => onPreviewMode(true)}
        >
          {/* eye: the page as it will be seen */}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.600" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.500 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>
    </div>
  )
}
