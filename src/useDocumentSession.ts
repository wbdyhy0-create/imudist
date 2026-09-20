import { useCallback, useEffect, useRef, useState } from 'react'
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
import { addRecent, listRecent, removeRecent, type RecentEntry } from './recent'

const NO_FRAMES: TextFrame[] = []

/** What was last written to disk: the document is "modified" while it differs from this. */
interface Saved {
  doc: DocSettings
  frames: TextFrame[]
}

const messageOf = (e: unknown) => (e instanceof Error && e.message ? e.message : 'שגיאה לא צפויה.')

/**
 * Everything about the open document as a whole: its settings, its content with undo history, the file it lives in,
 * whether it has unsaved changes, and the open / save / close actions (with the "save changes?" questions).
 */
export function useDocumentSession() {
  const history = useHistory<TextFrame[]>(NO_FRAMES)
  const [doc, setDoc] = useState<DocSettings | null>(null)
  /** changes for every newly created or opened document, so views can start fresh */
  const [docId, setDocId] = useState(0)
  const [file, setFile] = useState<FileRef | null>(null)
  const [saved, setSaved] = useState<Saved | null>(null)
  const [modal, setModal] = useState<ModalSpec | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [recent, setRecent] = useState<RecentEntry[]>([])
  const toastTimer = useRef<number | undefined>(undefined)

  const frames = history.value
  const dirty = !!doc && (!saved || saved.doc !== doc || saved.frames !== frames)

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

  const install = (d: DocSettings, f: TextFrame[], ref: FileRef | null) => {
    setDoc(d)
    setDocId((n) => n + 1)
    history.reset(f)
    setFile(ref)
    setSaved({ doc: d, frames: f })
  }

  const remember = (handle: FileSystemFileHandle | null) => {
    if (handle) void addRecent(handle).then(setRecent)
  }

  // ── saving ─────────────────────────────────────────────────────────────────────
  /** Save the document to a file of the user's choice. `copy`: write a copy and keep working on the original. */
  const saveAs = async (copy = false): Promise<boolean> => {
    if (!doc) return false
    const text = serializeDocument(doc, frames)
    try {
      if (!hasFilePicker) {
        const name = fileNameFor(doc.name)
        downloadText(name, text)
        if (!copy) {
          setFile({ name, handle: null })
          setSaved({ doc, frames })
        }
        notify(`הקובץ ${name} הורד לתיקיית ההורדות`)
        return true
      }
      const ref = await saveWithPicker(fileNameFor(doc.name), text)
      if (!ref) return false
      if (copy) {
        notify(`נשמר עותק: ${ref.name}`)
        return true
      }
      // the document takes its name from the file, like other desktop programs
      const name = baseName(ref.name)
      const next = name && name !== doc.name ? { ...doc, name } : doc
      setDoc(next)
      setFile(ref)
      setSaved({ doc: next, frames })
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
    if (!doc) return false
    if (!file?.handle) return saveAs()
    try {
      await writeToHandle(file.handle, serializeDocument(doc, frames))
      setSaved({ doc, frames })
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
      setDoc(null)
      history.reset(NO_FRAMES)
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

  const dismissModal = useCallback(() => setModal(null), [])

  return {
    doc,
    docId,
    frames,
    history,
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
    dismissModal,
  }
}
