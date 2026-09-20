/**
 * "Recent files": file handles kept in IndexedDB (they can be stored there, unlike in localStorage).
 * Only browsers with the File System Access API produce handles, so elsewhere the list stays empty.
 */

export interface RecentEntry {
  name: string
  handle: FileSystemFileHandle
  /** last opened / saved, ms since epoch */
  at: number
}

const DB = 'imudist'
const STORE = 'kv'
const KEY = 'recent'
const MAX = 10

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function read(): Promise<RecentEntry[]> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(KEY)
    req.onsuccess = () => resolve(Array.isArray(req.result) ? (req.result as RecentEntry[]) : [])
    req.onerror = () => reject(req.error)
  })
}

async function write(list: RecentEntry[]): Promise<void> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(list, KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Newest first. Never throws: a broken database just means an empty list. */
export async function listRecent(): Promise<RecentEntry[]> {
  try {
    return (await read()).sort((a, b) => b.at - a.at)
  } catch {
    return []
  }
}

/** Put a file at the top of the list (moving it if it is already there). */
export async function addRecent(handle: FileSystemFileHandle): Promise<RecentEntry[]> {
  try {
    const rest: RecentEntry[] = []
    for (const e of await read()) if (!(await e.handle.isSameEntry(handle))) rest.push(e)
    const list = [{ name: handle.name, handle, at: Date.now() }, ...rest].slice(0, MAX)
    await write(list)
    return list
  } catch {
    return listRecent()
  }
}

export async function removeRecent(entry: RecentEntry): Promise<RecentEntry[]> {
  try {
    const list = (await read()).filter((e) => e.handle !== entry.handle && e.name !== entry.name)
    await write(list)
    return list
  } catch {
    return listRecent()
  }
}
