import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadDockWorkspaceStore, loadLegacyDockTabOrder, saveDockWorkspaceStore, type DockWorkspaceStore } from './dockWorkspaces'

function mockStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  })
  return values
}

afterEach(() => vi.unstubAllGlobals())

describe('dock workspace persistence', () => {
  it('round-trips named layouts and the active workspace', () => {
    const values = mockStorage()
    const store: DockWorkspaceStore = {
      activeId: 'writing',
      workspaces: [{
        id: 'writing',
        name: 'כתיבה',
        layout: {
          openPanelId: 'paragraph',
          enabledPanelIds: ['paragraph', 'layers'],
          tabOrder: ['layers', 'paragraph'],
          floatingPanelId: 'style-manager',
          floatingPosition: { x: 210, y: 75 },
        },
      }],
    }

    saveDockWorkspaceStore(store)
    expect(loadDockWorkspaceStore()).toEqual(store)
    expect(values.has('imudist.workspaces')).toBe(true)
  })

  it('ignores malformed stored workspaces and invalid active ids', () => {
    mockStorage({
      'imudist.workspaces': JSON.stringify({
        activeId: 'missing',
        workspaces: [
          { id: 'bad', name: ' ', layout: {} },
          { id: 'good', name: 'עיצוב', layout: { enabledPanelIds: ['layers', 2], floatingPosition: { x: Infinity, y: 40 } } },
        ],
      }),
    })

    expect(loadDockWorkspaceStore()).toEqual({
      activeId: null,
      workspaces: [{
        id: 'good',
        name: 'עיצוב',
        layout: {
          openPanelId: null,
          enabledPanelIds: ['layers'],
          tabOrder: [],
          floatingPanelId: null,
          floatingPosition: { x: 0, y: 40 },
        },
      }],
    })
  })

  it('reads the previous tab order when no saved workspace has been created yet', () => {
    mockStorage({ 'imudist.dockTabOrder': '["layers","paragraph"]' })
    expect(loadLegacyDockTabOrder()).toEqual(['layers', 'paragraph'])
  })
})
