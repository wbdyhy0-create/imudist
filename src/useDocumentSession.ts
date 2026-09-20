import { useEffect, useRef, useState } from 'react'
import type { ModalSpec } from './components/Modal'
import type { DocSettings, TextFrame } from './document'
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

const messageOf = (e: unknown) => (e instanceof Error && e.message ? e.message : 'שגיאה לא צפויה.')

/** Operations on the pages of the open document. Each one is a single undo step. */
export interface PageOps {
  insert: (at: number, count: number) => void
  remove: (indices: number[]) => void
  move: (from: number, to: number) => void
  /** replace the document's settings (Document Setup) */
  setup: (next: DocSettings) => void
  /** replace the whole content (e.g. after placing a long text that added pages and frames) */
  commit: (content: DocContent) => void
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
  /** the frames changed (typing, dragging …); changes with the same key merge into one undo step */
  const changeFrames = (next: TextFrame[], key?: string) => {
    if (state && next !== state.frames) history.change({ doc: state.doc, frames: next }, key)
  }

  const applyPages = (result: DocContent | null) => {
    if (result) history.change(result)
  }
  const pages: PageOps = {
    insert: (at, count) => state && applyPages(insertPages(state.doc, state.frames, at, count)),
    remove: (indices) => state && applyPages(deletePages(state.doc, state.frames, indices)),
    move: (from, to) => state && applyPages(movePage(state.doc, state.frames, from, to)),
    setup: (next) => state && applyPages(applySettings(state.doc, state.frames, next)),
    commit: (content) => applyPages(content),
  }

  const install = (d: DocSettings, f: TextFrame[], ref: FileRef | null) => {
    const content = { doc: d, frames: f }
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
    if (!state) return false
    const text = serializeDocument(state.doc, state.frames)
    try {
      if (!hasFilePicker) {
        const name = fileNameFor(state.doc.name)
        downloadText(name, text)
        if (!copy) {
          setFile({ name, handle: null })
          setSaved(state)
        }
        notify(`הקובץ ${name} הורד לתיקיית ההורדות`)
        return true
      }
      const ref = await saveWithPicker(fileNameFor(state.doc.name), text)
      if (!ref) return false
      if (copy) {
        notify(`נשמר עותק: ${ref.name}`)
        return true
      }
      // the document takes its name from the file, like other desktop programs
      const name = baseName(ref.name)
      let content = state
      if (name && name !== state.doc.name) {
        content = { ...state, doc: { ...state.doc, name } }
        // renaming isn't an undoable edit: give earlier steps the new name as well
        history.replace(content, (s) => (s ? { ...s, doc: { ...s.doc, name } } : s))
      }
      setFile(ref)
      setSaved(content)
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
    if (!state) return false
    if (!file?.handle) return saveAs()
    try {
      await writeToHandle(file.handle, serializeDocument(state.doc, state.frames))
      setSaved(state)
      remember(file.handle)
      notify(`נשמר: ${file.name}`)
      return true
    } catch (e) {
      fail('השמירה נכשלה', e)
      return false
    }
  }

  // ── replacing the open document ────────────────────────────────────────────────
  /** Run `next` now, or after asking what to do with unsaved changes. */
  const guard = (next: () => void) => {
    if (!dirty || !doc) return next()
    setModal({
      title: 'לשמור את השינויים?',
      message: `במסמך "${doc.name}" יש שינויים שלא נשמרו. מה לעשות?`,
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
      install(d, NO_FRAMES, null)
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
        install(parsed.doc, parsed.frames, ref)
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
              const parsed = parseDocument(await (await handle.getFile()).text(), baseName(handle.name))
              install(parsed.doc, parsed.frames, file)
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
    history,
    changeFrames,
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
