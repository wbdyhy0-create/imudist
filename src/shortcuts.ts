import { useSyncExternalStore } from 'react'
import type { MenuDef, MenuItem } from './components/MenuBar'

/**
 * The keyboard shortcuts, and the user's own. A shortcut is written the same on every machine: `Ctrl` is the main modifier
 * (Command on a Mac), `Alt` is Option, then `Shift`, then the key: "Ctrl+Shift+S". Only the way it is shown depends on the system
 * (see `macKeys`), so a set of shortcuts made on a Windows machine works unchanged on a Mac.
 *
 * What the user changes is kept in named sets, each holding only the commands it changes; the built-in set (the program's own
 * shortcuts) is never written to, so it can always be returned to.
 */

// ── a shortcut as text ──────────────────────────────────────────────────────────

export interface Combo {
  ctrl: boolean
  alt: boolean
  shift: boolean
  /** the key as it is written in a shortcut: "S", "5", "Up", "PageDown", "F11", ";" */
  key: string
}

/** the punctuation keys, by the physical key (`KeyboardEvent.code`), so they work on every keyboard layout */
const SYMBOL_CODES: Record<string, string> = { '=': 'Equal', '-': 'Minus', ';': 'Semicolon', '[': 'BracketLeft', ']': 'BracketRight', '.': 'Period', ',': 'Comma', '/': 'Slash', '\\': 'Backslash', '`': 'Backquote', "'": 'Quote' }
const CODE_SYMBOLS: Record<string, string> = Object.fromEntries(Object.entries(SYMBOL_CODES).map(([symbol, code]) => [code, symbol]))

/** what a shortcut calls the keys that are not a character, by lower-case name (and the name the event gives them) */
const NAMED_KEYS: Record<string, { name: string; event: string }> = {
  up: { name: 'Up', event: 'arrowup' },
  down: { name: 'Down', event: 'arrowdown' },
  left: { name: 'Left', event: 'arrowleft' },
  right: { name: 'Right', event: 'arrowright' },
  pageup: { name: 'PageUp', event: 'pageup' },
  pagedown: { name: 'PageDown', event: 'pagedown' },
  home: { name: 'Home', event: 'home' },
  end: { name: 'End', event: 'end' },
  insert: { name: 'Insert', event: 'insert' },
  delete: { name: 'Delete', event: 'delete' },
  backspace: { name: 'Backspace', event: 'backspace' },
  enter: { name: 'Enter', event: 'enter' },
  tab: { name: 'Tab', event: 'tab' },
  escape: { name: 'Escape', event: 'escape' },
  space: { name: 'Space', event: ' ' },
}
/** other spellings that are read as one of the above */
const KEY_ALIASES: Record<string, string> = { arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right', del: 'delete', esc: 'escape', return: 'enter', ' ': 'space', '>': '.', '<': ',' }
const MODIFIER_ALIASES: Record<string, 'ctrl' | 'alt' | 'shift'> = { ctrl: 'ctrl', control: 'ctrl', cmd: 'ctrl', command: 'ctrl', meta: 'ctrl', alt: 'alt', option: 'alt', opt: 'alt', shift: 'shift' }

const parsed = new Map<string, Combo | null>()

/** The parts of a shortcut written as text ("Ctrl+Shift+S"); null when it is not one (no key, or a modifier written twice is fine). */
export function parseCombo(text: string): Combo | null {
  const cached = parsed.get(text)
  if (cached !== undefined) return cached
  let rest = text.trim()
  let key = ''
  if (rest === '+') {
    key = '+'
    rest = ''
  } else if (rest.endsWith('++')) {
    key = '+'
    rest = rest.slice(0, -2)
  } else {
    const at = rest.lastIndexOf('+')
    key = at < 0 ? rest : rest.slice(at + 1)
    rest = at < 0 ? '' : rest.slice(0, at)
  }
  let result: Combo | null = null
  const mods = { ctrl: false, alt: false, shift: false }
  let valid = key !== ''
  for (const part of rest.split('+')) {
    if (part === '') continue
    const mod = MODIFIER_ALIASES[part.toLowerCase()]
    if (mod) mods[mod] = true
    else valid = false
  }
  if (valid) {
    const lower = key.toLowerCase()
    const known = KEY_ALIASES[lower] ?? lower
    const named = NAMED_KEYS[known]
    if (named) result = { ...mods, key: named.name }
    else if (/^f\d{1,2}$/.test(lower)) result = { ...mods, key: lower.toUpperCase() }
    else if ([...key].length === 1) result = { ...mods, key: known.length === 1 ? known.toUpperCase() : key }
  }
  parsed.set(text, result)
  return result
}

/** the shortcut written in its one canonical form ("ctrl+shift+s" → "Ctrl+Shift+S"); the text itself when it is not a shortcut */
export function canonicalCombo(text: string): string {
  const combo = parseCombo(text)
  return combo ? formatCombo(combo) : text
}

export function formatCombo(combo: Combo): string {
  return [combo.ctrl ? 'Ctrl' : '', combo.alt ? 'Alt' : '', combo.shift ? 'Shift' : '', combo.key].filter(Boolean).join('+')
}

/** the same shortcut, however it was written */
export const sameCombo = (a: string, b: string): boolean => canonicalCombo(a) === canonicalCombo(b)

/**
 * Whether the key event is this shortcut. Letters are matched by the letter the key makes when it makes a Latin one, and by the
 * physical key otherwise (a Hebrew or Arabic layout, a Mac's Option); digits and punctuation by the physical key, so a shortcut
 * works on every layout. A key the shortcut does not name, or a modifier it does not have, does not match.
 */
export function matches(e: KeyboardEvent, shortcut: string): boolean {
  const combo = parseCombo(shortcut)
  if (!combo) return false
  if ((e.ctrlKey || e.metaKey) !== combo.ctrl || e.altKey !== combo.alt || e.shiftKey !== combo.shift) return false
  const key = combo.key
  if (key.length > 1) {
    const named = NAMED_KEYS[key.toLowerCase()]
    if (named) return e.key.toLowerCase() === named.event || (key === 'Space' && e.code === 'Space')
    return e.key.toLowerCase() === key.toLowerCase() // F1..F24
  }
  if (/^[A-Z]$/.test(key)) {
    if (/^[a-z]$/i.test(e.key)) return e.key.toUpperCase() === key
    return e.code === 'Key' + key
  }
  if (/^\d$/.test(key)) return e.code === 'Digit' + key || e.key === key
  return e.key === key || e.code === SYMBOL_CODES[key]
}

/**
 * The shortcut a key press makes, to be recorded; null while only modifiers are held. Stored as the physical key for digits and
 * punctuation, and as the letter for letters, the same way `matches` reads them.
 */
export function comboFromEvent(e: KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'OS', 'Dead', 'Process'].includes(e.key)) return null
  let key = ''
  const lower = e.key.toLowerCase()
  if (NAMED_KEYS[KEY_ALIASES[lower] ?? lower] || e.code === 'Space') key = NAMED_KEYS[KEY_ALIASES[lower] ?? lower]?.name ?? 'Space'
  else if (/^f\d{1,2}$/.test(lower)) key = lower.toUpperCase()
  else if (/^[a-z]$/.test(lower)) key = lower.toUpperCase()
  else if (e.code.startsWith('Key')) key = e.code.slice(3)
  else if (e.code.startsWith('Digit')) key = e.code.slice(5)
  else if (CODE_SYMBOLS[e.code]) key = CODE_SYMBOLS[e.code]
  else if (/^\d$/.test(e.key)) key = e.key
  else if ([...e.key].length === 1) key = e.key
  else return null
  return formatCombo({ ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, shift: e.shiftKey, key })
}

// ── keys that stay what they are ────────────────────────────────────────────────

/** The keys that cannot be given to a command: they have a fixed meaning (the reason is shown to the user). */
const RESERVED: { combos: string[]; reason: string }[] = [
  { combos: ['Ctrl+C', 'Ctrl+X', 'Ctrl+V', 'Ctrl+Insert', 'Shift+Insert', 'Shift+Delete'], reason: 'העתקה, גזירה והדבקה' },
  { combos: ['Ctrl+Y'], reason: 'ביצוע שוב' },
  { combos: ['Escape', 'Enter', 'Tab', 'Shift+Tab', 'Backspace', 'Delete', 'Space'], reason: 'מקשי העריכה הבסיסיים' },
  { combos: ['Up', 'Down', 'Left', 'Right', 'Shift+Up', 'Shift+Down', 'Shift+Left', 'Shift+Right'], reason: 'הזזה בחצים' },
  { combos: ['Ctrl+Up', 'Ctrl+Down'], reason: 'שינוי גודל הגופן בחצים' },
  { combos: ['Alt+F4'], reason: 'סגירת החלון' },
]

/** why the shortcut cannot be given to a command (Hebrew, to be translated), or null when it can */
export function reservedReason(combo: string): string | null {
  const key = canonicalCombo(combo)
  return RESERVED.find((entry) => entry.combos.some((c) => canonicalCombo(c) === key))?.reason ?? null
}

// ── the commands the shortcuts are given to ──────────────────────────────────────

/** What the shortcut system needs to know of a command: its id, and the keys it has in the built-in set. */
export interface KeyedCommand {
  id: string
  defaults: string[]
}

export interface ShortcutCommand extends KeyedCommand {
  /** the name, as the menu or the toolbox writes it (Hebrew, translated when shown) */
  label: string
  /** the menu it is in, or "כלים" for the tools */
  category: string
  /** the submenus it sits in below the menu, outermost first */
  path: string[]
}

type MenuLeaf = MenuItem & { label: string; onClick: () => void }

/** A menu item that a shortcut can run: it has a name and an action, and is not a list entry that comes and goes. */
const isCommand = (item: MenuItem): item is MenuLeaf => !!item.label && !!item.onClick && !item.submenu && !item.separator && !item.noKeys && !(item.shownShortcut && !item.shortcut)

/** a command's id: the one the item names, else the names of the menu and submenus it sits in and its own, so a shortcut survives changes elsewhere in the menus */
export const menuItemId = (item: MenuItem, path: string[]): string => item.id ?? [...path, item.label ?? ''].join('›')

export function menuCommands(menus: MenuDef[]): ShortcutCommand[] {
  const found: ShortcutCommand[] = []
  const walk = (items: MenuItem[], path: string[]) => {
    for (const item of items) {
      if (item.submenu) walk(item.submenu, [...path, item.label ?? ''])
      else if (isCommand(item) && !found.some((command) => command.id === menuItemId(item, path))) {
        // an item that sits in two menus is one command
        found.push({
          id: menuItemId(item, path),
          label: item.label,
          category: path[0],
          path: path.slice(1),
          defaults: [item.shortcut, ...(item.aliases ?? [])].filter((keys): keys is string => !!keys),
        })
      }
    }
  }
  for (const menu of menus) walk(menu.items, [menu.label])
  return found
}

/** The menus with the keys of the active set written on them: what the menu shows and what the key presses run. */
export function applyShortcuts(menus: MenuDef[], keysOf: (id: string, defaults: string[]) => string[]): MenuDef[] {
  const walk = (items: MenuItem[], path: string[]): MenuItem[] =>
    items.map((item) => {
      if (item.submenu) return { ...item, submenu: walk(item.submenu, [...path, item.label ?? '']) }
      if (!isCommand(item)) return item
      const own = [item.shortcut, ...(item.aliases ?? [])].filter((keys): keys is string => !!keys)
      const keys = keysOf(menuItemId(item, path), own)
      if (keys.length === own.length && keys.every((k, i) => k === own[i])) return item
      return { ...item, shortcut: keys[0] ?? '', aliases: keys.slice(1) }
    })
  return menus.map((menu) => ({ ...menu, items: walk(menu.items, [menu.label]) }))
}

// ── sets of shortcuts ───────────────────────────────────────────────────────────

/** the built-in set: the program's own shortcuts, never changed */
export const DEFAULT_SET_ID = 'default'

export interface ShortcutSet {
  id: string
  name: string
  /** only the commands this set changes: the keys they have in it (an empty list is a command with no shortcut) */
  keys: Record<string, string[]>
}

export interface ShortcutState {
  /** DEFAULT_SET_ID or the id of one of the sets */
  activeId: string
  sets: ShortcutSet[]
}

const STORAGE_KEY = 'imudist.shortcuts'

/** The state read from its stored text; anything that does not look right is left out (the built-in set is then in force). */
export function parseShortcutState(text: string | null): ShortcutState {
  const empty: ShortcutState = { activeId: DEFAULT_SET_ID, sets: [] }
  if (!text) return empty
  try {
    const raw = JSON.parse(text) as { activeId?: unknown; sets?: unknown }
    const sets: ShortcutSet[] = []
    for (const entry of Array.isArray(raw.sets) ? (raw.sets as Record<string, unknown>[]) : []) {
      if (!entry || typeof entry.id !== 'string' || typeof entry.name !== 'string' || entry.id === DEFAULT_SET_ID) continue
      const keys: Record<string, string[]> = {}
      const source = entry.keys && typeof entry.keys === 'object' ? (entry.keys as Record<string, unknown>) : {}
      for (const [id, list] of Object.entries(source)) {
        if (!Array.isArray(list)) continue
        const combos = list.filter((k): k is string => typeof k === 'string' && !!parseCombo(k)).map(canonicalCombo)
        keys[id] = [...new Set(combos)]
      }
      sets.push({ id: entry.id, name: entry.name, keys })
    }
    const activeId = typeof raw.activeId === 'string' && sets.some((set) => set.id === raw.activeId) ? raw.activeId : DEFAULT_SET_ID
    return { activeId, sets }
  } catch {
    return empty
  }
}

/** the set in force, or null for the built-in one */
export const activeSet = (state: ShortcutState): ShortcutSet | null => state.sets.find((set) => set.id === state.activeId) ?? null

/** the keys of a command given the keys a set changes */
export const keysIn = (keys: Record<string, string[]>, command: KeyedCommand): string[] => keys[command.id] ?? command.defaults

/** the keys a command has now */
export const keysOf = (state: ShortcutState, id: string, defaults: string[]): string[] => activeSet(state)?.keys[id] ?? defaults

/** The keys of a set with one command's keys changed; the entry is dropped when they are the command's own again. */
export function withCommandKeys(keys: Record<string, string[]>, command: KeyedCommand, list: string[]): Record<string, string[]> {
  const next = { ...keys }
  const unique = [...new Set(list.map(canonicalCombo))]
  const own = command.defaults.map(canonicalCombo)
  if (unique.length === own.length && unique.every((k, i) => k === own[i])) delete next[command.id]
  else next[command.id] = unique
  return next
}

/** the commands (other than `except`) that have this shortcut in the given keys */
export function commandsWithCombo<T extends KeyedCommand>(commands: T[], keys: Record<string, string[]>, combo: string, except?: string): T[] {
  return commands.filter((command) => command.id !== except && keysIn(keys, command).some((k) => sameCombo(k, combo)))
}

/** a name for a new set that no other set has: "name", "name 2", … */
export function freeName(state: ShortcutState, base: string): string {
  const taken = new Set(state.sets.map((set) => set.name))
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base} ${n}`)) n++
  return `${base} ${n}`
}

// ── the store ───────────────────────────────────────────────────────────────────

function load(): ShortcutState {
  try {
    return parseShortcutState(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return { activeId: DEFAULT_SET_ID, sets: [] }
  }
}

let state: ShortcutState = typeof window === 'undefined' ? { activeId: DEFAULT_SET_ID, sets: [] } : load()
const listeners = new Set<() => void>()

export const getShortcutState = (): ShortcutState => state

function commit(next: ShortcutState): void {
  state = next
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // not kept for the next time; it holds for this one
  }
  listeners.forEach((listener) => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** the sets, as a React value: whatever reads the shortcuts is drawn again when they change */
export const useShortcutState = (): ShortcutState => useSyncExternalStore(subscribe, getShortcutState, getShortcutState)

const newId = () => 'set-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

/** use another set (the built-in one with DEFAULT_SET_ID) */
export function selectShortcutSet(id: string): void {
  if (id === state.activeId || (id !== DEFAULT_SET_ID && !state.sets.some((set) => set.id === id))) return
  commit({ ...state, activeId: id })
}

/** A new set that starts as a copy of the active one, and becomes the active one. */
export function createShortcutSet(name: string): string {
  const id = newId()
  const keys = { ...(activeSet(state)?.keys ?? {}) }
  commit({ activeId: id, sets: [...state.sets, { id, name: name.trim() || freeName(state, 'סט'), keys }] })
  return id
}

export function renameShortcutSet(id: string, name: string): void {
  const trimmed = name.trim()
  if (!trimmed) return
  commit({ ...state, sets: state.sets.map((set) => (set.id === id ? { ...set, name: trimmed } : set)) })
}

/** delete a set; when it was the active one the built-in set is */
export function removeShortcutSet(id: string): void {
  commit({ activeId: state.activeId === id ? DEFAULT_SET_ID : state.activeId, sets: state.sets.filter((set) => set.id !== id) })
}

/**
 * Change the keys of the active set. The built-in set is never written to: when it is the active one, the change goes into a new
 * set (named from `newName`), which becomes the active one. Returns the set that was changed.
 */
export function changeActiveKeys(change: (keys: Record<string, string[]>) => Record<string, string[]>, newName: string): ShortcutSet {
  const current = activeSet(state)
  if (current) {
    const changed = { ...current, keys: change(current.keys) }
    commit({ ...state, sets: state.sets.map((set) => (set.id === current.id ? changed : set)) })
    return changed
  }
  const created: ShortcutSet = { id: newId(), name: freeName(state, newName), keys: change({}) }
  commit({ activeId: created.id, sets: [...state.sets, created] })
  return created
}

/** Put the active set back as the program's own: no command is changed in it any more. Returns what it held (to be undone). */
export function resetActiveSet(): Record<string, string[]> {
  const current = activeSet(state)
  if (!current) return {}
  const before = current.keys
  commit({ ...state, sets: state.sets.map((set) => (set.id === current.id ? { ...set, keys: {} } : set)) })
  return before
}

/** Put back what `resetActiveSet` returned. */
export function restoreSetKeys(id: string, keys: Record<string, string[]>): void {
  commit({ ...state, sets: state.sets.map((set) => (set.id === id ? { ...set, keys } : set)) })
}

/** only for tests: start again from the built-in set with nothing stored */
export function resetShortcutStateForTests(next: ShortcutState = { activeId: DEFAULT_SET_ID, sets: [] }): void {
  state = next
  listeners.forEach((listener) => listener())
}
