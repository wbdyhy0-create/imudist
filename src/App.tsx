import { useEffect, useMemo, useRef, useState } from 'react'
import { Home } from './components/Home'
import { MenuBar } from './components/MenuBar'
import { Modal } from './components/Modal'
import { NewDocumentDialog } from './components/NewDocumentDialog'
import { Workspace, type WorkspaceHandle } from './components/Workspace'
import { defaultDocSettings, type DocSettings, type TextFrame } from './document'
import { isTextEditor, isTyping } from './dom'
import { buildMenus, findShortcut } from './menus'
import { useDocumentSession, type PageOps } from './useDocumentSession'

const APP_NAME = 'Imudist'
const NO_FRAMES: TextFrame[] = []
const noop = () => {}
const NO_PAGE_OPS: PageOps = { insert: noop, remove: noop, move: noop, setup: noop }
/** Letter key by name or physical position (so it also works with a Hebrew keyboard layout). */
const isKey = (e: KeyboardEvent, letter: string) => e.key.toLowerCase() === letter || e.code === 'Key' + letter.toUpperCase()

export default function App() {
  const session = useDocumentSession()
  const { doc, history } = session
  const [nextName, setNextName] = useState(1)
  /** settings of the last created document — the next "New Document" starts from them */
  const [lastSettings, setLastSettings] = useState(() => defaultDocSettings(''))
  /** the left-hand dialog: creating a document, or changing the open document's settings */
  const [dialog, setDialog] = useState<'new' | 'setup' | null>(null)
  const dialogOpen = dialog !== null
  const [preview, setPreview] = useState<DocSettings | null>(null)
  const [showRulers, setShowRulers] = useState(true)
  const [showGuides, setShowGuides] = useState(true)
  const [previewMode, setPreviewMode] = useState(false)
  const [showProps, setShowProps] = useState(true)
  const [showPages, setShowPages] = useState(true)
  const ws = useRef<WorkspaceHandle>(null)

  const shown = preview ?? doc

  const menus = useMemo(
    () =>
      buildMenus({
        hasDoc: !!shown,
        ws,
        showRulers,
        showGuides,
        previewMode,
        setPreviewMode,
        showProps,
        toggleProps: () => setShowProps((v) => !v),
        showPages,
        togglePages: () => setShowPages((v) => !v),
        documentSetup: () => setDialog('setup'),
        canUndo: history.canUndo && !preview,
        canRedo: history.canRedo && !preview,
        undo: history.undo,
        redo: history.redo,
        recent: session.recent,
        canRevert: !!session.file?.handle && session.dirty,
        openFile: () => void session.openFile(),
        openRecent: (entry) => void session.openRecent(entry),
        save: () => void session.save(),
        saveAs: () => void session.saveAs(),
        saveCopy: () => void session.saveAs(true),
        revert: session.revert,
        newDocument: () => setDialog('new'),
        closeDocument: session.closeDocument,
        toggleRulers: () => setShowRulers((v) => !v),
        toggleGuides: () => setShowGuides((v) => !v),
      }),
    // the session's actions are recreated every render, so they are refreshed whenever what they depend on changes
    [shown, showRulers, showGuides, previewMode, showProps, showPages, history.canUndo, history.canRedo, preview, session.recent, session.file, session.dirty, session.doc, session.frames],
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

  const fitKey = preview
    ? [preview.width, preview.height, preview.pages, preview.facingPages, preview.binding, preview.startPage].join('|')
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
              showProps={showProps}
              showPages={showPages}
              previewMode={previewMode}
              onPreviewMode={setPreviewMode}
              frames={preview ? NO_FRAMES : session.frames}
              onFramesChange={preview ? noop : session.changeFrames}
              pageOps={preview ? NO_PAGE_OPS : session.pages}
              dirty={!preview && session.dirty}
              onClose={preview ? undefined : session.closeDocument}
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
          <NewDocumentDialog
            mode="setup"
            initial={doc}
            onCreate={(next) => {
              // nothing changed: nothing to undo or save
              if (JSON.stringify(next) !== JSON.stringify(doc)) session.pages.setup(next)
              closeDialog()
            }}
            onClose={closeDialog}
            onPreview={noop}
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
      </div>
      {session.toast && <div className="toast" role="status">{session.toast}</div>}
      {session.modal && <Modal spec={session.modal} />}
    </div>
  )
}
