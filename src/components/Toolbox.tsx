import type { ReactNode } from 'react'

export type ToolId =
  | 'select' | 'direct' | 'page' | 'gap' | 'collector' | 'type' | 'line' | 'pen' | 'pencil'
  | 'frame' | 'ellipse' | 'scissors' | 'transform' | 'gradient' | 'feather' | 'note' | 'eyedropper'
  | 'hand' | 'zoom'

interface ToolDef {
  id: ToolId
  label: string
  /** keyboard shortcut shown in the tooltip */
  key?: string
  /** KeyboardEvent.code, so the shortcut also works on a Hebrew keyboard layout */
  code?: string
  enabled: boolean
  icon: ReactNode
}

export const TOOLS: ToolDef[] = [
  { id: 'select', label: 'בחירה', key: 'V', code: 'KeyV', enabled: true, icon: <path d="M5 3v16l4.300-3.700L12 21.500l2.700-1.200-2.700-6.100 6-.2z" fill="currentColor" stroke="none" /> },
  { id: 'direct', label: 'בחירה ישירה', key: 'A', enabled: false, icon: <path d="M5 3v16l4.300-3.700L12 21.500l2.700-1.200-2.700-6.100 6-.2z" /> },
  { id: 'page', label: 'עמוד', key: 'Shift+P', enabled: false, icon: <path d="M7 3h7l4 4v14H7zM14 3v4h4" /> },
  { id: 'gap', label: 'רווח', key: 'U', enabled: false, icon: <path d="M4 4v16M20 4v16M9 12h6M11 9.500 8.500 12l2.500 2.500M13 9.500l2.500 2.500-2.500 2.500" /> },
  { id: 'collector', label: 'אוסף תוכן', key: 'B', enabled: false, icon: <path d="M4 4h10v10H4zM10 10h10v10H10z" /> },
  { id: 'type', label: 'טקסט', key: 'T', enabled: false, icon: <path d="M6 5h12M12 5v14M9 19h6" /> },
  { id: 'line', label: 'קו', key: '\\', enabled: false, icon: <path d="M5 19 19 5" /> },
  { id: 'pen', label: 'עט', key: 'P', enabled: false, icon: <><path d="M12 3l6 10-6 8-6-8z" /><circle cx="12" cy="11" r="1.500" /></> },
  { id: 'pencil', label: 'עיפרון', key: 'N', enabled: false, icon: <path d="m4 20 1-4.500L16.500 4a2 2 0 0 1 3 3L8 18.500zM14 6.500 17.500 10" /> },
  { id: 'frame', label: 'מסגרת מלבנית', key: 'F', enabled: false, icon: <path d="M4 5h16v14H4zM4 5l16 14M20 5 4 19" /> },
  { id: 'ellipse', label: 'אליפסה', key: 'L', enabled: false, icon: <ellipse cx="12" cy="12" rx="8" ry="6" /> },
  { id: 'scissors', label: 'מספריים', key: 'C', enabled: false, icon: <><circle cx="6.500" cy="6.500" r="2.500" /><circle cx="6.500" cy="17.500" r="2.500" /><path d="M8.300 8.300 20 17M8.300 15.700 20 7" /></> },
  { id: 'transform', label: 'שינוי צורה חופשי', key: 'E', enabled: false, icon: <><path d="M5 5h14v14H5z" /><path d="M3 3h4v4H3zM17 3h4v4h-4zM3 17h4v4H3zM17 17h4v4h-4z" fill="currentColor" /></> },
  { id: 'gradient', label: 'דוגמית מעבר צבע', key: 'G', enabled: false, icon: <path d="M4 6h16v12H4zM8 6v12M12 6v12M16 6v12" /> },
  { id: 'feather', label: 'החלקת מעבר צבע', key: 'Shift+G', enabled: false, icon: <path d="M4 6h16v12H4zM8 9v6M12 9v6M16 9v6" strokeDasharray="2 2" /> },
  { id: 'note', label: 'הערה', enabled: false, icon: <path d="M4 5h16v11h-9l-4 4v-4H4z" /> },
  { id: 'eyedropper', label: 'טפטפת', key: 'I', enabled: false, icon: <path d="m15 4 5 5-2.500 2.500-5-5zM12.500 8.500 4 17v3h3l8.500-8.500" /> },
  { id: 'hand', label: 'יד', key: 'H', code: 'KeyH', enabled: true, icon: <path d="M8 13V6.500a1.500 1.500 0 0 1 3 0V11M11 10V4.500a1.500 1.500 0 0 1 3 0V10M14 10V6a1.500 1.500 0 0 1 3 0v8.500c0 3.500-2 6-6 6-3 0-4.500-1.500-6-4.500l-1.500-3a1.500 1.500 0 0 1 2.600-1.400L8 14" /> },
  { id: 'zoom', label: 'זום', key: 'Z', code: 'KeyZ', enabled: true, icon: <><circle cx="10.500" cy="10.500" r="6" /><path d="m15 15 6 6" /></> },
]

interface ToolboxProps {
  tool: ToolId
  onSelect: (id: ToolId) => void
  previewMode: boolean
  onPreviewMode: (on: boolean) => void
}

export function Toolbox({ tool, onSelect, previewMode, onPreviewMode }: ToolboxProps) {
  return (
    <div className="toolbox" role="toolbar" aria-orientation="vertical" aria-label="כלים">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          className={'tool' + (tool === t.id ? ' active' : '') + (t.enabled ? '' : ' off')}
          title={t.enabled ? `${t.label}${t.key ? ` (${t.key})` : ''}` : `${t.label} — עדיין לא זמין`}
          aria-disabled={!t.enabled}
          aria-pressed={tool === t.id}
          onClick={() => t.enabled && onSelect(t.id)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.600" strokeLinecap="round" strokeLinejoin="round">
            {t.icon}
          </svg>
        </button>
      ))}
      <div className="swatches" aria-hidden="true">
        <span className="swatch-fill" />
        <span className="swatch-stroke" />
      </div>
      <div className="screen-modes" role="group" aria-label="מצב מסך">
        <button
          className={'tool' + (!previewMode ? ' active' : '')}
          title="מצב רגיל (W)"
          aria-pressed={!previewMode}
          onClick={() => onPreviewMode(false)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.600" strokeLinecap="round">
            <path d="M5 5h14v14H5z" strokeDasharray="2.500 2" />
            <path d="M9 3v18M15 3v18" strokeWidth="1" />
          </svg>
        </button>
        <button
          className={'tool' + (previewMode ? ' active' : '')}
          title="מצב תצוגה מקדימה (W)"
          aria-pressed={previewMode}
          onClick={() => onPreviewMode(true)}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <rect x="5" y="4" width="14" height="16" rx="1" />
          </svg>
        </button>
      </div>
    </div>
  )
}
