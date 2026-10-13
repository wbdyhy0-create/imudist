import type { RefObject } from 'react'
import { getLanguage, LANGUAGES, setLanguage } from './i18n'
import type { MenuDef, MenuItem } from './components/MenuBar'
import type { WorkspaceHandle } from './components/Workspace'
import type { RecentEntry } from './recent'
import type { FontStatus } from './fonts'

export interface MenuContext {
  hasDoc: boolean
  /** a parent (master) page is open for editing: the only place where an automatic page number or a running header makes sense */
  editingParent: boolean
  ws: RefObject<WorkspaceHandle | null>
  showRulers: boolean
  showGuides: boolean
  showHiddenChars: boolean
  /** spell checking of the text being typed (the engine's own checker) */
  spellcheck: boolean
  toggleSpellcheck: () => void
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
  dockOpenId: string | null
  onDockOpenChange: (id: string | null) => void
  enabledDockPanelIds: string[]
  onDockPanelToggle: (id: string) => void
  savedWorkspaces: { id: string; name: string }[]
  activeWorkspaceId: string | null
  saveWorkspace: () => void
  selectWorkspace: (id: string) => void
  loadSystemFonts: () => void
  fontStatus: FontStatus
  fontCount: number
  documentSetup: () => void
  /** load a Word / text file into the text cursor */
  /** File > הוספת קובץ > כל הקבצים הנתמכים */
  importText: () => void
  /** Help > רישיונות: shows the notices of the third-party parts in a window (a new browser window does not open in the desktop app) */
  showLicenses: () => void
  /** File > הוספת קובץ > one kind of file; IDML opens as a new document, so it works with no document open */
  importKind: (kind: ImportKind) => void
  /** load another Imudist file's paragraph styles and merge them into this document's */
  importParagraphStyles: () => void
  recent: RecentEntry[]
  /** the document lives in a file and has unsaved changes */
  canRevert: boolean
  openFile: () => void
  openRecent: (entry: RecentEntry) => void
  save: () => void
  saveAs: () => void
  saveCopy: () => void
  /** autosave is on: documents with a file are written by themselves after a pause */
  autosave: boolean
  toggleAutosave: () => void
  revert: () => void
  newDocument: () => void
  closeDocument: () => void
  toggleRulers: () => void
  toggleGuides: () => void
  toggleHiddenChars: () => void
  /** the open documents, for the Window menu */
  openDocs: { id: number; name: string; active: boolean }[]
  switchDoc: (id: number) => void
  exportPdf: () => void
  /** the page as the four inks of a press, each shown or hidden (View > Separation Preview) */
  separationPreview: () => void
  exportPng: () => void
  /** the selected objects, or the page, as an SVG file */
  exportSvg: () => void
  /** the text of the selected frames, or of the whole document, as a TXT / HTML / RTF file */
  exportText: (format: 'txt' | 'html' | 'rtf', encoding?: 'utf-8' | 'utf-16' | 'windows-1255') => void
  /** a new book (a set of documents kept together as chapters) */
  newBook: () => void
  openBook: () => void
  bookPanelOpen: boolean
  toggleBookPanel: () => void
}

/** the kinds of file the "הוספת קובץ" submenu offers one by one */
export type ImportKind = 'pdf' | 'word' | 'text' | 'image' | 'eps' | 'xml' | 'idml' | 'psd'

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
  /** an item that works only while a parent page is being edited (page numbers and running headers are written on parent pages) */
  const inParent = (label: string, run: (ws: WorkspaceHandle) => void): MenuItem => ({ ...doc(label, '', run), disabled: !c.hasDoc || !c.editingParent })
  const tool = (label: string, id: Parameters<WorkspaceHandle['selectTool']>[0], shortcut = '') => doc(label, shortcut, (ws) => ws.selectTool(id))
  const dock = (id: string, label: string, shortcut = ''): MenuItem => ({
    label,
    shortcut,
    checked: c.enabledDockPanelIds.includes(id),
    onClick: () => {
      const enabled = c.enabledDockPanelIds.includes(id)
      c.onDockPanelToggle(id)
      c.onDockOpenChange(enabled ? (c.dockOpenId === id ? null : c.dockOpenId) : id)
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
            { label: 'ספר…', onClick: c.newBook },
            off('ספרייה…'),
          ],
        },
        { label: 'פתח…', shortcut: 'Ctrl+O', onClick: c.openFile },
        { label: 'פתח ספר…', onClick: c.openBook },
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
        { label: 'שמירה אוטומטית', checked: c.autosave, onClick: c.toggleAutosave },
        sep,
        {
          label: 'הוספת קובץ',
          submenu: [
            { label: 'כל הקבצים הנתמכים…', shortcut: 'Ctrl+Shift+I', disabled: !c.hasDoc, onClick: c.importText },
            sep,
            { label: 'PDF…', disabled: !c.hasDoc, onClick: () => c.importKind('pdf') },
            { label: 'Word (DOCX)…', disabled: !c.hasDoc, onClick: () => c.importKind('word') },
            { label: 'טקסט (TXT, MD, CSV)…', disabled: !c.hasDoc, onClick: () => c.importKind('text') },
            { label: 'תמונה…', disabled: !c.hasDoc, onClick: () => c.importKind('image') },
            { label: 'Photoshop (PSD)…', disabled: !c.hasDoc, onClick: () => c.importKind('psd') },
            { label: 'EPS / PS (ציור וקטורי)…', disabled: !c.hasDoc, onClick: () => c.importKind('eps') },
            { label: 'XML…', disabled: !c.hasDoc, onClick: () => c.importKind('xml') },
            sep,
            { label: 'IDML (נפתח כמסמך חדש)…', onClick: () => c.importKind('idml') },
          ],
        },
        sep,
        { label: 'ייצוא ל-PDF…', shortcut: 'Ctrl+E', disabled: !c.hasDoc, onClick: c.exportPdf },
        {
          label: 'ייצוא תמונה',
          disabled: !c.hasDoc,
          submenu: [
            { label: 'PNG…', onClick: c.exportPng },
            { label: 'SVG…', onClick: c.exportSvg },
          ],
        },
        sep,
        {
          label: 'ייצוא תוכן וטקסט',
          disabled: !c.hasDoc,
          submenu: [
            { label: 'RTF (Word)…', onClick: () => c.exportText('rtf') },
            { label: 'HTML…', onClick: () => c.exportText('html') },
            {
              label: 'TXT',
              submenu: [
                { label: 'UTF-8…', onClick: () => c.exportText('txt', 'utf-8') },
                { label: 'UTF-16…', onClick: () => c.exportText('txt', 'utf-16') },
                { label: 'עברית 8 סיביות (Windows-1255)…', onClick: () => c.exportText('txt', 'windows-1255') },
              ],
            },
          ],
        },        sep,
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
        doc('שכפל במרווח האחרון', 'Ctrl+D', (ws) => ws.repeatDuplicate()),
        { label: 'שכפל וגרור', shownShortcut: 'Alt + גרירה', disabled: true },
        sep,
        { label: 'בחר הכול', shortcut: 'Ctrl+A', disabled: !c.hasDoc, onClick: () => c.ws.current?.selectAllText() },
        sep,
        doc('חיפוש והחלפה…', 'Ctrl+H', (ws) => ws.findReplace()),
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
        {
          label: 'כלי טקסט',
          submenu: [tool('טקסט', 'type', 'T'), tool('טקסט על קו', 'pathtype', 'Shift+T'), tool('דוגם סגנון', 'eyedropper', 'I')],
        },
        sep,
        doc('ניקוי רווחים כפולים', '', (ws) => ws.cleanSpacing()),
        doc('מעבר שורה עם מקף (אנגלית)', '', (ws) => ws.hyphenate()),
        doc('הסרת מקפי מעבר שורה', '', (ws) => ws.hyphenate(true)),
        doc('עיצוב מילה ראשונה…', '', (ws) => ws.firstWordStyler()),
        doc('יצירת חלון בטקסט…', '', (ws) => ws.windowText()),
        inParent('הוספת כותרת משתנה…', (ws) => ws.insertRunningHeader()),
        doc('הוספת הערת שוליים', 'Ctrl+Alt+Shift+F', (ws) => ws.insertFootnote()),
        doc('אפשרויות הערות שוליים…', '', (ws) => ws.openFootnoteOptions()),
        doc('ממיר הערות שבטקסט להערות שוליים ולהפך…', '', (ws) => ws.openFootnoteConverter()),
        doc('ממיר הערות שוליים להערות סיום ולהפך…', '', (ws) => ws.openFootnoteEndnoteConverter()),
        sep,
        {
          label: 'הוספת מספר עמוד אוטומטי',
          submenu: [
            inParent('מספר מסמך', (ws) => ws.insertPageNumberMarker('document')),
            inParent('מספר פנימי: 1, 2, 3', (ws) => ws.insertPageNumberMarker('internal-number')),
            inParent('מספר חיצוני: 1, 2, 3', (ws) => ws.insertPageNumberMarker('external-number')),
            inParent('אות פנימית: א, ב, ג', (ws) => ws.insertPageNumberMarker('internal-letter')),
            inParent('אות חיצונית: א, ב, ג', (ws) => ws.insertPageNumberMarker('external-letter')),
          ],
        },
        doc('תוכן עניינים…', '', (ws) => ws.insertTableOfContents()),
        doc('רצף סגנונות פסקה…', '', (ws) => ws.openParagraphSequences()),
        sep,
        doc('יתומים, אלמנות וכיווץ…', '', (ws) => ws.openSmartLayout()),
        { label: 'ייבוא סגנונות פסקה ותו…', disabled: !c.hasDoc, onClick: c.importParagraphStyles },
      ],
    },
    {
      label: 'אובייקט',
      items: [
        doc('ספריית עיצובים…', '', (ws) => ws.openDesignLibrary()),
        sep,
        {
          label: 'כלי אובייקט',
          submenu: [
            tool('בחירה', 'select', 'V'),
            tool('עריכת נקודות', 'direct', 'A'),
            tool('מלבן', 'rect', 'M'),
            tool('אליפסה', 'ellipse', 'L'),
            tool('מצולע', 'polygon', 'Y'),
            tool('מסגרת גרפית', 'framerect', 'F'),
            tool('קו', 'line'),
            tool('כלי הצבע', 'color', 'K'),
          ],
        },
        sep,
        doc('הסר רקע מהתמונה הנבחרת', '', (ws) => ws.removeBackgroundFromSelection()),
        doc('המר תמונה לווקטור…', '', (ws) => ws.traceImageFromSelection()),
        doc('המר טקסט לווקטור', 'Ctrl+Shift+O', (ws) => ws.createOutlinesFromSelection()),
        sep,
        doc('עומק תלת־ממדי…', '', (ws) => ws.extrudeSelection()),
        {
          label: 'גוף תלת־ממדי חדש',
          submenu: [
            doc('קוביה', '', (ws) => ws.addSolid('cube')),
            doc('תיבה', '', (ws) => ws.addSolid('box')),
            doc('גליל', '', (ws) => ws.addSolid('cylinder')),
            doc('מסגרת', '', (ws) => ws.addSolid('frame')),
            sep,
            doc('קוביה איזומטרית', '', (ws) => ws.addSolid('isoCube')),
            doc('תיבה איזומטרית שוכבת', '', (ws) => ws.addSolid('isoBox')),
            doc('תיבה איזומטרית זקופה', '', (ws) => ws.addSolid('isoBoxStanding')),
            doc('מסגרת איזומטרית שוכבת', '', (ws) => ws.addSolid('isoFrame')),
            doc('מסגרת איזומטרית זקופה', '', (ws) => ws.addSolid('isoFrameStanding')),
          ],
        },
        sep,
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
        doc('שחרר נתיב מורכב', '', (ws) => ws.releaseCompoundPaths()),
        sep,
        doc('קבץ', 'Ctrl+G', (ws) => ws.group()),
        doc('בטל קיבוץ', 'Ctrl+Shift+G', (ws) => ws.ungroup()),
      ],
    },
    {
      label: 'טבלה',
      items: [
        doc('הוספת טבלה…', 'Ctrl+Alt+Shift+T', (ws) => ws.insertTable()),
        sep,
        {
          label: 'בחירה',
          submenu: [
            doc('בחר שורה', '', (ws) => ws.tableCommand('select-row')),
            doc('בחר עמודה', '', (ws) => ws.tableCommand('select-column')),
            doc('בחר טבלה', '', (ws) => ws.tableCommand('select-table')),
          ],
        },
        sep,
        doc('אפשרויות טבלה…', '', (ws) => ws.tableCommand('options')),
        doc('אפשרויות תא…', '', (ws) => ws.tableCommand('cell-options')),
        sep,
        doc('הוספת שורה מעל', '', (ws) => ws.tableCommand('row-above')),
        doc('הוספת שורה מתחת', '', (ws) => ws.tableCommand('row-below')),
        doc('הוספת עמודה מימין', '', (ws) => ws.tableCommand('col-start')),
        doc('הוספת עמודה משמאל', '', (ws) => ws.tableCommand('col-end')),
        sep,
        doc('מחיקת שורה', '', (ws) => ws.tableCommand('delete-row')),
        doc('מחיקת עמודה', '', (ws) => ws.tableCommand('delete-col')),
        sep,
        doc('מיזוג תאים', '', (ws) => ws.tableCommand('merge')),
        doc('ביטול מיזוג תאים', '', (ws) => ws.tableCommand('unmerge')),
        sep,
        doc('מיון…', '', (ws) => ws.tableCommand('sort')),
        doc('נוסחה בתא…', '', (ws) => ws.tableCommand('formula')),
        doc('הסרת הנוסחה מהתא', '', (ws) => ws.tableCommand('remove-formula')),
      ],
    },
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
        { label: 'בדיקת איות בזמן הקלדה', checked: c.spellcheck, onClick: c.toggleSpellcheck },
        sep,
        { label: 'תצוגת הפרדת צבעים…', disabled: !c.hasDoc, onClick: c.separationPreview },
        sep,
        {
          label: 'שפת הממשק',
          // each language is written in its own letters, whatever the language of the interface
          submenu: LANGUAGES.map((language) => ({ label: language.name, checked: getLanguage() === language.id, onClick: () => setLanguage(language.id) })),
        },
        sep,
        {
          label: 'מצב מסך',
          submenu: [
            { label: 'רגיל', checked: !c.previewMode, disabled: !c.hasDoc, onClick: () => c.setPreviewMode(false) },
            // W flips between the two modes, like in professional layout tools
            { label: 'תצוגה מקדימה', shortcut: 'W', checked: c.previewMode, disabled: !c.hasDoc, onClick: () => c.setPreviewMode(!c.previewMode) },
          ],
        },
      ],
    },
    {
      label: 'חלון',
      items: [
        { label: 'שמירת סביבת עבודה…', onClick: c.saveWorkspace },
        {
          label: 'סביבות עבודה',
          submenu: c.savedWorkspaces.length
            ? c.savedWorkspaces.map((workspace) => ({
                label: workspace.name,
                checked: workspace.id === c.activeWorkspaceId,
                onClick: () => c.selectWorkspace(workspace.id),
              }))
            : [{ label: 'אין סביבות שמורות', disabled: true }],
        },
        { label: 'טען גופנים מהמחשב', disabled: c.fontStatus === 'loading' || c.fontStatus === 'unavailable', onClick: c.loadSystemFonts },
        ...(c.fontStatus === 'loading'
          ? [{ label: 'טוען גופנים מהמחשב…', disabled: true }]
          : c.fontStatus === 'system'
            ? [{ label: `${c.fontCount} משפחות גופנים מהמחשב`, disabled: true }]
            : c.fontStatus === 'denied'
              ? [{ label: 'לא ניתנה הרשאה לגופנים. מוצגת רשימה בסיסית.', disabled: true }]
              : c.fontStatus === 'unavailable'
                ? [{ label: 'הדפדפן אינו מאפשר לקרוא גופנים מותקנים (נדרש Chrome או Edge).', disabled: true }]
                : []),
        { separator: true },
        {
          label: 'כלים',
          submenu: [
            tool('יד', 'hand', 'H'),
            tool('זום', 'zoom', 'Z'),
            tool('מעבר צבע', 'gradient', 'G'),
            tool('דוגמיות צבע', 'swatches'),
            { label: 'סרגלים', checked: c.showRulers, onClick: c.toggleRulers },
          ],
        },
        dock('pages', 'לוח עמודים', 'F12'),
        dock('properties', 'מאפיינים'),
        dock('paragraph', 'פסקה', 'Ctrl+Alt+L'),
        { separator: true },
        dock('paragraph-styles', 'סגנונות פסקה'),
        dock('character-styles', 'סגנונות תו'),
        dock('object-styles', 'סגנונות אובייקט'),
        dock('style-manager', 'ניהול סגנונות'),
        dock('color', 'צבע'),
        dock('gradient', 'מעבר צבע'),
        dock('swatches', 'דוגמיות'),
        dock('brushes', 'מברשות'),
        dock('layers', 'שכבות'),
        dock('links', 'קישורים'),
        { label: 'ספר', checked: c.bookPanelOpen, onClick: c.toggleBookPanel },
        ...(c.openDocs.length > 0
          ? [sep, ...c.openDocs.map((d): MenuItem => ({ label: d.name, checked: d.active, onClick: () => c.switchDoc(d.id) }))]
          : []),
      ],
    },
    {
      label: 'עזרה',
      items: [
        {
          label: 'רישיונות',
          onClick: c.showLicenses,
        },
        { separator: true },
        off('אודות'),
      ],
    },
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
