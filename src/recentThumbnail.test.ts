import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RecentEntry } from './recent'

afterEach(() => vi.unstubAllGlobals())

describe('recent document thumbnails', () => {
  it('does not prompt to restore a recent file handle permission just to show a preview', async () => {
    vi.stubGlobal('window', {})
    const { recentThumbnail } = await import('./recentThumbnail')
    const queryPermission = vi.fn().mockResolvedValue('prompt')
    const getFile = vi.fn()
    const entry: RecentEntry = {
      name: 'recent.imudist',
      handle: { queryPermission, getFile } as unknown as FileSystemFileHandle,
      at: 1,
    }

    await expect(recentThumbnail(entry)).resolves.toBeNull()
    expect(queryPermission).toHaveBeenCalledWith({ mode: 'read' })
    expect(getFile).not.toHaveBeenCalled()
  })
})
