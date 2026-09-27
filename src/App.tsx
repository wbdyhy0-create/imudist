import { useEffect, useMemo, useRef, useState } from 'react'
import { Home } from './components/Home'
import { MenuBar } from './components/MenuBar'
import { Modal } from './components/Modal'
import { DocumentSetupDialog } from './components/DocumentSetupDialog'
import { ExportPdfDialog } from './components/ExportPdfDialog'
import { NewDocumentDialog } from './components/NewDocumentDialog'
import { DocTabs } from './components/DocTabs'
import { Workspace, type WorkspaceHandle } from './components/Workspace'
import { DEFAULT_PARAGRAPH_STYLES, defaultDocSettings, type DocSettings, type Guide, type ImageFrame, type ParagraphStyleRecord, type ShapeFrame, type TextFrame } from './document'
import { DEFAULT_SHAPE_PREFS, type ShapePrefs } from './shapes'
import { emptyPrimaryFrameIds } from './placeText'
import { isTextEditor, isTyping } from './dom'
import { buildMenus, findShortcut } from './menus'
import { baseName, pickFiles } from './fileio'
import { FILE_EXT, FileFormatError, mergeParagraphStyles, parseDocument } from './fileFormat'
import { isImageFile, readImageFile, type PlacedImage } from './importImage'
import { ImportError, placedFromPlainText, readPlacedText, type PlacedText } from './importText'
import { ImportOptionsDialog } from './components/ImportOptionsDialog'
import { useDocumentSession, type PageOps } from './useDocumentSession'

const APP_NAME = 'Imudist'
const NO_FRAMES: TextFrame[] = []
const NO_IMAGES: ImageFrame[] = []
const NO_PLACED: PlacedImage[] = []
const NO_GUIDES: Guide[] = []
const NO_SHAPES: ShapeFrame[] = []
const NO_PARAGRAPH_STYLES: ParagraphStyleRecord[] = DEFAULT_PARAGRAPH_STYLES
const noop = () => {}
const NO_PAGE_OPS: PageOps = { insert: noop, remove: noop, move: noop, setup: noop, commit: noop }
/** Letter key by name or physical position (so it also works with a Hebrew keyboard layout). */
const isDocumentFile = (f: File) => f.name.toLowerCase().endsWith(FILE_EXT)
const isKey = (e: KeyboardEvent, letter: string) => e.key.toLowerCase() === letter || e.code === 'Key' + letter.toUpperCase()

export default function App() {
  const session = useDocumentSession()
  // menu items are memoized, so they call the session through this ref and never run an outdated action
  const sessionRef = useRef(session)
  sessionRef.current = session
  const { doc, history } = session
  const [nextName, setNextName] = useState(1)
  /** settings of the last created document — the next "New Document" starts from them */
  const [lastSettings, setLastSettings] = useState(() => defaultDocSettings(''))
  /** the left-hand dialog: creating a document, or changing the open document's settings */
  const [dialog, setDialog] = useState<'new' | 'setup' | 'export' | null>(null)
  const dialogOpen = dialog !== null
  const [preview, setPreview] = useState<DocSettings | null>(null)
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
  const ws = useRef<WorkspaceHandle>(null)

  const shown = preview ?? doc

  /**
   * Files chosen, dropped or pasted: pictures are queued for the image cursor, a Word / text file is loaded into
   * the text cursor. Only one kind is loaded at a time.
   */
  const placeFiles = async (all: File[]) => {
    // an Imudist document is opened, not placed
    for (const f of all.filter(isDocumentFile)) await sessionRef.current.openTextFile(f)
    const files = all.filter((f) => !isDocumentFile(f))
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
        if (problems.length > 0) session.showError(read.length > 0 ? 'חלק מהתמונות לא יובאו' : 'לא ניתן לייבא את התמונה', new Error(problems.join('\n')))
        if (read.length > 0) {
          setPlacing(null)
          setPlacingImages(read)
        }
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
  const confirmDocxImport = async (replaceSelected: boolean) => {
    const file = importOptionsFile
    setImportOptionsFile(null)
    if (!file) return
    try {
      const placed = await readPlacedText(file)
      if (replaceSelected && ws.current?.replaceSelectedText(placed)) return
      setPlacingImages([])
      setPlacing(placed)
    } catch (e) {
      session.showError('לא ניתן לייבא את הקובץ', e instanceof ImportError ? e : new Error('הקובץ לא נקרא כראוי.'))
    }
  }
  const importFiles = async () => {
    const files = await pickFiles(
      `${FILE_EXT},.docx,.txt,.text,.md,.csv,.png,.jpg,.jpeg,.gif,.webp,.svg,.bmp,.avif,image/*,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
      true,
    )
    if (files.length > 0) await placeFiles(files)
  }
  // Paragraph Styles panel's "ייבוא סגנונות" (Load Paragraph Styles…): read another Imudist file and merge
  // its paragraph styles into this document's, renaming/renumbering ids as needed so nothing collides.
  const importParagraphStyles = async () => {
    const [file] = await pickFiles(FILE_EXT)
    if (!file) return
    try {
      const parsed = parseDocument(await file.text(), baseName(file.name))
      sessionRef.current.changeParagraphStyles(mergeParagraphStyles(sessionRef.current.paragraphStyles, parsed.paragraphStyles))
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
        revert: () => sessionRef.current.revert(),

        newDocument: () => setDialog('new'),
        closeDocument: () => sessionRef.current.closeDocument(),
        openDocs: session.tabs.map((t) => ({ id: t.id, name: t.name, active: t.id === session.activeId })),
        switchDoc: (id) => sessionRef.current.switchTo(id),
        toggleRulers: () => setShowRulers((v) => !v),
        toggleGuides: () => setShowGuides((v) => !v),
        toggleHiddenChars: () => setShowHiddenChars((v) => !v),
        exportPdf: () => setDialog('export'),
      }),
    // the session's actions are recreated every render, so they are refreshed whenever what they depend on changes
    [shown, showRulers, showGuides, showHiddenChars, previewMode, showProps, showPages, showParagraph, history.canUndo, history.canRedo, preview, session.recent, session.file, session.dirty, session.history.value, session.tabs, session.activeId],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (session.modal) return // a question is open: only the question's own keys
      const typing = isTyping(e.target)
      // single-key shortcuts (like W) must not fire while typing in a field
      if (typing && !e.ctrlKey && !e.metaKey && !e.altKey) return
      // in ordinary fields Ctrl+Z / Ctrl+Y / Ctrl+A keep their native meaning; only the text editor uses ours
      if (typing && !isTextEditor(e.target) && (isKey(e, 'z') || isKey(e, 'y') || isKey(e, 'a'))) return
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
  }, [menus, preview, history.redo, session.modal])

  // a different document: nothing is loaded any more
  useEffect(() => {
    setPlacing(null)
    setPlacingImages([])
  }, [session.docId, !!doc])

  // Ctrl+V outside a text box loads the clipboard text into the text cursor
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!doc || session.modal || isTyping(e.target)) return
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
  }, [doc, session.modal])

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

  const closeDialog = () => {
    setDialog(null)
    setPreview(null)
  }

  const create = (d: DocSettings) =>
    session.createDocument(d, () => {
      setNextName((n) => n + 1)
      setLastSettings(d)
      closeDialog()
    })

  // the empty frames made automatically on the margins, counted only while the settings window is open
  const emptyFrames = useMemo(() => (dialog === 'setup' && doc ? emptyPrimaryFrameIds(doc, session.frames).length : 0), [dialog, doc, session.frames])

  const fitKey = preview
    ? [preview.width, preview.height, preview.perRow, preview.rowsCustom, JSON.stringify(preview.pageJoins), JSON.stringify(preview.pageSizes), preview.pages, preview.facingPages, preview.binding, preview.startPage].join('|')
    : String(session.docId)

  return (
    <div className="app">
      <MenuBar menus={menus} />
      <div className="app-body">
        <div className="stage">
          {shown ? (
            <Workspace
              key={preview ? 'preview' : session.docId}
              ref={ws}
              doc={shown}
              fitKey={fitKey}
              showRulers={showRulers}
              showGuides={showGuides}
              showHiddenChars={showHiddenChars}
              showProps={showProps}
              showPages={showPages}
              showParagraph={showParagraph}
              previewMode={previewMode}
              onPreviewMode={setPreviewMode}
              frames={preview ? NO_FRAMES : session.frames}
              onFramesChange={preview ? noop : session.changeFrames}
              pageOps={preview ? NO_PAGE_OPS : session.pages}
              placing={preview ? null : placing}
              onPlacingChange={preview ? noop : setPlacing}
              images={preview ? NO_IMAGES : session.images}
              assets={session.assets}
              onImagesChange={preview ? noop : session.changeImages}
              placingImages={preview ? NO_PLACED : placingImages}
              onPlacingImagesChange={preview ? noop : setPlacingImages}
              guides={preview ? NO_GUIDES : session.guides}
              onGuidesChange={preview ? noop : session.changeGuides}
              onShowGuides={() => setShowGuides(true)}
              shapes={preview ? NO_SHAPES : session.shapes}
              onShapesChange={preview ? noop : session.changeShapes}
              paragraphStyles={preview ? NO_PARAGRAPH_STYLES : session.paragraphStyles}
              onParagraphStylesChange={preview ? noop : session.changeParagraphStyles}
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
                        onSelect={session.switchTo}
                        onClose={(id) => session.closeDocument(id)}
                        onNew={() => setDialog('new')}
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
              onNew={() => setDialog('new')}
              onOpen={() => void session.openFile()}
              onOpenRecent={(entry) => void session.openRecent(entry)}
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
            initial={{ ...lastSettings, name: `ללא שם-${nextName}` }}
            onCreate={create}
            onClose={closeDialog}
            onPreview={setPreview}
          />
        )}
        {dialog === 'export' && doc && (
          <ExportPdfDialog doc={doc} frames={session.frames} images={session.images} shapes={session.shapes} assets={session.assets} onClose={closeDialog} />
        )}
      </div>
      {session.toast && <div className="toast" role="status">{session.toast}</div>}
      {session.modal && <Modal spec={session.modal} />}
      {importOptionsFile && <ImportOptionsDialog fileName={importOptionsFile.name} canReplace={!!ws.current && !!doc && ws.current.canReplaceSelectedText()} onConfirm={(replaceSelected) => void confirmDocxImport(replaceSelected)} onClose={() => setImportOptionsFile(null)} />}
    </div>
  )
}
