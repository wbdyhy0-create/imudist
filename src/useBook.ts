import { useEffect, useMemo, useRef, useState } from 'react'
import { BookFormatError, computeBookNumbering, newBook, newChapterId, normalizePath, parseBook, readChapterInfo, serializeBook, type BookChapter, type BookFile, type BookSettings, type ChapterInfo } from './book'
import { planContentSync, styleSetOf, syncContent, syncText, withStartPage } from './bookOps'
import { reportCount, type StyleSet, type SyncReport } from './bookStyles'
import { exportBookPdf, type BookExportChapter, type BookExportProgress } from './bookExport'
import { bookLevelIssues, type BookCheck, type ChapterCheck } from './bookPreflight'
import { createBookFile, openBookFile, type BookStorage, type ChapterRef } from './bookStorage'
import { baseName } from './fileio'
import { fontInstalled, useFontCatalog } from './fonts'
import { resolveLinkedAssets } from './imageLinks'
import { exportContentOf, prepareExport, type PageDrawOptions } from './pdfExport'
import { runPreflight, type PreflightIssue } from './preflight'
import { parseDocument } from './fileFormat'
import type { DocContent } from './pages'
import { t } from './i18n'

export type ChapterStatus = 'loading' | 'ok' | 'missing' | 'error'

/** What is known about one chapter's file right now. */
export interface ChapterState {
  status: ChapterStatus
  info: ChapterInfo | null
  message?: string
  /** when its file was last changed (milliseconds), where that can be told */
  modified?: number | null
}

/** One chapter in the list of what a style sync would do. */
export interface SyncRow {
  chapterId: string
  name: string
  /** `changes`: it would be changed; `current`: it is in line already; `error`: it could not be read */
  status: 'changes' | 'current' | 'error'
  report?: SyncReport
  /** the chapter is open as a document: it is changed there (and left for the user to save) */
  open: boolean
  message?: string
}

export interface SyncPlan {
  masterName: string
  rows: SyncRow[]
}

/** A document that is open in the program, as the book needs to see it. */
interface OpenFile {
  id: number
  file: { handle: FileSystemFileHandle | null; path?: string } | null
  dirty: boolean
}

interface Options {
  /** open a chapter as an ordinary document (a tab) */
  openChapter: (ref: ChapterRef) => Promise<void>
  notify: (message: string) => void
  showError: (title: string, error: unknown) => void
  /** the documents that are open now, with their files */
  openFiles: () => OpenFile[]
  contentOf: (id: number) => DocContent | null
  /** change an open document (as one undo step) */
  changeDoc: (id: number, next: (content: DocContent) => DocContent) => void
  /** bring an open document to the front */
  switchTo: (id: number) => void
  /** show a problem of the preflight check in the document shown (false: that document is not shown yet) */
  goToIssue: (docId: number, issue: PreflightIssue) => boolean
}

const isMissing = (error: unknown) => (error instanceof DOMException && error.name === 'NotFoundError') || /not found|no such file|cannot find|os error (2|3)\b/i.test(String(error))
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** whether two references are the same file */
async function sameFile(a: ChapterRef, b: { handle: FileSystemFileHandle | null; path?: string }): Promise<boolean> {
  if (a.path && b.path) return normalizePath(a.path).toLowerCase() === normalizePath(b.path).toLowerCase()
  if (a.handle && b.handle) {
    try {
      return await a.handle.isSameEntry(b.handle)
    } catch {
      return false
    }
  }
  return false
}

/**
 * The open book: its file, its chapters and what is known about each one's file, and the actions of the Book panel. The
 * book file is written after every change (it holds only the list and the settings, so it is small and nothing is lost by
 * writing it often). The chapters are only read, except by the two actions the user asks for by name - updating the page
 * numbers and syncing the styles - which change a chapter that is open right where it is open (for the user to save) and a
 * chapter that is not open in its file.
 */
export function useBook(options: Options) {
  const { openChapter, notify, showError } = options
  const [book, setBook] = useState<BookFile | null>(null)
  const [storage, setStorage] = useState<BookStorage | null>(null)
  const [states, setStates] = useState<Record<string, ChapterState>>({})
  const [panelOpen, setPanelOpen] = useState(false)
  /** the document files of the book's folder to choose chapters from (browsers have no dialog for that) */
  const [candidates, setCandidates] = useState<string[] | null>(null)
  /** the chapter that the files in `candidates` are offered to replace the file of (null: they are offered to be added) */
  const [relinking, setRelinking] = useState<string | null>(null)
  /** the chapters whose file was changed elsewhere while the chapter is open with changes of its own */
  const [conflicts, setConflicts] = useState<string[]>([])
  /** when each chapter's file was last seen to change, to notice a change made elsewhere */
  const knownModified = useRef(new Map<string, number | null>())
  const [syncPlan, setSyncPlan] = useState<SyncPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [check, setCheck] = useState<BookCheck | null>(null)
  const [checkProgress, setCheckProgress] = useState<{ done: number; total: number; title: string } | null>(null)
  const fontCatalog = useFontCatalog()
  const fontAvailable = useMemo(() => {
    const installed = fontCatalog.status === 'system' ? new Set(fontCatalog.families.map((family) => family.family.toLowerCase())) : null
    return (family: string) => !!installed?.has(family.toLowerCase()) || fontInstalled(family)
  }, [fontCatalog])
  const [exportProgress, setExportProgress] = useState<(BookExportProgress & { title: string }) | null>(null)
  const latest = useRef({ book, storage, options, conflicts })
  latest.current = { book, storage, options, conflicts }
  const readToken = useRef(0)
  /** the styles of the master as they were when the plan was made: what the sync then writes */
  const planMaster = useRef<StyleSet | null>(null)

  /** read the size and name of every chapter's file again */
  const refresh = async (of: BookFile | null = latest.current.book, from: BookStorage | null = latest.current.storage) => {
    if (!of || !from) return
    const token = ++readToken.current
    setStates((current) => Object.fromEntries(of.chapters.map((chapter) => [chapter.id, current[chapter.id]?.info ? { ...current[chapter.id], status: 'loading' as const } : { status: 'loading' as const, info: null }])))
    const found: string[] = []
    const results = await Promise.all(
      of.chapters.map(async (chapter): Promise<[string, ChapterState]> => {
        try {
          const read = await from.readFile(chapter.path)
          // changed since the last look, while the chapter is open with unsaved changes: saving it would write over that
          const known = knownModified.current.get(chapter.id)
          if (known !== undefined && read.modified !== null && known !== read.modified && (await openDocOf(chapter))?.dirty) found.push(chapter.id)
          knownModified.current.set(chapter.id, read.modified)
          return [chapter.id, { status: 'ok', info: readChapterInfo(read.text), modified: read.modified }]
        } catch (e) {
          if (isMissing(e)) return [chapter.id, { status: 'missing', info: null, message: t('הקובץ לא נמצא') }]
          return [chapter.id, { status: 'error', info: null, message: e instanceof BookFormatError ? e.message : messageOf(e) }]
        }
      }),
    )
    if (token !== readToken.current) return
    setStates(Object.fromEntries(results))
    // a warning stays while the chapter is still open with changes, and goes when it is saved or closed
    const stillOpen: string[] = []
    for (const id of new Set([...latest.current.conflicts, ...found])) {
      const chapter = of.chapters.find((item) => item.id === id)
      if (chapter && (await openDocOf(chapter))?.dirty) stillOpen.push(id)
    }
    setConflicts(stillOpen)
  }

  // coming back to the app after the chapters were saved elsewhere: their sizes may have changed
  useEffect(() => {
    if (!book) return
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh reads the latest book through a ref
  }, [!!book])

  const adopt = (next: BookFile, from: BookStorage) => {
    setBook(next)
    setStorage(from)
    setPanelOpen(true)
    setSyncPlan(null)
    setCheck(null)
    setConflicts([])
    knownModified.current.clear()
    void refresh(next, from)
  }

  /** change the book and write its file */
  const commit = async (next: BookFile) => {
    setBook(next)
    const from = latest.current.storage
    if (!from) return
    try {
      await from.writeText(from.bookFileName, serializeBook(next))
    } catch (e) {
      showError(t('לא ניתן לשמור את הספר'), e)
    }
  }

  const create = async () => {
    try {
      const fresh = newBook(t('ספר חדש'))
      const from = await createBookFile(fresh)
      if (from) adopt(fresh, from)
    } catch (e) {
      showError(t('לא ניתן ליצור ספר'), e)
    }
  }

  const open = async () => {
    try {
      const picked = await openBookFile()
      if (picked) adopt(parseBook(picked.text), picked.storage)
    } catch (e) {
      showError(t('לא ניתן לפתוח את הספר'), e)
    }
  }

  const close = () => {
    readToken.current++
    setBook(null)
    setStorage(null)
    setStates({})
    setCandidates(null)
    setRelinking(null)
    setSyncPlan(null)
    setCheck(null)
    setConflicts([])
    knownModified.current.clear()
  }

  /** put these files (paths from the book's folder) at the end of the book, except those already in it */
  const addPaths = async (paths: string[]) => {
    const current = latest.current.book
    if (!current) return
    const have = new Set(current.chapters.map((chapter) => chapter.path.toLowerCase()))
    const fresh = paths.filter((path) => !have.has(path.toLowerCase()))
    setCandidates(null)
    if (fresh.length === 0) return
    const next = { ...current, chapters: [...current.chapters, ...fresh.map((path) => ({ id: newChapterId(), path }))] }
    await commit(next)
    void refresh(next)
  }

  /** a different file for a chapter whose file is gone (or moved): the book keeps the chapter's place, number and the rest */
  const relinkTo = async (id: string, path: string) => {
    const current = latest.current.book
    setCandidates(null)
    setRelinking(null)
    if (!current) return
    const taken = current.chapters.some((chapter) => chapter.id !== id && chapter.path.toLowerCase() === path.toLowerCase())
    if (taken) {
      notify(t('הקובץ הזה כבר פרק אחר בספר'))
      return
    }
    knownModified.current.delete(id)
    const next = { ...current, chapters: current.chapters.map((chapter) => (chapter.id === id ? { ...chapter, path } : chapter)) }
    await commit(next)
    void refresh(next)
  }

  const relinkChapter = async (id: string) => {
    const from = latest.current.storage
    if (!from) return
    try {
      if (from.pickChapters) {
        const picked = await from.pickChapters()
        if (picked?.[0]) await relinkTo(id, picked[0])
      } else if (from.listChapters) {
        const used = new Set((latest.current.book?.chapters ?? []).filter((chapter) => chapter.id !== id).map((chapter) => chapter.path.toLowerCase()))
        const found = (await from.listChapters()).filter((path) => !used.has(path.toLowerCase()))
        if (found.length === 0) notify(t('בתיקיית הספר אין מסמך אחר שאפשר לקשר אליו'))
        else {
          setRelinking(id)
          setCandidates(found)
        }
      }
    } catch (e) {
      showError(t('לא ניתן לקשר את הפרק'), e)
    }
  }

  /** the picker is confirmed: the files chosen are added to the book, or (when relinking) the one chosen replaces the chapter's file */
  const confirmCandidates = async (paths: string[]) => {
    if (relinking) {
      if (paths[0]) await relinkTo(relinking, paths[0])
      return
    }
    await addPaths(paths)
  }

  /** document files dropped on the book panel: those under the book's folder become chapters */
  const dropFiles = async (files: { handles?: FileSystemFileHandle[]; paths?: string[] }) => {
    const from = latest.current.storage
    if (!from) return
    const paths: string[] = []
    let outside = 0
    for (const handle of files.handles ?? []) {
      const path = await from.chapterPathOfHandle?.(handle)
      if (path) paths.push(path)
      else outside++
    }
    if (files.paths && from.chapterPathsOf) paths.push(...from.chapterPathsOf(files.paths))
    if (outside > 0) notify(t('קובץ שנגרר לא נמצא בתיקיית הספר, ולכן לא נוסף. העבר אותו לתיקייה ואז הוסף אותו.'))
    if (paths.length > 0) await addPaths(paths)
  }

  const addChapters = async () => {
    const from = latest.current.storage
    if (!from) return
    try {
      if (from.pickChapters) {
        const picked = await from.pickChapters()
        if (picked) await addPaths(picked)
      } else if (from.listChapters) {
        const have = new Set((latest.current.book?.chapters ?? []).map((chapter) => chapter.path.toLowerCase()))
        const found = (await from.listChapters()).filter((path) => !have.has(path.toLowerCase()))
        if (found.length === 0) notify(t('אין בתיקיית הספר מסמכים נוספים שאפשר להוסיף'))
        else setCandidates(found)
      }
    } catch (e) {
      showError(t('לא ניתן להוסיף פרקים'), e)
    }
  }

  const removeChapter = (id: string) => {
    const current = latest.current.book
    if (!current) return
    void commit({
      ...current,
      chapters: current.chapters.filter((chapter) => chapter.id !== id),
      settings: current.settings.styleSourceId === id ? { ...current.settings, styleSourceId: null } : current.settings,
    })
  }

  /** move a chapter to the place with this index (in the list as it will be after the move) */
  const moveChapter = (id: string, to: number) => {
    const current = latest.current.book
    if (!current) return
    const from = current.chapters.findIndex((chapter) => chapter.id === id)
    if (from < 0) return
    const target = Math.max(0, Math.min(current.chapters.length - 1, to))
    if (target === from) return
    const chapters = current.chapters.slice()
    chapters.splice(target, 0, chapters.splice(from, 1)[0])
    void commit({ ...current, chapters })
  }

  const setTitle = (title: string) => {
    const current = latest.current.book
    if (current && title.trim() && title !== current.title) void commit({ ...current, title })
  }

  const setSettings = (patch: Partial<BookSettings>) => {
    const current = latest.current.book
    if (current) void commit({ ...current, settings: { ...current.settings, ...patch } })
  }

  const openChapterById = async (id: string) => {
    const current = latest.current
    const chapter = current.book?.chapters.find((item) => item.id === id)
    if (!chapter || !current.storage) return
    try {
      const already = await openDocOf(chapter)
      if (already) current.options.switchTo(already.id)
      else await openChapter(await current.storage.chapterRef(chapter.path))
    } catch (e) {
      showError(t('לא ניתן לפתוח את הפרק'), e)
    }
  }

  const numbering = useMemo(
    () => (book ? computeBookNumbering(book.chapters.map((chapter) => ({ id: chapter.id, pages: states[chapter.id]?.info?.pages ?? null })), book.settings) : null),
    [book, states],
  )

  /** the chapters whose saved first page number is not the one the book gives them */
  const staleNumbers = useMemo(
    () => (book && numbering ? book.chapters.flatMap((chapter, index) => {
      const wanted = numbering.chapters[index]?.startPage
      const have = states[chapter.id]?.info?.startPage
      return wanted != null && have !== undefined && wanted !== have ? [chapter.id] : []
    }) : []),
    [book, numbering, states],
  )

  // ── what changes the chapters ────────────────────────────────────────────────

  /** the open document that is this chapter, if there is one */
  const openDocOf = async (chapter: BookChapter): Promise<OpenFile | null> => {
    const { storage: from, options: host } = latest.current
    if (!from) return null
    const ref = await from.chapterRef(chapter.path)
    for (const doc of host.openFiles()) if (doc.file && (await sameFile(ref, doc.file))) return doc
    return null
  }

  /** the chapter's content: as it is in its open document, or read from its file */
  const contentOfChapter = async (chapter: BookChapter): Promise<{ content: DocContent; open: OpenFile | null }> => {
    const { storage: from, options: host } = latest.current
    const open = await openDocOf(chapter)
    const live = open ? host.contentOf(open.id) : null
    if (live) return { content: live, open }
    return { content: parseDocument(await from!.readText(chapter.path), baseName(chapter.path.split('/').pop() ?? chapter.path)), open: null }
  }

  /** give every chapter the first page number the book works out for it */
  const updateNumbering = async () => {
    const { book: current, storage: from, options: host } = latest.current
    if (!current || !from || !numbering) return
    setBusy(true)
    let changed = 0
    let inMemory = 0
    try {
      for (const [index, chapter] of current.chapters.entries()) {
        const wanted = numbering.chapters[index]?.startPage
        if (wanted == null) continue
        const open = await openDocOf(chapter)
        if (open) {
          const live = host.contentOf(open.id)
          if (live && live.doc.startPage !== wanted) {
            host.changeDoc(open.id, (content) => ({ ...content, doc: { ...content.doc, startPage: wanted } }))
            changed++
            inMemory++
          }
          // a clean open chapter is still the file's: write the file too, so the book and the chapter agree on disk
          if (!open.dirty && states[chapter.id]?.info?.startPage !== wanted) {
            const next = withStartPage(await from.readText(chapter.path), wanted)
            if (next !== null) {
              await from.writeText(chapter.path, next)
              knownModified.current.delete(chapter.id)
            }
          }
          continue
        }
        const next = withStartPage(await from.readText(chapter.path), wanted)
        if (next !== null) {
          await from.writeText(chapter.path, next)
          knownModified.current.delete(chapter.id)
          changed++
        }
      }
      notify(changed === 0 ? t('המספור כבר מעודכן בכל הפרקים') : inMemory > 0 ? t('המספור עודכן ב-{changed} פרקים. {inMemory} מהם פתוחים: שמור אותם כדי שהשינוי יישמר בקובץ', { changed, inMemory }) : t('המספור עודכן ב-{changed} פרקים', { changed }))
    } catch (e) {
      showError(t('לא ניתן לעדכן את המספור'), e)
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  /** the title a chapter goes by: the name in its file, else its file's name */
  const titleOfChapter = (chapter: BookChapter) => states[chapter.id]?.info?.name || chapter.path.split('/').pop()!.replace(/\.[^.]*$/, '')

  /**
   * The preflight check of the whole book: each chapter is laid out as it would be exported and checked the way a single
   * document is (text that does not fit, things off the page, missing fonts and pictures), then what is wrong with the book
   * itself is added (a chapter that is missing, numbers and styles that are out of line).
   */
  const runCheck = async () => {
    const { book: current } = latest.current
    if (!current || !numbering) return
    setBusy(true)
    try {
      const masterChapter = current.chapters.find((chapter) => chapter.id === current.settings.styleSourceId)
      let masterSet: StyleSet | null = null
      if (masterChapter && states[masterChapter.id]?.status === 'ok') {
        try {
          masterSet = styleSetOf((await contentOfChapter(masterChapter)).content)
        } catch {
          masterSet = null
        }
      }
      const chapters: ChapterCheck[] = []
      const styleReports: Record<string, ReturnType<typeof planContentSync> | undefined> = {}
      for (const [index, chapter] of current.chapters.entries()) {
        const title = titleOfChapter(chapter)
        setCheckProgress({ done: index, total: current.chapters.length, title })
        const state = states[chapter.id]
        if (state?.status === 'missing' || state?.status === 'error') {
          chapters.push({ chapterId: chapter.id, title, issues: [], error: state.message })
          continue
        }
        try {
          const { content, open } = await contentOfChapter(chapter)
          if (!open) await resolveLinkedAssets(content.assets)
          if (masterSet) styleReports[chapter.id] = planContentSync(content, masterSet)
          // laid out as it is exported, with the page numbers the book gives it
          const prepared = prepareExport({ ...content, doc: { ...content.doc, startPage: numbering.chapters[index]?.startPage ?? content.doc.startPage } })
          const issues = runPreflight({
            doc: prepared.content.doc,
            frames: prepared.content.frames,
            images: prepared.content.images,
            shapes: prepared.content.shapes,
            assets: prepared.content.assets,
            flows: prepared.flows,
            pageRects: prepared.rects,
            isFontAvailable: fontAvailable,
          })
          chapters.push({ chapterId: chapter.id, title, issues })
        } catch (e) {
          chapters.push({ chapterId: chapter.id, title, issues: [], error: messageOf(e) })
        }
        // let the screen breathe between chapters: laying one out is heavy
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
      const bookIssues = bookLevelIssues({
        chapters: current.chapters.map((chapter) => ({ id: chapter.id, title: titleOfChapter(chapter) })),
        states: Object.fromEntries(current.chapters.map((chapter) => [chapter.id, states[chapter.id] ? { status: states[chapter.id].status, message: states[chapter.id].message, startPage: states[chapter.id].info?.startPage } : undefined])),
        numbering: numbering.chapters,
        styleReports,
        masterId: current.settings.styleSourceId,
      })
      setCheck({ at: Date.now(), chapters, bookIssues })
    } catch (e) {
      showError(t('בדיקת התקינות נכשלה'), e)
    } finally {
      setBusy(false)
      setCheckProgress(null)
    }
  }

  /** open the place of a problem found in a chapter: the chapter is opened (or brought to the front) and the problem shown in it */
  const openIssue = async (chapterId: string, issue: PreflightIssue) => {
    const { book: current, options: host } = latest.current
    const chapter = current?.chapters.find((item) => item.id === chapterId)
    if (!chapter) return
    try {
      let doc = await openDocOf(chapter)
      if (doc) host.switchTo(doc.id)
      else {
        await openChapterById(chapterId)
        // the new tab shows up a moment later
        for (let attempt = 0; attempt < 40 && !doc; attempt++) {
          doc = await openDocOf(chapter)
          if (!doc) await new Promise((resolve) => setTimeout(resolve, 100))
        }
      }
      if (!doc) return
      // its workspace needs a moment to be there
      for (let attempt = 0; attempt < 60; attempt++) {
        if (host.goToIssue(doc.id, issue)) return
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    } catch (e) {
      showError(t('לא ניתן לפתוח את הפרק'), e)
    }
  }

  /** the whole book as one PDF (`viewWindow`: a window opened from the click that asked for it) */
  const runExport = async (options: PageDrawOptions, viewWindow: Window | null): Promise<boolean> => {
    const { book: current } = latest.current
    if (!current || !numbering) return false
    if (!numbering.complete) {
      viewWindow?.close()
      notify(t('אי אפשר לייצא: הקובץ של אחד הפרקים חסר או לא נקרא'))
      return false
    }
    setBusy(true)
    try {
      const chapters: BookExportChapter[] = current.chapters.map((chapter, index) => ({
        title: states[chapter.id]?.info?.name || chapter.path.split('/').pop()!.replace(/\.[^.]*$/, ''),
        startPage: numbering.chapters[index].startPage!,
        skipped: numbering.chapters[index].skipped,
        load: async () => {
          const { content, open } = await contentOfChapter(chapter)
          // a chapter read from its file gets its linked pictures from theirs
          if (!open) await resolveLinkedAssets(content.assets)
          // with its parent (master) pages mixed in - page numbers and running headers - and the first page number the book gives it
          return exportContentOf({ ...content, doc: { ...content.doc, startPage: numbering.chapters[index].startPage! } })
        },
      }))
      const done = await exportBookPdf(chapters, options, current.title.replace(/[\\/:*?"<>|]/g, '_').trim() || t('ספר'), (progress) => setExportProgress({ ...progress, title: chapters[progress.chapter - 1].title }), viewWindow)
      if (done) {
        // when the text was to be written as text, the dialog stays to say what became of each frame (it closes itself then)
        if (!options.vectorReport) setExportOpen(false)
        notify(t('הספר יוצא ל-PDF'))
      } else viewWindow?.close()
      return done
    } catch (e) {
      viewWindow?.close()
      showError(t('הייצוא נכשל'), e)
      return false
    } finally {
      setBusy(false)
      setExportProgress(null)
    }
  }

  const setStyleSource = (id: string | null) => {
    const current = latest.current.book
    if (!current) return
    void commit({ ...current, settings: { ...current.settings, styleSourceId: current.settings.styleSourceId === id ? null : id } })
  }

  /** find out what a style sync would change in each chapter, and show it (nothing is changed yet) */
  const planSync = async () => {
    const current = latest.current.book
    if (!current) return
    const master = current.chapters.find((chapter) => chapter.id === current.settings.styleSourceId)
    if (!master) {
      notify(t('סמן קודם פרק כמקור הסגנונות (הכוכב בשורת הפרק)'))
      return
    }
    setBusy(true)
    try {
      const source = await contentOfChapter(master)
      if (source.open?.dirty) notify(t('מסמך המקור פתוח עם שינויים שלא נשמרו: הסנכרון ישתמש בגרסה הנוכחית שלו, כולל השינויים'))
      const set = styleSetOf(source.content)
      planMaster.current = set
      const rows: SyncRow[] = []
      for (const chapter of current.chapters) {
        if (chapter.id === master.id) continue
        const name = states[chapter.id]?.info?.name || chapter.path.split('/').pop()!.replace(/\.[^.]*$/, '')
        try {
          const target = await contentOfChapter(chapter)
          const report = planContentSync(target.content, set)
          rows.push({ chapterId: chapter.id, name, status: reportCount(report) === 0 ? 'current' : 'changes', report, open: !!target.open })
        } catch (e) {
          rows.push({ chapterId: chapter.id, name, status: 'error', open: false, message: isMissing(e) ? t('הקובץ לא נמצא') : messageOf(e) })
        }
      }
      setSyncPlan({ masterName: states[master.id]?.info?.name || master.path, rows })
    } catch (e) {
      showError(t('לא ניתן לקרוא את מסמך המקור'), e)
    } finally {
      setBusy(false)
    }
  }

  /** do the sync that was shown: the open chapters are changed where they are open, the others in their files */
  const applySync = async () => {
    const { book: current, storage: from, options: host } = latest.current
    const set = planMaster.current
    if (!current || !from || !set || !syncPlan) return
    setBusy(true)
    let done = 0
    let open = 0
    const failed: string[] = []
    try {
      for (const row of syncPlan.rows) {
        if (row.status !== 'changes') continue
        const chapter = current.chapters.find((item) => item.id === row.chapterId)
        if (!chapter) continue
        try {
          const doc = await openDocOf(chapter)
          if (doc) {
            host.changeDoc(doc.id, (content) => syncContent(content, set).content)
            open++
          } else {
            const { text } = syncText(await from.readText(chapter.path), set, baseName(chapter.path.split('/').pop() ?? chapter.path))
            if (text !== null) {
              await from.writeText(chapter.path, text)
              knownModified.current.delete(chapter.id)
            }
          }
          done++
        } catch (e) {
          failed.push(`${row.name}: ${messageOf(e)}`)
        }
      }
      setSyncPlan(null)
      planMaster.current = null
      if (failed.length > 0) showError(t('הסנכרון לא הושלם בכל הפרקים'), new Error(failed.join('\n')))
      notify(open ? t('הסגנונות סונכרנו ב-{done} פרקים. {open} מהם פתוחים: שמור אותם כדי שהשינוי יישמר בקובץ', { done, open }) : t('הסגנונות סונכרנו ב-{done} פרקים', { done }))
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  return {
    book,
    storage,
    states,
    numbering,
    staleNumbers,
    panelOpen,
    setPanelOpen,
    candidates,
    relinking,
    cancelCandidates: () => {
      setCandidates(null)
      setRelinking(null)
    },
    confirmCandidates,
    relinkChapter,
    dropFiles,
    conflicts,
    dismissConflict: (id: string) => setConflicts((list) => list.filter((item) => item !== id)),
    syncPlan,
    cancelSync: () => setSyncPlan(null),
    busy,
    check,
    checkProgress,
    runCheck,
    openIssue,
    exportOpen,
    setExportOpen,
    exportProgress,
    runExport,
    create,
    open,
    close,
    refresh: () => void refresh(),
    addChapters,
    addPaths,
    removeChapter,
    moveChapter,
    setTitle,
    setSettings,
    setStyleSource,
    openChapter: openChapterById,
    updateNumbering,
    planSync,
    applySync,
  }
}

export type BookController = ReturnType<typeof useBook>
