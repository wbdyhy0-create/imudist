import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

export interface DockPanelDefinition {
  id: string
  label: string
  content: ReactNode
  visible?: boolean
  floating?: boolean
}

interface Props {
  panels: DockPanelDefinition[]
  enabledPanelIds: string[]
  /** which tab is open, kept by the caller (not here) so it survives this component remounting - editing a parent
   *  page does exactly that, and a panel the user had open shouldn't close just because of it */
  openId: string | null
  onOpenChange: (id: string | null) => void
}

interface DragState {
  id: string
  startX: number
  startY: number
  x: number
  y: number
  floating: boolean
  canFloat: boolean
}

const TAB_ORDER_KEY = 'imudist.dockTabOrder'

function loadTabOrder(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(TAB_ORDER_KEY) ?? 'null')
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function DockingPanels({ panels, enabledPanelIds = panels.map((panel) => panel.id), openId, onOpenChange }: Props) {
  const available = panels.filter((panel) => panel.visible !== false && enabledPanelIds.includes(panel.id))
  // panels stay mounted (just hidden) once opened: their own state — the Layers panel's list of layers, the selected
  // paragraph style — used to be thrown away every time the tab was closed or another one opened, leaving the
  // workspace (which keeps the layer hidden/locked flags) out of step with what the panel showed
  const [mounted, setMounted] = useState<string[]>(() => (openId ? [openId] : []))
  // a floating panel (the style manager) opens from its tab, never by itself: on start it used to sit open over the canvas
  const [floatingId, setFloatingId] = useState<string | null>(null)
  const [floatingPos, setFloatingPos] = useState({ x: 0, y: 60 })
  const [tabOrder, setTabOrder] = useState<string[]>(loadTabOrder)
  const [dragLayerId, setDragLayerId] = useState<string | null>(null)
  const [dockOverId, setDockOverId] = useState<string | null>(null)
  const dockRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  useEffect(() => {
    // ids of tabs that aren't available right now stay in the saved order, so hiding a panel doesn't forget its place
    setTabOrder((current) => {
      const next = [...current, ...available.map((panel) => panel.id).filter((id) => !current.includes(id))]
      return next.length === current.length ? current : next
    })
  }, [panels])
  useEffect(() => {
    try { localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(tabOrder)) } catch { /* a convenience only */ }
  }, [tabOrder])
  const ordered = [...available].sort((a, b) => tabOrder.indexOf(a.id) - tabOrder.indexOf(b.id))

  const moveTab = (from: string, to: string) => setTabOrder((current) => {
    const next = [...current]
    const a = next.indexOf(from)
    const b = next.indexOf(to)
    if (a < 0 || b < 0 || a === b) return current
    const [moved] = next.splice(a, 1)
    next.splice(b, 0, moved)
    return next
  })

  const openPanel = (id: string) => {
    onOpenChange(id)
    setMounted((current) => (current.includes(id) ? current : [...current, id]))
  }

  const finishDrag = () => {
    const drag = dragRef.current
    if (!drag) return
    if (!drag.floating && dockOverId && dockOverId !== drag.id) moveTab(drag.id, dockOverId)
    const dock = dockRef.current?.getBoundingClientRect()
    const inDock = !!dock && drag.x >= dock.left && drag.x <= dock.right && drag.y >= dock.top && drag.y <= dock.bottom
    if (drag.floating && inDock) {
      setFloatingId(null)
      openPanel(drag.id)
    }
    dragRef.current = null
    setDockOverId(null)
    window.removeEventListener('pointermove', moveDrag)
    window.removeEventListener('pointerup', finishDrag)
    window.removeEventListener('pointercancel', finishDrag)
  }

  const moveDrag = (event: PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    drag.x = event.clientX
    drag.y = event.clientY
    if (!drag.floating && drag.canFloat && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 8) {
      drag.floating = true
      setFloatingId(drag.id)
      openPanel(drag.id)
    }
    if (drag.floating) setFloatingPos({ x: Math.max(8, event.clientX - 120), y: Math.max(36, event.clientY - 18) })
  }

  const startDrag = (id: string, event: ReactPointerEvent<HTMLButtonElement>, canFloat = floatingId === id) => {
    if (event.button !== 0) return
    event.preventDefault()
    dragRef.current = { id, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, floating: floatingId === id, canFloat }
    window.addEventListener('pointermove', moveDrag)
    window.addEventListener('pointerup', finishDrag)
    window.addEventListener('pointercancel', finishDrag)
  }

  const toggle = (id: string) => {
    if (floatingId === id) return
    const panel = available.find((candidate) => candidate.id === id)
    if (panel?.floating) {
      setFloatingId(id)
      openPanel(id)
      return
    }
    if (openId === id) onOpenChange(null)
    else openPanel(id)
  }

  const open = available.find((panel) => panel.id === openId && panel.id !== floatingId)
  const floating = available.find((panel) => panel.id === floatingId)

  return (
    <>
      <aside ref={dockRef} className={'docking-shell' + (open || floating ? ' has-open' : '')} aria-label="חלוניות">
        <div className="dock-strip">
          {dragLayerId && ordered[0] && <div className={'dock-drop-top' + (dockOverId === ordered[0].id ? ' active' : '')} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDockOverId(ordered[0].id) }} onDrop={(event) => { event.preventDefault(); const from = event.dataTransfer.getData('text/layer') || dragLayerId; if (from && from !== ordered[0].id) moveTab(from, ordered[0].id); setDragLayerId(null); setDockOverId(null) }}>+</div>}
          {ordered.map((panel) => (
            <button
              key={panel.id}
              className={'dock-tab' + (open?.id === panel.id || floating?.id === panel.id ? ' open' : '') + (dockOverId === panel.id && dragLayerId !== panel.id ? ' drop-target' : '')}
              draggable={!panel.floating}
              aria-expanded={open?.id === panel.id || floating?.id === panel.id}
              title={panel.label}
              onPointerDown={panel.floating ? (event) => startDrag(panel.id, event, true) : undefined}
              onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/layer', panel.id); setDragLayerId(panel.id); dragRef.current = null }}
              onDragEnd={() => { setDragLayerId(null); setDockOverId(null) }}
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; const from = event.dataTransfer.getData('text/layer'); if (from && from !== panel.id) setDockOverId(panel.id) }}
              onDrop={(event) => { event.preventDefault(); const from = event.dataTransfer.getData('text/layer') || dragLayerId; if (from && from !== panel.id) moveTab(from, panel.id); setDragLayerId(null); setDockOverId(null) }}
              onClick={() => toggle(panel.id)}
            >
              <span>{panel.label}</span>
            </button>
          ))}
        </div>
        {available
          .filter((panel) => mounted.includes(panel.id) && panel.id !== floatingId)
          .map((panel) => (
            <section key={panel.id} className="dock-content" style={panel.id === open?.id ? undefined : { display: 'none' }}>
              {panel.content}
            </section>
          ))}
        {floating && (
          <section className="dock-floating" style={{ left: floatingPos.x, top: floatingPos.y }}>
            <button className="dock-floating-head" onPointerDown={(event) => startDrag(floating.id, event)} onClick={() => { setFloatingId(null); onOpenChange(null) }}>
              <span>{floating.label}</span>
              <span aria-hidden="true">×</span>
            </button>
            <div className="dock-floating-content">{floating.content}</div>
          </section>
        )}
      </aside>
      {dragRef.current?.floating && <div className="dock-drop-zone">גרור לכאן כדי להצמיד</div>}
    </>
  )
}
