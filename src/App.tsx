import { useEffect, useMemo, useRef, useState } from 'react'
import { Home } from './components/Home'
import { MenuBar } from './components/MenuBar'
import { NewDocumentDialog } from './components/NewDocumentDialog'
import { Workspace, type WorkspaceHandle } from './components/Workspace'
import { defaultDocSettings, type DocSettings, type TextFrame } from './document'
import { isTextEditor, isTyping } from './dom'
import { useHistory } from './history'
import { buildMenus, findShortcut } from './menus'

const APP_NAME = 'Imudist'
const NO_FRAMES: TextFrame[] = []
const noop = () => {}
/** Letter key by name or physical position (so it also works with a Hebrew keyboard layout). */
const isKey = (e: KeyboardEvent, letter: string) => e.key.toLowerCase() === letter || e.code === 'Key' + letter.toUpperCase()

export default function App() {
  const [doc, setDoc] = useState<DocSettings | null>(null)
  const [docId, setDocId] = useState(0)
  const [nextName, setNextName] = useState(1)
  /** settings of the last created document — the next "New Document" starts from them */
  const [lastSettings, setLastSettings] = useState(() => defaultDocSettings(''))
  const [dialogOpen, setDialogOpen] = useState(false)
  const [preview, setPreview] = useState<DocSettings | null>(null)
  const [showRulers, setShowRulers] = useState(true)
  const [showGuides, setShowGuides] = useState(true)
  const [previewMode, setPreviewMode] = useState(false)
  const [showProps, setShowProps] = useState(true)
  /** text frames of the open document (kept here so they survive the New Document panel's live preview) */
  const history = useHistory<TextFrame[]>(NO_FRAMES)
  const frames = history.value
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
        canUndo: history.canUndo && !preview,
        canRedo: history.canRedo && !preview,
        undo: history.undo,
        redo: history.redo,
        newDocument: () => setDialogOpen(true),
        closeDocument: () => {
          setDoc(null)
          history.reset(NO_FRAMES)
        },
        toggleRulers: () => setShowRulers((v) => !v),
        toggleGuides: () => setShowGuides((v) => !v),
      }),
    [shown, showRulers, showGuides, previewMode, showProps, history.canUndo, history.canRedo, history.undo, history.redo, preview],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
  }, [menus, preview, history.redo])

  const closeDialog = () => {
    setDialogOpen(false)
    setPreview(null)
  }

  const create = (d: DocSettings) => {
    setDoc(d)
    history.reset(NO_FRAMES)
    setDocId((n) => n + 1)
    setNextName((n) => n + 1)
    setLastSettings(d)
    closeDialog()
  }

  const fitKey = preview
    ? [preview.width, preview.height, preview.pages, preview.facingPages, preview.binding, preview.startPage].join('|')
    : String(docId)

  return (
    <div className="app">
      <MenuBar menus={menus} />
      <div className="app-body">
        <div className="stage">
          {shown ? (
            <Workspace
              key={preview ? 'preview' : docId}
              ref={ws}
              doc={shown}
              fitKey={fitKey}
              showRulers={showRulers}
              showGuides={showGuides}
              showProps={showProps}
              previewMode={previewMode}
              onPreviewMode={setPreviewMode}
              frames={preview ? NO_FRAMES : frames}
              onFramesChange={preview ? noop : history.change}
              onClose={preview ? undefined : () => { setDoc(null); history.reset(NO_FRAMES) }}
            />
          ) : (
            <Home appName={APP_NAME} onNew={() => setDialogOpen(true)} />
          )}
          {dialogOpen && !preview && <div className="stage-dim" />}
        </div>
        {dialogOpen && (
          <NewDocumentDialog
            initial={{ ...lastSettings, name: `ללא שם-${nextName}` }}
            onCreate={create}
            onClose={closeDialog}
            onPreview={setPreview}
          />
        )}
      </div>
    </div>
  )
}
