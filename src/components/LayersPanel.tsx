import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { ImageFrame, ShapeFrame, TextFrame } from '../document'
import { ContextMenu } from './ContextMenu'

interface Props {
  frames: TextFrame[]
  images: ImageFrame[]
  shapes: ShapeFrame[]
  layerOrder: string[]
  onLayerOrderChange: (order: string[]) => void
  onItemOrderChange: (layerId: string, orderedIds: string[]) => void
  onLayerDelete: (layerId: string) => void
  onItemDelete: (id: string) => void
  selectedId: string | null
  activeLayerId: string
  onActiveLayer: (id: string) => void
  onSelect: (id: string) => void
  onVisibility: (visible: boolean) => void
  onLock: (locked: boolean) => void
  onItemVisibility: (id: string, visible: boolean) => void
  onItemLock: (id: string, locked: boolean) => void
  parentItemsAbovePageContent: boolean
  canChangeParentOrder: boolean
  onParentItemsAbovePageContentChange: (above: boolean) => void
}

const LAYER_COLORS = ['#3d8bff', '#ff5c5c', '#00d1b2', '#f5b800', '#a78bfa']

interface LayerDragState {
  kind: 'layer' | 'item'
  id: string
  layerId: string
  startX: number
  startY: number
  moved: boolean
  overId: string | null
}

export function LayersPanel({ frames, images, shapes, layerOrder, onLayerOrderChange, onItemOrderChange, onLayerDelete, onItemDelete, selectedId, activeLayerId, onActiveLayer, onSelect, onVisibility, onLock, onItemVisibility, onItemLock, parentItemsAbovePageContent, canChangeParentOrder, onParentItemsAbovePageContentChange }: Props) {
  const [layers, setLayers] = useState(() => (layerOrder.length ? layerOrder : ['layer-1']).map((id, index) => ({ id, name: `שכבה ${index + 1}`, color: LAYER_COLORS[index % LAYER_COLORS.length], visible: true, locked: false, open: true })))
  const [activeId, setActiveId] = useState(activeLayerId)
  const [itemState, setItemState] = useState<Record<string, { visible: boolean; locked: boolean }>>({})
  const [itemNames, setItemNames] = useState<Record<string, string>>({})
  const [dragging, setDragging] = useState<LayerDragState | null>(null)
  const [dragOverLayerId, setDragOverLayerId] = useState<string | null>(null)
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ kind: 'layer' | 'item'; id: string } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState(LAYER_COLORS[0])
  const dragRef = useRef<LayerDragState | null>(null)
  const dragCleanupRef = useRef<(() => void) | null>(null)
  const suppressClickRef = useRef<string | null>(null)
  const visibleTextFrames = frames
  const allItems = [
    ...images.map((item) => ({ id: item.id, layerId: item.layerId, z: item.z ?? 0, label: item.label ?? 'תמונה', type: 'IMG' })),
    ...shapes.map((item) => ({ id: item.id, layerId: item.layerId, z: item.z ?? 1, label: item.kind === 'path' ? 'נתיב' : item.kind === 'rect' ? 'מלבן' : item.kind === 'ellipse' ? 'אליפסה' : 'צורה', type: 'PATH' })),
    ...visibleTextFrames.map((item) => ({ id: item.id, layerId: item.layerId, z: item.z ?? 1, label: item.rasterized ? 'מקור טקסט חתוך' : item.text.trim().split('\n')[0] || 'תיבת טקסט', type: 'T' })),
  ].map((item) => ({ ...item, label: itemNames[item.id] ?? item.label }))
  const itemsFor = (layerId: string) => {
    const items = allItems.filter((item) => layerId === 'layer-1' ? !item.layerId || item.layerId === 'layer-1' || !layers.some((layer) => layer.id === item.layerId) : item.layerId === layerId)
    return [...items].sort((a, b) => a.z - b.z)
  }
  const active = layers.find((layer) => layer.id === activeId) ?? layers[0]
  useEffect(() => {
    setLayers((current) => {
      const existing = new Map(current.map((layer) => [layer.id, layer]))
      const ids = layerOrder.length ? layerOrder : ['layer-1']
      const next = ids.map((id, index) => existing.get(id) ?? { id, name: `שכבה ${index + 1}`, color: LAYER_COLORS[index % LAYER_COLORS.length], visible: true, locked: false, open: true })
      return next.length === current.length && next.every((layer, index) => layer === current[index]) ? current : next
    })
  }, [layerOrder])
  const reorderLayer = (fromId: string, toId: string) => {
    if (!fromId || fromId === toId) return
    const from = layers.findIndex((layer) => layer.id === fromId)
    const to = layers.findIndex((layer) => layer.id === toId)
    if (from < 0 || to < 0) return
    const next = [...layers]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setLayers(next)
    onLayerOrderChange(next.map((layer) => layer.id))
  }
  const reorderItem = (layerId: string, fromId: string, toId: string) => {
    if (!fromId || fromId === toId) return
    const source = allItems.find((item) => item.id === fromId)
    const sourceLayerId = source?.layerId ?? 'layer-1'
    if (sourceLayerId !== layerId) return
    const next = itemsFor(layerId).map((item) => item.id).reverse()
    const from = next.indexOf(fromId)
    const to = next.indexOf(toId)
    if (from < 0 || to < 0) return
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onItemOrderChange(layerId, next.reverse())
  }
  const clearDrag = () => {
    dragCleanupRef.current?.()
    dragCleanupRef.current = null
    dragRef.current = null
    setDragging(null)
    setDragOverLayerId(null)
    setDragOverItemId(null)
  }
  const startReorder = (kind: LayerDragState['kind'], id: string, layerId: string, event: ReactPointerEvent) => {
    if (event.button !== 0) return
    suppressClickRef.current = null
    const drag: LayerDragState = { kind, id, layerId, startX: event.clientX, startY: event.clientY, moved: false, overId: null }
    dragRef.current = drag
    const move = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== event.pointerId) return
      const current = dragRef.current
      if (!current) return
      if (Math.hypot(pointerEvent.clientX - current.startX, pointerEvent.clientY - current.startY) > 5) {
        current.moved = true
        pointerEvent.preventDefault()
        if (current.kind === 'layer') {
          current.overId = document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY)?.closest<HTMLElement>('[data-layer-row-id]')?.dataset.layerRowId ?? null
          setDragOverLayerId(current.overId)
        } else {
          const target = document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY)?.closest<HTMLElement>('[data-layer-item-id]')
          current.overId = target?.dataset.layerOwnerId === current.layerId ? target.dataset.layerItemId ?? null : null
          setDragOverItemId(current.overId)
        }
        setDragging({ ...current })
      }
    }
    const finish = (pointerEvent: PointerEvent, cancelled = false) => {
      if (pointerEvent.pointerId !== event.pointerId) return
      const current = dragRef.current
      if (current?.moved && !cancelled) {
        if (current.kind === 'layer' && current.overId) reorderLayer(current.id, current.overId)
        else if (current.kind === 'item' && current.overId) reorderItem(current.layerId, current.id, current.overId)
      }
      if (current?.moved) suppressClickRef.current = `${current.kind}:${current.id}`
      clearDrag()
    }
    const onUp = (pointerEvent: PointerEvent) => finish(pointerEvent)
    const onCancel = (pointerEvent: PointerEvent) => finish(pointerEvent, true)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    dragCleanupRef.current = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }
  useEffect(() => () => dragCleanupRef.current?.(), [])
  const openEditor = (kind: 'layer' | 'item', id: string, name: string, color = editColor) => { setEditing({ kind, id }); setEditName(name); setEditColor(color) }
  const saveEditor = () => {
    if (!editing) return
    if (editing.kind === 'layer') setLayers((current) => current.map((layer) => layer.id === editing.id ? { ...layer, name: editName || layer.name, color: editColor } : layer))
    else setItemNames((current) => ({ ...current, [editing.id]: editName }))
    setEditing(null)
  }

  return (
    <section className="layers-panel" aria-label="שכבות">
      <div className="layers-head">
        <h2 className="props-title">שכבות</h2>
      </div>
      {layers.map((layer) => <div key={layer.id} className="layer-row-wrap" data-layer-row-id={layer.id}>
        {dragging?.kind === 'layer' && dragOverLayerId === layer.id && dragging.id !== layer.id && <div className="layer-drop-indicator" aria-hidden="true" />}
        <div className={'layer-row' + (layer.id === active.id ? ' active' : '') + (dragging?.kind === 'layer' && dragging.id === layer.id ? ' dragging' : '')} onPointerDown={(event) => { if (!(event.target as HTMLElement).closest('button')) startReorder('layer', layer.id, layer.id, event) }} onClick={() => { if (suppressClickRef.current === `layer:${layer.id}`) { suppressClickRef.current = null; return } setActiveId(layer.id); onActiveLayer(layer.id); setLayers((current) => current.map((item) => item.id === layer.id ? { ...item, open: !item.open } : item)) }} onDoubleClick={() => openEditor('layer', layer.id, layer.name, layer.color)}>
        <button className="layer-toggle" aria-label={layer.open ? 'סגור שכבה' : 'פתח שכבה'} onClick={(event) => { event.stopPropagation(); setLayers((current) => current.map((item) => item.id === layer.id ? { ...item, open: !item.open } : item)) }}>{layer.open ? '▾' : '▸'}</button>
        <button className="layer-eye" aria-label={layer.visible ? 'הסתר שכבה' : 'הצג שכבה'} onClick={(event) => { event.stopPropagation(); const visible = !layer.visible; setLayers((current) => current.map((item) => item.id === layer.id ? { ...item, visible } : item)); if (layer.id === active.id) onVisibility(visible) }}><span className={'visibility-dot' + (layer.visible ? ' filled' : '')} /></button>
        <button className="layer-lock" aria-label={layer.locked ? 'פתח שכבה' : 'נעל שכבה'} onClick={(event) => { event.stopPropagation(); const locked = !layer.locked; setLayers((current) => current.map((item) => item.id === layer.id ? { ...item, locked } : item)); if (layer.id === active.id) onLock(locked) }}>{layer.locked ? '🔒' : '·'}</button>
        <span className="layer-color" style={{ background: layer.color }} />
        <span className="layer-name">{layer.name}</span>
        </div>
        {layer.open && <div className="layer-children">
        {itemsFor(layer.id).length === 0 && <p className="muted">אין אובייקטים בשכבה</p>}
        {[...itemsFor(layer.id)].reverse().map((item) => {
          const state = itemState[item.id] ?? { visible: true, locked: false }
          return (
            <div key={item.id} className={'layer-item' + (selectedId === item.id ? ' selected' : '') + (dragging?.kind === 'item' && dragging.id === item.id ? ' dragging' : '') + (dragOverItemId === item.id && dragging?.id !== item.id ? ' drop-target' : '')} data-layer-item-id={item.id} data-layer-owner-id={layer.id} onPointerDown={(event) => { if (!(event.target as HTMLElement).closest('.layer-item-eye, .layer-item-lock')) startReorder('item', item.id, layer.id, event) }} onClickCapture={(event) => { if (suppressClickRef.current === `item:${item.id}`) { suppressClickRef.current = null; event.preventDefault(); event.stopPropagation() } }} onContextMenu={(event) => { event.preventDefault(); setContextMenu({ id: item.id, x: event.clientX, y: event.clientY }) }} onDoubleClick={() => openEditor('item', item.id, item.label)}>
              <button className="layer-item-eye" aria-label={state.visible ? `הסתר ${item.label}` : `הצג ${item.label}`} onClick={(event) => { event.stopPropagation(); const visible = !state.visible; setItemState((current) => ({ ...current, [item.id]: { ...state, visible } })); onItemVisibility(item.id, visible) }}><span className={'visibility-dot' + (state.visible ? ' filled' : '')} /></button>
              <button className="layer-item-lock" aria-label={state.locked ? `פתח ${item.label}` : `נעל ${item.label}`} onClick={(event) => { event.stopPropagation(); const locked = !state.locked; setItemState((current) => ({ ...current, [item.id]: { ...state, locked } })); onItemLock(item.id, locked) }}>{state.locked ? '🔒' : '·'}</button>
              <button className="layer-item-main" onClick={() => onSelect(item.id)}><span className="layer-item-type">{item.type}</span><span>{item.label}</span></button>
            </div>
          )
        })}
        </div>}
      </div>)}
      <div className="layers-foot">
        {itemsFor(active.id).length} אובייקטים · {active.name}
        <label className="layer-parent-order">
          <input
            type="checkbox"
            checked={parentItemsAbovePageContent}
            disabled={!canChangeParentOrder}
            onChange={(event) => onParentItemsAbovePageContentChange(event.target.checked)}
          />
          <span>אובייקטי אב מעל תוכן העמוד</span>
        </label>
        <div className="layers-actions">
          <button className="icon-button" aria-label="הוסף שכבה" title="הוסף שכבה" onClick={() => { const n = Math.max(0, ...layers.map((item) => Number(item.id.replace('layer-', '')) || 0)) + 1; const layer = { id: `layer-${n}`, name: `שכבה ${n}`, color: LAYER_COLORS[layers.length % LAYER_COLORS.length], visible: true, locked: false, open: true }; const next = [...layers, layer]; setLayers(next); onLayerOrderChange(next.map((item) => item.id)); setActiveId(layer.id); onActiveLayer(layer.id) }}>+</button>
          <button className="icon-button" aria-label="מחק שכבה" title="מחק שכבה ואת כל האובייקטים שבה" disabled={layers.length <= 1 || active.id === 'layer-1'} onClick={() => { onLayerDelete(active.id); const next = layers.filter((layer) => layer.id !== active.id); setLayers(next); onLayerOrderChange(next.map((layer) => layer.id)); setActiveId('layer-1'); onActiveLayer('layer-1') }}>⌫</button>
        </div>
      </div>
      {editing && <div className="layer-edit-dialog" role="dialog" aria-label={editing.kind === 'layer' ? 'אפשרויות שכבה' : 'שם אובייקט'}>
        <div className="layer-edit-title">{editing.kind === 'layer' ? 'אפשרויות שכבה' : 'שם תת-פריט'}</div>
        <label>שם<input value={editName} onChange={(event) => setEditName(event.target.value)} autoFocus /></label>
        {editing.kind === 'layer' && <label>צבע<input type="color" value={editColor} onChange={(event) => setEditColor(event.target.value)} /></label>}
        <div className="layer-edit-actions"><button className="btn small primary" onClick={saveEditor}>אישור</button><button className="btn small" onClick={() => setEditing(null)}>ביטול</button></div>
      </div>}
      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} items={[{ label: 'מחק אובייקט', onClick: () => onItemDelete(contextMenu.id) }]} />}
    </section>
  )
}
