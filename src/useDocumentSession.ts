import { useEffect, useRef, useState } from 'react'
import type { ModalSpec } from './components/Modal'
import type { DocSettings, Guide, ImageFrame, ShapeFrame, TextFrame } from './document'
import { FileFormatError, parseDocument, serializeDocument } from './fileFormat'
import {
  baseName,
  downloadText,
  ensureReadPermission,
  fileNameFor,
  hasFilePicker,
  openWithInput,
  openWithPicker,
  saveWithPicker,
  writeToHandle,
  type FileRef,
} from './fileio'
import { COALESCE_MS, changeHistory, newHistory, redoHistory, replaceHistory, undoHistory, type History } from './history'
import { applySettings, deletePages, insertPages, movePage, type DocContent } from './pages'
import { emptyPrimaryFrameIds, withPrimaryFrames } from './placeText'
import { addRecent, listRecent, removeRecent, type RecentEntry } from './recent'

const NO_FRAMES: TextFrame[] = []
const NO_IMAGES: ImageFrame[] = []
const NO_ASSETS = {}
const NO_GUIDES: Guide[] = []
const NO_SHAPES: ShapeFrame[] = []

const messageOf = (e: unknown) => (e instanceof Error && e.message ? e.message : 'שגיאה לא צפויה.')

/** Extras of a settings change. */
export interface SetupOptions {
  /** also delete the empty text frames that were made on the margins automatically (when the user switches to manual frames) */
  dropEmptyFrames?: boolean
}

/** Operations on the pages and content of the open document. Each one is a single undo step. */
export interface PageOps {
  /** `beside`: the new pages join the row of the page before them */
  insert: (at: number, count: number, beside?: boolean) => void
  remove: (indices: number[]) => void
  move: (from: number, to: number) => void
  /** replace the document's settings (Document Setup); `coalesceKey`: repeated calls with it become one undo step */
  setup: (next: DocSettings, coalesceKey?: string, options?: SetupOptions) => void
  /** change several parts of the content at once (e.g. placing a long text that added pages and frames, or a picture) */
  commit: (patch: Partial<DocContent>) => void
}

/** What the workspace remembers of a document while another one is shown. */
export interface TabView {
  zoom: number
  /** the world point in the middle of the window */
  cx: number
  cy: number
}

/** One open document: its content with undo history, the file it lives in and what was last written to disk. */
interface OpenDoc {
  id: number
  h: History<DocContent>
  file: FileRef | null
  /** the content that was last written to disk: the document is "modified" while it is a different object */
  saved: DocContent
  /** bumps when the document is reloaded in place (revert), so its view starts fresh */
  rev: number
  /** the key and time of the last change, to merge quick repeated changes into one undo step */
  last: { key: string; at: number } | null
  /** where the view was when the document was left */
  view: TabView | null
}

/** A tab of the open documents. */
export interface DocTab {
  id: number
  name: string
  dirty: boolean
}

/**
 * Everything about the open documents: for each its settings and content with an undo history, the file it lives in,
 * whether it has unsaved changes; plus the open / save / close actions (with the "save changes?" questions).
 * Several documents can be open at once (tabs); every action works on the active one unless it is given an id.
 */
export function useDocumentSession() {
  const [docs, setDocs] = useState<OpenDoc[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const nextId = useRef(1)
  const [modal, setModal] = useState<ModalSpec | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [recent, setRecent] = useState<RecentEntry[]>([])
  const toastTimer = useRef<number | undefined>(undefined)

  const active = docs.find((d) => d.id === activeId) ?? null
  const state = active?.h.present ?? null
  const doc = state?.doc ?? null
  const frames = state?.frames ?? NO_FRAMES
  const images = state?.images ?? NO_IMAGES
  const assets = state?.assets ?? NO_ASSETS
  const guides = state?.guides ?? NO_GUIDES
  const shapes = state?.shapes ?? NO_SHAPES
  const file = active?.file ?? null
  const dirty = !!active && active.saved !== active.h.present
  const anyDirty = docs.some((d) => d.saved !== d.h.present)

  // The newest values, for actions that finish after an await (a file dialog) or were created by an older render
  // (menus are memoized): they must never act on, or write back, an outdated document.
  const latest = useRef({ docs, activeId })
  latest.current = { docs, activeId }
  const entryOf = (id: number | null) => (id === null ? undefined : latest.current.docs.find((d) => d.id === id))
  const isDirty = (d: OpenDoc | undefined) => !!d && d.saved !== d.h.present

  /** change one open document (by id) */
  const update = (id: number, fn: (d: OpenDoc) => OpenDoc) => setDocs((list) => list.map((d) => (d.id === id ? fn(d) : d)))

  useEffect(() => {
    void listRecent().then(setRecent)
  }, [])

  // the browser asks before the tab is closed while there is unsaved work
  useEffect(() => {
    if (!anyDirty) return
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [anyDirty])

  const notify = (text: string) => {
    setToast(text)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }

  const fail = (title: string, e: unknown) =>
    setModal({ title, message: messageOf(e), buttons: [{ label: 'אישור', kind: 'primary', cancel: true, run: () => setModal(null) }] })

  // ── the active document's history ──────────────────────────────────────────────
  /** apply a change to the active document; changes with the same key in quick succession merge into one undo step */
  const change = (next: (prev: DocContent) => DocContent | null, key?: string) => {
    const id = latest.current.activeId
    if (id === null) return
    const now = Date.now()
    update(id, (d) => {
      // decided from the state (not from a ref) so React may safely run the updater more than once
      const merge = !!key && d.last?.key === key && now - d.last.at < COALESCE_MS
      const h = changeHistory(d.h, (prev) => next(prev) ?? prev, merge)
      return { ...d, h, last: key ? { key, at: now } : null }
    })
  }
  const undo = () => {
    const id = latest.current.activeId
    if (id !== null) update(id, (d) => ({ ...d, h: undoHistory(d.h), last: null }))
  }
  const redo = () => {
    const id = latest.current.activeId
    if (id !== null) update(id, (d) => ({ ...d, h: redoHistory(d.h), last: null }))
  }
  const history = {
    value: state,
    canUndo: !!active && active.h.past.length > 0,
    canRedo: !!active && active.h.future.length > 0,
    undo,
    redo,
  }

  // ── editing ────────────────────────────────────────────────────────────────────
  // Every change is a function of the newest content, so two changes in the same moment can't overwrite each other.
  /** the text frames changed (typing, dragging …); changes with the same key merge into one undo step */
  const changeFrames = (next: TextFrame[], key?: string) => change((s) => (next !== s.frames ? { ...s, frames: next } : s), key)
  const changeImages = (next: ImageFrame[], key?: string) => change((s) => (next !== s.images ? { ...s, images: next } : s), key)
  const changeShapes = (next: ShapeFrame[], key?: string) => change((s) => (next !== s.shapes ? { ...s, shapes: next } : s), key)
  const changeGuides = (next: Guide[], key?: string) => change((s) => (next !== s.guides ? { ...s, guides: next } : s), key)

  const pages: PageOps = {
    insert: (at, count, beside) =>
      change((s) => {
        const r = insertPages(s, at, count, beside)
        return r ? (r.doc.primaryTextFrame ? withPrimaryFrames(r, Array.from({ length: r.doc.pages - s.doc.pages }, (_, i) => at + i)) : r) : s
      }),
    remove: (indices) => change((s) => deletePages(s, indices) || s),
    move: (from, to) => change((s) => movePage(s, from, to) || s),
    setup: (next, key, options) =>
      change((s) => {
        // decided before the pages move: which empty margin frames there are now
        const drop = options?.dropEmptyFrames ? new Set(emptyPrimaryFrameIds(s.doc, s.frames)) : null
        const applied = applySettings(s, next)
        const r = drop && drop.size > 0 ? { ...applied, frames: applied.frames.filter((f) => !drop.has(f.id)) } : applied
        if (!next.primaryTextFrame) return r
        // turning the option on gives every page without a text frame one; otherwise only pages that were added
        return withPrimaryFrames(r, s.doc.primaryTextFrame ? Array.from({ length: Math.max(0, next.pages - s.doc.pages) }, (_, i) => s.doc.pages + i) : 'all')
      }, key),
    commit: (patch) => change((s) => ({ ...s, ...patch })),
  }

  // ── tabs ───────────────────────────────────────────────────────────────────────
  /** a document becomes a new tab and the active one */
  const addDoc = (content: DocContent, ref: FileRef | null) => {
    const id = nextId.current++
    setDocs((list) => [...list, { id, h: newHistory(content), file: ref, saved: content, rev: 0, last: null, view: null }])
    setActiveId(id)
  }
  const switchTo = (id: number) => {
    if (latest.current.docs.some((d) => d.id === id)) setActiveId(id)
  }
  /** the workspace tells where the view is, so it can be restored when the document is shown again */
  const rememberView = (id: number, view: TabView) => update(id, (d) => ({ ...d, view }))

  const tabs: DocTab[] = docs.map((d) => ({ id: d.id, name: d.h.present.doc.name, dirty: d.saved !== d.h.present }))

  const remember = (handle: FileSystemFileHandle | null) => {
    if (handle) void addRecent(handle).then(setRecent)
  }

  // ── saving ─────────────────────────────────────────────────────────────────────
  /** Save a document (the active one by default) to a file of the user's choice. `copy`: write a copy and keep working on the original. */
  const saveAs = async (copy = false, id: number | null = latest.current.activeId): Promise<boolean> => {
    const entry = entryOf(id)
    if (!entry || id === null) return false
    const start = entry.h.present // exactly what is written; edits made while the dialog is open stay "unsaved"
    const text = serializeDocument(start)
    try {
      if (!hasFilePicker) {
        const name = fileNameFor(start.doc.name)
        downloadText(name, text)
        if (!copy) update(id, (d) => ({ ...d, file: { name, handle: null }, saved: start }))
        notify(`הקובץ ${name} הורד לתיקיית ההורדות`)
        return true
      }
      const ref = await saveWithPicker(fileNameFor(start.doc.name), text)
      if (!ref) return false
      if (copy) {
        notify(`נשמר עותק: ${ref.name}`)
        return true
      }
      // the document takes its name from the file, like other desktop programs
      const name = baseName(ref.name)
      const rename = (s: DocContent): DocContent => (name && name !== s.doc.name ? { ...s, doc: { ...s.doc, name } } : s)
      const savedContent = rename(start)
      const now = entryOf(id)?.h.present
      if (now && savedContent !== start) {
        // renaming isn't an undoable edit: give earlier steps the new name as well
        update(id, (d) => ({ ...d, h: replaceHistory(d.h, now === start ? savedContent : rename(now), rename) }))
      }
      update(id, (d) => ({ ...d, file: ref, saved: savedContent }))
      remember(ref.handle)
      notify(`נשמר: ${ref.name}`)
      return true
    } catch (e) {
      fail('השמירה נכשלה', e)
      return false
    }
  }
  /** Save in place; asks for a file the first time. Resolves to false if it was cancelled or failed. */
  const save = async (id: number | null = latest.current.activeId): Promise<boolean> => {
    const entry = entryOf(id)
    if (!entry || id === null) return false
    const start = entry.h.present
    const target = entry.file
    if (!target?.handle) return saveAs(false, id)
    try {
      await writeToHandle(target.handle, serializeDocument(start))
      update(id, (d) => ({ ...d, saved: start }))
      remember(target.handle)
      notify(`נשמר: ${target.name}`)
      return true
    } catch (e) {
      fail('השמירה נכשלה', e)
      return false
    }
  }

  // ── closing ────────────────────────────────────────────────────────────────────
  /** Run `next` now, or after asking what to do with the unsaved changes of document `id`. */
  const guard = (id: number, next: () => void) => {
    const entry = entryOf(id)
    if (!entry || !isDirty(entry)) return next()
    setModal({
      title: 'לשמור את השינויים?',
      message: `במסמך "${entry.h.present.doc.name}" יש שינויים שלא נשמרו. מה לעשות?`,
      buttons: [
        {
          label: 'שמור',
          kind: 'primary',
          run: async () => {
            setModal(null)
            if (await save(id)) next()
          },
        },
        {
          label: 'אל תשמור',
          run: () => {
            setModal(null)
            next()
          },
        },
        { label: 'ביטול', cancel: true, run: () => setModal(null) },
      ],
    })
  }

  /** remove a document from the open ones; the tab next to it (or none) becomes active */
  const removeDoc = (id: number) => {
    const list = latest.current.docs
    const at = list.findIndex((d) => d.id === id)
    if (at < 0) return
    const rest = list.filter((d) => d.id !== id)
    setDocs(rest)
    if (latest.current.activeId === id) setActiveId(rest.length ? rest[Math.min(at, rest.length - 1)].id : null)
  }

  /** New documents open in a new tab; the ones already open stay as they are. */
  const createDocument = (d: DocSettings, onDone?: () => void) => {
    const blank: DocContent = { doc: d, frames: NO_FRAMES, images: NO_IMAGES, assets: NO_ASSETS, guides: NO_GUIDES, shapes: NO_SHAPES }
    // a new document starts with a text frame on the margins of every page
    addDoc(d.primaryTextFrame ? withPrimaryFrames(blank, 'all') : blank, null)
    onDone?.()
  }

  /** Close a document (the active one by default), asking about unsaved changes first. */
  const closeDocument = (id: number | null = latest.current.activeId) => {
    if (id !== null) guard(id, () => removeDoc(id))
  }

  // ── opening files ──────────────────────────────────────────────────────────────
  const loadText = (text: string, ref: FileRef) => {
    try {
      const parsed = parseDocument(text, baseName(ref.name))
      addDoc(parsed, ref)
      remember(ref.handle)
      notify(`נפתח: ${ref.name}`)
    } catch (e) {
      fail('לא ניתן לפתוח את הקובץ', e instanceof FileFormatError ? e : new Error('הקובץ לא נקרא כראוי.'))
    }
  }

  const openFile = async () => {
    try {
      const res = hasFilePicker ? await openWithPicker() : await openWithInput()
      if (res) loadText(res.text, res.ref)
    } catch (e) {
      fail('לא ניתן לפתוח את הקובץ', e)
    }
  }

  /** open a file the user dropped or double-clicked; with its handle the document can be saved back in place */
  const openTextFile = async (file: File, handle: FileSystemFileHandle | null = null) => {
    try {
      loadText(await file.text(), { name: file.name, handle })
    } catch (e) {
      fail('לא ניתן לפתוח את הקובץ', e)
    }
  }
  const openHandle = async (handle: FileSystemFileHandle) => openTextFile(await handle.getFile(), handle)

  const openRecent = async (entry: RecentEntry) => {
    try {
      if (!(await ensureReadPermission(entry.handle))) return
      loadText(await (await entry.handle.getFile()).text(), { name: entry.handle.name, handle: entry.handle })
    } catch {
      // the file was moved or deleted
      setRecent(await removeRecent(entry))
      fail('לא ניתן לפתוח את הקובץ', new Error(`הקובץ "${entry.name}" לא נמצא. ייתכן שהוא הועבר או נמחק.`))
    }
  }

  /** Throw away the changes made since the last save and reload the file. */
  const revert = () => {
    const id = latest.current.activeId
    const current = entryOf(id)
    const handle = current?.file?.handle
    if (id === null || !handle || !current) return
    setModal({
      title: 'לחזור לגרסה השמורה?',
      message: `כל השינויים ב-"${current.h.present.doc.name}" מאז השמירה האחרונה יאבדו.`,
      buttons: [
        {
          label: 'חזור לגרסה השמורה',
          kind: 'danger',
          run: async () => {
            setModal(null)
            try {
              const parsed = parseDocument(await (await handle.getFile()).text(), baseName(handle.name))
              update(id, (d) => ({ ...d, h: newHistory(parsed), saved: parsed, last: null, rev: d.rev + 1, view: null }))
              notify('המסמך הוחזר לגרסה השמורה')
            } catch (e) {
              fail('לא ניתן לחזור לגרסה השמורה', e)
            }
          },
        },
        { label: 'ביטול', cancel: true, run: () => setModal(null) },
      ],
    })
  }

  return {
    doc,
    /** changes for every newly shown, created, opened or reloaded document, so views can start fresh */
    docId: active ? `${active.id}.${active.rev}` : '',
    frames,
    images,
    assets,
    guides,
    shapes,
    history,
    changeFrames,
    changeImages,
    changeGuides,
    changeShapes,
    pages,
    file,
    dirty,
    modal,
    toast,
    recent,
    tabs,
    activeId,
    switchTo,
    view: active?.view ?? null,
    rememberView,
    createDocument,
    closeDocument,
    openFile,
    openTextFile,
    openHandle,
    openRecent,
    save,
    saveAs,
    revert,
    showError: fail,
    notify,
  }
}
