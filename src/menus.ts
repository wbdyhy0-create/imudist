import type { RefObject } from 'react'
import type { MenuDef, MenuItem } from './components/MenuBar'
import type { WorkspaceHandle } from './components/Workspace'
import type { RecentEntry } from './recent'

export interface MenuContext {
  hasDoc: boolean
  ws: RefObject<WorkspaceHandle | null>
  showRulers: boolean
  showGuides: boolean
  showHiddenChars: boolean
  previewMode: boolean
  setPreviewMode: (on: boolean) => void
  showProps: boolean
  toggleProps: () => void
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
  showPages: boolean
  togglePages: () => void
  showParagraph: boolean
  toggleParagraph: () => void
  documentSetup: () => void
  /** load a Word / text file into the text cursor */
  importText: () => void
  recent: RecentEntry[]
  /** the document lives in a file and has unsaved changes */
  canRevert: boolean
  openFile: () => void
  openRecent: (entry: RecentEntry) => void
  save: () => void
  saveAs: () => void
  saveCopy: () => void
  revert: () => void
  newDocument: () => void
  closeDocument: () => void
  toggleRulers: () => void
  toggleGuides: () => void
  toggleHiddenChars: () => void
  /** the open documents, for the Window menu */
  openDocs: { id: number; name: string; active: boolean }[]
  switchDoc: (id: number) => void
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
        { label: 'פתח…', shortcut: 'Ctrl+O', onClick: c.openFile },
        {
          label: 'פתח אחרון',
          submenu: c.recent.length
            ? c.recent.map((r) => ({ label: r.name, onClick: () => c.openRecent(r) }))
            : [{ label: 'אין קבצים אחרונים', disabled: true }],
        },
        sep,
        { label: 'סגור', shortcut: 'Ctrl+W', disabled: !c.hasDoc, onClick: c.closeDocument },
        { label: 'שמור', shortcut: 'Ctrl+S', disabled: !c.hasDoc, onClick: c.save },
        { label: 'שמור בשם…', shortcut: 'Ctrl+Shift+S', disabled: !c.hasDoc, onClick: c.saveAs },
        { label: 'שמור עותק…', shortcut: 'Ctrl+Alt+S', disabled: !c.hasDoc, onClick: c.saveCopy },
        { label: 'חזור לגרסה שנשמרה', disabled: !c.canRevert, onClick: c.revert },
        sep,
        { label: 'הוספת קובץ…', shortcut: 'Ctrl+Shift+I', disabled: !c.hasDoc, onClick: c.importText },
        off('ייבוא XML…'),
        sep,
        off('ייצוא…', 'Ctrl+E'),
        sep,
        { label: 'הגדרות קבועות של מסמך', submenu: [], disabled: true },
        { label: 'הגדרות מסמך…', shortcut: 'Ctrl+Alt+P', disabled: !c.hasDoc, onClick: c.documentSetup },
        off('התאמת פריסה…', 'Alt+Shift+P'),
        sep,
        off('מידע על הקובץ…', 'Ctrl+Alt+Shift+I'),
        sep,
        off('איסוף קבצים…'),
        { label: 'הגדרות הדפסה קבועות', submenu: [], disabled: true },
        off('הדפס…', 'Ctrl+P'),
        off('הדפס חוברת…'),
      ],
    },
    {
      label: 'עריכה',
      items: [
        { label: 'בטל', shortcut: 'Ctrl+Z', disabled: !c.canUndo, onClick: c.undo },
        { label: 'בצע שוב', shortcut: 'Ctrl+Shift+Z', disabled: !c.canRedo, onClick: c.redo },
        sep,
        { label: 'גזור', shownShortcut: 'Ctrl+X', disabled: !c.hasDoc, onClick: () => c.ws.current?.cut() },
        { label: 'העתק', shownShortcut: 'Ctrl+C', disabled: !c.hasDoc, onClick: () => c.ws.current?.copy() },
        { label: 'הדבק', shownShortcut: 'Ctrl+V', disabled: !c.hasDoc, onClick: () => c.ws.current?.paste() },
        doc('שכפל במקום', 'Ctrl+F', (ws) => ws.duplicateInPlace()),
        { label: 'שכפל וגרור', shownShortcut: 'Alt + גרירה', disabled: true },
        sep,
        { label: 'בחר הכול', shortcut: 'Ctrl+A', disabled: !c.hasDoc, onClick: () => c.ws.current?.selectAllText() },
        off('בטל בחירה', 'Ctrl+Shift+A'),
      ],
    },
    {
      label: 'עמודים',
      items: [
        { label: 'הוסף עמוד', disabled: !c.hasDoc, onClick: () => c.ws.current?.addPage() },
        { label: 'מחק עמוד', disabled: !c.hasDoc, onClick: () => c.ws.current?.deletePage() },
        { label: 'שוליים ועמודות…', disabled: !c.hasDoc, onClick: c.documentSetup },
        sep,
        doc('יצירת קווי עזר…', 'Ctrl+Alt+G', (ws) => ws.createGuides()),
        doc('מחק את קווי העזר בעמוד', '', (ws) => ws.clearGuides()),
        sep,
        doc('עמוד ראשון', 'Ctrl+Shift+PageUp', (ws) => ws.firstPage()),
        doc('עמוד קודם', 'Shift+PageUp', (ws) => ws.prevPage()),
        doc('עמוד הבא', 'Shift+PageDown', (ws) => ws.nextPage()),
        doc('עמוד אחרון', 'Ctrl+Shift+PageDown', (ws) => ws.lastPage()),
      ],
    },
    {
      label: 'טיפוגרפיה',
      items: [
        off('גופן'),
        off('גודל'),
        sep,
        off('יצירת קווי מתאר', 'Ctrl+Shift+O'),
        sep,
        doc('ניקוי רווחים כפולים', '', (ws) => ws.cleanSpacing()),
      ],
    },
    {
      label: 'אובייקט',
      items: [
        off('שינוי צורה'),
        {
          label: 'סדר',
          submenu: [
            doc('הבא לחזית', 'Ctrl+Shift+]', (ws) => ws.arrange('front')),
            doc('קדימה', 'Ctrl+]', (ws) => ws.arrange('forward')),
            doc('אחורה', 'Ctrl+[', (ws) => ws.arrange('backward')),
            doc('שלח לרקע', 'Ctrl+Shift+[', (ws) => ws.arrange('back')),
          ],
        },
        {
          label: 'בניית צורות',
          submenu: [
            doc('איחוד', 'Ctrl+Alt+U', (ws) => ws.shapeOp('unite')),
            doc('חיסור', 'Ctrl+Alt+M', (ws) => ws.shapeOp('subtract')),
            doc('חיתוך', 'Ctrl+Alt+I', (ws) => ws.shapeOp('intersect')),
            doc('החרגה', 'Ctrl+Alt+E', (ws) => ws.shapeOp('exclude')),
          ],
        },
        sep,
        off('קבץ', 'Ctrl+G'),
        off('בטל קיבוץ', 'Ctrl+Shift+G'),
      ],
    },
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
        { label: 'תווים נסתרים', shortcut: 'Ctrl+Shift+8', checked: c.showHiddenChars, onClick: c.toggleHiddenChars },
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
    {
      label: 'חלון',
      items: [
        off('כלים'),
        { label: 'לוח עמודים', shortcut: 'F12', checked: c.showPages, onClick: c.togglePages },
        { label: 'מאפיינים', checked: c.showProps, onClick: c.toggleProps },
        { label: 'פסקה', shortcut: 'Ctrl+Alt+L', checked: c.showParagraph, onClick: c.toggleParagraph },
        ...(c.openDocs.length > 0
          ? [sep, ...c.openDocs.map((d): MenuItem => ({ label: d.name, checked: d.active, onClick: () => c.switchDoc(d.id) }))]
          : []),
      ],
    },
    { label: 'עזרה', items: [off('אודות')] },
  ]
}

// ── keyboard shortcuts, derived from the same menu definitions ───────────────────

const CODE: Record<string, string> = { '=': 'Equal', '-': 'Minus', ';': 'Semicolon', '[': 'BracketLeft', ']': 'BracketRight' }

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
