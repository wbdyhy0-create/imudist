import { useEffect, useRef, useState } from 'react'
import type { ModalSpec } from './components/Modal'
import type { DocSettings, Guide, ImageFrame, TextFrame } from './document'
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
import { useHistory } from './history'
import { applySettings, deletePages, insertPages, movePage, type DocContent } from './pages'
import { addRecent, listRecent, removeRecent, type RecentEntry } from './recent'

const NO_FRAMES: TextFrame[] = []
const NO_IMAGES: ImageFrame[] = []
const NO_ASSETS = {}
const NO_GUIDES: Guide[] = []

const messageOf = (e: unknown) => (e instanceof Error && e.message ? e.message : 'שגיאה לא צפויה.')

/** Operations on the pages and content of the open document. Each one is a single undo step. */
export interface PageOps {
  insert: (at: number, count: number) => void
  remove: (indices: number[]) => void
  move: (from: number, to: number) => void
  /** replace the document's settings (Document Setup) */
  setup: (next: DocSettings, coalesceKey?: string) => void
  /** change several parts of the content at once (e.g. placing a long text that added pages and frames, or a picture) */
  commit: (patch: Partial<DocContent>) => void
}

/**
 * Everything about the open document as a whole: its settings and content with one undo history, the file it lives
 * in, whether it has unsaved changes, and the open / save / close actions (with the "save changes?" questions).
 */
export function useDocumentSession() {
  /** the open document; null on the home screen */
  const history = useHistory<DocContent | null>(null)
  const state = history.value
  const doc = state?.doc ?? null
  const frames = state?.frames ?? NO_FRAMES
  const images = state?.images ?? NO_IMAGES
  const assets = state?.assets ?? NO_ASSETS
  const guides = state?.guides ?? NO_GUIDES
  /** changes for every newly created or opened document, so views can start fresh */
  const [docId, setDocId] = useState(0)
  const [file, setFile] = useState<FileRef | null>(null)
  /** the content that was last written to disk: the document is "modified" while it is a different object */
  const [saved, setSaved] = useState<DocContent | null>(null)
  const [modal, setModal] = useState<ModalSpec | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [recent, setRecent] = useState<RecentEntry[]>([])
  const toastTimer = useRef<number | undefined>(undefined)

  const dirty = !!state && saved !== state

  // The newest values, for actions that finish after an await (a file dialog) or were created by an older render
  // (menus are memoized): they must never act on, or write back, an outdated document.
  const latest = useRef({ state, file, dirty })
  latest.current = { state, file, dirty }

  useEffect(() => {
    void listRecent().then(setRecent)
  }, [])

  // the browser asks before the tab is closed while there is unsaved work
  useEffect(() => {
    if (!dirty) return
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [dirty])

  const notify = (text: string) => {
    setToast(text)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }

  const fail = (title: string, e: unknown) =>
    setModal({ title, message: messageOf(e), buttons: [{ label: 'אישור', kind: 'primary', cancel: true, run: () => setModal(null) }] })

  // ── editing ────────────────────────────────────────────────────────────────────
  // Every change is a function of the newest content, so two changes in the same moment can't overwrite each other.
  /** the text frames changed (typing, dragging …); changes with the same key merge into one undo step */
  const changeFrames = (next: TextFrame[], key?: string) =>
    history.change((s) => (s && next !== s.frames ? { ...s, frames: next } : s), key)
  const changeImages = (next: ImageFrame[], key?: string) =>
    history.change((s) => (s && next !== s.images ? { ...s, images: next } : s), key)
  const changeGuides = (next: Guide[], key?: string) =>
    history.change((s) => (s && next !== s.guides ? { ...s, guides: next } : s), key)

  const pages: PageOps = {
    insert: (at, count) => history.change((s) => (s && insertPages(s, at, count)) || s),
    remove: (indices) => history.change((s) => (s && deletePages(s, indices)) || s),
    move: (from, to) => history.change((s) => (s && movePage(s, from, to)) || s),
    setup: (next, key) => history.change((s) => (s ? applySettings(s, next) : s), key),
    commit: (patch) => history.change((s) => (s ? { ...s, ...patch } : s)),
  }
  const install = (content: DocContent, ref: FileRef | null) => {
    history.reset(content)
    setDocId((n) => n + 1)
    setFile(ref)
    setSaved(content)
  }

  const remember = (handle: FileSystemFileHandle | null) => {
    if (handle) void addRecent(handle).then(setRecent)
  }

  // ── saving ─────────────────────────────────────────────────────────────────────
  /** Save the document to a file of the user's choice. `copy`: write a copy and keep working on the original. */
  const saveAs = async (copy = false): Promise<boolean> => {
    const start = latest.current.state // exactly what is written; edits made while the dialog is open stay "unsaved"
    if (!start) return false
    const text = serializeDocument(start)
    try {
      if (!hasFilePicker) {
        const name = fileNameFor(start.doc.name)
        downloadText(name, text)
        if (!copy) {
          setFile({ name, handle: null })
          setSaved(start)
        }
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
      const now = latest.current.state
      if (now && savedContent !== start) {
        // renaming isn't an undoable edit: give earlier steps the new name as well
        history.replace(now === start ? savedContent : rename(now), (s) => (s ? rename(s) : s))
      }
      setFile(ref)
      setSaved(savedContent)
      remember(ref.handle)
      notify(`נשמר: ${ref.name}`)
      return true
    } catch (e) {
      fail('השמירה נכשלה', e)
      return false
    }
  }
  /** Save in place; asks for a file the first time. Resolves to false if it was cancelled or failed. */
  const save = async (): Promise<boolean> => {
    const { state: start, file: target } = latest.current
    if (!start) return false
    if (!target?.handle) return saveAs()
    try {
      await writeToHandle(target.handle, serializeDocument(start))
      setSaved(start)
      remember(target.handle)
      notify(`נשמר: ${target.name}`)
      return true
    } catch (e) {
      fail('השמירה נכשלה', e)
      return false
    }
  }
  // ── replacing the open document ────────────────────────────────────────────────
  /** Run `next` now, or after asking what to do with unsaved changes. */
  const guard = (next: () => void) => {
    const current = latest.current
    if (!current.dirty || !current.state) return next()
    setModal({
      title: 'לשמור את השינויים?',
      message: `במסמך "${current.state.doc.name}" יש שינויים שלא נשמרו. מה לעשות?`,
      buttons: [
        {
          label: 'שמור',
          kind: 'primary',
          run: async () => {
            setModal(null)
            if (await save()) next()
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

  const createDocument = (d: DocSettings, onDone?: () => void) =>
    guard(() => {
      install({ doc: d, frames: NO_FRAMES, images: NO_IMAGES, assets: NO_ASSETS, guides: NO_GUIDES }, null)
      onDone?.()
    })

  const closeDocument = () =>
    guard(() => {
      history.reset(null)
      setFile(null)
      setSaved(null)
    })

  const loadText = (text: string, ref: FileRef) => {
    try {
      const parsed = parseDocument(text, baseName(ref.name))
      guard(() => {
        install(parsed, ref)
        remember(ref.handle)
        notify(`נפתח: ${ref.name}`)
      })
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
    const handle = file?.handle
    if (!handle || !doc) return
    setModal({
      title: 'לחזור לגרסה השמורה?',
      message: `כל השינויים ב-"${doc.name}" מאז השמירה האחרונה יאבדו.`,
      buttons: [
        {
          label: 'חזור לגרסה השמורה',
          kind: 'danger',
          run: async () => {
            setModal(null)
            try {
              install(parseDocument(await (await handle.getFile()).text(), baseName(handle.name)), file)
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
    docId,
    frames,
    images,
    assets,
    guides,
    history,
    changeFrames,
    changeImages,
    changeGuides,
    pages,
    file,
    dirty,
    modal,
    toast,
    recent,
    createDocument,
    closeDocument,
    openFile,
    openRecent,
    save,
    saveAs,
    revert,
    showError: fail,
    notify,
  }
}
