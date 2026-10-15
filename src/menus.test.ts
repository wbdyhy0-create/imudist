import { describe, expect, it, vi } from 'vitest'
import { buildMenus, findShortcut, matches, shortcutOwners, type MenuContext } from './menus'

const context = (calls: string[] = []): MenuContext => {
  const base: Record<string, unknown> = {
    hasDoc: true,
    editingParent: false,
    recent: [],
    savedWorkspaces: [],
    openDocs: [],
    enabledDockPanelIds: [],
    fontStatus: 'idle',
    fontCount: 0,
    ws: { current: new Proxy({}, { get: (_, name) => (...args: unknown[]) => calls.push(`${String(name)}(${args.join(',')})`) }) },
  }
  // every other command of the menus is a function that does nothing
  return new Proxy(base, { get: (target, name) => (name in target ? target[name as string] : () => {}) }) as unknown as MenuContext
}

const key = (init: { ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; code: string; key: string }) =>
  ({ ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...init }) as KeyboardEvent

describe('the keyboard shortcuts of the menus', () => {
  const menus = buildMenus(context())

  it('are each used by one command only', () => {
    const shared = [...shortcutOwners(menus)].filter(([, labels]) => labels.length > 1)
    expect(shared).toEqual([])
  })

  it('answer to the text keys: alignment, size, line spacing and letter spacing', () => {
    const calls: string[] = []
    const live = buildMenus(context(calls))
    const press = (init: Parameters<typeof key>[0]) => findShortcut(live, key(init))?.onClick?.()
    press({ ctrlKey: true, shiftKey: true, code: 'KeyL', key: 'L' })
    press({ ctrlKey: true, shiftKey: true, code: 'KeyR', key: 'R' })
    press({ ctrlKey: true, shiftKey: true, code: 'KeyC', key: 'C' })
    press({ ctrlKey: true, shiftKey: true, code: 'KeyJ', key: 'J' })
    press({ ctrlKey: true, shiftKey: true, code: 'Period', key: '>' })
    press({ ctrlKey: true, shiftKey: true, code: 'Comma', key: '<' })
    press({ altKey: true, code: 'ArrowDown', key: 'ArrowDown' })
    press({ altKey: true, code: 'ArrowUp', key: 'ArrowUp' })
    press({ altKey: true, code: 'ArrowRight', key: 'ArrowRight' })
    press({ altKey: true, code: 'ArrowLeft', key: 'ArrowLeft' })
    expect(calls).toEqual([
      'alignText(left)', 'alignText(right)', 'alignText(center)', 'alignText(justify)',
      'stepTextSize(1)', 'stepTextSize(-1)',
      'stepLineSpacing(1)', 'stepLineSpacing(-1)',
      'stepLetterSpacing(20)', 'stepLetterSpacing(-20)',
    ])
  })

  it('answer to the object keys', () => {
    const calls: string[] = []
    const live = buildMenus(context(calls))
    const press = (init: Parameters<typeof key>[0]) => findShortcut(live, key(init))?.onClick?.()
    press({ ctrlKey: true, altKey: true, code: 'KeyC', key: 'c' })
    press({ ctrlKey: true, altKey: true, code: 'KeyE', key: 'e' })
    press({ ctrlKey: true, code: 'KeyL', key: 'l' })
    press({ ctrlKey: true, altKey: true, code: 'KeyL', key: 'l' })
    press({ ctrlKey: true, code: 'KeyG', key: 'g' })
    press({ ctrlKey: true, shiftKey: true, code: 'KeyG', key: 'G' })
    expect(calls).toEqual(['fitFramesToText()', 'fillFramesWithPictures()', 'lockChosenObjects()', 'unlockAllObjects()', 'group()', 'ungroup()'])
  })

  it('open the file dialog with Ctrl+D (and still with Ctrl+Shift+I), and export with Ctrl+Alt+Shift+S (and still Ctrl+E)', () => {
    const spy = vi.fn()
    const live = buildMenus({ ...context(), importText: spy, exportPdf: spy } as MenuContext)
    for (const init of [{ ctrlKey: true, code: 'KeyD', key: 'd' }, { ctrlKey: true, shiftKey: true, code: 'KeyI', key: 'I' }, { ctrlKey: true, altKey: true, shiftKey: true, code: 'KeyS', key: 'S' }, { ctrlKey: true, code: 'KeyE', key: 'e' }]) {
      findShortcut(live, key(init))?.onClick?.()
    }
    expect(spy).toHaveBeenCalledTimes(4)
  })

  it('open the style panels with F11 and Shift+F11, and the presentation with Shift+W', () => {
    expect(findShortcut(menus, key({ code: 'F11', key: 'F11' }))?.label).toBe('סגנונות פסקה')
    expect(findShortcut(menus, key({ shiftKey: true, code: 'F11', key: 'F11' }))?.label).toBe('סגנונות תו')
    expect(findShortcut(menus, key({ shiftKey: true, code: 'KeyW', key: 'W' }))?.label).toBe('מצגת (מסך מלא)')
    expect(findShortcut(menus, key({ code: 'KeyW', key: 'w' }))?.label).toBe('תצוגה מקדימה')
  })

  it('are matched by the physical key, so a Hebrew layout works too', () => {
    expect(matches(key({ ctrlKey: true, shiftKey: true, code: 'KeyL', key: 'ך' }), 'Ctrl+Shift+L')).toBe(true)
    expect(matches(key({ ctrlKey: true, shiftKey: true, code: 'Period', key: 'ץ' }), 'Ctrl+Shift+>')).toBe(true)
    expect(matches(key({ ctrlKey: true, code: 'KeyL', key: 'l' }), 'Ctrl+Shift+L')).toBe(false)
  })
})
