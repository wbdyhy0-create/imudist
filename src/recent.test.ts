import { afterEach, describe, expect, it, vi } from 'vitest'
import { removeRecent, type RecentEntry } from './recent'

interface MockRequest {
  result?: RecentEntry[] | MockDatabase
  onsuccess?: () => void
  onupgradeneeded?: () => void
}

interface MockTransaction {
  oncomplete?: () => void
  objectStore: () => {
    get: (key: string) => MockRequest
    put: (value: RecentEntry[], key: string) => void
  }
}

interface MockDatabase {
  createObjectStore: () => void
  transaction: () => MockTransaction
}

function mockIndexedDb(entries: RecentEntry[]) {
  const values = new Map<string, RecentEntry[]>([['recent', entries]])
  const database: MockDatabase = {
    createObjectStore: () => {},
    transaction: () => {
      const transaction: MockTransaction = {
        objectStore: () => ({
          get: (key) => {
            const request: MockRequest = {}
            queueMicrotask(() => {
              request.result = values.get(key)
              request.onsuccess?.()
            })
            return request
          },
          put: (value, key) => {
            queueMicrotask(() => {
              values.set(key, value)
              transaction.oncomplete?.()
            })
          },
        }),
      }
      return transaction
    },
  }
  const indexedDB = {
    open: () => {
      const request: MockRequest = {}
      queueMicrotask(() => {
        request.result = database
        request.onupgradeneeded?.()
        request.onsuccess?.()
      })
      return request
    },
  }
  return { indexedDB, values }
}

afterEach(() => vi.unstubAllGlobals())

describe('removing recent documents', () => {
  it('removes a missing desktop file by normalized path', async () => {
    const missing: RecentEntry = { name: 'missing.imudist', handle: null, path: 'C:\\Docs\\missing.imudist', at: 10 }
    const other: RecentEntry = { name: 'other.imudist', handle: null, path: 'C:\\Docs\\other.imudist', at: 11 }
    const db = mockIndexedDb([missing, other])
    vi.stubGlobal('indexedDB', db.indexedDB)

    await expect(removeRecent({ ...missing, path: 'c:/docs/MISSING.imudist' })).resolves.toEqual([other])
    expect(db.values.get('recent')).toEqual([other])
  })

  it('keeps a different recent file with the same name', async () => {
    const selected: RecentEntry = { name: 'document.imudist', handle: null, at: 10 }
    const other: RecentEntry = { name: 'document.imudist', handle: null, at: 11 }
    const db = mockIndexedDb([selected, other])
    vi.stubGlobal('indexedDB', db.indexedDB)

    await expect(removeRecent(selected)).resolves.toEqual([other])
  })
})
