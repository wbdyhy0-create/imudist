import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { t } from '../i18n'

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
  tabOrder: string[]
  onTabOrderChange: (tabOrder: string[]) => void
  floatingPanelId: string | null
  onFloatingPanelChange: (id: string | null) => void
  floatingPosition: { x: number; y: number }
  onFloatingPositionChange: (position: { x: number; y: number }) => void
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
  moved: boolean
  overId: string | null
}

export function DockingPanels({
  panels,
  enabledPanelIds = panels.map((panel) => panel.id),
  tabOrder,
  onTabOrderChange,
  floatingPanelId,
  onFloatingPanelChange,
  floatingPosition,
  onFloatingPositionChange,
  openId,
  onOpenChange,
}: Props) {
  const available = panels.filter((panel) => panel.visible !== false && enabledPanelIds.includes(panel.id))
  // panels stay mounted (just hidden) once opened: their own state — the Layers panel's list of layers, the selected
  // paragraph style — used to be thrown away every time the tab was closed or another one opened, leaving the
  // workspace (which keeps the layer hidden/locked flags) out of step with what the panel showed
  const [mounted, setMounted] = useState<string[]>(() => (openId ? [openId] : []))
  const [dragLayerId, setDragLayerId] = useState<string | null>(null)
  const [dockOverId, setDockOverId] = useState<string | null>(null)
  const dockRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const suppressClickRef = useRef<string | null>(null)
  const fullTabOrder = [...tabOrder, ...available.map((panel) => panel.id).filter((id) => !tabOrder.includes(id))]
  const ordered = [...available].sort((a, b) => fullTabOrder.indexOf(a.id) - fullTabOrder.indexOf(b.id))

  const moveTab = (from: string, to: string) => {
    const next = [...fullTabOrder]
    const a = next.indexOf(from)
    const b = next.indexOf(to)
    if (a < 0 || b < 0 || a === b) return
    const [moved] = next.splice(a, 1)
    next.splice(b, 0, moved)
    onTabOrderChange(next)
  }

  const openPanel = (id: string) => {
    onOpenChange(id)
    setMounted((current) => (current.includes(id) ? current : [...current, id]))
  }

  const finishDrag = () => {
    const drag = dragRef.current
    if (!drag) return
    if (!drag.floating && drag.moved && drag.overId && drag.overId !== drag.id) moveTab(drag.id, drag.overId)
    const dock = dockRef.current?.getBoundingClientRect()
    const inDock = !!dock && drag.x >= dock.left && drag.x <= dock.right && drag.y >= dock.top && drag.y <= dock.bottom
    if (drag.floating && inDock) {
      onFloatingPanelChange(null)
      openPanel(drag.id)
    }
    if (drag.moved) suppressClickRef.current = drag.id
    dragRef.current = null
    setDragLayerId(null)
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
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 8) {
      drag.moved = true
      if (!drag.floating && drag.canFloat) {
        drag.floating = true
        onFloatingPanelChange(drag.id)
        openPanel(drag.id)
      } else if (!drag.floating) {
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-dock-panel-id]')?.dataset.dockPanelId ?? null
        drag.overId = target === drag.id ? null : target
        setDragLayerId(drag.id)
        setDockOverId(drag.overId)
      }
    }
    if (drag.floating) onFloatingPositionChange({ x: Math.max(8, event.clientX - 120), y: Math.max(36, event.clientY - 18) })
  }

  const startDrag = (id: string, event: ReactPointerEvent<HTMLButtonElement>, canFloat = floatingPanelId === id) => {
    if (event.button !== 0) return
    suppressClickRef.current = null
    dragRef.current = { id, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, floating: floatingPanelId === id, canFloat, moved: false, overId: null }
    window.addEventListener('pointermove', moveDrag)
    window.addEventListener('pointerup', finishDrag)
    window.addEventListener('pointercancel', finishDrag)
  }

  const toggle = (id: string) => {
    if (floatingPanelId === id) return
    const panel = available.find((candidate) => candidate.id === id)
    if (panel?.floating) {
      onFloatingPanelChange(id)
      openPanel(id)
      return
    }
    if (openId === id) onOpenChange(null)
    else openPanel(id)
  }

  const open = available.find((panel) => panel.id === openId && panel.id !== floatingPanelId)
  const floating = available.find((panel) => panel.id === floatingPanelId)

  return (
    <>
      <aside ref={dockRef} className={'docking-shell' + (open || floating ? ' has-open' : '')} aria-label={t('חלוניות')}>
        <div className="dock-strip">
          {ordered.map((panel) => (
            <button
              key={panel.id}
              className={'dock-tab' + (open?.id === panel.id || floating?.id === panel.id ? ' open' : '') + (dockOverId === panel.id && dragLayerId !== panel.id ? ' drop-target' : '')}
              data-tour-id={`panel:${panel.id}`}
              aria-expanded={open?.id === panel.id || floating?.id === panel.id}
              title={t(panel.label)}
              data-dock-panel-id={panel.id}
              onPointerDown={(event) => startDrag(panel.id, event, !!panel.floating)}
              onClick={() => {
                if (suppressClickRef.current === panel.id) {
                  suppressClickRef.current = null
                  return
                }
                toggle(panel.id)
              }}
            >
              <span>{t(panel.label)}</span>
            </button>
          ))}
        </div>
        {available
          .filter((panel) => (mounted.includes(panel.id) || panel.id === openId) && panel.id !== floatingPanelId)
          .map((panel) => (
            <section key={panel.id} className="dock-content" style={panel.id === open?.id ? undefined : { display: 'none' }}>
              {panel.content}
            </section>
          ))}
        {floating && (
          <section className="dock-floating" style={{ left: floatingPosition.x, top: floatingPosition.y }}>
            <button className="dock-floating-head" onPointerDown={(event) => startDrag(floating.id, event)} onClick={() => {
              if (suppressClickRef.current === floating.id) {
                suppressClickRef.current = null
                return
              }
              onFloatingPanelChange(null)
              onOpenChange(null)
            }}>
              <span>{t(floating.label)}</span>
              <span aria-hidden="true">×</span>
            </button>
            <div className="dock-floating-content">{floating.content}</div>
          </section>
        )}
      </aside>
      {dragRef.current?.floating && <div className="dock-drop-zone">{t('גרור לכאן כדי להצמיד')}</div>}
    </>
  )
}
