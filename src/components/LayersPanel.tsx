import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { ImageFrame, LayerInfo, ShapeFrame, TextFrame } from '../document'
import { LAYER_COLORS, layerViewsOf, newLayerId, withLayerInfo } from '../layers'
import { ContextMenu } from './ContextMenu'

interface Props {
  frames: TextFrame[]
  images: ImageFrame[]
  shapes: ShapeFrame[]
  layerOrder: string[]
  /** names, colours, hidden and locked of the layers, by id */
  layers: Record<string, LayerInfo>
  /** the layers in their new order, with what the panel changed of them (one step of the history) */
  onLayersChange: (order: string[], layers: Record<string, LayerInfo>, coalesceKey?: string) => void
  onItemOrderChange: (layerId: string, orderedIds: string[]) => void
  onLayerDelete: (layerId: string) => void
  onItemDelete: (id: string) => void
  selectedId: string | null
  activeLayerId: string
  onActiveLayer: (id: string) => void
  onSelect: (id: string) => void
  /** an object hidden, locked or named in the panel */
  onItemChange: (id: string, patch: { hidden?: boolean; locked?: boolean; label?: string }, coalesceKey?: string) => void
  parentItemsAbovePageContent: boolean
  canChangeParentOrder: boolean
  onParentItemsAbovePageContentChange: (above: boolean) => void
}

interface LayerDragState {
  kind: 'layer' | 'item'
  id: string
  layerId: string
  startX: number
  startY: number
  moved: boolean
  overId: string | null
}

interface LayerPaintState {
  scope: 'layer' | 'item'
  kind: 'hidden' | 'locked'
  value: boolean
  pointerId: number
  layerId: string
  key: string
  touchedIds: Set<string>
}

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="5.5" y="10" width="13" height="11" rx="2" />
      {locked
        ? <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        : <path d="M8 10V7a4 4 0 0 1 7.7-1.5" />}
    </svg>
  )
}

export function LayersPanel({ frames, images, shapes, layerOrder, layers: layerInfo, onLayersChange, onItemOrderChange, onLayerDelete, onItemDelete, selectedId, activeLayerId, onActiveLayer, onSelect, onItemChange, parentItemsAbovePageContent, canChangeParentOrder, onParentItemsAbovePageContentChange }: Props) {
  // which layers are folded shut is the panel's own business; everything else about a layer is the document's
  const [closedIds, setClosedIds] = useState<Record<string, boolean>>({})
  const layers = layerViewsOf(layerOrder, layerInfo).map((view) => ({ ...view, open: !closedIds[view.id] }))
  const toggleOpen = (id: string) => setClosedIds((current) => ({ ...current, [id]: !current[id] }))
  const [activeId, setActiveId] = useState(activeLayerId)
  const [dragging, setDragging] = useState<LayerDragState | null>(null)
  const [dragOverLayerId, setDragOverLayerId] = useState<string | null>(null)
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ kind: 'layer' | 'item'; id: string } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState(LAYER_COLORS[0])
  const dragRef = useRef<LayerDragState | null>(null)
  const dragCleanupRef = useRef<(() => void) | null>(null)
  const paintRef = useRef<LayerPaintState | null>(null)
  const paintCleanupRef = useRef<(() => void) | null>(null)
  const paintClickRef = useRef<string | null>(null)
  const layerInfoRef = useRef(layerInfo)
  const paintCallbacksRef = useRef({ layerOrder, onLayersChange, onItemChange })
  const paintSequenceRef = useRef(0)
  layerInfoRef.current = layerInfo
  paintCallbacksRef.current = { layerOrder, onLayersChange, onItemChange }
  const suppressClickRef = useRef<string | null>(null)
  const visibleTextFrames = frames
  const allItems = [
    ...images.map((item) => ({ id: item.id, layerId: item.layerId, z: item.z ?? 0, label: item.label ?? 'תמונה', type: 'IMG', hidden: item.hidden === true, locked: item.locked === true })),
    ...shapes.map((item) => ({ id: item.id, layerId: item.layerId, z: item.z ?? 1, label: item.label ?? (item.kind === 'path' ? 'נתיב' : item.kind === 'rect' ? 'מלבן' : item.kind === 'ellipse' ? 'אליפסה' : 'צורה'), type: 'PATH', hidden: item.hidden === true, locked: item.locked === true })),
    ...visibleTextFrames.map((item) => ({ id: item.id, layerId: item.layerId, z: item.z ?? 1, label: item.label ?? (item.rasterized ? 'מקור טקסט חתוך' : item.text.trim().split('\n')[0] || 'תיבת טקסט'), type: 'T', hidden: item.hidden === true, locked: item.locked === true })),
  ]
  const itemsFor = (layerId: string) => {
    const items = allItems.filter((item) => layerId === 'layer-1' ? !item.layerId || item.layerId === 'layer-1' || !layers.some((layer) => layer.id === item.layerId) : item.layerId === layerId)
    return [...items].sort((a, b) => a.z - b.z)
  }
  const active = layers.find((layer) => layer.id === activeId) ?? layers[0]
  const reorderLayer = (fromId: string, toId: string) => {
    if (!fromId || fromId === toId) return
    const from = layers.findIndex((layer) => layer.id === fromId)
    const to = layers.findIndex((layer) => layer.id === toId)
    if (from < 0 || to < 0) return
    const next = [...layers]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onLayersChange(next.map((layer) => layer.id), layerInfo)
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
  const paintLayer = (id: string, paint: LayerPaintState) => {
    if (paint.touchedIds.has(id)) return
    paint.touchedIds.add(id)
    const patch = paint.kind === 'hidden' ? { hidden: paint.value } : { locked: paint.value }
    const next = withLayerInfo(layerInfoRef.current, id, patch)
    layerInfoRef.current = next
    paintCallbacksRef.current.onLayersChange(paintCallbacksRef.current.layerOrder, next, paint.key)
  }
  const paintItem = (id: string, paint: LayerPaintState) => {
    if (paint.touchedIds.has(id)) return
    paint.touchedIds.add(id)
    const patch = paint.kind === 'hidden' ? { hidden: paint.value } : { locked: paint.value }
    paintCallbacksRef.current.onItemChange(id, patch, paint.key)
  }
  const startPaint = (scope: LayerPaintState['scope'], kind: LayerPaintState['kind'], id: string, layerId: string, value: boolean, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    event.stopPropagation()
    paintCleanupRef.current?.()
    paintClickRef.current = `${scope}:${kind}:${id}`
    const paint: LayerPaintState = {
      scope,
      kind,
      value,
      pointerId: event.pointerId,
      layerId,
      key: `gap:layers-paint:${++paintSequenceRef.current}`,
      touchedIds: new Set(),
    }
    paintRef.current = paint
    if (scope === 'layer') paintLayer(id, paint)
    else paintItem(id, paint)
    const applyAt = (x: number, y: number) => {
      if (scope === 'layer') {
        const target = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-layer-row-id]')
        const targetId = target?.dataset.layerRowId
        if (targetId) paintLayer(targetId, paint)
      } else {
        const target = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-layer-item-id]')
        const targetId = target?.dataset.layerItemId
        if (targetId && target.dataset.layerOwnerId === paint.layerId) paintItem(targetId, paint)
      }
    }
    const finish = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== paint.pointerId) return
      if (pointerEvent.type === 'pointerup') applyAt(pointerEvent.clientX, pointerEvent.clientY)
      paintCleanupRef.current?.()
      paintCleanupRef.current = null
      paintRef.current = null
      window.setTimeout(() => {
        if (paintClickRef.current === `${scope}:${kind}:${id}`) paintClickRef.current = null
      }, 0)
    }
    const move = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId === paint.pointerId) applyAt(pointerEvent.clientX, pointerEvent.clientY)
    }
    const onUp = (pointerEvent: PointerEvent) => finish(pointerEvent)
    const onCancel = (pointerEvent: PointerEvent) => finish(pointerEvent)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    paintCleanupRef.current = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }
  const togglePaint = (scope: LayerPaintState['scope'], kind: LayerPaintState['kind'], id: string, value: boolean) => {
    if (paintClickRef.current === `${scope}:${kind}:${id}`) {
      paintClickRef.current = null
      return
    }
    const patch = kind === 'hidden' ? { hidden: value } : { locked: value }
    if (scope === 'layer') {
      const next = withLayerInfo(layerInfo, id, patch)
      layerInfoRef.current = next
      onLayersChange(layerOrder, next)
    } else onItemChange(id, patch)
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
  useEffect(() => () => {
    dragCleanupRef.current?.()
    paintCleanupRef.current?.()
  }, [])
  const openEditor = (kind: 'layer' | 'item', id: string, name: string, color = editColor) => { setEditing({ kind, id }); setEditName(name); setEditColor(color) }
  const saveEditor = () => {
    if (!editing) return
    if (editing.kind === 'layer') onLayersChange(layerOrder, withLayerInfo(layerInfo, editing.id, { name: editName.trim(), color: editColor }))
    else onItemChange(editing.id, { label: editName })
    setEditing(null)
  }

  return (
    <section className="layers-panel" aria-label="שכבות">
      <div className="layers-head">
        <h2 className="props-title">שכבות</h2>
      </div>
      {layers.map((layer) => <div key={layer.id} className="layer-row-wrap" data-layer-row-id={layer.id}>
        {dragging?.kind === 'layer' && dragOverLayerId === layer.id && dragging.id !== layer.id && <div className="layer-drop-indicator" aria-hidden="true" />}
        <div className={'layer-row' + (layer.id === active.id ? ' active' : '') + (dragging?.kind === 'layer' && dragging.id === layer.id ? ' dragging' : '')} onPointerDown={(event) => { if (!(event.target as HTMLElement).closest('button')) startReorder('layer', layer.id, layer.id, event) }} onClick={() => { if (suppressClickRef.current === `layer:${layer.id}`) { suppressClickRef.current = null; return } setActiveId(layer.id); onActiveLayer(layer.id); toggleOpen(layer.id) }} onDoubleClick={() => openEditor('layer', layer.id, layer.name, layer.color)}>
        <button className="layer-toggle" aria-label={layer.open ? 'סגור שכבה' : 'פתח שכבה'} onClick={(event) => { event.stopPropagation(); toggleOpen(layer.id) }}>{layer.open ? '▾' : '▸'}</button>
        <button className="layer-eye" aria-label={layer.hidden ? 'הצג שכבה' : 'הסתר שכבה'} onPointerDown={(event) => startPaint('layer', 'hidden', layer.id, layer.id, !layer.hidden, event)} onClick={(event) => { event.stopPropagation(); togglePaint('layer', 'hidden', layer.id, !layer.hidden) }}><span className={'visibility-dot' + (layer.hidden ? '' : ' filled')} /></button>
        <button className={'layer-lock' + (layer.locked ? ' locked' : '')} aria-label={layer.locked ? 'פתח שכבה' : 'נעל שכבה'} onPointerDown={(event) => startPaint('layer', 'locked', layer.id, layer.id, !layer.locked, event)} onClick={(event) => { event.stopPropagation(); togglePaint('layer', 'locked', layer.id, !layer.locked) }}><LockIcon locked={layer.locked} /></button>
        <span className="layer-color" style={{ background: layer.color }} />
        <span className="layer-name">{layer.name}</span>
        </div>
        {layer.open && <div className="layer-children">
        {itemsFor(layer.id).length === 0 && <p className="muted">אין אובייקטים בשכבה</p>}
        {[...itemsFor(layer.id)].reverse().map((item) => {
          return (
            <div key={item.id} className={'layer-item' + (selectedId === item.id ? ' selected' : '') + (dragging?.kind === 'item' && dragging.id === item.id ? ' dragging' : '') + (dragOverItemId === item.id && dragging?.id !== item.id ? ' drop-target' : '')} data-layer-item-id={item.id} data-layer-owner-id={layer.id} onPointerDown={(event) => { if (!(event.target as HTMLElement).closest('.layer-item-eye, .layer-item-lock')) startReorder('item', item.id, layer.id, event) }} onClickCapture={(event) => { if (suppressClickRef.current === `item:${item.id}`) { suppressClickRef.current = null; event.preventDefault(); event.stopPropagation() } }} onContextMenu={(event) => { event.preventDefault(); setContextMenu({ id: item.id, x: event.clientX, y: event.clientY }) }} onDoubleClick={() => openEditor('item', item.id, item.label)}>
              <button className="layer-item-eye" aria-label={item.hidden ? `הצג ${item.label}` : `הסתר ${item.label}`} onPointerDown={(event) => startPaint('item', 'hidden', item.id, layer.id, !item.hidden, event)} onClick={(event) => { event.stopPropagation(); togglePaint('item', 'hidden', item.id, !item.hidden) }}><span className={'visibility-dot' + (item.hidden ? '' : ' filled')} /></button>
              <button className={'layer-item-lock' + (item.locked ? ' locked' : '')} aria-label={item.locked ? `פתח ${item.label}` : `נעל ${item.label}`} onPointerDown={(event) => startPaint('item', 'locked', item.id, layer.id, !item.locked, event)} onClick={(event) => { event.stopPropagation(); togglePaint('item', 'locked', item.id, !item.locked) }}><LockIcon locked={item.locked} /></button>
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
          <button className="icon-button" aria-label="הוסף שכבה" title="הוסף שכבה" onClick={() => { const id = newLayerId(layerOrder); onLayersChange([...layerOrder, id], layerInfo); setActiveId(id); onActiveLayer(id) }}>+</button>
          <button className="icon-button" aria-label="מחק שכבה" title="מחק שכבה ואת כל האובייקטים שבה" disabled={layers.length <= 1 || active.id === 'layer-1'} onClick={() => { onLayerDelete(active.id); setActiveId('layer-1'); onActiveLayer('layer-1') }}>⌫</button>
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
