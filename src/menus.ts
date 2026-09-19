import type { RefObject } from 'react'
import type { MenuDef, MenuItem } from './components/MenuBar'
import type { WorkspaceHandle } from './components/Workspace'

export interface MenuContext {
  hasDoc: boolean
  ws: RefObject<WorkspaceHandle | null>
  showRulers: boolean
  showGuides: boolean
  newDocument: () => void
  closeDocument: () => void
  toggleRulers: () => void
  toggleGuides: () => void
}

const off = (label: string, shortcut?: string): MenuItem => ({ label, shortcut, disabled: true })
const sep: MenuItem = { separator: true }

export function buildMenus(c: MenuContext): MenuDef[] {
  const w = () => c.ws.current
  const doc = (label: string, shortcut: string, run: (ws: WorkspaceHandle) => void): MenuItem => ({
    label,
    shortcut,
    disabled: !c.hasDoc,
    onClick: () => {
      const ws = w()
      if (ws) run(ws)
    },
  })

  return [
    {
      label: 'File',
      items: [
        {
          label: 'New',
          submenu: [
            { label: 'Document…', shortcut: 'Ctrl+N', onClick: c.newDocument },
            off('Book…'),
            off('Library…'),
          ],
        },
        off('Open…', 'Ctrl+O'),
        { label: 'Open Recent', submenu: [], disabled: true },
        sep,
        { label: 'Close', shortcut: 'Ctrl+W', disabled: !c.hasDoc, onClick: c.closeDocument },
        off('Save', 'Ctrl+S'),
        off('Save As…', 'Ctrl+Shift+S'),
        off('Save a Copy…', 'Ctrl+Alt+S'),
        off('Revert'),
        sep,
        off('Place…', 'Ctrl+D'),
        off('Import XML…'),
        sep,
        off('Export…', 'Ctrl+E'),
        sep,
        { label: 'Document Presets', submenu: [], disabled: true },
        off('Document Setup…', 'Ctrl+Alt+P'),
        off('Adjust Layout…', 'Alt+Shift+P'),
        sep,
        off('File Info…', 'Ctrl+Alt+Shift+I'),
        sep,
        off('Package…', 'Ctrl+Alt+Shift+P'),
        { label: 'Print Presets', submenu: [], disabled: true },
        off('Print…', 'Ctrl+P'),
        off('Print Booklet…'),
      ],
    },
    {
      label: 'Edit',
      items: [
        off('Undo', 'Ctrl+Z'),
        off('Redo', 'Ctrl+Shift+Z'),
        sep,
        off('Cut', 'Ctrl+X'),
        off('Copy', 'Ctrl+C'),
        off('Paste', 'Ctrl+V'),
        sep,
        off('Select All', 'Ctrl+A'),
        off('Deselect All', 'Ctrl+Shift+A'),
      ],
    },
    {
      label: 'Layout',
      items: [
        off('Margins and Columns…'),
        sep,
        doc('First Page', 'Ctrl+Shift+PageUp', (ws) => ws.firstPage()),
        doc('Previous Page', 'Shift+PageUp', (ws) => ws.prevPage()),
        doc('Next Page', 'Shift+PageDown', (ws) => ws.nextPage()),
        doc('Last Page', 'Ctrl+Shift+PageDown', (ws) => ws.lastPage()),
      ],
    },
    { label: 'Type', items: [off('Font'), off('Size'), sep, off('Create Outlines', 'Ctrl+Shift+O')] },
    { label: 'Object', items: [off('Transform'), off('Arrange'), sep, off('Group', 'Ctrl+G'), off('Ungroup', 'Ctrl+Shift+G')] },
    { label: 'Table', items: [off('Insert Table…', 'Ctrl+Alt+Shift+T')] },
    {
      label: 'View',
      items: [
        doc('Zoom In', 'Ctrl+=', (ws) => ws.zoomIn()),
        doc('Zoom Out', 'Ctrl+-', (ws) => ws.zoomOut()),
        doc('Fit Page in Window', 'Ctrl+0', (ws) => ws.fitPage()),
        doc('Fit Spread in Window', 'Ctrl+Alt+0', (ws) => ws.fitSpread()),
        doc('Actual Size', 'Ctrl+1', (ws) => ws.actualSize()),
        sep,
        { label: 'Rulers', shortcut: 'Ctrl+R', checked: c.showRulers, onClick: c.toggleRulers },
        { label: 'Guides', shortcut: 'Ctrl+;', checked: c.showGuides, onClick: c.toggleGuides },
      ],
    },
    { label: 'Window', items: [off('Tools'), off('Pages', 'F12'), off('Properties')] },
    { label: 'Help', items: [off('About')] },
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
