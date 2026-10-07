export interface DockLayout {
  openPanelId: string | null
  enabledPanelIds: string[]
  tabOrder: string[]
  floatingPanelId: string | null
  floatingPosition: { x: number; y: number }
}

export interface SavedDockWorkspace {
  id: string
  name: string
  layout: DockLayout
}

export interface DockWorkspaceStore {
  activeId: string | null
  workspaces: SavedDockWorkspace[]
}

const STORAGE_KEY = 'imudist.workspaces'
const LEGACY_TAB_ORDER_KEY = 'imudist.dockTabOrder'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

function parseLayout(value: unknown): DockLayout | null {
  if (!isRecord(value)) return null
  const position = isRecord(value.floatingPosition) ? value.floatingPosition : {}
  const numberOr = (candidate: unknown, fallback: number) =>
    typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : fallback

  return {
    openPanelId: typeof value.openPanelId === 'string' ? value.openPanelId : null,
    enabledPanelIds: stringList(value.enabledPanelIds),
    tabOrder: stringList(value.tabOrder),
    floatingPanelId: typeof value.floatingPanelId === 'string' ? value.floatingPanelId : null,
    floatingPosition: {
      x: numberOr(position.x, 0),
      y: numberOr(position.y, 60),
    },
  }
}

export function defaultDockLayout(panelIds: string[], tabOrder: string[] = panelIds): DockLayout {
  return {
    openPanelId: null,
    enabledPanelIds: [...panelIds],
    tabOrder: [...tabOrder],
    floatingPanelId: null,
    floatingPosition: { x: 0, y: 60 },
  }
}

export function loadLegacyDockTabOrder(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(LEGACY_TAB_ORDER_KEY) ?? 'null')
    return stringList(raw)
  } catch {
    return []
  }
}

export function loadDockWorkspaceStore(): DockWorkspaceStore {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!isRecord(raw) || !Array.isArray(raw.workspaces)) return { activeId: null, workspaces: [] }

    const workspaces = raw.workspaces.flatMap((item): SavedDockWorkspace[] => {
      if (!isRecord(item) || typeof item.id !== 'string' || typeof item.name !== 'string') return []
      const layout = parseLayout(item.layout)
      const name = item.name.trim()
      return layout && name ? [{ id: item.id, name, layout }] : []
    })
    const activeId = typeof raw.activeId === 'string' && workspaces.some((workspace) => workspace.id === raw.activeId)
      ? raw.activeId
      : null
    return { activeId, workspaces }
  } catch {
    return { activeId: null, workspaces: [] }
  }
}

export function saveDockWorkspaceStore(store: DockWorkspaceStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}
