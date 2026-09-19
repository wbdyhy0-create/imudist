import { useEffect, useMemo, useRef, useState } from 'react'
import { Home } from './components/Home'
import { MenuBar } from './components/MenuBar'
import { NewDocumentDialog } from './components/NewDocumentDialog'
import { Workspace, type WorkspaceHandle } from './components/Workspace'
import { defaultDocSettings, type DocSettings } from './document'
import { isTyping } from './dom'
import { buildMenus, findShortcut } from './menus'

const APP_NAME = 'Imudist'

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
        newDocument: () => setDialogOpen(true),
        closeDocument: () => setDoc(null),
        toggleRulers: () => setShowRulers((v) => !v),
        toggleGuides: () => setShowGuides((v) => !v),
      }),
    [shown, showRulers, showGuides, previewMode],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // single-key shortcuts (like W) must not fire while typing in a field
      if (isTyping(e.target) && !e.ctrlKey && !e.metaKey && !e.altKey) return
      const item = findShortcut(menus, e)
      if (!item) return
      e.preventDefault()
      item.onClick?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menus])

  const closeDialog = () => {
    setDialogOpen(false)
    setPreview(null)
  }

  const create = (d: DocSettings) => {
    setDoc(d)
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
              previewMode={previewMode}
              onPreviewMode={setPreviewMode}
              onClose={preview ? undefined : () => setDoc(null)}
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
