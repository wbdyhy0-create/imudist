import { t } from './i18n'
/**
 * A book: several documents (the chapters) kept together as one publication. The book file holds only the list and the
 * settings - never a copy of what is in the chapters - so each chapter stays an ordinary document with its own file.
 */

export const BOOK_EXT = '.imubook'

/** which pages a chapter may begin on: `odd` / `even` skip a page number (a blank page) when the next one is of the other kind */
export type ChapterStart = 'any' | 'odd' | 'even'

export interface BookChapter {
  id: string
  /** the chapter's file, from the book file's folder, with "/" between folders */
  path: string
}

export interface BookSettings {
  /** the number of the book's first page */
  startPage: number
  chapterStart: ChapterStart
  /** the chapter whose styles the others follow (the id of a chapter), or none */
  styleSourceId: string | null
}

export interface BookFile {
  format: 'imubook'
  version: 1
  title: string
  settings: BookSettings
  chapters: BookChapter[]
}

export class BookFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BookFormatError'
  }
}

export const newChapterId = () => globalThis.crypto?.randomUUID?.() ?? `chapter-${Date.now()}-${Math.random().toString(36).slice(2)}`

export function newBook(title: string): BookFile {
  return { format: 'imubook', version: 1, title: title.trim() || t('ספר ללא שם'), settings: { startPage: 1, chapterStart: 'any', styleSourceId: null }, chapters: [] }
}

export const serializeBook = (book: BookFile) => JSON.stringify(book, null, 2)

// ── paths ──────────────────────────────────────────────────────────────────────

/** A path with "/" between its parts, no "." parts, ".." resolved where it can be, and no trailing "/". */
export function normalizePath(path: string): string {
  const parts: string[] = []
  const absolute = /^([a-zA-Z]:)?\//.test(path.replace(/\\/g, '/'))
  const drive = /^[a-zA-Z]:/.exec(path)?.[0] ?? ''
  for (const part of path.replace(/\\/g, '/').replace(/^[a-zA-Z]:/, '').split('/')) {
    if (!part || part === '.') continue
    if (part === '..' && parts.length > 0 && parts[parts.length - 1] !== '..') parts.pop()
    else parts.push(part)
  }
  return `${drive}${absolute ? '/' : ''}${parts.join('/')}`
}

export const dirnameOf = (path: string) => {
  const normal = normalizePath(path)
  const cut = normal.lastIndexOf('/')
  return cut < 0 ? '' : cut === 0 ? '/' : normal.slice(0, cut)
}

export const basenameOf = (path: string) => normalizePath(path).split('/').pop() ?? path

export const joinPath = (dir: string, rel: string) => normalizePath(dir ? `${dir}/${rel}` : rel)

/** `file` as a path from `fromDir` (both absolute, or both from the same place): "../Other/c.imudist" */
export function relativePath(fromDir: string, file: string): string {
  const from = normalizePath(fromDir).split('/').filter(Boolean)
  const to = normalizePath(file).split('/').filter(Boolean)
  let common = 0
  while (common < from.length && common < to.length - 1 && from[common].toLowerCase() === to[common].toLowerCase()) common++
  return [...from.slice(common).map(() => '..'), ...to.slice(common)].join('/')
}

/** a chapter's path is usable: from the book's folder, not absolute, no empty name */
export const isChapterPath = (path: string) => !!path && !/^([a-zA-Z]:)?[\\/]/.test(path) && normalizePath(path) !== ''

// ── reading ────────────────────────────────────────────────────────────────────

/**
 * Reads a book file. Strict about the shape (a file that is not a book is refused), forgiving about the contents: a chapter
 * entry that cannot be used is left out, two chapters with one id get a new one, and numbers that make no sense are replaced.
 */
export function parseBook(text: string): BookFile {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new BookFormatError(t('הקובץ אינו קובץ ספר תקין.'))
  }
  const root = data as Record<string, unknown> | null
  if (!root || typeof root !== 'object' || root.format !== 'imubook') throw new BookFormatError(t('הקובץ אינו קובץ ספר של Imudist.'))
  if (typeof root.version === 'number' && root.version > 1) throw new BookFormatError(t('הספר נשמר בגרסה חדשה יותר של התוכנה.'))
  const settings = (root.settings && typeof root.settings === 'object' ? root.settings : {}) as Record<string, unknown>
  const startPage = typeof settings.startPage === 'number' && Number.isFinite(settings.startPage) ? Math.round(settings.startPage) : 1
  const chapterStart: ChapterStart = settings.chapterStart === 'odd' || settings.chapterStart === 'even' ? settings.chapterStart : 'any'
  const used = new Set<string>()
  const chapters: BookChapter[] = []
  for (const entry of Array.isArray(root.chapters) ? root.chapters : []) {
    const item = entry as Record<string, unknown> | null
    if (!item || typeof item.path !== 'string' || !isChapterPath(item.path)) continue
    let id = typeof item.id === 'string' && item.id ? item.id : newChapterId()
    if (used.has(id)) id = newChapterId()
    used.add(id)
    chapters.push({ id, path: normalizePath(item.path) })
  }
  const styleSourceId = typeof settings.styleSourceId === 'string' && chapters.some((chapter) => chapter.id === settings.styleSourceId) ? settings.styleSourceId : null
  return {
    format: 'imubook',
    version: 1,
    title: typeof root.title === 'string' && root.title.trim() ? root.title : t('ספר ללא שם'),
    settings: { startPage, chapterStart, styleSourceId },
    chapters,
  }
}

/** What the book needs to know about a chapter without opening it as a document. */
export interface ChapterInfo {
  name: string
  pages: number
  /** the chapter's own first page number, as saved in it */
  startPage: number
}

/** Reads the name and the page count of a document file: the settings only, not the pages. */
export function readChapterInfo(text: string): ChapterInfo {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new BookFormatError(t('הקובץ אינו מסמך תקין.'))
  }
  const root = data as { format?: unknown; settings?: Record<string, unknown> } | null
  if (!root || root.format !== 'imudist' || !root.settings) throw new BookFormatError(t('הקובץ אינו מסמך של Imudist.'))
  const pages = root.settings.pages
  if (typeof pages !== 'number' || !Number.isFinite(pages) || pages < 0) throw new BookFormatError(t('במסמך אין מספר עמודים תקין.'))
  const startPage = root.settings.startPage
  return {
    name: typeof root.settings.name === 'string' ? root.settings.name : '',
    pages: Math.round(pages),
    startPage: typeof startPage === 'number' && Number.isFinite(startPage) ? Math.round(startPage) : 1,
  }
}

// ── numbering ──────────────────────────────────────────────────────────────────

export interface ChapterNumbering {
  id: string
  pages: number | null
  /** the number of the chapter's first and last page in the book; null where an earlier chapter's size is not known */
  startPage: number | null
  endPage: number | null
  /** pages the book leaves blank in front of this chapter so that it begins on the kind of page the settings ask for */
  skipped: number
}

export interface BookNumbering {
  chapters: ChapterNumbering[]
  /** pages of the whole book, the blank ones included - of the chapters whose size is known */
  totalPages: number
  /** every chapter's size is known */
  complete: boolean
}

const parityOf = (page: number) => ((page % 2) + 2) % 2

/**
 * The numbers every chapter's pages get in the book, from the first page's number on: each chapter begins on the page after
 * the one before ended (skipping one when the settings want an odd or an even page). A chapter whose size is not known (its
 * file is missing) leaves the chapters after it without numbers: where they begin is not known.
 */
export function computeBookNumbering(chapters: { id: string; pages: number | null }[], settings: Pick<BookSettings, 'startPage' | 'chapterStart'>): BookNumbering {
  let next: number | null = settings.startPage
  let total = 0
  let complete = true
  const out: ChapterNumbering[] = []
  for (const chapter of chapters) {
    if (next === null) {
      out.push({ id: chapter.id, pages: chapter.pages, startPage: null, endPage: null, skipped: 0 })
      if (chapter.pages === null) complete = false
      else total += chapter.pages
      continue
    }
    let start: number = next
    let skipped = 0
    const wanted = settings.chapterStart === 'odd' ? 1 : settings.chapterStart === 'even' ? 0 : null
    // the first chapter begins where the book does: that number is the user's choice
    if (wanted !== null && out.length > 0 && parityOf(start) !== wanted) {
      start++
      skipped = 1
    }
    if (chapter.pages === null) {
      out.push({ id: chapter.id, pages: null, startPage: start, endPage: null, skipped })
      complete = false
      next = null
      continue
    }
    total += chapter.pages + skipped
    out.push({ id: chapter.id, pages: chapter.pages, startPage: start, endPage: chapter.pages > 0 ? start + chapter.pages - 1 : start - 1, skipped })
    next = start + chapter.pages
  }
  return { chapters: out, totalPages: total, complete }
}
