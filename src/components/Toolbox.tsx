import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export type ToolId =
  | 'select' | 'direct' | 'page' | 'pathtype' | 'gap' | 'collector' | 'type' | 'line' | 'pen' | 'pencil' | 'eraser'
  | 'rect' | 'ellipse' | 'polygon' | 'framerect' | 'frameellipse' | 'framepolygon' | 'scissors' | 'transform' | 'gradient' | 'color' | 'swatches' | 'feather' | 'note' | 'eyedropper'
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
  { id: 'direct', label: 'עריכת נקודות', group: 1, key: 'A', code: 'KeyA', enabled: true, icon: <><path d="M4.500 17.500C8 17.500 8 6.500 12 6.500s4 11 7.500 11" /><path d="M3 16h3v3H3zM10.500 5h3v3h-3zM18 16h3v3h-3z" fill="currentColor" stroke="none" /></> },
  { id: 'hand', label: 'יד', group: 1, key: 'H', code: 'KeyH', enabled: true, icon: <path d="M8 13V6.500a1.500 1.500 0 0 1 3 0V11M11 10V4.500a1.500 1.500 0 0 1 3 0V10M14 10V6a1.500 1.500 0 0 1 3 0v8.500c0 3.500-2 6-6 6-3 0-4.500-1.500-6-4.500l-1.500-3a1.500 1.500 0 0 1 2.600-1.400L8 14" /> },
  { id: 'zoom', label: 'זום', group: 1, key: 'Z', code: 'KeyZ', enabled: true, icon: <><circle cx="10.500" cy="10.500" r="6" /><path d="m15 15 6 6" /></> },

  { id: 'type', label: 'טקסט', group: 2, key: 'T', code: 'KeyT', enabled: true, icon: <path d="M6 5h12M12 5v14M9 19h6" /> },
  { id: 'pathtype', label: 'טקסט על קו', group: 2, key: 'Shift+T', code: 'KeyT', shift: true, enabled: true, icon: <><path d="M3.500 19C6 8 18 8 20.500 19" /><path d="M9.500 4.500h5M12 4.500v6" /></> },
  { id: 'page', label: 'עמוד', group: 2, key: 'Shift+P', code: 'KeyP', shift: true, enabled: true, icon: <path d="M7 3h7l4 4v14H7zM14 3v4h4" /> },
  { id: 'collector', label: 'אוסף תוכן', group: 2, key: 'B', enabled: false, icon: <path d="M4 4h10v10H4zM10 10h10v10H10z" /> },

  { id: 'rect', label: 'מלבן', group: 3, key: 'M', code: 'KeyM', enabled: true, icon: <rect x="4" y="6" width="16" height="12" rx="1.500" /> },
  { id: 'ellipse', label: 'אליפסה', group: 3, key: 'L', code: 'KeyL', enabled: true, icon: <ellipse cx="12" cy="12" rx="8" ry="6" /> },
  { id: 'polygon', label: 'מצולע', group: 3, key: 'Y', code: 'KeyY', enabled: true, icon: <path d="M12 3.500 19 8v8l-7 4.500L5 16V8z" /> },
  {
    id: 'framerect',
    label: 'מסגרת גרפית — מלבן',
    group: 3,
    key: 'F',
    code: 'KeyF',
    enabled: true,
    icon: (
      <>
        <rect x="4" y="6" width="16" height="12" rx="1.500" />
        <circle cx="9" cy="10.500" r="1.200" fill="currentColor" stroke="none" />
        <path d="M6 15.500 10 11.500 13 14 18 9.500" />
      </>
    ),
  },
  {
    id: 'frameellipse',
    label: 'מסגרת גרפית — אליפסה',
    group: 3,
    key: 'Shift+F',
    code: 'KeyF',
    shift: true,
    enabled: true,
    icon: (
      <>
        <ellipse cx="12" cy="12" rx="8" ry="6" />
        <circle cx="9.500" cy="10.500" r="1.100" fill="currentColor" stroke="none" />
        <path d="M6.700 14 10 11 13 13.500 17.300 9.700" />
      </>
    ),
  },
  {
    id: 'framepolygon',
    label: 'מסגרת גרפית — מצולע',
    group: 3,
    enabled: true,
    icon: (
      <>
        <path d="M12 3.500 19 8v8l-7 4.500L5 16V8z" />
        <circle cx="10.200" cy="10.500" r="1.100" fill="currentColor" stroke="none" />
        <path d="M7.500 14.500 10.500 11 13.500 13.500 16.300 10.200" />
      </>
    ),
  },
  { id: 'line', label: 'קו', group: 3, key: '\\', enabled: true, icon: <path d="M5 19 19 5" /> },
  { id: 'pen', label: 'עט', group: 3, key: 'P', code: 'KeyP', enabled: true, icon: <><path d="M12 3l6 10-6 8-6-8z" /><circle cx="12" cy="11" r="1.500" /></> },
  { id: 'pencil', label: 'עיפרון', group: 3, key: 'N', code: 'KeyN', enabled: true, icon: <path d="m4 20 1-4.500L16.500 4a2 2 0 0 1 3 3L8 18.500zM14 6.500 17.500 10" /> },

  { id: 'scissors', label: 'מספריים', group: 4, key: 'C', code: 'KeyC', enabled: true, icon: <><circle cx="6.500" cy="6.500" r="2.500" /><circle cx="6.500" cy="17.500" r="2.500" /><path d="M8.300 8.300 20 17M8.300 15.700 20 7" /></> },
  { id: 'eraser', label: 'מחק נקודות', group: 4, key: 'Shift+E', code: 'KeyE', shift: true, enabled: true, icon: <path d="m4 16 9-11a2 2 0 0 1 3 0l4 4-9 11H7zM12 20h9" /> },
  { id: 'transform', label: 'שינוי צורה חופשי', group: 4, key: 'E', code: 'KeyE', enabled: true, icon: <><path d="M5 5h14v14H5z" /><path d="M3 3h4v4H3zM17 3h4v4h-4zM3 17h4v4H3zM17 17h4v4h-4z" fill="currentColor" /></> },
  { id: 'gap', label: 'רווח', group: 4, key: 'U', enabled: false, icon: <path d="M4 4v16M20 4v16M9 12h6M11 9.500 8.500 12l2.500 2.500M13 9.500l2.500 2.500-2.500 2.500" /> },
  { id: 'color', label: 'צבע', group: 5, key: 'K', code: 'KeyK', enabled: true, icon: <path d="M4 5h16v14H4zM7 8h10M7 12h6M7 16h8" /> },
  { id: 'gradient', label: 'מעבר צבע', group: 5, key: 'G', code: 'KeyG', enabled: true, icon: <path d="M4 6h16v12H4zM7 6v12M10 6v12M13 6v12M16 6v12" /> },
  { id: 'swatches', label: 'דוגמיות צבע', group: 5, enabled: true, icon: <><circle cx="8" cy="8" r="3" fill="#ed168c" stroke="none" /><circle cx="16" cy="8" r="3" fill="#00a6d6" stroke="none" /><circle cx="8" cy="16" r="3" fill="#f5b800" stroke="none" /><circle cx="16" cy="16" r="3" fill="#222" stroke="none" /></> },
  { id: 'feather', label: 'החלקת מעבר צבע', group: 4, key: 'Shift+G', enabled: false, icon: <path d="M4 6h16v12H4zM8 9v6M12 9v6M16 9v6" strokeDasharray="2 2" /> },

  { id: 'eyedropper', label: 'דוגם סגנון', group: 5, key: 'I', code: 'KeyI', enabled: true, icon: <path d="m15 4 5 5-2.500 2.500-5-5zM12.500 8.500 4 17v3h3l8.500-8.500" /> },
  { id: 'note', label: 'הערה', group: 5, enabled: false, icon: <path d="M4 5h16v11h-9l-4 4v-4H4z" /> },
]

/** tools that have a settings window (double click) */
// ellipse and line have no default-tool settings left (nothing but a click-made default size, which no longer exists)
const SETTINGS_TOOLS: ToolId[] = ['rect', 'polygon', 'framerect', 'framepolygon', 'pen', 'pencil']

/** the plain shape each graphic-frame tool draws (they share its settings and its keyboard-drawing behaviour) */
export const FRAME_TOOL_KIND: Partial<Record<ToolId, 'rect' | 'ellipse' | 'polygon'>> = { framerect: 'rect', frameellipse: 'ellipse', framepolygon: 'polygon' }

/**
 * Tools that share one slot in the toolbox, like the shape and type tools in InDesign: the slot shows and uses whichever
 * one was picked last, and a small mark in its corner opens a flyout to pick a different one.
 */
const FOLD_GROUPS: ToolId[][] = [
  ['rect', 'ellipse', 'polygon'],
  ['type', 'pathtype'],
  ['framerect', 'frameellipse', 'framepolygon'],
  ['color', 'gradient', 'swatches'],
]
const foldGroupOf = new Map<ToolId, ToolId[]>(FOLD_GROUPS.flatMap((g) => g.map((id) => [id, g] as const)))
const toolDef = (id: ToolId) => TOOLS.find((t) => t.id === id)!
const TOOL_HINTS: Partial<Record<ToolId, string>> = {
  select: 'בחירת אובייקטים, הזזה ושינוי גודל',
  direct: 'עריכת נקודות עוגן וידיות של נתיב',
  hand: 'הזזת תצוגת הקנבס',
  zoom: 'הגדלה והקטנה של תצוגת המסמך',
  type: 'יצירת ועריכת תיבות טקסט',
  pathtype: 'הוספת טקסט לאורך נתיב',
  page: 'שינוי גודל ושוליים של עמוד',
  rect: 'ציור מלבן',
  ellipse: 'ציור אליפסה',
  polygon: 'ציור מצולע',
  framerect: 'יצירת מסגרת תמונה מלבנית',
  frameellipse: 'יצירת מסגרת תמונה אליפטית',
  framepolygon: 'יצירת מסגרת תמונה מצולעת',
  line: 'ציור קו ישר',
  pen: 'יצירת נתיב עם נקודות וידיות Bezier',
  pencil: 'ציור קו חופשי מוחלק',
  scissors: 'חיתוך נתיב בנקודת העוגן הקרובה',
  eraser: 'מחיקת מקטע נתיב באמצעות מברשת',
  color: 'בחירת צבע מילוי או קו',
  gradient: 'יצירת מעבר צבע',
  swatches: 'בחירה וניהול של דוגמיות צבע',
  eyedropper: 'דגימת סגנון מטקסט או אובייקט',
}

interface ToolboxProps {
  tool: ToolId
  onSelect: (id: ToolId) => void
  /** double click on a tool: its settings */
  onSettings?: (id: ToolId) => void
  previewMode: boolean
  onPreviewMode: (on: boolean) => void
  colorTarget: 'fill' | 'stroke'
  fillColor?: string | null
  strokeColor?: string | null
  onColorTarget: (target: 'fill' | 'stroke') => void
  onOpenColor: (target: 'fill' | 'stroke') => void
}

export function Toolbox({ tool, onSelect, onSettings, previewMode, onPreviewMode, colorTarget, fillColor, strokeColor, onColorTarget, onOpenColor }: ToolboxProps) {
  // which tool of a fold group its slot shows, keyed by the group's first id; starts at that first tool, and follows
  // `tool` whenever it becomes one of the group's own (a click on the slot, a pick from its flyout, or the tool's own
  // keyboard shortcut, which changes `tool` from outside this component). Adjusted right in render, as React's docs say
  // to for state derived from a prop, so the slot's icon is never one render behind.
  const [current, setCurrent] = useState<Partial<Record<ToolId, ToolId>>>({})
  const [prevTool, setPrevTool] = useState(tool)
  if (tool !== prevTool) {
    setPrevTool(tool)
    const g = foldGroupOf.get(tool)
    if (g) setCurrent((c) => ({ ...c, [g[0]]: tool }))
  }

  const [flyout, setFlyout] = useState<{ group: ToolId[]; rect: DOMRect } | null>(null)
  const [hoveredTool, setHoveredTool] = useState<{ label: string; description: string; key?: string; rect: DOMRect } | null>(null)
  const renderedGroups = new Set<ToolId>()

  return (
    <div className="toolbox" role="toolbar" aria-orientation="vertical" aria-label="כלים">
      <div className="toolbox-scroll">
      {TOOLS.map((t, i) => {
        const group = foldGroupOf.get(t.id)
        if (group) {
          if (renderedGroups.has(group[0])) return null
          renderedGroups.add(group[0])
        }
        const active = toolDef(group ? (current[group[0]] ?? group[0]) : t.id)
        const hasFlyout = !!group && group.length > 1
        const tooltipDescription = `${TOOL_HINTS[active.id] ?? active.label}${hasFlyout ? ' · לחיצה כפולה להצגת כלים נוספים' : ''}`
        return (
          <Fragment key={t.id}>
            {i > 0 && TOOLS[i - 1].group !== t.group && <div className="tool-sep" />}
            <div className="tool-slot">
              <button
                className={'tool' + (tool === active.id ? ' active' : '') + (active.enabled ? '' : ' off')}
                aria-disabled={!active.enabled}
                aria-pressed={tool === active.id}
                aria-label={active.enabled ? `${active.label}${active.key ? ` (${active.key})` : ''}` : `${active.label} — עדיין לא זמין`}
                onMouseEnter={(event) => setHoveredTool({ label: active.label, description: tooltipDescription, key: active.key, rect: event.currentTarget.getBoundingClientRect() })}
                onMouseLeave={() => setHoveredTool(null)}
                onFocus={(event) => setHoveredTool({ label: active.label, description: tooltipDescription, key: active.key, rect: event.currentTarget.getBoundingClientRect() })}
                onBlur={() => setHoveredTool(null)}
                onClick={() => active.enabled && onSelect(active.id)}
                onDoubleClick={(event) => {
                  setHoveredTool(null)
                  if (!active.enabled) return
                  if (hasFlyout) setFlyout({ group, rect: event.currentTarget.getBoundingClientRect() })
                  else if (SETTINGS_TOOLS.includes(active.id)) onSettings?.(active.id)
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.600" strokeLinecap="round" strokeLinejoin="round">
                  {active.icon}
                </svg>
              </button>
            </div>
          </Fragment>
        )
      })}
      <div className="swatches">
        <button
          className={'swatch-fill' + (colorTarget === 'fill' ? ' active' : '')}
          style={fillColor ? { background: fillColor } : undefined}
          title="מילוי — לחיצה מחליפה יעד, לחיצה כפולה פותחת את כלי הצבע"
          aria-label="מילוי"
          onClick={() => onColorTarget('fill')}
          onDoubleClick={() => onOpenColor('fill')}
        />
        <button
          className={'swatch-stroke' + (colorTarget === 'stroke' ? ' active' : '')}
          style={strokeColor ? { borderColor: strokeColor, background: 'transparent' } : undefined}
          title="קו — לחיצה מחליפה יעד, לחיצה כפולה פותחת את כלי הצבע"
          aria-label="קו"
          onClick={() => onColorTarget('stroke')}
          onDoubleClick={() => onOpenColor('stroke')}
        />
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
      {hoveredTool && (
        <div className="tool-tooltip-fixed" role="tooltip" style={{ left: hoveredTool.rect.right + 8, top: hoveredTool.rect.top + hoveredTool.rect.height / 2 }}>
          <strong>{hoveredTool.label}</strong>
          <span>{hoveredTool.description}</span>
          {hoveredTool.key && <kbd>{hoveredTool.key}</kbd>}
        </div>
      )}
      {flyout && (
        <ToolFlyout
          group={flyout.group}
          anchor={flyout.rect}
          current={tool}
          onPick={(id) => {
            onSelect(id)
            setFlyout(null)
          }}
          onClose={() => setFlyout(null)}
        />
      )}
    </div>
  )
}

interface FlyoutProps {
  group: ToolId[]
  /** the slot button's own position: the flyout opens beside it, toward the canvas */
  anchor: DOMRect
  current: ToolId
  onPick: (id: ToolId) => void
  onClose: () => void
}

/** The list of alternative tools for one toolbox slot, opened by its corner mark. Closes on a click elsewhere, Escape, scrolling or resizing. */
function ToolFlyout({ group, anchor, current, onPick, onClose }: FlyoutProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: anchor.left, top: anchor.top })

  // open toward the canvas (away from the toolbox, which sits against the window's edge); the other side if there is no room
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const left = anchor.left - r.width - 6 >= 4 ? anchor.left - r.width - 6 : Math.min(anchor.right + 6, window.innerWidth - r.width - 4)
    const top = Math.max(4, Math.min(anchor.top, window.innerHeight - r.height - 4))
    setPos({ left, top })
  }, [anchor])

  useEffect(() => {
    const away = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', away, true)
    window.addEventListener('keydown', key)
    window.addEventListener('resize', onClose)
    window.addEventListener('blur', onClose)
    window.addEventListener('wheel', onClose, { passive: true })
    return () => {
      window.removeEventListener('pointerdown', away, true)
      window.removeEventListener('keydown', key)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('wheel', onClose)
    }
  }, [onClose])

  return (
    <div ref={ref} className="menu-panel tool-flyout" role="menu" style={pos}>
      {group.map((id) => {
        const t = toolDef(id)
        return (
          <div
            key={id}
            role="menuitemradio"
            aria-checked={id === current}
            className={'menu-item tool-flyout-item' + (id === current ? ' on' : '')}
            onClick={() => t.enabled && onPick(id)}
          >
            <svg className="tool-flyout-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.600" strokeLinecap="round" strokeLinejoin="round">
              {t.icon}
            </svg>
            <span className="menu-text">{t.label}</span>
            {t.key && (
              <span className="menu-shortcut" dir="ltr">
                {t.key}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
