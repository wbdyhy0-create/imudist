import { useEffect, useRef, useState } from 'react'
import type { ModalSpec } from './components/Modal'
import { DEFAULT_PARAGRAPH_STYLES, defaultParagraphStyles, type Asset, type CharacterStyleRecord, type ObjectStyleRecord, type ColorSample, type DocSettings, type Guide, type ImageFrame, type LayerInfo, type PageSection, type ParagraphStyleRecord, type ParentPage, type ShapeFrame, type TextFrame } from './document'
import { FileFormatError, parseDocument, serializeDocument } from './fileFormat'
import {
  baseName,
  downloadText,
  ensureReadPermission,
  fileNameFor,
  hasFilePicker,
  isFileHandlePermissionError,
  openWithInput,
  openWithPicker,
  saveWithPicker,
  writeToHandle,
  type FileRef,
} from './fileio'
import { changeHistory, newHistory, redoHistory, replaceHistory, shouldMergeChange, undoHistory, type History } from './history'
import { assetsWeight } from './assetWeight'
import { resolveLinkedAssets } from './imageLinks'
import { applySettings, deletePages, insertPages, movePage, withMasterOnAddedPages, type DocContent, type ParentOverride } from './pages'
import { emptyPrimaryFrameIds, expandPrimaryFramesForColumns, withPrimaryFrames } from './placeText'
import { addRecent, addRecentPath, listRecent, removeRecent, type RecentEntry } from './recent'
import { t } from './i18n'

const NO_FRAMES: TextFrame[] = []
const NO_IMAGES: ImageFrame[] = []
const NO_ASSETS = {}
const NO_GUIDES: Guide[] = []
const NO_SHAPES: ShapeFrame[] = []
const NO_PARAGRAPH_STYLES: ParagraphStyleRecord[] = DEFAULT_PARAGRAPH_STYLES
const NO_CHARACTER_STYLES: CharacterStyleRecord[] = []
const NO_OBJECT_STYLES: ObjectStyleRecord[] = []
const NO_PARENTS: ParentPage[] = []
const NO_PAGE_PARENTS: (string | null)[] = []
const NO_SECTIONS: PageSection[] = []
const NO_PARENT_OVERRIDES: ParentOverride[] = []
const NO_COLOR_SAMPLES: ColorSample[] = []
const NO_LAYERS: Record<string, LayerInfo> = {}
const NO_LAYER_ORDER = ['layer-1']

const messageOf = (e: unknown) => (e instanceof Error && e.message ? e.message : t('שגיאה לא צפויה.'))

/** what to tell the user when a document opens with linked pictures that are missing or changed on disk */
const linkNotice = ({ missing, modified }: { missing: number; modified: number }) => {
  const parts = [missing > 0 && t('{missing} תמונות מקושרות חסרות', { missing }), modified > 0 && t('{modified} תמונות מקושרות השתנו', { modified })].filter(Boolean)
  return parts.length > 0 ? t('{n1} — ראה את לוח הקישורים', { n1: parts.join(', ') }) : null
}

/** Extras of a settings change. */
export interface SetupOptions {
  /** also delete the empty text frames that were made on the margins automatically (when the user switches to manual frames) */
  dropEmptyFrames?: boolean
  /** resize automatic margin/column text frames when page margins change */
  resizeTextFrames?: boolean
}

/** Operations on the pages and content of the open document. Each one is a single undo step. */
export interface PageOps {
  /** `beside`: the new pages join the row of the page before them; `parentId`: master to assign the new pages (null = none) */
  insert: (at: number, count: number, beside?: boolean, parentId?: string | null) => void
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
  const paragraphStyles = state?.paragraphStyles ?? NO_PARAGRAPH_STYLES
  const characterStyles = state?.characterStyles ?? NO_CHARACTER_STYLES
  const objectStyles = state?.objectStyles ?? NO_OBJECT_STYLES
  const parents = state?.parents ?? NO_PARENTS
  const pageParents = state?.pageParents ?? NO_PAGE_PARENTS
  const sections = state?.sections ?? NO_SECTIONS
  const layerOrder = state?.layerOrder ?? NO_LAYER_ORDER
  const layers = state?.layers ?? NO_LAYERS
  const parentOverrides = state?.parentOverrides ?? NO_PARENT_OVERRIDES
  const colorSamples = state?.colorSamples ?? NO_COLOR_SAMPLES
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
    void listRecent().then(async (entries) => {
      setRecent(entries)
      const paths = entries.flatMap((entry) => entry.path ? [entry.path] : [])
      if (paths.length === 0) return
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const results = await Promise.allSettled(paths.map((path) => invoke('remember_recent_file', { path })))
        if (results.some((result) => result.status === 'rejected')) console.warn('Some recent document permissions could not be restored.')
      } catch (e) {
        console.warn('Could not restore recent document permissions.', e)
      }
    })
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

  /** `action`: one extra button next to the close button (it leaves the message open, so its steps can be read while it works) */
  const fail = (title: string, e: unknown, action?: { label: string; run: () => void }) =>
    setModal({
      title,
      message: messageOf(e),
      buttons: action
        ? [{ label: action.label, kind: 'primary', run: action.run }, { get label() { return t('סגירה') }, cancel: true, run: () => setModal(null) }]
        : [{ get label() { return t('אישור') }, kind: 'primary', cancel: true, run: () => setModal(null) }],
    })

  // ── the active document's history ──────────────────────────────────────────────
  /**
   * apply a change to the active document; gap gesture keys merge for their whole unique gesture, other keys use the time window.
   * `silent`: a follow-up the program makes by itself (a measurement kept up to date) - it joins the undo step it follows
   * instead of being one of its own, and leaves the running gesture alone
   */
  const change = (next: (prev: DocContent) => DocContent | null, key?: string, silent = false) => {
    const id = latest.current.activeId
    if (id === null) return
    const now = Date.now()
    update(id, (d) => {
      // decided from the state (not from a ref) so React may safely run the updater more than once
      const merge = silent || shouldMergeChange(d.last, key, now)
      const changed = changeHistory(d.h, (prev) => next(prev) ?? prev, merge)
      // a silent follow-up must not cost the user their redo list
      const h = silent && changed !== d.h ? { ...changed, future: d.h.future } : changed
      return { ...d, h, last: silent ? d.last : key ? { key, at: now } : null }
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
  const changeFrames = (next: TextFrame[], key?: string, silent?: boolean) => change((s) => (next !== s.frames ? { ...s, frames: next } : s), key, silent)
  const changeImages = (next: ImageFrame[], key?: string) => change((s) => (next !== s.images ? { ...s, images: next } : s), key)
  const changeShapes = (next: ShapeFrame[], key?: string, silent?: boolean) => change((s) => (next !== s.shapes ? { ...s, shapes: next } : s), key, silent)
  const changeGuides = (next: Guide[], key?: string) => change((s) => (next !== s.guides ? { ...s, guides: next } : s), key)
  const changeParagraphStyles = (next: ParagraphStyleRecord[], key?: string) => change((s) => (next !== s.paragraphStyles ? { ...s, paragraphStyles: next } : s), key)
  const changeParents = (next: ParentPage[], key?: string) => change((s) => (next !== s.parents ? { ...s, parents: next } : s), key)
  const changePageParents = (next: (string | null)[], key?: string) => change((s) => (next !== s.pageParents ? { ...s, pageParents: next } : s), key)
  const changeSections = (next: PageSection[], key?: string) => change((s) => (next !== s.sections ? { ...s, sections: next } : s), key)
  /** the layers in their new order, with their names, colours, hidden and locked: one step of the history, however many of them changed */
  const changeLayers = (order: string[], next: Record<string, LayerInfo>, key?: string) => change((s) => {
    const current = s.layerOrder ?? ['layer-1']
    const sameOrder = current.length === order.length && current.every((id, index) => id === order[index])
    const sameLayers = s.layers === next || (!s.layers && Object.keys(next).length === 0)
    return sameOrder && sameLayers ? s : { ...s, layerOrder: order, layers: next }
  }, key)

  const pages: PageOps = {
    insert: (at, count, beside, parentId) =>
      change((s) => {
        const r = insertPages(s, at, count, beside, parentId ?? null)
        return r ? (r.doc.primaryTextFrame ? withPrimaryFrames(r, Array.from({ length: r.doc.pages - s.doc.pages }, (_, i) => at + i)) : r) : s
      }),
    remove: (indices) => change((s) => deletePages(s, indices) || s),
    move: (from, to) => change((s) => movePage(s, from, to) || s),
    setup: (next, key, options) =>
      change((s) => {
        // decided before the pages move: which empty margin frames there are now
        const drop = options?.dropEmptyFrames ? new Set(emptyPrimaryFrameIds(s.doc, s.frames)) : null
        const applied = withMasterOnAddedPages(s, applySettings(s, next, options?.resizeTextFrames))
        const r = drop && drop.size > 0 ? { ...applied, frames: applied.frames.filter((f) => !drop.has(f.id)) } : applied
        if (!next.primaryTextFrame) return r
        const expanded = s.doc.primaryTextFrame && next.columns > s.doc.columns
          ? expandPrimaryFramesForColumns(r, s.doc, s.frames)
          : r
        // turning the option on gives every page without a text frame one; otherwise only pages that were added
        return withPrimaryFrames(expanded, s.doc.primaryTextFrame ? Array.from({ length: Math.max(0, next.pages - s.doc.pages) }, (_, i) => s.doc.pages + i) : 'all')
      }, key),
    commit: (patch) => change((s) => ({ ...s, ...patch })),
  }

  // ── tabs ───────────────────────────────────────────────────────────────────────
  /** a document becomes a new tab and the active one */
  const addDoc = (content: DocContent, ref: FileRef | null) => {
    const id = nextId.current++
    setDocs((list) => [...list, { id, h: newHistory(content), file: ref, saved: content, rev: 0, last: null, view: null }])
    setActiveId(id)
    return id
  }
  /** the open documents and the files they live in, as they are now (for a book to tell which of its chapters are open) */
  const openFiles = () => latest.current.docs.map((d) => ({ id: d.id, file: d.file, dirty: d.saved !== d.h.present }))
  /** one open document's content as it is now */
  const contentOf = (id: number): DocContent | null => entryOf(id)?.h.present ?? null
  /** change one open document (by id) as one undo step, whether or not it is the one shown */
  const changeDoc = (id: number, next: (prev: DocContent) => DocContent) =>
    update(id, (d) => ({ ...d, h: changeHistory(d.h, (prev) => next(prev) ?? prev, false), last: null }))
  const replaceImageAsset = (id: number, parentId: string | null, imageId: string, expectedAssetId: string, assetId: string, asset: Asset) => {
    const hasTargetImage = (content: DocContent) => {
      const targetImages = parentId
        ? content.parents.find((parent) => parent.id === parentId)?.images
        : content.images
      return targetImages?.some((image) => image.id === imageId && image.assetId === expectedAssetId) ?? false
    }
    const entry = docs.find((document) => document.id === id)
    if (!entry || !hasTargetImage(entry.h.present)) return false

    update(id, (d) => {
      const content = d.h.present
      if (!hasTargetImage(content)) return d
      const next: DocContent = {
        ...content,
        assets: { ...content.assets, [assetId]: asset },
        ...(parentId
          ? {
              parents: content.parents.map((parent) => parent.id === parentId
                ? { ...parent, images: parent.images.map((image) => image.id === imageId && image.assetId === expectedAssetId ? { ...image, assetId } : image) }
                : parent),
            }
          : {
              images: content.images.map((image) => image.id === imageId && image.assetId === expectedAssetId ? { ...image, assetId } : image),
            }),
      }
      return { ...d, h: changeHistory(d.h, () => next, false), last: null }
    })
    return true
  }
  const switchTo = (id: number) => {
    if (latest.current.docs.some((d) => d.id === id)) setActiveId(id)
  }
  /** the workspace tells where the view is, so it can be restored when the document is shown again */
  const rememberView = (id: number, view: TabView) => update(id, (d) => ({ ...d, view }))

  const tabs: DocTab[] = docs.map((d) => ({ id: d.id, name: d.h.present.doc.name, dirty: d.saved !== d.h.present }))

  const remember = async (ref: FileRef) => {
    if (ref.path) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('remember_recent_file', { path: ref.path })
      } catch (e) {
        console.warn('Could not persist access to the recent document.', e)
      }
      setRecent(await addRecentPath(ref.path, ref.name))
    } else if (ref.handle) {
      setRecent(await addRecent(ref.handle))
    }
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
        notify(t('הקובץ {name} הורד לתיקיית ההורדות', { name }))
        return true
      }
      const ref = await saveWithPicker(fileNameFor(start.doc.name), text)
      if (!ref) return false
      if (copy) {
        notify(t('נשמר עותק: {n1}', { n1: ref.name }))
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
      await remember(ref)
      notify(!ref.handle && !ref.path ? t('הקובץ {n1} הורד לתיקיית ההורדות', { n1: ref.name }) : t('נשמר: {n1}', { n1: ref.name }))
      return true
    } catch (e) {
      fail(t('השמירה נכשלה'), e)
      return false
    }
  }
  /** Save in place; asks for a file the first time. Resolves to false if it was cancelled or failed. */
  const save = async (id: number | null = latest.current.activeId): Promise<boolean> => {
    const entry = entryOf(id)
    if (!entry || id === null) return false
    const start = entry.h.present
    const target = entry.file
    if (!target || (!target.handle && !target.path)) return saveAs(false, id)
    try {
      if (target.path) {
        const { writeTextFile } = await import('@tauri-apps/plugin-fs')
        await writeTextFile(target.path, serializeDocument(start))
      } else if (target.handle) {
        try {
          await writeToHandle(target.handle, serializeDocument(start))
        } catch (error) {
          if (!isFileHandlePermissionError(error)) throw error
          downloadText(target.name, serializeDocument(start))
          update(id, (d) => ({ ...d, file: { ...target, handle: null }, saved: start }))
          notify(t('הקובץ {n1} הורד לתיקיית ההורדות כי אין הרשאת כתיבה למיקום המקורי', { n1: target.name }))
          return true
        }
      } else {
        return saveAs(false, id)
      }
      update(id, (d) => ({ ...d, saved: start }))
      await remember(target)
      notify(t('נשמר: {n1}', { n1: target.name }))
      return true
    } catch (e) {
      fail(t('השמירה נכשלה'), e)
      return false
    }
  }

  /**
   * The quiet twin of `save`, for autosave: writes the document in place and does nothing else - never a file dialog, a
   * download or a message (a document that was never saved has nowhere to be written: `skipped`; a write the system
   * refuses, such as a folder that went read-only, is `failed` and is reported by the indicator, not by a dialog).
   */
  const autosave = async (id: number): Promise<'saved' | 'skipped' | 'failed'> => {
    const entry = entryOf(id)
    const target = entry?.file
    if (!entry || !isDirty(entry) || !target || (!target.path && !target.handle)) return 'skipped'
    const start = entry.h.present
    try {
      if (target.path) {
        const { writeTextFile } = await import('@tauri-apps/plugin-fs')
        await writeTextFile(target.path, serializeDocument(start))
      } else await writeToHandle(target.handle!, serializeDocument(start))
    } catch (e) {
      console.warn('Autosave failed.', e)
      return 'failed'
    }
    update(id, (d) => ({ ...d, saved: start }))
    return 'saved'
  }

  // ── closing ────────────────────────────────────────────────────────────────────
  /** Run `next` now, or after asking what to do with the unsaved changes of document `id` (`onCancel`: the user chose to stay). */
  const guard = (id: number, next: () => void, onCancel?: () => void) => {
    const entry = entryOf(id)
    if (!entry || !isDirty(entry)) return next()
    setModal({
      get title() { return t('לשמור את השינויים?') },
      message: t('במסמך "{n1}" יש שינויים שלא נשמרו. מה לעשות?', { n1: entry.h.present.doc.name }),
      buttons: [
        {
          get label() { return t('שמור') },
          kind: 'primary',
          run: async () => {
            setModal(null)
            if (await save(id)) next()
            else onCancel?.()
          },
        },
        {
          get label() { return t('אל תשמור') },
          run: () => {
            setModal(null)
            next()
          },
        },
        {
          get label() { return t('ביטול') },
          cancel: true,
          run: () => {
            setModal(null)
            onCancel?.()
          },
        },
      ],
    })
  }

  /**
   * The program is about to close: ask about every document that still has unsaved changes, one after the other (with
   * autosave on, that is the ones that were never saved to a file, or whose write failed). Resolves to whether to close.
   */
  const confirmExit = () =>
    new Promise<boolean>((resolve) => {
      const ids = latest.current.docs.filter(isDirty).map((d) => d.id)
      const step = (index: number) => {
        if (index >= ids.length) resolve(true)
        else guard(ids[index], () => step(index + 1), () => resolve(false))
      }
      step(0)
    })

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
  const createDocument = (d: DocSettings, onDone?: (id: number) => void) => {
    // every new document starts with one parent ("אב A") already applied to all of its pages, the same way
    // professional layout tools start with a default master - so pages already look uniform from the start, instead of needing it set by hand
    const parentA: ParentPage = { id: globalThis.crypto?.randomUUID?.() ?? `parent-${Date.now()}`, prefix: 'A', name: t('אב A'), w: d.width, h: d.height, frames: [], images: [], shapes: [] }
    const blank: DocContent = {
      doc: d,
      frames: NO_FRAMES,
      images: NO_IMAGES,
      assets: NO_ASSETS,
      guides: NO_GUIDES,
      shapes: NO_SHAPES,
      paragraphStyles: defaultParagraphStyles(),
      parents: [parentA],
      pageParents: Array<string | null>(d.pages).fill(parentA.id),
      sections: NO_SECTIONS,
    }
    // a new document starts with a text frame on the margins of every page
    const id = addDoc(d.primaryTextFrame ? withPrimaryFrames(blank, 'all') : blank, null)
    onDone?.(id)
    return id
  }

  /** Close a document (the active one by default), asking about unsaved changes first. */
  const closeDocument = (id: number | null = latest.current.activeId) => {
    if (id !== null) guard(id, () => removeDoc(id))
  }

  // ── opening files ──────────────────────────────────────────────────────────────
  const loadText = async (text: string, ref: FileRef) => {
    try {
      const parsed = parseDocument(text, baseName(ref.name))
      const links = await resolveLinkedAssets(parsed.assets)
      addDoc(parsed, ref)
      await remember(ref)
      notify(linkNotice(links) ?? t('נפתח: {n1}', { n1: ref.name }))
    } catch (e) {
      fail(t('לא ניתן לפתוח את הקובץ'), e instanceof FileFormatError ? e : new Error(t('הקובץ לא נקרא כראוי.')))
    }
  }

  const openWithInputFallback = async () => {
    const result = await openWithInput()
    if (result) await loadText(result.text, result.ref)
  }

  const openFile = async () => {
    try {
      const res = hasFilePicker ? await openWithPicker() : await openWithInput()
      if (res) await loadText(res.text, res.ref)
    } catch (e) {
      fail(t('לא ניתן לפתוח את הקובץ'), e)
    }
  }

  const openTextFile = async (file: File, handle: FileSystemFileHandle | null = null) => {
    try {
      await loadText(await file.text(), { name: file.name, handle })
    } catch (e) {
      fail(t('לא ניתן לפתוח את הקובץ'), e)
    }
  }
  const openHandle = async (handle: FileSystemFileHandle) => {
    try {
      await openTextFile(await handle.getFile(), handle)
    } catch (error) {
      if (!isFileHandlePermissionError(error)) throw error
      await openWithInputFallback()
    }
  }

  const openRecent = async (entry: RecentEntry) => {
    try {
      if (entry.path) {
        const { readTextFile } = await import('@tauri-apps/plugin-fs')
        await loadText(await readTextFile(entry.path), { name: entry.name, handle: null, path: entry.path })
        return
      }
      if (!entry.handle) throw new Error(t('הקובץ לא נמצא.'))
      try {
        if (!(await ensureReadPermission(entry.handle))) {
          await openWithInputFallback()
          return
        }
        await loadText(await (await entry.handle.getFile()).text(), { name: entry.handle.name, handle: entry.handle })
      } catch (error) {
        if (!isFileHandlePermissionError(error)) throw error
        await openWithInputFallback()
      }
    } catch (e) {
      if (!entry.path) {
        try {
          setRecent(await removeRecent(entry))
        } catch (removeError) {
          console.warn(`Could not remove missing recent document "${entry.name}".`, removeError)
        }
      }
      const message = entry.path ? messageOf(e) : t('הקובץ "{n1}" לא נמצא. ייתכן שהוא הועבר או נמחק.', { n1: entry.name })
      fail(t('לא ניתן לפתוח את הקובץ'), new Error(message))
    }
  }

  const forgetRecent = async (entry: RecentEntry) => {
    try {
      setRecent(await removeRecent(entry))
      notify(t('"{n1}" הוסר מרשימת האחרונים.', { n1: entry.name }))
    } catch (e) {
      fail(t('לא ניתן להסיר את הקובץ מרשימת האחרונים'), e)
    }
  }

  /** Open the file at a path (the desktop app), e.g. a chapter of a book. */
  const openPath = async (path: string) => {
    try {
      const { readTextFile } = await import('@tauri-apps/plugin-fs')
      await loadText(await readTextFile(path), { name: path.split(/[\\/]/).pop() ?? path, handle: null, path })
    } catch (e) {
      fail(t('לא ניתן לפתוח את הקובץ'), e)
    }
  }

  /** Throw away the changes made since the last save and reload the file. */
  const revert = () => {
    const id = latest.current.activeId
    const current = entryOf(id)
    const handle = current?.file?.handle
    if (id === null || !handle || !current) return
    setModal({
      get title() { return t('לחזור לגרסה השמורה?') },
      message: t('כל השינויים ב-"{n1}" מאז השמירה האחרונה יאבדו.', { n1: current.h.present.doc.name }),
      buttons: [
        {
          get label() { return t('חזור לגרסה השמורה') },
          kind: 'danger',
          run: async () => {
            setModal(null)
            try {
              const parsed = parseDocument(await (await handle.getFile()).text(), baseName(handle.name))
              update(id, (d) => ({ ...d, h: newHistory(parsed), saved: parsed, last: null, rev: d.rev + 1, view: null }))
              notify(t('המסמך הוחזר לגרסה השמורה'))
            } catch (e) {
              fail(t('לא ניתן לחזור לגרסה השמורה'), e)
            }
          },
        },
        { get label() { return t('ביטול') }, cancel: true, run: () => setModal(null) },
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
    paragraphStyles,
    characterStyles,
    objectStyles,
    parents,
    pageParents,
    sections,
    layerOrder,
    layers,
    parentOverrides,
    colorSamples,
    history,
    changeFrames,
    changeImages,
    changeGuides,
    changeShapes,
    changeParagraphStyles,
    changeParents,
    changePageParents,
    changeSections,
    changeLayers,
    pages,
    file,
    dirty,
    anyDirty,
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
    openPath,
    forgetRecent,
    openFiles,
    contentOf,
    changeDoc,
    replaceImageAsset,
    save,
    saveAs,
    autosave,
    /** every open document as autosave sees it (see useAutosave.ts) */
    autosaveDocs: docs.map((d) => ({ id: d.id, content: d.h.present, saved: d.saved, writable: !!(d.file?.path || d.file?.handle), weight: assetsWeight(d.h.present.assets) })),
    confirmExit,
    revert,
    showError: fail,
    notify,
  }
}
