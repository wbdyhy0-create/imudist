import { t } from './i18n'
import { BOOK_EXT, basenameOf, dirnameOf, joinPath, normalizePath, relativePath, serializeBook, type BookFile } from './book'
import { FILE_EXT } from './fileFormat'
import { isTauri, writeToHandle } from './fileio'

/** What it takes to open a chapter as an ordinary document: the file's handle (browser) or its path (desktop). */
export interface ChapterRef {
  name: string
  handle: FileSystemFileHandle | null
  path?: string
}

/**
 * Where a book's files are and how to reach them, whatever the platform: the desktop app reads and writes by path, the
 * browser through the folder the user gave the book (it can only reach what is under it).
 */
export interface BookStorage {
  /** where the book is, for showing */
  label: string
  /** the book file's name in its folder */
  bookFileName: string
  readText(path: string): Promise<string>
  /** the text and when the file was last changed (milliseconds; null where that cannot be told) */
  readFile(path: string): Promise<{ text: string; modified: number | null }>
  writeText(path: string, text: string): Promise<void>
  chapterRef(path: string): Promise<ChapterRef>
  /** the path from the book's folder of a file that was dropped on the book (null: it is not under it) - where the platform gives handles */
  chapterPathOfHandle?(handle: FileSystemFileHandle): Promise<string | null>
  /** paths from the book's folder for files given by their full paths - where the platform gives paths */
  chapterPathsOf?(paths: string[]): string[]
  /** the user picks chapter files in a dialog: their paths from the book's folder (null: cancelled) - where the platform has one */
  pickChapters?(): Promise<string[] | null>
  /** every document file under the book's folder, to choose from - where there is no dialog */
  listChapters?(): Promise<string[]>
}

// ── desktop ────────────────────────────────────────────────────────────────────

function desktopStorage(bookPath: string): BookStorage {
  const path = normalizePath(bookPath)
  const folder = dirnameOf(path)
  const full = (relative: string) => joinPath(folder, relative)
  return {
    label: path,
    bookFileName: basenameOf(path),
    async readText(relative) {
      const { readTextFile } = await import('@tauri-apps/plugin-fs')
      return readTextFile(full(relative))
    },
    async readFile(relative) {
      const { readTextFile, stat } = await import('@tauri-apps/plugin-fs')
      const text = await readTextFile(full(relative))
      // the time is only for noticing a change made elsewhere: where it cannot be read, that is not noticed
      const modified = await stat(full(relative)).then((info) => info.mtime?.getTime() ?? null).catch(() => null)
      return { text, modified }
    },
    async writeText(relative, text) {
      const { writeTextFile } = await import('@tauri-apps/plugin-fs')
      await writeTextFile(full(relative), text)
    },
    chapterPathsOf(paths) {
      return paths.filter((file) => file.toLowerCase().endsWith(FILE_EXT)).map((file) => relativePath(folder, file))
    },
    async chapterRef(relative) {
      const target = full(relative)
      return { name: basenameOf(target), handle: null, path: target }
    },
    async pickChapters() {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const picked = await open({ multiple: true, directory: false, defaultPath: folder, filters: [{ name: 'מסמך Imudist', extensions: [FILE_EXT.slice(1)] }] })
      if (!picked) return null
      return (Array.isArray(picked) ? picked : [picked]).map((file) => relativePath(folder, file))
    },
  }
}

async function openDesktopBook(): Promise<{ text: string; storage: BookStorage } | null> {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const { readTextFile } = await import('@tauri-apps/plugin-fs')
  const picked = await open({ multiple: false, directory: false, filters: [{ name: 'ספר Imudist', extensions: [BOOK_EXT.slice(1)] }] })
  if (!picked || Array.isArray(picked)) return null
  return { text: await readTextFile(picked), storage: desktopStorage(picked) }
}

async function createDesktopBook(book: BookFile): Promise<BookStorage | null> {
  const { save } = await import('@tauri-apps/plugin-dialog')
  const { writeTextFile } = await import('@tauri-apps/plugin-fs')
  const picked = await save({ defaultPath: `${book.title.replace(/[\\/:*?"<>|]/g, '_')}${BOOK_EXT}`, filters: [{ name: 'ספר Imudist', extensions: [BOOK_EXT.slice(1)] }] })
  if (!picked) return null
  const storage = desktopStorage(picked.toLowerCase().endsWith(BOOK_EXT) ? picked : `${picked}${BOOK_EXT}`)
  await writeTextFile(storage.label, serializeBook(book))
  return storage
}

// ── browser ────────────────────────────────────────────────────────────────────

interface FolderApi {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>
}
const folderApi = () => window as unknown as FolderApi
export const hasFolderPicker = () => typeof folderApi().showDirectoryPicker === 'function'

/** the names in a folder (the API's iteration is not in every TypeScript's types) */
const entriesOf = (dir: FileSystemDirectoryHandle): AsyncIterable<[string, FileSystemHandle]> => (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()

async function fileHandleAt(root: FileSystemDirectoryHandle, path: string, create = false): Promise<FileSystemFileHandle> {
  const parts = normalizePath(path).split('/')
  if (parts.some((part) => part === '..')) throw new Error(t('הקובץ נמצא מחוץ לתיקיית הספר, ולכן הדפדפן לא יכול לפתוח אותו.'))
  let dir = root
  for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part)
  return dir.getFileHandle(parts[parts.length - 1], { create })
}

function folderStorage(root: FileSystemDirectoryHandle, bookFileName: string): BookStorage {
  const listUnder = async (dir: FileSystemDirectoryHandle, prefix: string, depth: number, out: string[]) => {
    for await (const [name, handle] of entriesOf(dir)) {
      if (handle.kind === 'file' && name.toLowerCase().endsWith(FILE_EXT)) out.push(`${prefix}${name}`)
      else if (handle.kind === 'directory' && depth < 4 && !name.startsWith('.') && name !== 'node_modules') await listUnder(handle as FileSystemDirectoryHandle, `${prefix}${name}/`, depth + 1, out)
    }
  }
  return {
    label: `${root.name}/${bookFileName}`,
    bookFileName,
    async readText(path) {
      return (await (await fileHandleAt(root, path)).getFile()).text()
    },
    async readFile(path) {
      const file = await (await fileHandleAt(root, path)).getFile()
      return { text: await file.text(), modified: file.lastModified }
    },
    async writeText(path, text) {
      await writeToHandle(await fileHandleAt(root, path, true), text)
    },
    async chapterPathOfHandle(handle) {
      try {
        const parts = await root.resolve(handle)
        return parts && parts.length > 0 ? parts.join('/') : null
      } catch {
        return null
      }
    },
    async chapterRef(path) {
      const handle = await fileHandleAt(root, path)
      return { name: handle.name, handle }
    },
    async listChapters() {
      const found: string[] = []
      await listUnder(root, '', 0, found)
      return found.sort((a, b) => a.localeCompare(b, 'he'))
    },
  }
}

async function openFolderBook(): Promise<{ text: string; storage: BookStorage } | null> {
  const root = await pickFolder()
  if (!root) return null
  const books: string[] = []
  for await (const [name, handle] of entriesOf(root)) if (handle.kind === 'file' && name.toLowerCase().endsWith(BOOK_EXT)) books.push(name)
  if (books.length === 0) throw new Error(t('בתיקייה "{name}" אין קובץ ספר ({ext}). כדי ליצור ספר חדש בחר בקובץ > חדש > ספר.', { name: root.name, ext: BOOK_EXT }))
  books.sort((a, b) => a.localeCompare(b, 'he'))
  const storage = folderStorage(root, books[0])
  return { text: await storage.readText(books[0]), storage }
}

async function createFolderBook(book: BookFile): Promise<BookStorage | null> {
  const root = await pickFolder()
  if (!root) return null
  const name = `${book.title.replace(/[\\/:*?"<>|]/g, '_').trim() || 'ספר'}${BOOK_EXT}`
  const storage = folderStorage(root, name)
  await storage.writeText(name, serializeBook(book))
  return storage
}

async function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await folderApi().showDirectoryPicker!({ mode: 'readwrite' })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null
    throw e
  }
}

// ── what the rest of the app uses ───────────────────────────────────────────────

/** Whether this platform can keep a book (the desktop app, or a browser that lets the page open a folder). */
export const canKeepBooks = () => isTauri || hasFolderPicker()

/** Ask for a book file (the desktop) or the folder of one (the browser) and read it. Null: cancelled. */
export async function openBookFile(): Promise<{ text: string; storage: BookStorage } | null> {
  return isTauri ? openDesktopBook() : openFolderBook()
}

/** Ask where the new book goes and write it there. Null: cancelled. */
export async function createBookFile(book: BookFile): Promise<BookStorage | null> {
  return isTauri ? createDesktopBook(book) : createFolderBook(book)
}
