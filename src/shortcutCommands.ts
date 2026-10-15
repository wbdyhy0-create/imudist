import type { MenuDef } from './components/MenuBar'
import { TOOLS, toolDefaults } from './components/Toolbox'
import { menuCommands, type ShortcutCommand } from './shortcuts'

/** the category the tools are listed under in the window of the shortcuts */
export const TOOLS_CATEGORY = 'כלים'

/**
 * Everything a shortcut can be given to: the commands of the menus, and the tools of the toolbox (a tool that has an item in a menu
 * is listed once, among the tools). `menus` are the menus as they are built, with the program's own shortcuts on them.
 */
export function allShortcutCommands(menus: MenuDef[]): ShortcutCommand[] {
  const tools: ShortcutCommand[] = TOOLS.filter((def) => def.enabled).map((def) => ({
    id: 'tool:' + def.id,
    label: def.label,
    category: TOOLS_CATEGORY,
    path: [],
    defaults: toolDefaults(def),
  }))
  const toolIds = new Set(tools.map((command) => command.id))
  return [...menuCommands(menus).filter((command) => !toolIds.has(command.id)), ...tools]
}

/** the keys a command has in the program's own set: a tool's are the toolbox's, the others' are the ones its menu item is written with */
export function defaultKeysFor(id: string, own: string[]): string[] {
  if (!id.startsWith('tool:')) return own
  const def = TOOLS.find((tool) => 'tool:' + tool.id === id)
  return def ? toolDefaults(def) : own
}
