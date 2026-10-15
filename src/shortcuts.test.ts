import { beforeEach, describe, expect, it } from 'vitest'
import { TOOLS, toolDefaults } from './components/Toolbox'
import { buildMenus, findShortcut, type MenuContext } from './menus'
import { allShortcutCommands, defaultKeysFor } from './shortcutCommands'
import {
  DEFAULT_SET_ID,
  activeSet,
  applyShortcuts,
  canonicalCombo,
  changeActiveKeys,
  commandsWithCombo,
  comboFromEvent,
  createShortcutSet,
  getShortcutState,
  keysIn,
  keysOf,
  matches,
  menuCommands,
  parseCombo,
  parseShortcutState,
  removeShortcutSet,
  renameShortcutSet,
  reservedReason,
  resetActiveSet,
  resetShortcutStateForTests,
  restoreSetKeys,
  sameCombo,
  selectShortcutSet,
  withCommandKeys,
} from './shortcuts'
import { macKeys } from './platform'

const context = (): MenuContext => {
  const base: Record<string, unknown> = {
    hasDoc: true,
    editingParent: false,
    recent: [],
    savedWorkspaces: [],
    openDocs: [],
    enabledDockPanelIds: [],
    fontStatus: 'idle',
    fontCount: 0,
    ws: { current: new Proxy({}, { get: () => () => {} }) },
  }
  return new Proxy(base, { get: (target, name) => (name in target ? target[name as string] : () => {}) }) as unknown as MenuContext
}

const press = (init: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean; code: string; key: string }) =>
  ({ ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...init }) as KeyboardEvent

describe('a shortcut as text', () => {
  it('is read and written in one form, whatever the spelling', () => {
    expect(canonicalCombo('ctrl+shift+s')).toBe('Ctrl+Shift+S')
    expect(canonicalCombo('Shift+Ctrl+S')).toBe('Ctrl+Shift+S')
    expect(canonicalCombo('Cmd+Option+K')).toBe('Ctrl+Alt+K')
    expect(canonicalCombo('Ctrl+Shift+>')).toBe('Ctrl+Shift+.')
    expect(canonicalCombo('Alt+ArrowDown')).toBe('Alt+Down')
    expect(canonicalCombo('f11')).toBe('F11')
    expect(sameCombo('Ctrl+Shift+<', 'ctrl+shift+,')).toBe(true)
    expect(parseCombo('Ctrl+')).toBeNull()
    expect(parseCombo('Ctrl+Foo')).toBeNull()
  })

  it('is shown with the Mac keys on a Mac, and written the same everywhere', () => {
    expect(macKeys('Ctrl+Alt+Shift+K', true)).toBe('⌘⌥⇧K')
    expect(macKeys('Ctrl+Alt+Shift+K', false)).toBe('Ctrl+Alt+Shift+K')
  })
})

describe('matching a key press', () => {
  it('reads letters by the letter, and by the physical key on a layout that has no Latin letter', () => {
    expect(matches(press({ ctrlKey: true, code: 'KeyS', key: 's' }), 'Ctrl+S')).toBe(true)
    expect(matches(press({ ctrlKey: true, code: 'KeyS', key: 'ד' }), 'Ctrl+S')).toBe(true)
    // a French keyboard: the physical A key makes a Q, which is not the shortcut A
    expect(matches(press({ ctrlKey: true, code: 'KeyA', key: 'q' }), 'Ctrl+A')).toBe(false)
    expect(matches(press({ ctrlKey: true, code: 'KeyQ', key: 'a' }), 'Ctrl+A')).toBe(true)
  })

  it('treats Command as Ctrl, and needs exactly the modifiers the shortcut has', () => {
    expect(matches(press({ metaKey: true, code: 'KeyS', key: 's' }), 'Ctrl+S')).toBe(true)
    expect(matches(press({ ctrlKey: true, shiftKey: true, code: 'KeyS', key: 'S' }), 'Ctrl+S')).toBe(false)
    expect(matches(press({ code: 'KeyV', key: 'v' }), 'V')).toBe(true)
    expect(matches(press({ ctrlKey: true, code: 'KeyV', key: 'v' }), 'V')).toBe(false)
  })

  it('reads punctuation, arrows, function keys and the space bar', () => {
    expect(matches(press({ ctrlKey: true, shiftKey: true, code: 'Period', key: '>' }), 'Ctrl+Shift+>')).toBe(true)
    expect(matches(press({ ctrlKey: true, shiftKey: true, code: 'Period', key: '>' }), 'Ctrl+Shift+.')).toBe(true)
    expect(matches(press({ ctrlKey: true, code: 'Equal', key: '=' }), 'Ctrl+=')).toBe(true)
    expect(matches(press({ altKey: true, code: 'ArrowDown', key: 'ArrowDown' }), 'Alt+Down')).toBe(true)
    expect(matches(press({ code: 'F11', key: 'F11' }), 'F11')).toBe(true)
    expect(matches(press({ code: 'Space', key: ' ' }), 'Space')).toBe(true)
    expect(matches(press({ ctrlKey: true, shiftKey: true, code: 'PageDown', key: 'PageDown' }), 'Ctrl+Shift+PageDown')).toBe(true)
  })

  it('records the key presses it reads', () => {
    for (const text of ['Ctrl+Shift+S', 'Ctrl+Alt+Shift+K', 'Alt+Down', 'F11', 'Shift+F11', 'Ctrl+;', 'Ctrl+=', 'Ctrl+Shift+PageUp', 'V', 'Shift+T', 'Ctrl+0', 'Space']) {
      const combo = parseCombo(text)!
      const key = combo.key
      const code = /^[A-Z]$/.test(key) ? 'Key' + key : /^\d$/.test(key) ? 'Digit' + key : key === ';' ? 'Semicolon' : key === '=' ? 'Equal' : key
      const event = press({ ctrlKey: combo.ctrl, altKey: combo.alt, shiftKey: combo.shift, code, key: /^[A-Z]$/.test(key) ? (combo.shift ? key : key.toLowerCase()) : key === 'Up' || key === 'Down' ? 'Arrow' + key : key === 'Space' ? ' ' : key })
      expect(comboFromEvent(event), text).toBe(text)
    }
    expect(comboFromEvent(press({ ctrlKey: true, code: 'ControlLeft', key: 'Control' }))).toBeNull()
    expect(comboFromEvent(press({ code: 'KeyS', key: 'ד', ctrlKey: true }))).toBe('Ctrl+S')
  })

  it('keeps the keys with a fixed meaning', () => {
    expect(reservedReason('Ctrl+C')).not.toBeNull()
    expect(reservedReason('ctrl+v')).not.toBeNull()
    expect(reservedReason('Escape')).not.toBeNull()
    expect(reservedReason('Ctrl+Shift+S')).toBeNull()
  })
})

describe('the commands', () => {
  const menus = buildMenus(context())
  const commands = allShortcutCommands(menus)

  it('have one id each', () => {
    const ids = commands.map((command) => command.id)
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([])
  })

  it('have no key in common in the program\'s own set, and none of the fixed keys', () => {
    const owners = new Map<string, string[]>()
    for (const command of commands) {
      for (const keys of command.defaults) {
        const key = canonicalCombo(keys)
        owners.set(key, [...(owners.get(key) ?? []), command.id])
        expect(reservedReason(keys), `${command.id} ${keys}`).toBeNull()
      }
    }
    expect([...owners].filter(([, ids]) => ids.length > 1)).toEqual([])
  })

  it('include the tools, once each, and not the entries that come and go', () => {
    const tools = commands.filter((command) => command.id.startsWith('tool:'))
    expect(tools.map((tool) => tool.id)).toContain('tool:pen')
    expect(tools.length).toBe(TOOLS.filter((def) => def.enabled).length)
    expect(commands.some((command) => command.label === 'אין קבצים אחרונים')).toBe(false)
    expect(commands.find((command) => command.id === 'עריכה›קיצורי מקשים…')?.defaults).toEqual(['Ctrl+Alt+Shift+K'])
  })

  it('give the tools in the menus the keys the toolbox gives them', () => {
    for (const command of menuCommands(menus).filter((c) => c.id.startsWith('tool:') && c.defaults.length > 0)) {
      const def = TOOLS.find((item) => 'tool:' + item.id === command.id)!
      expect(toolDefaults(def).map(canonicalCombo), command.id).toEqual(command.defaults.map(canonicalCombo))
    }
    for (const def of TOOLS.filter((item) => item.code)) {
      const combo = parseCombo(def.key!)!
      expect(def.code, def.id).toBe(/^[A-Z]$/.test(combo.key) ? 'Key' + combo.key : combo.key === '\\' ? 'Backslash' : undefined)
      expect(!!def.shift, def.id).toBe(combo.shift)
    }
  })
})

describe('sets of shortcuts', () => {
  const menus = buildMenus(context())
  const commands = allShortcutCommands(menus)
  const command = (label: string) => commands.find((c) => c.label === label)!

  beforeEach(() => resetShortcutStateForTests())

  it('never change the built-in set: the first change goes into a new set', () => {
    const save = command('שמור')
    expect(getShortcutState().activeId).toBe(DEFAULT_SET_ID)
    const made = changeActiveKeys((keys) => withCommandKeys(keys, save, ['Ctrl+Alt+Shift+9']), 'הסט שלי')
    expect(getShortcutState().activeId).toBe(made.id)
    expect(made.name).toBe('הסט שלי')
    expect(keysOf(getShortcutState(), save.id, save.defaults)).toEqual(['Ctrl+Alt+Shift+9'])
    selectShortcutSet(DEFAULT_SET_ID)
    expect(keysOf(getShortcutState(), save.id, save.defaults)).toEqual(['Ctrl+S'])
    // a second set is named apart
    const second = changeActiveKeys((keys) => withCommandKeys(keys, save, []), 'הסט שלי')
    expect(second.name).toBe('הסט שלי 2')
  })

  it('hold only what they change, and drop a command that is back as it was', () => {
    const save = command('שמור')
    let keys = withCommandKeys({}, save, ['Ctrl+Alt+Shift+9'])
    expect(Object.keys(keys)).toEqual([save.id])
    keys = withCommandKeys(keys, save, ['ctrl+s'])
    expect(keys).toEqual({})
    expect(keysIn(withCommandKeys({}, save, []), save)).toEqual([]) // no shortcut at all
  })

  it('find the commands that have a key', () => {
    const save = command('שמור')
    const keys = withCommandKeys({}, command('פתח…'), ['Ctrl+Shift+S'])
    expect(commandsWithCombo(commands, {}, 'Ctrl+S').map((c) => c.id)).toEqual([save.id])
    expect(commandsWithCombo(commands, {}, 'Ctrl+S', save.id)).toEqual([])
    expect(commandsWithCombo(commands, keys, 'ctrl+shift+s').map((c) => c.label).sort()).toEqual(['פתח…', 'שמור בשם…'].sort())
  })

  it('are made, renamed, deleted and reset, and the reset can be undone', () => {
    const save = command('שמור')
    const id = createShortcutSet('עבודה')
    expect(activeSet(getShortcutState())?.name).toBe('עבודה')
    renameShortcutSet(id, 'סט עבודה')
    changeActiveKeys((keys) => withCommandKeys(keys, save, ['Ctrl+Alt+Shift+9']), 'x')
    const before = resetActiveSet()
    expect(activeSet(getShortcutState())?.keys).toEqual({})
    expect(Object.keys(before)).toEqual([save.id])
    restoreSetKeys(id, before)
    expect(activeSet(getShortcutState())?.keys).toEqual(before)
    // a new set starts as a copy of the active one
    const copy = createShortcutSet('עותק')
    expect(activeSet(getShortcutState())?.id).toBe(copy)
    expect(activeSet(getShortcutState())?.keys).toEqual(before)
    removeShortcutSet(copy)
    expect(getShortcutState().activeId).toBe(DEFAULT_SET_ID)
    expect(getShortcutState().sets.map((set) => set.name)).toEqual(['סט עבודה'])
  })

  it('are read back from what was stored, and a damaged text is the built-in set', () => {
    const save = command('שמור')
    changeActiveKeys((keys) => withCommandKeys(keys, save, ['ctrl+alt+9']), 'הסט שלי')
    const read = parseShortcutState(JSON.stringify(getShortcutState()))
    expect(read.activeId).toBe(getShortcutState().activeId)
    expect(read.sets[0].keys[save.id]).toEqual(['Ctrl+Alt+9'])
    expect(parseShortcutState('{not json')).toEqual({ activeId: DEFAULT_SET_ID, sets: [] })
    expect(parseShortcutState(null)).toEqual({ activeId: DEFAULT_SET_ID, sets: [] })
    const odd = parseShortcutState(JSON.stringify({ activeId: 'gone', sets: [{ id: 'default', name: 'x', keys: {} }, { id: 'a', name: 'A', keys: { q: ['Ctrl+Nope', 'ctrl+k', 7] } }] }))
    expect(odd.activeId).toBe(DEFAULT_SET_ID)
    expect(odd.sets).toEqual([{ id: 'a', name: 'A', keys: { q: ['Ctrl+K'] } }])
  })
})

describe('the menus with the keys of a set', () => {
  it('answer to the new key and no longer to the old one, and show it', () => {
    const calls: string[] = []
    const base = buildMenus({
      ...context(),
      ws: { current: new Proxy({}, { get: (_, name) => () => calls.push(String(name)) }) },
    } as unknown as MenuContext)
    const commands = allShortcutCommands(base)
    const group = commands.find((c) => c.label === 'קבץ')!
    const keys = withCommandKeys({}, group, ['Ctrl+Alt+Shift+9'])
    const live = applyShortcuts(base, (id, own) => keysIn(keys, { id, defaults: defaultKeysFor(id, own) }))
    expect(findShortcut(live, press({ ctrlKey: true, code: 'KeyG', key: 'g' }))).toBeUndefined()
    const item = findShortcut(live, press({ ctrlKey: true, altKey: true, shiftKey: true, code: 'Digit9', key: '9' }))
    expect(item?.label).toBe('קבץ')
    expect(item?.shortcut).toBe('Ctrl+Alt+Shift+9')
    item?.onClick?.()
    expect(calls).toEqual(['group'])
  })

  it('give a command that had no key one, and a tool the keys it was given', () => {
    const base = buildMenus(context())
    const commands = allShortcutCommands(base)
    const hyphenate = commands.find((c) => c.label === 'מעבר שורה עם מקף (אנגלית)')!
    expect(hyphenate.defaults).toEqual([])
    const keys = withCommandKeys(withCommandKeys({}, hyphenate, ['Ctrl+Alt+H']), commands.find((c) => c.id === 'tool:hand')!, ['Ctrl+Alt+Shift+H'])
    const live = applyShortcuts(base, (id, own) => keysIn(keys, { id, defaults: defaultKeysFor(id, own) }))
    expect(findShortcut(live, press({ ctrlKey: true, altKey: true, code: 'KeyH', key: 'h' }))?.label).toBe('מעבר שורה עם מקף (אנגלית)')
    expect(findShortcut(live, press({ code: 'KeyH', key: 'h' }))).toBeUndefined()
    expect(findShortcut(live, press({ ctrlKey: true, altKey: true, shiftKey: true, code: 'KeyH', key: 'H' }))?.label).toBe('יד')
  })

  it('keep the keys of the program when nothing is changed', () => {
    const base = buildMenus(context())
    const live = applyShortcuts(base, (id, own) => defaultKeysFor(id, own))
    const save = (menus: typeof base) => menus.flatMap((menu) => menu.items).find((item) => item.label === 'שמור')
    expect(save(live)).toBe(save(base)) // the same item: it was not copied
    expect(live.length).toBe(base.length)
  })
})
