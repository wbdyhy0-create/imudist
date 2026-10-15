import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { t } from '../i18n'
import { macKeys } from '../platform'
import { getShortcutState, keysOf, matches, useShortcutState } from '../shortcuts'

export type ToolId =
  | 'select' | 'marqueeRect' | 'marqueeEllipse' | 'magneticLasso' | 'direct' | 'page' | 'pathtype' | 'gap' | 'collector' | 'type' | 'line' | 'pen' | 'pencil' | 'brush' | 'eraser'
  | 'rect' | 'ellipse' | 'polygon' | 'framerect' | 'frameellipse' | 'framepolygon' | 'scissors' | 'transform' | 'gradient' | 'color' | 'swatches' | 'feather' | 'note' | 'eyedropper' | 'colorSampler' | 'heal'
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
  { id: 'select', get label() { return t('בחירה') }, group: 1, key: 'V', code: 'KeyV', enabled: true, icon: <path d="M5 3v16l4.300-3.700L12 21.500l2.700-1.200-2.700-6.100 6-.2z" fill="currentColor" stroke="none" /> },
  { id: 'direct', get label() { return t('עריכת נקודות') }, group: 1, key: 'A', code: 'KeyA', enabled: true, icon: <><path d="M4.500 17.500C8 17.500 8 6.500 12 6.500s4 11 7.500 11" /><path d="M3 16h3v3H3zM10.500 5h3v3h-3zM18 16h3v3h-3z" fill="currentColor" stroke="none" /></> },
  { id: 'type', get label() { return t('טקסט') }, group: 2, key: 'T', code: 'KeyT', enabled: true, icon: <path d="M6 5h12M12 5v14M9 19h6" /> },
  { id: 'pathtype', get label() { return t('טקסט על קו') }, group: 2, key: 'Shift+T', code: 'KeyT', shift: true, enabled: true, icon: <><path d="M3.500 19C6 8 18 8 20.500 19" /><path d="M9.500 4.500h5M12 4.500v6" /></> },
  { id: 'page', get label() { return t('עמוד') }, group: 2, key: 'Shift+P', code: 'KeyP', shift: true, enabled: true, icon: <path d="M7 3h7l4 4v14H7zM14 3v4h4" /> },

  { id: 'rect', get label() { return t('מרובע') }, group: 3, key: 'M', code: 'KeyM', enabled: true, icon: <rect x="4" y="4" width="16" height="16" rx="1.500" /> },
  { id: 'ellipse', get label() { return t('אליפסה') }, group: 3, key: 'L', code: 'KeyL', enabled: true, icon: <ellipse cx="12" cy="12" rx="8" ry="6" /> },
  { id: 'polygon', get label() { return t('מצולע') }, group: 3, key: 'Y', code: 'KeyY', enabled: true, icon: <path d="M12 3.500 19 8v8l-7 4.500L5 16V8z" /> },
  {
    id: 'framerect',
    get label() { return t('מסגרת גרפית — מלבן') },
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
    get label() { return t('מסגרת גרפית — אליפסה') },
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
    get label() { return t('מסגרת גרפית — מצולע') },
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
  { id: 'marqueeRect', get label() { return t('בחירה מלבנית') }, group: 1, enabled: true, icon: <><path d="M7 3v14a2 2 0 0 0 2 2h12" /><path d="M3 7h14a2 2 0 0 1 2 2v12" /></> },
  { id: 'marqueeEllipse', get label() { return t('בחירה אליפטית') }, group: 1, enabled: true, icon: <ellipse cx="12" cy="12" rx="8" ry="7" strokeDasharray="2 2" /> },
  { id: 'magneticLasso', get label() { return t('לאסו מגנטי') }, group: 1, enabled: true, icon: <><path d="M5 18.500 6.200 9.200a5.800 5.800 0 0 1 11.600 0L19 18.500a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z" /><path d="m6.500 16.500 2-1.500 2 1 2-2 2 1 2-2" strokeDasharray="1.5 1.5" /></> },
  { id: 'line', get label() { return t('קו') }, group: 3, key: '\\', code: 'Backslash', enabled: true, icon: <path d="M5 19 19 5" /> },
  { id: 'pen', get label() { return t('עט') }, group: 3, key: 'P', code: 'KeyP', enabled: true, icon: <><path d="M12 3l6 10-6 8-6-8z" /><circle cx="12" cy="11" r="1.500" /></> },
  { id: 'pencil', get label() { return t('עיפרון') }, group: 3, key: 'N', code: 'KeyN', enabled: true, icon: <path d="m4 20 1-4.500L16.500 4a2 2 0 0 1 3 3L8 18.500zM14 6.500 17.500 10" /> },
  { id: 'brush', get label() { return t('מברשת') }, group: 3, key: 'B', code: 'KeyB', enabled: true, icon: <><path d="M14.500 4.500a2.100 2.100 0 0 1 3 3L11.500 13.500l-3-3z" /><path d="M8.500 11.500c-2.500 0-4 1.600-4 3.800 0 1.500-.8 2.700-1.500 3.500 3.500 1 8-.5 8-4" /></> },

  { id: 'scissors', get label() { return t('מספריים') }, group: 4, key: 'C', code: 'KeyC', enabled: true, icon: <><circle cx="6.500" cy="6.500" r="2.500" /><circle cx="6.500" cy="17.500" r="2.500" /><path d="M8.300 8.300 20 17M8.300 15.700 20 7" /></> },
  { id: 'eraser', get label() { return t('מחק נקודות') }, group: 4, key: 'Shift+E', code: 'KeyE', shift: true, enabled: true, icon: <path d="m4 16 9-11a2 2 0 0 1 3 0l4 4-9 11H7zM12 20h9" /> },
  { id: 'heal', get label() { return t('מברשת ריפוי') }, group: 4, enabled: true, icon: <><path d="m4 12 8-8 8 8-8 8z" /><path d="M12 8v8M8 12h8" /><circle cx="12" cy="12" r="2" fill="currentColor" /></> },
  { id: 'transform', get label() { return t('שינוי צורה חופשי') }, group: 4, key: 'E', code: 'KeyE', enabled: true, icon: <><path d="M5 5h14v14H5z" /><path d="M3 3h4v4H3zM17 3h4v4h-4zM3 17h4v4H3zM17 17h4v4h-4z" fill="currentColor" /></> },
  {
    id: 'gap',
    get label() { return t('רווח') },
    group: 4,
    key: 'U',
    code: 'KeyU',
    enabled: true,
    icon: (
      <>
        <rect x="2" y="7" width="6" height="10" rx="0.75" fill="none" />
        <rect x="16" y="7" width="6" height="10" rx="0.75" fill="none" />
        <path d="M4 12h16m-3-3 3 3-3 3M7 9l-3 3 3 3" />
      </>
    ),
  },
  { id: 'color', get label() { return t('צבע') }, group: 5, key: 'K', code: 'KeyK', enabled: true, icon: <path d="M4 5h16v14H4zM7 8h10M7 12h6M7 16h8" /> },
  { id: 'gradient', get label() { return t('מעבר צבע') }, group: 5, key: 'G', code: 'KeyG', enabled: true, icon: <path d="M4 6h16v12H4zM7 6v12M10 6v12M13 6v12M16 6v12" /> },
  { id: 'swatches', get label() { return t('דוגמיות צבע') }, group: 5, enabled: true, icon: <><circle cx="8" cy="8" r="3" fill="#ed168c" stroke="none" /><circle cx="16" cy="8" r="3" fill="#00a6d6" stroke="none" /><circle cx="8" cy="16" r="3" fill="#f5b800" stroke="none" /><circle cx="16" cy="16" r="3" fill="#222" stroke="none" /></> },
  { id: 'feather', get label() { return t('החלקת מעבר צבע') }, group: 4, key: 'Shift+G', code: 'KeyG', shift: true, enabled: true, icon: <path d="M4 6h16v12H4zM8 9v6M12 9v6M16 9v6" strokeDasharray="2 2" /> },

  { id: 'eyedropper', get label() { return t('דוגם סגנון') }, group: 5, key: 'I', code: 'KeyI', enabled: true, icon: <><rect x="4" y="3" width="13" height="6" rx="1.500" /><path d="M17 6h2.500v5H11v3" /><rect x="9" y="14" width="4" height="7" rx="1" /></> },
  { id: 'colorSampler', get label() { return t('דגימת צבע') }, group: 5, enabled: true, icon: <><path d="m3 21 1-4 9-9 3 3-9 9z" /><path d="m13 8 2.500-2.500a2.100 2.100 0 0 1 3 0l.5.500a2.100 2.100 0 0 1 0 3L16.500 11.500" /><path d="m14 7 3 3" /></> },
  { id: 'note', get label() { return t('הערה') }, group: 5, enabled: false, icon: <path d="M4 5h16v11h-9l-4 4v-4H4z" /> },
  { id: 'hand', get label() { return t('יד') }, group: 1, key: 'H', code: 'KeyH', enabled: true, icon: <path d="M8 13V6.500a1.500 1.500 0 0 1 3 0V11M11 10V4.500a1.500 1.500 0 0 1 3 0V10M14 10V6a1.500 1.500 0 0 1 3 0v8.500c0 3.500-2 6-6 6-3 0-4.500-1.500-6-4.500l-1.500-3a1.500 1.500 0 0 1 2.600-1.400L8 14" /> },
  { id: 'zoom', get label() { return t('זום') }, group: 1, key: 'Z', code: 'KeyZ', enabled: true, icon: <><circle cx="10.500" cy="10.500" r="6" /><path d="m15 15 6 6" /></> },
]

const HIDDEN_TOOLBOX_TOOLS = new Set<ToolId>(['color', 'gradient', 'swatches', 'transform', 'collector'])
const TOOLBOX_TOOLS = TOOLS.filter((item) => !HIDDEN_TOOLBOX_TOOLS.has(item.id))
export const TOOL_TOUR_IDS = TOOLBOX_TOOLS.filter((item) => item.enabled).map((item) => item.id)

/** tools that have a settings window (double click) */
// ellipse and line have no default-tool settings left (nothing but a click-made default size, which no longer exists)
const SETTINGS_TOOLS: ToolId[] = ['rect', 'polygon', 'framerect', 'framepolygon', 'pen', 'pencil']

/** the plain shape each graphic-frame tool draws (they share its settings and its keyboard-drawing behaviour) */
export const FRAME_TOOL_KIND: Partial<Record<ToolId, 'rect' | 'ellipse' | 'polygon'>> = { framerect: 'rect', frameellipse: 'ellipse', framepolygon: 'polygon' }

/**
 * Tools that share one slot in the toolbox, like the shape and type tools in professional layout tools: the slot shows and uses whichever
 * one was picked last, and a small mark in its corner opens a flyout to pick a different one.
 */
const FOLD_GROUPS: ToolId[][] = [
  ['marqueeRect', 'marqueeEllipse', 'magneticLasso', 'heal'],
  ['rect', 'ellipse', 'polygon'],
  ['type', 'pathtype'],
  ['framerect', 'frameellipse', 'framepolygon'],
]
const foldGroupOf = new Map<ToolId, ToolId[]>(FOLD_GROUPS.flatMap((g) => g.map((id) => [id, g] as const)))
const toolDef = (id: ToolId) => TOOLS.find((t) => t.id === id)!

/** the keys a tool has in the program's own set of shortcuts: the one written on it, when a key press can reach it */
export const toolDefaults = (def: Pick<ToolDef, 'key' | 'code'>): string[] => (def.code && def.key ? [def.key] : [])

/** the keys of a tool now: the ones the active set of shortcuts gives it */
export const toolShortcuts = (def: ToolDef, state = getShortcutState()): string[] => keysOf(state, 'tool:' + def.id, toolDefaults(def))

/** the tool a key press chooses, if any */
export function toolForKey(e: KeyboardEvent): ToolId | undefined {
  const state = getShortcutState()
  return TOOLS.find((def) => def.enabled && toolShortcuts(def, state).some((keys) => matches(e, keys)))?.id
}
export const TOOL_HINTS: Partial<Record<ToolId, string>> = {
  get select() { return t('בחירת אובייקטים, הזזה ושינוי גודל') },
  get marqueeRect() { return t('בחירת צורה לחיתוך אובייקטים, תמונות וטקסט') },
  get marqueeEllipse() { return t('בחירה אליפטית וחיתוך לאובייקט חדש') },
  get magneticLasso() { return t('לחצו על קצה בתמונה והזיזו את העכבר לאורכו: הקו נצמד אליו. לחיצה כפולה סוגרת את האזור. אפשר למלא, למחוק או להשאיר רק את האזור הנבחר.') },
  get direct() { return t('עריכת נקודות עוגן וידיות של נתיב') },
  get hand() { return t('הזזת תצוגת הקנבס') },
  get zoom() { return t('הגדלה והקטנה של תצוגת המסמך') },
  get type() { return t('יצירת ועריכת תיבות טקסט') },
  get pathtype() { return t('הוספת טקסט לאורך נתיב') },
  get page() { return t('שינוי גודל ושוליים של עמוד') },
  get rect() { return t('ציור מרובע') },
  get ellipse() { return t('ציור אליפסה') },
  get polygon() { return t('ציור מצולע') },
  get framerect() { return t('יצירת מסגרת תמונה מלבנית') },
  get frameellipse() { return t('יצירת מסגרת תמונה אליפטית') },
  get framepolygon() { return t('יצירת מסגרת תמונה מצולעת') },
  get line() { return t('ציור קו ישר') },
  get pen() { return t('יצירת נתיב עם נקודות וידיות Bezier') },
  get pencil() { return t('ציור קו חופשי מוחלק') },
  get brush() { return t('ציור במברשת: קליגרפית, מדורגת, נתז צבע ועוד. כל משיכה נשמרת כצורה וקטורית') },
  get scissors() { return t('חיתוך נתיב בנקודת העוגן הקרובה') },
  get eraser() { return t('מחיקת מקטע נתיב באמצעות מברשת') },
  get heal() { return t('גררו על אזור בתמונה כדי למלא אותו בפיקסלים מהסביבה. להקטנת המברשת החזיקו Shift ולחצו על (, ולהגדלתה החזיקו Shift ולחצו על ).') },
  get gap() { return t('גרור בין אובייקטים מיושרים כדי להרחיב צד אחד ולכווץ את השני; Shift מגביל לזוג הקרוב בלבד') },
  get color() { return t('בחירת צבע מילוי או קו') },
  get gradient() { return t('יצירת מעבר צבע') },
  get swatches() { return t('בחירה וניהול של דוגמיות צבע') },
  get feather() { return t('גרירת נקודת התחלה וסיום יוצרת מסכת אטימות') },
  get eyedropper() { return t('דגימת סגנון מטקסט או אובייקט') },
  get colorSampler() { return t('דגימת צבע מהמסמך או מהמסך') },
}

interface ToolboxProps {
  tool: ToolId
  onSelect: (id: ToolId) => void
  colorSamplerActive: boolean
  onToggleColorSampler: () => void
  /** double click on a tool: its settings */
  onSettings?: (id: ToolId) => void
  previewMode: boolean
  onPreviewMode: (on: boolean) => void
}

export function Toolbox({ tool, onSelect, colorSamplerActive, onToggleColorSampler, onSettings, previewMode, onPreviewMode }: ToolboxProps) {
  const shortcuts = useShortcutState() // drawn again when the user gives a tool other keys
  const toolboxRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; left: number; top: number; moved: boolean } | null>(null)
  const [floating, setFloating] = useState(false)
  const [floatingPosition, setFloatingPosition] = useState({ left: 0, top: 94 })
  const [dockTarget, setDockTarget] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
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

  useEffect(() => {
    const syncTourTarget = (event: Event) => {
      const targetId = (event as CustomEvent<string>).detail
      const requestedTool = targetId?.startsWith('tool:') ? targetId.slice(5) as ToolId : null
      const group = requestedTool ? foldGroupOf.get(requestedTool) : undefined
      if (!group) {
        setFlyout(null)
        return
      }
      const slot = toolboxRef.current?.querySelector<HTMLButtonElement>(`[data-tour-slot="${group[0]}"]`)
      if (!slot) return
      slot.scrollIntoView({ block: 'nearest' })
      setFlyout({ group, rect: slot.getBoundingClientRect() })
    }
    window.addEventListener('imudist:tool-tour-target', syncTourTarget)
    return () => window.removeEventListener('imudist:tool-tour-target', syncTourTarget)
  }, [])

  return (
    <div
      ref={toolboxRef}
      className={'toolbox' + (floating ? ' toolbox-floating' : '')}
      style={floating ? { left: floatingPosition.left, top: floatingPosition.top } : undefined}
      role="toolbar"
      aria-orientation="vertical"
      aria-label={t('כלים')}
    >
      <button
        className="toolbox-grab"
        aria-label={t('גרור את סרגל הכלים')}
        title={floating ? t('גרור לסרגל השמאלי כדי להצמיד') : t('גרור כדי לנתק ולהזיז')}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          const bounds = toolboxRef.current?.getBoundingClientRect()
          if (!bounds) return
          dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: bounds.left, top: bounds.top, moved: floating }
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current
          if (!drag || drag.pointerId !== event.pointerId || event.buttons === 0) return
          const dx = event.clientX - drag.startX
          const dy = event.clientY - drag.startY
          if (!drag.moved && Math.hypot(dx, dy) < 4) return
          drag.moved = true
          const height = Math.min(window.innerHeight * 0.78, 650)
          setFloating(true)
          setFloatingPosition({
            left: Math.max(0, Math.min(window.innerWidth - 42, drag.left + dx)),
            top: Math.max(32, Math.min(window.innerHeight - height - 8, drag.top + dy)),
          })
          const dock = toolboxRef.current?.parentElement?.getBoundingClientRect()
          const canDock = !!dock && event.clientX <= dock.left + 66 && event.clientY >= dock.top && event.clientY <= dock.bottom
          setDockTarget((current) => {
            const next = canDock && dock ? { left: dock.left, top: dock.top, width: 42, height: dock.height } : null
            return current?.left === next?.left && current?.top === next?.top && current?.height === next?.height ? current : next
          })
          event.preventDefault()
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current
          if (!drag || drag.pointerId !== event.pointerId) return
          const dock = toolboxRef.current?.parentElement?.getBoundingClientRect()
          dragRef.current = null
          setDockTarget(null)
          if (!drag.moved) return
          if (dock && event.clientX <= dock.left + 66 && event.clientY >= dock.top && event.clientY <= dock.bottom) {
            setFloating(false)
            setFloatingPosition({ left: 0, top: 94 })
          }
        }}
        onPointerCancel={() => { dragRef.current = null; setDockTarget(null) }}
      >
        <svg viewBox="0 0 24 12" aria-hidden="true"><circle cx="6" cy="3" r="1" /><circle cx="12" cy="3" r="1" /><circle cx="18" cy="3" r="1" /><circle cx="6" cy="9" r="1" /><circle cx="12" cy="9" r="1" /><circle cx="18" cy="9" r="1" /></svg>
      </button>
      <div className="toolbox-scroll">
      {TOOLBOX_TOOLS.map((def, i) => {
        const group = foldGroupOf.get(def.id)
        if (group) {
          if (renderedGroups.has(group[0])) return null
          renderedGroups.add(group[0])
        }
        const active = toolDef(group ? (current[group[0]] ?? group[0]) : def.id)
        const hasFlyout = !!group && group.length > 1
        const isActive = active.id === 'colorSampler'
          ? colorSamplerActive
          : !colorSamplerActive && tool === active.id
        const toolKeys = (def: ToolDef) => macKeys(toolShortcuts(def, shortcuts)[0] ?? '')
        const tooltipLabel = active.id === 'marqueeRect' ? t('מסגרת חיתוך / Crop Frame') : active.label
        const tooltipDescription = active.id === 'marqueeRect'
          ? t('{hint}, לחיצה כפולה להצגת צורות נוספות', { hint: TOOL_HINTS[active.id] ?? active.label })
          : `${TOOL_HINTS[active.id] ?? active.label}${hasFlyout ? t(' · לחיצה כפולה להצגת כלים נוספים') : ''}`
        return (
          <Fragment key={def.id}>
            {i > 0 && TOOLBOX_TOOLS[i - 1].group !== def.group && <div className="tool-sep" />}
            <div className="tool-slot">
              <button
                className={'tool' + (isActive ? ' active' : '') + (active.enabled ? '' : ' off')}
                data-tour-id={`tool:${active.id}`}
                data-tour-slot={group?.[0] ?? active.id}
                aria-disabled={!active.enabled}
                aria-pressed={isActive}
                aria-label={active.enabled ? `${active.label}${toolKeys(active) ? ` (${toolKeys(active)})` : ''}` : t('{label} — עדיין לא זמין', { label: active.label })}
                onMouseEnter={(event) => setHoveredTool({ label: tooltipLabel, description: tooltipDescription, key: toolKeys(active), rect: event.currentTarget.getBoundingClientRect() })}
                onMouseLeave={() => setHoveredTool(null)}
                onFocus={(event) => setHoveredTool({ label: tooltipLabel, description: tooltipDescription, key: toolKeys(active), rect: event.currentTarget.getBoundingClientRect() })}
                onBlur={() => setHoveredTool(null)}
                onClick={() => {
                  if (!active.enabled) return
                  if (active.id === 'colorSampler') onToggleColorSampler()
                  else onSelect(active.id)
                }}
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
      <div className="screen-modes" role="group" aria-label={t('מצב מסך')}>
        <button
          className={'tool' + (!previewMode ? ' active' : '')}
          data-tour-id="view:normal"
          title={t('מצב רגיל (W)')}
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
          data-tour-id="view:preview"
          title={t('מצב תצוגה מקדימה (W)')}
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
          }}
          onSettings={onSettings}
          onClose={() => setFlyout(null)}
        />
      )}
      {floating && dockTarget && (
        <div className="toolbox-dock-target" style={{ left: dockTarget.left, top: dockTarget.top, width: dockTarget.width, height: dockTarget.height }} aria-hidden="true">
          <span>{t('שחרר כדי להצמיד')}</span>
        </div>
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
  onSettings?: (id: ToolId) => void
  onClose: () => void
}

/** The list of alternative tools for one toolbox slot, opened by its corner mark. Closes on a click elsewhere, Escape, scrolling or resizing. */
function ToolFlyout({ group, anchor, current, onPick, onSettings, onClose }: FlyoutProps) {
  const shortcuts = useShortcutState()
  const ref = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
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
      if (closeTimer.current !== null) clearTimeout(closeTimer.current)
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
            data-tour-id={`tool:${id}`}
            role="menuitemradio"
            aria-checked={id === current}
            className={'menu-item tool-flyout-item' + (id === current ? ' on' : '')}
            onClick={() => {
              if (!t.enabled) return
              onPick(id)
              if (closeTimer.current !== null) clearTimeout(closeTimer.current)
              closeTimer.current = setTimeout(() => {
                closeTimer.current = null
                onClose()
              }, 500)
            }}
            onDoubleClick={() => {
              if (!t.enabled) return
              if (closeTimer.current !== null) clearTimeout(closeTimer.current)
              closeTimer.current = null
              onPick(id)
              if (SETTINGS_TOOLS.includes(id)) onSettings?.(id)
              onClose()
            }}
          >
            <svg className="tool-flyout-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.600" strokeLinecap="round" strokeLinejoin="round">
              {t.icon}
            </svg>
            <span className="menu-text">{t.label}</span>
            {toolShortcuts(t, shortcuts)[0] && (
              <span className="menu-shortcut" dir="ltr">
                {macKeys(toolShortcuts(t, shortcuts)[0])}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
