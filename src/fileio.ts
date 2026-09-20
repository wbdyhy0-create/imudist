import { FILE_EXT } from './fileFormat'

/** A document's file. `handle` is null when the browser can't give us a writable file (see hasFilePicker). */
export interface FileRef {
  name: string
  handle: FileSystemFileHandle | null
}

/** The File System Access API (Chrome, Edge): real "Save" / "Save as" dialogs and overwriting in place. */
interface PickerApi {
  showSaveFilePicker?: (options: unknown) => Promise<FileSystemFileHandle>
  showOpenFilePicker?: (options: unknown) => Promise<FileSystemFileHandle[]>
}
const api = window as unknown as PickerApi

export const hasFilePicker = typeof api.showSaveFilePicker === 'function' && typeof api.showOpenFilePicker === 'function'

const TYPES = [{ description: 'מסמך Imudist', accept: { 'application/json': [FILE_EXT] } }]

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

/** "My file.imudist" → "My file" */
export const baseName = (fileName: string) => fileName.replace(/\.[^./\\]*$/, '')

/** A file name for a document: no characters Windows doesn't allow, plus the extension. */
export const fileNameFor = (docName: string) => `${docName.replace(/[\\/:*?"<>|]/g, '_').trim() || 'ללא שם'}${FILE_EXT}`

export async function writeToHandle(handle: FileSystemFileHandle, text: string) {
  const writable = await handle.createWritable()
  await writable.write(text)
  await writable.close()
}

/** Ask where to save. Returns null when the user cancels. */
export async function saveWithPicker(suggestedName: string, text: string): Promise<FileRef | null> {
  try {
    const handle = await api.showSaveFilePicker!({ suggestedName, types: TYPES })
    await writeToHandle(handle, text)
    return { name: handle.name, handle }
  } catch (e) {
    if (isAbort(e)) return null
    throw e
  }
}

/** Ask which file to open. Returns null when the user cancels. */
export async function openWithPicker(): Promise<{ ref: FileRef; text: string } | null> {
  try {
    const [handle] = await api.showOpenFilePicker!({ types: TYPES, multiple: false })
    return { ref: { name: handle.name, handle }, text: await (await handle.getFile()).text() }
  } catch (e) {
    if (isAbort(e)) return null
    throw e
  }
}

/** Browsers without the File System Access API: "saving" downloads a copy. */
export function downloadText(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Browsers without the File System Access API: open through a hidden <input type="file">. */
export function openWithInput(): Promise<{ ref: FileRef; text: string } | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = `${FILE_EXT},application/json`
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      file.text().then((text) => resolve({ ref: { name: file.name, handle: null }, text }), reject)
    }
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

/** Make sure we may read a file handle remembered from an earlier visit (asks the user if needed). */
export async function ensureReadPermission(handle: FileSystemFileHandle): Promise<boolean> {
  const h = handle as unknown as {
    queryPermission?: (d: { mode: 'read' }) => Promise<PermissionState>
    requestPermission?: (d: { mode: 'read' }) => Promise<PermissionState>
  }
  if (!h.queryPermission || !h.requestPermission) return true
  if ((await h.queryPermission({ mode: 'read' })) === 'granted') return true
  return (await h.requestPermission({ mode: 'read' })) === 'granted'
}

/** Let the user pick any file (through a hidden <input>). Resolves to null when the dialog is cancelled. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}