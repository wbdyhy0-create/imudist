import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Home } from './components/Home'
import { MenuBar } from './components/MenuBar'
import { Modal } from './components/Modal'
import { DocumentSetupDialog } from './components/DocumentSetupDialog'
import { ExportPdfDialog } from './components/ExportPdfDialog'
import { NewDocumentDialog } from './components/NewDocumentDialog'
import { DocTabs } from './components/DocTabs'
import { Workspace, type WorkspaceHandle } from './components/Workspace'
import { DEFAULT_PARAGRAPH_STYLES, defaultDocSettings, marginsOf, MAX_PAGE_PT, MIN_PAGE_PT, type CharacterStyleRecord, type DocSettings, type Guide, type ImageFrame, type PageSection, type ParagraphStyleRecord, type ParentPage, type ShapeFrame, type TextFrame } from './document'
import { DEFAULT_SHAPE_PREFS, type ShapePrefs } from './shapes'
import { emptyPrimaryFrameIds } from './placeText'
import { isTableCellEditor, isTextEditor, isTyping } from './dom'
import { buildMenus, findShortcut } from './menus'
import { baseName, isTauri, pickFiles } from './fileio'
import { mergeCharacterStyles, remapNestedStyles } from './characterStyleTree'
import { FILE_EXT, FileFormatError, mergeParagraphStyles, parseDocument } from './fileFormat'
import { isImageFile, readImageFile, type PlacedImage } from './importImage'
import { IMAGE_FILE_EXTENSIONS, fileNameOf, isImagePath, readLinkedImage } from './imageLinks'
import { readEpsFile } from './importEps'
import { ImportError, placedFromPlainText, readPlacedText, type PlacedText } from './importText'
import { ImportOptionsDialog } from './components/ImportOptionsDialog'
import { useDocumentSession, type PageOps } from './useDocumentSession'
import { deliverPng } from './pngExport'
import { prepareExport, renderPage } from './pdfExport'
import { useAutosave } from './useAutosave'
import { useBook } from './useBook'
import { BookExportDialog, BookPanel, ChapterPicker, SyncDialog } from './components/BookPanel'
import { insertPages as insertDocumentPages, pageRects, parentEditDoc, parentShadowContent, type DocContent } from './pages'
import type { PdfImportSource } from './importPdf'
import { ImportPdfOptionsDialog } from './components/ImportPdfOptionsDialog'
import type { PagePreset, Unit } from './units'
import { SaveWorkspaceDialog } from './components/SaveWorkspaceDialog'
import { TOOL_TOUR_COMPLETE_KEY } from './components/GuidedToolTour'
import { defaultDockLayout, loadDockWorkspaceStore, loadLegacyDockTabOrder, saveDockWorkspaceStore, type DockLayout, type DockWorkspaceStore } from './dockWorkspaces'
import { loadSystemFonts, useFontCatalog } from './fonts'

const APP_NAME = 'Imudist'
const NO_FRAMES: TextFrame[] = []
const NO_IMAGES: ImageFrame[] = []
const NO_PLACED: PlacedImage[] = []
const NO_GUIDES: Guide[] = []
const NO_SHAPES: ShapeFrame[] = []
const ALL_DOCK_PANEL_IDS = ['properties', 'paragraph', 'paragraph-styles', 'character-styles', 'style-manager', 'pages', 'links', 'color', 'gradient', 'swatches', 'layers']
const NO_PARAGRAPH_STYLES: ParagraphStyleRecord[] = DEFAULT_PARAGRAPH_STYLES
const NO_CHARACTER_STYLES: CharacterStyleRecord[] = []
const NO_PARENTS: ParentPage[] = []
const NO_PAGE_PARENTS: (string | null)[] = []
const NO_SECTIONS: PageSection[] = []
const noop = () => {}
const NO_PAGE_OPS: PageOps = { insert: noop, remove: noop, move: noop, setup: noop, commit: noop }
const newImportedImageId = () => globalThis.crypto?.randomUUID?.() ?? `pdf-image-${Date.now()}-${Math.random().toString(36).slice(2)}`
/** Letter key by name or physical position (so it also works with a Hebrew keyboard layout). */
const isDocumentFile = (f: File) => f.name.toLowerCase().endsWith(FILE_EXT)
const isPdfFile = (f: File) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
const isEpsFile = (f: File) => f.name.toLowerCase().endsWith('.eps') || f.type === 'application/postscript'
const isKey = (e: KeyboardEvent, letter: string) => e.key.toLowerCase() === letter || e.code === 'Key' + letter.toUpperCase()

export default function App() {
  const session = useDocumentSession()
  const fontCatalog = useFontCatalog()
  // menu items are memoized, so they call the session through this ref and never run an outdated action
  const sessionRef = useRef(session)
  sessionRef.current = session
  /** the open book (several documents kept together as chapters) */
  const book = useBook({
    openChapter: async (ref) => {
      if (ref.handle) await sessionRef.current.openHandle(ref.handle)
      else if (ref.path) await sessionRef.current.openPath(ref.path)
    },
    notify: (message) => sessionRef.current.notify(message),
    showError: (title, error) => sessionRef.current.showError(title, error),
    openFiles: () => sessionRef.current.openFiles(),
    contentOf: (id) => sessionRef.current.contentOf(id),
    changeDoc: (id, next) => sessionRef.current.changeDoc(id, next),
    switchTo: (id) => sessionRef.current.switchTo(id),
    goToIssue: (docId, issue) => {
      // only once that document is the one shown and its workspace is there
      if (sessionRef.current.activeId !== docId || !ws.current) return false
      ws.current.goToIssue(issue)
      return true
    },
  })
  const bookRef = useRef(book)
  bookRef.current = book
  const { doc, history } = session
  /** autosave on or off (the "שמירה אוטומטית" item of the file menu): on unless the user turned it off, and remembered */
  const [autosaveOn, setAutosaveOn] = useState(() => {
    try {
      return localStorage.getItem('imudist.autosave') !== 'off'
    } catch {
      return true
    }
  })
  const toggleAutosave = () =>
    setAutosaveOn((on) => {
      try {
        localStorage.setItem('imudist.autosave', on ? 'off' : 'on')
      } catch {
        // not remembered: it is back on at the next start
      }
      return !on
    })
  const autosave = useAutosave({
    docs: session.autosaveDocs,
    activeId: session.activeId,
    write: (id) => sessionRef.current.autosave(id),
    enabled: autosaveOn,
    // the desktop window closing: whatever could not be written by itself (a document never saved) is asked about
    confirmClose: () => sessionRef.current.confirmExit(),
  })
  const [nextName, setNextName] = useState(1)
  const [initialToolbarDocId, setInitialToolbarDocId] = useState<number | null>(null)
  const [firstRunTourPending, setFirstRunTourPending] = useState(() => {
    try {
      return localStorage.getItem(TOOL_TOUR_COMPLETE_KEY) !== 'true'
    } catch (error) {
      console.warn('Could not read the first-run tool tour preference.', error)
      return true
    }
  })
  const [firstRunTourDocId, setFirstRunTourDocId] = useState<number | null>(null)
  const firstRunDocumentStarted = useRef(false)
  /** settings of the last created document — the next "New Document" starts from them */
  const [lastSettings, setLastSettings] = useState(() => defaultDocSettings(''))
  const [newPreset, setNewPreset] = useState<PagePreset | null>(null)
  const [newPresetUnit, setNewPresetUnit] = useState<Unit | null>(null)
  /** the left-hand dialog: creating a document, or changing the open document's settings */
  const [dialog, setDialog] = useState<'new' | 'setup' | 'export' | null>(null)
  const dialogOpen = dialog !== null
  const [preview, setPreview] = useState<DocSettings | null>(null)
  /** the parent (master) page open for editing instead of the document itself, if any */
  const [editingParentId, setEditingParentId] = useState<string | null>(null)
  /** the parent a click in "עמודי אב" marked "current": new pages get it automatically. Lives here, not in
   *  Workspace, because editing a parent remounts Workspace (its `key` changes) - state kept there would be lost
   *  the moment a parent is opened for editing and again the moment it's closed. */
  const [activeParentId, setActiveParentId] = useState<string | null>(null)
  const [workspaceStore, setWorkspaceStore] = useState(loadDockWorkspaceStore)
  const [dockLayout, setDockLayout] = useState<DockLayout>(() => {
    const active = workspaceStore.workspaces.find((workspace) => workspace.id === workspaceStore.activeId)
    const legacyOrder = loadLegacyDockTabOrder()
    return active?.layout ?? defaultDockLayout(ALL_DOCK_PANEL_IDS, legacyOrder.length ? legacyOrder : ALL_DOCK_PANEL_IDS)
  })
  const [saveWorkspaceDialogOpen, setSaveWorkspaceDialogOpen] = useState(false)
  const dockOpenId = dockLayout.openPanelId
  const enabledDockPanelIds = dockLayout.enabledPanelIds
  const setDockOpenId = (id: string | null) => setDockLayout((current) => ({ ...current, openPanelId: id }))
  const setDockTabOrder = (tabOrder: string[]) => setDockLayout((current) => ({ ...current, tabOrder }))
  const setFloatingDockPanelId = (floatingPanelId: string | null) => setDockLayout((current) => ({ ...current, floatingPanelId }))
  const setFloatingDockPosition = (floatingPosition: { x: number; y: number }) => setDockLayout((current) => ({ ...current, floatingPosition }))
  const toggleDockPanel = (id: string) => setDockLayout((current) => {
    const enabled = current.enabledPanelIds.includes(id)
    return {
      ...current,
      enabledPanelIds: enabled ? current.enabledPanelIds.filter((panelId) => panelId !== id) : [...current.enabledPanelIds, id],
      openPanelId: enabled ? (current.openPanelId === id ? null : current.openPanelId) : id,
    }
  })
  const saveWorkspace = (name: string) => {
    const matching = workspaceStore.workspaces.find((workspace) => workspace.name.toLocaleLowerCase() === name.toLocaleLowerCase())
    let id = matching?.id
    if (!id) {
      let suffix = workspaceStore.workspaces.length + 1
      id = `workspace-${suffix}`
      while (workspaceStore.workspaces.some((workspace) => workspace.id === id)) {
        suffix += 1
        id = `workspace-${suffix}`
      }
    }
    const next: DockWorkspaceStore = {
      activeId: id,
      workspaces: matching
        ? workspaceStore.workspaces.map((workspace) => workspace.id === id ? { id, name, layout: dockLayout } : workspace)
        : [...workspaceStore.workspaces, { id, name, layout: dockLayout }],
    }
    try {
      saveDockWorkspaceStore(next)
      setWorkspaceStore(next)
      setSaveWorkspaceDialogOpen(false)
    } catch (error) {
      setSaveWorkspaceDialogOpen(false)
      sessionRef.current.showError('לא ניתן לשמור סביבת עבודה', error)
    }
  }
  const selectWorkspace = useCallback((id: string) => {
    const selected = workspaceStore.workspaces.find((workspace) => workspace.id === id)
    if (!selected) return
    const next = { ...workspaceStore, activeId: id }
    try {
      saveDockWorkspaceStore(next)
    } catch (error) {
      sessionRef.current.showError('לא ניתן לשמור את סביבת העבודה שנבחרה', error)
    }
    setWorkspaceStore(next)
    setDockLayout(selected.layout)
  }, [workspaceStore])
  const [showRulers, setShowRulers] = useState(true)
  const [showGuides, setShowGuides] = useState(true)
  const [showHiddenChars, setShowHiddenChars] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const [showProps, setShowProps] = useState(true)
  const [showPages, setShowPages] = useState(true)
  const [showParagraph, setShowParagraph] = useState(false)
  /** what the shape tools make by a click, and the number of corners of the polygon tool */
  const [shapePrefs, setShapePrefs] = useState<ShapePrefs>(DEFAULT_SHAPE_PREFS)
  /** text loaded from a file / the clipboard, waiting for a click on the page (the loaded text cursor) */
  const [placing, setPlacing] = useState<PlacedText | null>(null)
  const [importOptionsFile, setImportOptionsFile] = useState<File | null>(null)
  /** pictures loaded from files / the clipboard, waiting for a click on the page */
  const [placingImages, setPlacingImages] = useState<PlacedImage[]>([])
  const [importPdfSource, setImportPdfSource] = useState<PdfImportSource | null>(null)
  const ws = useRef<WorkspaceHandle>(null)

  const editingParent = editingParentId ? (session.parents.find((p) => p.id === editingParentId) ?? null) : null
  // the parent being edited was deleted (from another tab, or Ctrl+Z): fall back to the document itself
  useEffect(() => {
    if (editingParentId && !editingParent) setEditingParentId(null)
  }, [editingParentId, editingParent])
  /** a pseudo document matching the parent's own size, so Workspace can edit it exactly like real pages - see
   *  parentEditDoc (pages.ts) for why it's a two-page spread whenever the document has facing pages. */
  const parentDoc: DocSettings | null = editingParent ? parentEditDoc(doc ?? defaultDocSettings(''), editingParent) : null
  const updateParent = (patch: Partial<ParentPage>, key?: string) => {
    if (!editingParentId) return
    session.changeParents(session.parents.map((p) => (p.id === editingParentId ? { ...p, ...patch } : p)), key)
  }

  const shown = editingParent ? parentDoc : (preview ?? doc)

  /** the document's content for PDF export: every page's assigned parent content mixed in, behind its own objects */
  const exportContent = useMemo(() => {
    if (!doc) return null
    const shadow = parentShadowContent(doc, session.parents, session.pageParents, session.sections, session.frames, undefined, session.parentOverrides, session.images, session.shapes)
    return {
      frames: [...shadow.frames, ...session.frames],
      images: [...shadow.images, ...session.images],
      shapes: [...shadow.shapes, ...session.shapes],
    }
  }, [doc, session.parents, session.pageParents, session.sections, session.frames, session.images, session.shapes, session.parentOverrides])

  const exportCurrentPagePng = useCallback(async () => {
    const currentDoc = doc
    const workspace = ws.current
    if (!currentDoc || !workspace || !exportContent) return
    try {
      sessionRef.current.notify('מייצא את העמוד הנוכחי ל־PNG…')
      const pageIndex = workspace.currentPageIndex()
      const prepared = prepareExport({
        doc: currentDoc,
        ...exportContent,
        layerOrder: session.layerOrder,
        assets: session.assets,
        paragraphStyles: session.paragraphStyles,
        sections: session.sections,
      })
      const page = prepared.rects[pageIndex]
      if (!page) throw new Error(`page ${pageIndex + 1} is unavailable for PNG export`)
      const canvas = await renderPage(prepared.content, prepared.flows, page, 0, 300)
      const safeName = currentDoc.name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'ללא שם'
      const saved = await deliverPng(canvas, `${safeName}-page-${pageIndex + 1}`)
      if (saved) sessionRef.current.notify(`העמוד ${pageIndex + 1} יוצא ל־PNG`)
    } catch (error) {
      sessionRef.current.showError('ייצוא PNG נכשל', error)
    }
  }, [doc, exportContent, session.assets, session.layerOrder, session.paragraphStyles, session.sections])

  /** pictures read and waiting for a click on the page; whatever could not be read is reported */
  const queuePlacedImages = (read: PlacedImage[], problems: string[]) => {
    if (problems.length > 0) session.showError(read.length > 0 ? 'חלק מהתמונות לא יובאו' : 'לא ניתן לייבא את התמונה', new Error(problems.join('\n')))
    if (read.length > 0) {
      setPlacing(null)
      setPlacingImages(read)
    }
  }
  /**
   * Files chosen, dropped or pasted: pictures are queued for the image cursor, a Word / text file is loaded into
   * the text cursor. Only one kind is loaded at a time.
   */
  const placeFiles = async (all: File[]) => {
    // an Imudist document is opened, not placed
    for (const f of all.filter(isDocumentFile)) await sessionRef.current.openTextFile(f)
    const files = all.filter((f) => !isDocumentFile(f))
    const pdfs = files.filter(isPdfFile)
    if (pdfs.length > 0) {
      if (pdfs.length !== 1 || files.length !== 1) {
        session.showError('ייבוא PDF', new ImportError('יש לבחור קובץ PDF אחד בכל פעם.'))
        return
      }
      try {
        const { openPdfFile } = await import('./importPdf')
        setImportPdfSource(await openPdfFile(pdfs[0]))
      } catch (e) {
        session.showError('לא ניתן לייבא את קובץ ה-PDF', e instanceof ImportError ? e : new ImportError('הקובץ פגום או מוגן בסיסמה.'))
      }
      return
    }
    const epsFiles = files.filter(isEpsFile)
    if (epsFiles.length > 0) {
      if (epsFiles.length !== 1 || files.length !== 1) {
        session.showError('ייבוא EPS', new ImportError('יש לבחור קובץ EPS אחד בכל פעם.'))
        return
      }
      if (!session.doc || preview) {
        session.notify('צור או פתח מסמך לפני ייבוא EPS')
        return
      }
      try {
        const shapes = await readEpsFile(epsFiles[0])
        if (!ws.current?.placeVectorShapes(shapes)) throw new ImportError('לא ניתן להוסיף את הצורות לעמוד הנוכחי.')
      } catch (e) {
        session.showError('לא ניתן לייבא את קובץ ה-EPS', e instanceof ImportError ? e : new ImportError(typeof e === 'string' ? e : e instanceof Error ? e.message : 'קובץ ה-EPS לא נקרא כראוי.'))
      }
      return
    }
    const pictures = files.filter(isImageFile)
    try {
      if (pictures.length > 0) {
        const read: PlacedImage[] = []
        const problems: string[] = []
        for (const f of pictures) {
          try {
            read.push(await readImageFile(f))
          } catch (e) {
            problems.push(e instanceof Error ? e.message : String(f.name))
          }
        }
        queuePlacedImages(read, problems)
      } else if (files.length > 0) {
        if (files[0].name.toLowerCase().endsWith('.docx')) {
          setImportOptionsFile(files[0])
          return
        }
        const text = await readPlacedText(files[0])
        setPlacingImages([])
        setPlacing(text)
      }
    } catch (e) {
      session.showError('לא ניתן לייבא את הקובץ', e instanceof ImportError ? e : new Error('הקובץ לא נקרא כראוי.'))
    }
  }
  const cancelPdfImport = () => {
    const source = importPdfSource
    setImportPdfSource(null)
    if (source) void source.destroy()
  }
  const confirmPdfImport = async (pageNumbers: number[]) => {
    const source = importPdfSource
    setImportPdfSource(null)
    if (!source || !doc) return
    try {
      const { readPdfFile } = await import('./importPdf')
      // the import takes a while for a long file, and the window shows nothing meanwhile: say how far it is
      session.notify(`מייבא PDF: ${pageNumbers.length} עמודים…`)
      const placed = await readPdfFile(source, pageNumbers, (done, total) => session.notify(`מייבא PDF: ${done} מתוך ${total} עמודים…`))
      let content: DocContent = {
        doc,
        frames: session.frames,
        images: session.images,
        assets: session.assets,
        guides: session.guides,
        shapes: session.shapes,
        paragraphStyles: session.paragraphStyles,
        parents: session.parents,
        pageParents: session.pageParents,
        sections: session.sections,
        parentOverrides: session.parentOverrides,
      }
      if (placed.length > content.doc.pages) {
        const currentMaster = activeParentId && session.parents.some((parent) => parent.id === activeParentId)
          ? activeParentId
          : session.parents[0]?.id ?? null
        const expanded = insertDocumentPages(content, content.doc.pages, placed.length - content.doc.pages, false, currentMaster)
        if (!expanded || expanded.doc.pages < placed.length) throw new ImportError('לא ניתן להוסיף את כל עמודי ה-PDF למסמך.')
        content = expanded
      }
      const rects = pageRects(content.doc)
      const images = [...content.images]
      const assets = { ...content.assets }
      placed.forEach(({ assetId, asset }, pageIndex) => {
        const page = rects[pageIndex]
        const margins = marginsOf(content.doc, pageIndex)
        const width = page.w - margins.left - margins.right
        const height = page.h - margins.top - margins.bottom
        if (width <= 0 || height <= 0) throw new ImportError(`לעמוד ${pageIndex + 1} אין שטח פנוי בין השוליים.`)
        images.push({
          id: newImportedImageId(),
          label: asset.name,
          x: page.x + margins.left,
          y: page.y + margins.top,
          w: width,
          h: height,
          assetId,
          fit: 'fit',
        })
        assets[assetId] = asset
      })
      setPlacing(null)
      setPlacingImages([])
      session.pages.commit({ ...content, images, assets })
      session.notify(placed.length === 1 ? 'יובא עמוד אחד מה-PDF' : `יובאו ${placed.length} עמודים מה-PDF`)
    } catch (e) {
      session.showError('לא ניתן לייבא את קובץ ה-PDF', e instanceof ImportError ? e : new ImportError(e instanceof Error ? e.message : 'הקובץ פגום או מוגן בסיסמה.'))
    } finally {
      await source.destroy()
    }
  }
  const confirmDocxImport = async (replaceSelected: boolean, includeFootnotes: boolean) => {
    const file = importOptionsFile
    setImportOptionsFile(null)
    if (!file) return
    try {
      const placed = await readPlacedText(file, { includeFootnotes })
      if (replaceSelected && ws.current?.replaceSelectedText(placed)) return
      setPlacingImages([])
      setPlacing(placed)
    } catch (e) {
      session.showError('לא ניתן לייבא את הקובץ', e instanceof ImportError ? e : new Error('הקובץ לא נקרא כראוי.'))
    }
  }
  /**
   * Files chosen or dropped in the desktop app, which (unlike a browser) knows where they are: pictures are linked to
   * their files instead of copied into the document, anything else is read and goes the usual way.
   */
  const placePaths = async (paths: string[]) => {
    if (paths.length === 0) return
    if (paths.every(isImagePath)) {
      const read: PlacedImage[] = []
      const problems: string[] = []
      for (const path of paths) {
        try {
          read.push(await readLinkedImage(path))
        } catch (e) {
          problems.push(e instanceof Error ? e.message : fileNameOf(path))
        }
      }
      queuePlacedImages(read, problems)
      return
    }
    try {
      const { readFile } = await import('@tauri-apps/plugin-fs')
      await placeFiles(await Promise.all(paths.map(async (path) => new File([await readFile(path)], fileNameOf(path)))))
    } catch (e) {
      session.showError('לא ניתן לייבא את הקובץ', e instanceof ImportError ? e : new Error('הקובץ לא נקרא כראוי.'))
    }
  }
  const importFiles = async () => {
    if (isTauri) {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const picked = await open({
        multiple: true,
        directory: false,
        filters: [{ name: 'קבצים נתמכים', extensions: [FILE_EXT.slice(1), 'docx', 'pdf', 'eps', 'txt', 'text', 'md', 'csv', ...IMAGE_FILE_EXTENSIONS] }],
      })
      await placePaths(picked ?? [])
      return
    }
    const files = await pickFiles(
      `${FILE_EXT},.docx,.pdf,.eps,.txt,.text,.md,.csv,.png,.jpg,.jpeg,.gif,.webp,.svg,.bmp,.avif,image/*,application/pdf,application/postscript,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
      true,
    )
    if (files.length > 0) await placeFiles(files)
  }
  // Paragraph Styles panel's "ייבוא סגנונות" (Load Paragraph Styles…): read another Imudist file and merge
  // its paragraph and character styles into this document's, renaming/renumbering ids as needed so nothing collides.
  const importParagraphStyles = async () => {
    const [file] = await pickFiles(FILE_EXT)
    if (!file) return
    try {
      const parsed = parseDocument(await file.text(), baseName(file.name))
      // the character styles come along, and the nested rules of the paragraph styles are pointed at their new ids; one undo step
      const characters = mergeCharacterStyles(sessionRef.current.characterStyles, parsed.characterStyles ?? [])
      const paragraphs = mergeParagraphStyles(sessionRef.current.paragraphStyles, remapNestedStyles(parsed.paragraphStyles, characters.idMap))
      sessionRef.current.pages.commit({ paragraphStyles: paragraphs, ...(characters.styles !== sessionRef.current.characterStyles ? { characterStyles: characters.styles } : {}) })
    } catch (e) {
      session.showError('לא ניתן לייבא את הסגנונות', e instanceof FileFormatError ? e : new Error('הקובץ לא נקרא כראוי.'))
    }
  }
  const menus = useMemo(
    () =>
      buildMenus({
        hasDoc: !!shown,
        ws,
        showRulers,
        showGuides,
        showHiddenChars,
        previewMode,
        setPreviewMode,
        showProps,
        toggleProps: () => setShowProps((v) => !v),
        showPages,
        togglePages: () => setShowPages((v) => !v),
        showParagraph,
        toggleParagraph: () => setShowParagraph((v) => !v),
        dockOpenId,
        onDockOpenChange: setDockOpenId,
        enabledDockPanelIds,
        onDockPanelToggle: toggleDockPanel,
        savedWorkspaces: workspaceStore.workspaces.map(({ id, name }) => ({ id, name })),
        activeWorkspaceId: workspaceStore.activeId,
        saveWorkspace: () => setSaveWorkspaceDialogOpen(true),
        selectWorkspace,
        loadSystemFonts: () => void loadSystemFonts(),
        fontStatus: fontCatalog.status,
        fontCount: fontCatalog.families.length,
        documentSetup: () => setDialog('setup'),
        importText: () => void importFiles(),
        importParagraphStyles: () => void importParagraphStyles(),
        canUndo: history.canUndo && !preview,
        canRedo: history.canRedo && !preview,
        undo: history.undo,
        redo: history.redo,
        recent: session.recent,
        canRevert: !!session.file?.handle && session.dirty,
        openFile: () => void sessionRef.current.openFile(),
        openRecent: (entry) => void sessionRef.current.openRecent(entry),
        save: () => void sessionRef.current.save(),
        saveAs: () => void sessionRef.current.saveAs(),
        saveCopy: () => void sessionRef.current.saveAs(true),
        autosave: autosaveOn,
        toggleAutosave,
        revert: () => sessionRef.current.revert(),

        newDocument: () => setDialog('new'),
        closeDocument: () => sessionRef.current.closeDocument(),
        openDocs: session.tabs.map((t) => ({ id: t.id, name: t.name, active: t.id === session.activeId })),
        switchDoc: (id) => sessionRef.current.switchTo(id),
        toggleRulers: () => setShowRulers((v) => !v),
        toggleGuides: () => setShowGuides((v) => !v),
        toggleHiddenChars: () => setShowHiddenChars((v) => !v),
        exportPdf: () => setDialog('export'),
        exportPng: () => void exportCurrentPagePng(),
        newBook: () => void bookRef.current.create(),
        openBook: () => void bookRef.current.open(),
        bookPanelOpen: book.panelOpen,
        toggleBookPanel: () => bookRef.current.setPanelOpen(!bookRef.current.panelOpen),
      }),
    // the session's actions are recreated every render, so they are refreshed whenever what they depend on changes
    [book.panelOpen, shown, showRulers, showGuides, showHiddenChars, previewMode, showProps, showPages, showParagraph, dockOpenId, enabledDockPanelIds, workspaceStore, selectWorkspace, fontCatalog.status, fontCatalog.families.length, history.canUndo, history.canRedo, preview, session.recent, session.file, session.dirty, session.history.value, session.tabs, session.activeId, autosaveOn, exportCurrentPagePng],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (session.modal || saveWorkspaceDialogOpen) return // a question is open: only the dialog's own keys
      const typing = isTyping(e.target)
      // single-key shortcuts (like W) must not fire while typing in a field
      if (typing && !e.ctrlKey && !e.metaKey && !e.altKey) return
      // in ordinary fields Ctrl+Z / Ctrl+Y / Ctrl+A keep their native meaning; only the text editor uses ours
      if (typing && !isTextEditor(e.target) && !(isTableCellEditor(e.target) && (isKey(e, 'z') || isKey(e, 'y'))) && (isKey(e, 'z') || isKey(e, 'y') || isKey(e, 'a'))) return
      if ((e.ctrlKey || e.metaKey) && isKey(e, 'y') && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        if (!preview) history.redo()
        return
      }
      const item = findShortcut(menus, e)
      if (!item) return
      e.preventDefault()
      item.onClick?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menus, preview, history.redo, session.modal, saveWorkspaceDialogOpen])

  // a different document: nothing is loaded any more
  useEffect(() => {
    setPlacing(null)
    setPlacingImages([])
  }, [session.docId, !!doc])

  // Ctrl+V outside a text box loads the clipboard text into the text cursor
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!doc || session.modal || saveWorkspaceDialogOpen || isTyping(e.target)) return
      const pictures = Array.from(e.clipboardData?.files ?? []).filter(isImageFile)
      if (pictures.length > 0) {
        e.preventDefault()
        void placeFiles(pictures)
        return
      }
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (!text.trim()) return
      e.preventDefault()
      setPlacingImages([])
      setPlacing(placedFromPlainText('הטקסט מהלוח', text))
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [doc, session.modal, saveWorkspaceDialogOpen])

  // dropping a Word / text file onto the window loads it into the text cursor
  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      // the items are only valid during the event: ask for the handles (they let a dropped document be saved in place) now
      const items = Array.from(e.dataTransfer?.items ?? []).filter((it) => it.kind === 'file')
      const dropped = items.map((it) => {
        const file = it.getAsFile()
        const handle = file && isDocumentFile(file) ? (it as DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> }).getAsFileSystemHandle?.() : undefined
        return { file, handle }
      })
      const files = dropped.map((d) => d.file).filter((f): f is File => !!f)
      if (files.length === 0) return
      void (async () => {
        // Imudist documents open anywhere, even on the start screen
        for (const d of dropped) {
          if (!d.file || !isDocumentFile(d.file)) continue
          const h = await d.handle?.catch(() => null)
          await sessionRef.current.openTextFile(d.file, h && h.kind === 'file' ? (h as FileSystemFileHandle) : null)
        }
        const rest = files.filter((f) => !isDocumentFile(f))
        if (rest.length === 0) return
        if (!doc) sessionRef.current.notify('צור מסמך חדש או פתח קובץ לפני הוספת קבצים')
        else void placeFiles(rest)
      })()
    }
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [doc])
  // the desktop app gets dropped files as paths (the webview doesn't hand them over as File objects), so pictures can be linked
  const dropPaths = useRef((_paths: string[], _position?: { x: number; y: number }) => {})
  dropPaths.current = (paths, position) => {
    // dropped on the Book panel: the document files become chapters of the book
    const overBook = !!position && !!bookRef.current.book && !!document.elementFromPoint(position.x / window.devicePixelRatio, position.y / window.devicePixelRatio)?.closest('.book-panel')
    if (overBook) {
      void bookRef.current.dropFiles({ paths })
      return
    }
    if (!doc && !paths.some((path) => path.toLowerCase().endsWith(FILE_EXT))) sessionRef.current.notify('צור מסמך חדש או פתח קובץ לפני הוספת קבצים')
    else void placePaths(paths)
  }
  useEffect(() => {
    if (!isTauri) return
    let stop: (() => void) | undefined
    let disposed = false
    void import('@tauri-apps/api/webview')
      .then(({ getCurrentWebview }) =>
        getCurrentWebview().onDragDropEvent((event) => {
          if (event.payload.type === 'drop') dropPaths.current(event.payload.paths, event.payload.position)
        }),
      )
      .then((unlisten) => (disposed ? unlisten() : (stop = unlisten)))
    return () => {
      disposed = true
      stop?.()
    }
  }, [])
  // double-clicking a .imudist file in Windows (when the app is installed) hands the file to the running app
  useEffect(() => {
    const queue = (window as unknown as { launchQueue?: { setConsumer: (fn: (p: { files: FileSystemFileHandle[] }) => void) => void } }).launchQueue
    queue?.setConsumer((params) => {
      for (const handle of params.files) void sessionRef.current.openHandle(handle)
    })
  }, [])

  // the browser tab shows the document's name, with a dot while it has unsaved changes
  useEffect(() => {
    document.title = doc ? `${session.dirty ? '• ' : ''}${doc.name} — ${APP_NAME}` : APP_NAME
  }, [doc, session.dirty])

  const closeDialog = useCallback(() => {
    setDialog(null)
    setPreview(null)
    setNewPreset(null)
    setNewPresetUnit(null)
  }, [setDialog, setPreview, setNewPreset, setNewPresetUnit])

  const openNewDocument = (preset?: PagePreset, unit?: Unit) => {
    setNewPreset(preset ?? null)
    setNewPresetUnit(unit ?? null)
    setDialog('new')
  }

  const create = useCallback((d: DocSettings) =>
    sessionRef.current.createDocument(d, (id) => {
      setInitialToolbarDocId(id)
      setNextName((n) => n + 1)
      setLastSettings(d)
      closeDialog()
    }), [closeDialog, setInitialToolbarDocId, setNextName, setLastSettings])

  useEffect(() => {
    if (!firstRunTourPending || session.activeId !== null || firstRunDocumentStarted.current) return
    firstRunDocumentStarted.current = true
    setFirstRunTourDocId(create(defaultDocSettings(`ללא שם-${nextName}`)))
  }, [create, firstRunTourPending, nextName, session.activeId])

  const completeFirstRunTour = useCallback(() => {
    try {
      localStorage.setItem(TOOL_TOUR_COMPLETE_KEY, 'true')
    } catch (error) {
      console.warn('Could not save the first-run tool tour preference.', error)
    }
    setFirstRunTourPending(false)
    setFirstRunTourDocId(null)
  }, [setFirstRunTourPending, setFirstRunTourDocId])

  // the empty frames made automatically on the margins, counted only while the settings window is open
  const emptyFrames = useMemo(() => (dialog === 'setup' && doc ? emptyPrimaryFrameIds(doc, session.frames).length : 0), [dialog, doc, session.frames])

  const fitKey = editingParentId
    ? `parent:${editingParentId}`
    : preview
      ? [preview.width, preview.height, preview.perRow, preview.rowsCustom, JSON.stringify(preview.pageJoins), JSON.stringify(preview.pageSizes), preview.pages, preview.facingPages, preview.binding, preview.startPage].join('|')
      : String(session.docId)
  const customWebSize =
    !newPreset && newPresetUnit === 'px'
      ? {
          width: 1200,
          height: Math.min(
            1200,
            MAX_PAGE_PT,
            Math.max(MIN_PAGE_PT, (1200 * Math.min(lastSettings.width, lastSettings.height)) / Math.max(lastSettings.width, lastSettings.height)),
          ),
        }
      : {}
  const newDocInitial = {
    ...lastSettings,
    ...(newPreset
      ? newPreset.rotateWithDocument !== false && lastSettings.width > lastSettings.height
        ? { width: newPreset.height, height: newPreset.width }
        : { width: newPreset.width, height: newPreset.height }
      : customWebSize),
    unit: newPresetUnit ?? newPreset?.unit ?? lastSettings.unit,
    name: `ללא שם-${nextName}`,
  }

  return (
    <div className="app">
      <MenuBar menus={menus} />
      <div className="app-body">
        <div className="stage">
          {shown ? (
            <Workspace
              key={editingParentId ? `parent:${editingParentId}` : preview ? 'preview' : session.docId}
              ref={ws}
              doc={shown}
              initiallySelectPrimaryFrame={!preview && !editingParent && session.activeId === initialToolbarDocId}
              onInitialSelectionApplied={() => setInitialToolbarDocId((id) => id === session.activeId ? null : id)}
              startInitialTour={!preview && !editingParent && firstRunTourPending && session.activeId === firstRunTourDocId}
              onInitialTourComplete={completeFirstRunTour}
              fitKey={fitKey}
              showRulers={showRulers}
              showGuides={showGuides}
              showHiddenChars={showHiddenChars}
              showProps={showProps}
              showPages={showPages}
              showParagraph={showParagraph}
              previewMode={previewMode}
              onPreviewMode={setPreviewMode}
              frames={editingParent ? editingParent.frames : preview ? NO_FRAMES : session.frames}
              onFramesChange={editingParent ? (next, key) => updateParent({ frames: next }, key) : preview ? noop : session.changeFrames}
              pageOps={editingParent ? NO_PAGE_OPS : preview ? NO_PAGE_OPS : session.pages}
              placing={preview ? null : placing}
              onPlacingChange={preview ? noop : setPlacing}
              documentSessionId={session.activeId}
              images={editingParent ? editingParent.images : preview ? NO_IMAGES : session.images}
              assets={session.assets}
              colorSamples={preview ? [] : session.colorSamples}
              onImagesChange={editingParent ? (next, key) => updateParent({ images: next }, key) : preview ? noop : session.changeImages}
              onReplaceImageAsset={(docId, parentId, imageId, expectedAssetId, assetId, asset) =>
                sessionRef.current.replaceImageAsset(docId, parentId, imageId, expectedAssetId, assetId, asset)}
              onNotify={(message) => sessionRef.current.notify(message)}
              onShowError={(title, error) => sessionRef.current.showError(title, error)}
              placingImages={preview ? NO_PLACED : placingImages}
              onPlacingImagesChange={preview ? noop : setPlacingImages}
              guides={editingParent ? editingParent.guides ?? NO_GUIDES : preview ? NO_GUIDES : session.guides}
              onGuidesChange={editingParent ? (next, key) => updateParent({ guides: next }, key) : preview ? noop : session.changeGuides}
              onShowGuides={() => setShowGuides(true)}
              shapes={editingParent ? editingParent.shapes : preview ? NO_SHAPES : session.shapes}
              onShapesChange={editingParent ? (next, key) => updateParent({ shapes: next }, key) : preview ? noop : session.changeShapes}
              layerOrder={editingParent ? ['layer-1'] : session.layerOrder}
              onLayerStackChange={editingParent ? noop : preview ? noop : session.changeLayerOrder}
              paragraphStyles={preview ? NO_PARAGRAPH_STYLES : session.paragraphStyles}
              characterStyles={preview ? NO_CHARACTER_STYLES : session.characterStyles}
              onParagraphStylesChange={preview ? noop : session.changeParagraphStyles}
              parents={preview ? NO_PARENTS : session.parents}
              onParentsChange={preview ? noop : session.changeParents}
              pageParents={preview ? NO_PAGE_PARENTS : session.pageParents}
              onPageParentsChange={preview ? noop : session.changePageParents}
              sections={preview ? NO_SECTIONS : session.sections}
              onSectionsChange={preview ? noop : session.changeSections}
              parentOverrides={preview ? [] : session.parentOverrides}
              editingParentId={editingParentId}
              onEditParent={setEditingParentId}
              onExitParentEdit={() => setEditingParentId(null)}
              activeParentId={activeParentId}
              onSelectParent={setActiveParentId}
              dockOpenId={dockOpenId}
              onDockOpenChange={setDockOpenId}
              onDockPanelToggle={toggleDockPanel}
              enabledDockPanelIds={enabledDockPanelIds}
              dockTabOrder={dockLayout.tabOrder}
              onDockTabOrderChange={setDockTabOrder}
              floatingDockPanelId={dockLayout.floatingPanelId}
              onFloatingDockPanelChange={setFloatingDockPanelId}
              floatingDockPosition={dockLayout.floatingPosition}
              onFloatingDockPositionChange={setFloatingDockPosition}
              shapePrefs={shapePrefs}
              onShapePrefs={setShapePrefs}
              dirty={!preview && session.dirty}
              onClose={preview ? undefined : () => session.closeDocument()}
              renderTabs={
                preview
                  ? undefined
                  : (zoomText) => (
                      <DocTabs
                        tabs={session.tabs}
                        activeId={session.activeId}
                        zoomText={zoomText}
                        autosave={autosave.state}
                        onSelect={session.switchTo}
                        onClose={(id) => session.closeDocument(id)}
                        onNew={() => openNewDocument()}
                      />
                    )
              }
              initialView={preview ? null : session.view}
              onLeaveView={(v) => {
                if (!preview && session.activeId !== null) session.rememberView(session.activeId, v)
              }}
            />
          ) : (
            <Home
              appName={APP_NAME}
              recent={session.recent}
              onNew={openNewDocument}
              onOpen={() => void session.openFile()}
              onOpenRecent={(entry) => void session.openRecent(entry)}
              onRemoveRecent={(entry) => void session.forgetRecent(entry)}
            />
          )}
          {dialogOpen && !preview && <div className="stage-dim" />}
        </div>
        {dialog === 'setup' && doc && (
          <DocumentSetupDialog
            initial={doc}
            removableFrames={emptyFrames}
            onApply={(next, options) => {
              // nothing changed: nothing to undo or save
              if (JSON.stringify(next) !== JSON.stringify(doc) || options.dropEmptyFrames) {
                session.pages.setup(next, undefined, options)
                // bring the rearranged pages into view once the new layout is in place
                window.setTimeout(() => ws.current?.fitSpread(), 60)
              }
              closeDialog()
            }}
            onClose={closeDialog}
          />
        )}
        {dialog === 'new' && (
          <NewDocumentDialog
            initial={newDocInitial}
            onCreate={create}
            onClose={closeDialog}
            onPreview={setPreview}
          />
        )}
        {dialog === 'export' && doc && exportContent && (
          <ExportPdfDialog doc={doc} frames={exportContent.frames} images={exportContent.images} shapes={exportContent.shapes} layerOrder={session.layerOrder} assets={session.assets} paragraphStyles={session.paragraphStyles} sections={session.sections} onClose={closeDialog} />
        )}
      </div>
      {session.toast && <div className="toast" role="status">{session.toast}</div>}
      <BookPanel controller={book} />
      <ChapterPicker controller={book} />
      <SyncDialog controller={book} />
      <BookExportDialog controller={book} />
      {session.modal && <Modal spec={session.modal} />}
      {saveWorkspaceDialogOpen && <SaveWorkspaceDialog onSave={saveWorkspace} onClose={() => setSaveWorkspaceDialogOpen(false)} />}
      {importOptionsFile && <ImportOptionsDialog fileName={importOptionsFile.name} canReplace={!!ws.current && !!doc && ws.current.canReplaceSelectedText()} onConfirm={(replaceSelected, includeFootnotes) => void confirmDocxImport(replaceSelected, includeFootnotes)} onClose={() => setImportOptionsFile(null)} />}
      {importPdfSource && <ImportPdfOptionsDialog fileName={importPdfSource.file.name} pageCount={importPdfSource.pageCount} onConfirm={(pages) => void confirmPdfImport(pages)} onClose={cancelPdfImport} />}
    </div>
  )
}
