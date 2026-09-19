import type { RefObject } from 'react'
import type { MenuDef, MenuItem } from './components/MenuBar'
import type { WorkspaceHandle } from './components/Workspace'

export interface MenuContext {
  hasDoc: boolean
  ws: RefObject<WorkspaceHandle | null>
  showRulers: boolean
  showGuides: boolean
  previewMode: boolean
  setPreviewMode: (on: boolean) => void
  newDocument: () => void
  closeDocument: () => void
  toggleRulers: () => void
  toggleGuides: () => void
}

const off = (label: string, shortcut?: string): MenuItem => ({ label, shortcut, disabled: true })
const sep: MenuItem = { separator: true }

export function buildMenus(c: MenuContext): MenuDef[] {
  const doc = (label: string, shortcut: string, run: (ws: WorkspaceHandle) => void): MenuItem => ({
    label,
    shortcut,
    disabled: !c.hasDoc,
    onClick: () => {
      const ws = c.ws.current
      if (ws) run(ws)
    },
  })

  return [
    {
      label: 'קובץ',
      items: [
        {
          label: 'חדש',
          submenu: [
            { label: 'מסמך…', shortcut: 'Ctrl+N', onClick: c.newDocument },
            off('ספר…'),
            off('ספרייה…'),
          ],
        },
        off('פתח…', 'Ctrl+O'),
        { label: 'פתח אחרון', submenu: [], disabled: true },
        sep,
        { label: 'סגור', shortcut: 'Ctrl+W', disabled: !c.hasDoc, onClick: c.closeDocument },
        off('שמור', 'Ctrl+S'),
        off('שמור בשם…', 'Ctrl+Shift+S'),
        off('שמור עותק…', 'Ctrl+Alt+S'),
        off('חזור לגרסה שנשמרה'),
        sep,
        off('מקם…', 'Ctrl+D'),
        off('ייבוא XML…'),
        sep,
        off('ייצוא…', 'Ctrl+E'),
        sep,
        { label: 'הגדרות קבועות של מסמך', submenu: [], disabled: true },
        off('הגדרת מסמך…', 'Ctrl+Alt+P'),
        off('התאמת פריסה…', 'Alt+Shift+P'),
        sep,
        off('מידע על הקובץ…', 'Ctrl+Alt+Shift+I'),
        sep,
        off('אריזה…', 'Ctrl+Alt+Shift+P'),
        { label: 'הגדרות הדפסה קבועות', submenu: [], disabled: true },
        off('הדפס…', 'Ctrl+P'),
        off('הדפס חוברת…'),
      ],
    },
    {
      label: 'עריכה',
      items: [
        off('בטל', 'Ctrl+Z'),
        off('בצע שוב', 'Ctrl+Shift+Z'),
        sep,
        off('גזור', 'Ctrl+X'),
        off('העתק', 'Ctrl+C'),
        off('הדבק', 'Ctrl+V'),
        sep,
        off('בחר הכול', 'Ctrl+A'),
        off('בטל בחירה', 'Ctrl+Shift+A'),
      ],
    },
    {
      label: 'עמודים',
      items: [
        off('שוליים ועמודות…'),
        sep,
        doc('עמוד ראשון', 'Ctrl+Shift+PageUp', (ws) => ws.firstPage()),
        doc('עמוד קודם', 'Shift+PageUp', (ws) => ws.prevPage()),
        doc('עמוד הבא', 'Shift+PageDown', (ws) => ws.nextPage()),
        doc('עמוד אחרון', 'Ctrl+Shift+PageDown', (ws) => ws.lastPage()),
      ],
    },
    { label: 'טיפוגרפיה', items: [off('גופן'), off('גודל'), sep, off('יצירת קווי מתאר', 'Ctrl+Shift+O')] },
    { label: 'אובייקט', items: [off('שינוי צורה'), off('סדר'), sep, off('קבץ', 'Ctrl+G'), off('בטל קיבוץ', 'Ctrl+Shift+G')] },
    { label: 'טבלה', items: [off('הוספת טבלה…', 'Ctrl+Alt+Shift+T')] },
    {
      label: 'תצוגה',
      items: [
        doc('הגדל', 'Ctrl+=', (ws) => ws.zoomIn()),
        doc('הקטן', 'Ctrl+-', (ws) => ws.zoomOut()),
        doc('התאם עמוד לחלון', 'Ctrl+0', (ws) => ws.fitPage()),
        doc('התאם דף כפול לחלון', 'Ctrl+Alt+0', (ws) => ws.fitSpread()),
        doc('גודל מקורי', 'Ctrl+1', (ws) => ws.actualSize()),
        sep,
        { label: 'סרגלים', shortcut: 'Ctrl+R', checked: c.showRulers, onClick: c.toggleRulers },
        { label: 'קווי עזר', shortcut: 'Ctrl+;', checked: c.showGuides, onClick: c.toggleGuides },
        sep,
        {
          label: 'מצב מסך',
          submenu: [
            { label: 'רגיל', checked: !c.previewMode, disabled: !c.hasDoc, onClick: () => c.setPreviewMode(false) },
            // W flips between the two modes, like in InDesign
            { label: 'תצוגה מקדימה', shortcut: 'W', checked: c.previewMode, disabled: !c.hasDoc, onClick: () => c.setPreviewMode(!c.previewMode) },
          ],
        },
      ],
    },
    { label: 'חלון', items: [off('כלים'), off('לוח עמודים', 'F12'), off('מאפיינים')] },
    { label: 'עזרה', items: [off('אודות')] },
  ]
}

// ── keyboard shortcuts, derived from the same menu definitions ───────────────────

const CODE: Record<string, string> = { '=': 'Equal', '-': 'Minus', ';': 'Semicolon' }

/** Layout-independent: letters/digits are matched by physical key so Hebrew layouts work too. */
function matches(e: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.split('+')
  const key = parts.pop()!.toLowerCase()
  const mods = new Set(parts.map((p) => p.toLowerCase()))
  if ((e.ctrlKey || e.metaKey) !== mods.has('ctrl')) return false
  if (e.altKey !== mods.has('alt')) return false
  if (e.shiftKey !== mods.has('shift')) return false
  if (e.key.toLowerCase() === key) return true
  if (key.length === 1) {
    const code = /[a-z]/.test(key) ? 'Key' + key.toUpperCase() : /\d/.test(key) ? 'Digit' + key : CODE[key]
    return e.code === code
  }
  return false
}

export function findShortcut(menus: MenuDef[], e: KeyboardEvent): MenuItem | undefined {
  const walk = (items: MenuItem[]): MenuItem | undefined => {
    for (const it of items) {
      if (it.submenu) {
        const hit = walk(it.submenu)
        if (hit) return hit
      } else if (it.shortcut && it.onClick && !it.disabled && matches(e, it.shortcut)) return it
    }
    return undefined
  }
  for (const m of menus) {
    const hit = walk(m.items)
    if (hit) return hit
  }
  return undefined
}
