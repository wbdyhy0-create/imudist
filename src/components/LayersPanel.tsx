import { useState } from 'react'
import type { ImageFrame, ShapeFrame, TextFrame } from '../document'

interface Props {
  frames: TextFrame[]
  images: ImageFrame[]
  shapes: ShapeFrame[]
  selectedId: string | null
  activeLayerId: string
  onActiveLayer: (id: string) => void
  onSelect: (id: string) => void
  onVisibility: (visible: boolean) => void
  onLock: (locked: boolean) => void
  onItemVisibility: (id: string, visible: boolean) => void
  onItemLock: (id: string, locked: boolean) => void
}

const LAYER_COLORS = ['#3d8bff', '#ff5c5c', '#00d1b2', '#f5b800', '#a78bfa']

export function LayersPanel({ frames, images, shapes, selectedId, activeLayerId, onActiveLayer, onSelect, onVisibility, onLock, onItemVisibility, onItemLock }: Props) {
  const [layers, setLayers] = useState([{ id: 'layer-1', name: 'שכבה 1', color: LAYER_COLORS[0], visible: true, locked: false, open: true }])
  const [activeId, setActiveId] = useState(activeLayerId)
  const [itemState, setItemState] = useState<Record<string, { visible: boolean; locked: boolean }>>({})
  const [itemNames, setItemNames] = useState<Record<string, string>>({})
  const [itemOrder, setItemOrder] = useState<Record<string, string[]>>({})
  const [dragLayerId, setDragLayerId] = useState<string | null>(null)
  const [dragOverLayerId, setDragOverLayerId] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ kind: 'layer' | 'item'; id: string } | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState(LAYER_COLORS[0])
  const visibleTextFrames = frames.filter((item) => item.text.trim())
  const allItems = [
    ...visibleTextFrames.map((item) => ({ id: item.id, layerId: item.layerId, label: item.text.trim().split('\n')[0] || 'תיבת טקסט', type: 'T' })),
    ...images.map((item) => ({ id: item.id, layerId: item.layerId, label: 'תמונה', type: 'IMG' })),
    ...shapes.map((item) => ({ id: item.id, layerId: item.layerId, label: item.kind === 'path' ? 'נתיב' : item.kind === 'rect' ? 'מלבן' : item.kind === 'ellipse' ? 'אליפסה' : 'צורה', type: 'PATH' })),
  ].map((item) => ({ ...item, label: itemNames[item.id] ?? item.label }))
  const itemsFor = (layerId: string) => {
    const items = allItems.filter((item) => layerId === 'layer-1' ? !item.layerId || item.layerId === 'layer-1' || !layers.some((layer) => layer.id === item.layerId) : item.layerId === layerId)
    const order = itemOrder[layerId] ?? []
    return [...items].sort((a, b) => (order.indexOf(a.id) < 0 ? Number.MAX_SAFE_INTEGER : order.indexOf(a.id)) - (order.indexOf(b.id) < 0 ? Number.MAX_SAFE_INTEGER : order.indexOf(b.id)))
  }
  const active = layers.find((layer) => layer.id === activeId) ?? layers[0]
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
      {layers.map((layer) => <div key={layer.id} className="layer-row-wrap" onDragEnter={(event) => { event.preventDefault(); if (dragLayerId !== layer.id) setDragOverLayerId(layer.id) }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; if (dragLayerId !== layer.id) setDragOverLayerId(layer.id) }} onDrop={(event) => { event.preventDefault(); const from = event.dataTransfer.getData('text/layer'); if (from && from !== layer.id) setLayers((current) => { const next = [...current]; const a = next.findIndex((item) => item.id === from); const b = next.findIndex((item) => item.id === layer.id); if (a < 0 || b < 0) return current; const [moved] = next.splice(a, 1); next.splice(b, 0, moved); return next }); setDragLayerId(null); setDragOverLayerId(null) }}>
        {dragOverLayerId === layer.id && dragLayerId !== layer.id && <div className="layer-drop-indicator" aria-hidden="true" />}
        <div className={'layer-row' + (layer.id === active.id ? ' active' : '')} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/layer', layer.id); setDragLayerId(layer.id) }} onDragEnd={() => { setDragLayerId(null); setDragOverLayerId(null) }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragOverLayerId(layer.id) }} onDrop={(event) => { event.preventDefault(); const from = event.dataTransfer.getData('text/layer'); if (from && from !== layer.id) setLayers((current) => { const next = [...current]; const a = next.findIndex((item) => item.id === from); const b = next.findIndex((item) => item.id === layer.id); const [moved] = next.splice(a, 1); next.splice(b, 0, moved); return next }); setDragLayerId(null); setDragOverLayerId(null) }} onClick={() => { setActiveId(layer.id); onActiveLayer(layer.id); setLayers((current) => current.map((item) => item.id === layer.id ? { ...item, open: !item.open } : item)) }} onDoubleClick={() => openEditor('layer', layer.id, layer.name, layer.color)}>
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
            <div key={item.id} className={'layer-item' + (selectedId === item.id ? ' selected' : '')} draggable onDragStart={(event) => event.dataTransfer.setData('text/item', item.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const from = event.dataTransfer.getData('text/item'); if (from && from !== item.id) setItemOrder((current) => { const next = [...(current[layer.id] ?? itemsFor(layer.id).map((entry) => entry.id))]; const a = next.indexOf(from); const b = next.indexOf(item.id); const [moved] = next.splice(a, 1); next.splice(b, 0, moved); return { ...current, [layer.id]: next } }) }} onDoubleClick={() => openEditor('item', item.id, item.label)}>
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
        <div className="layers-actions">
          <button className="icon-button" aria-label="הוסף שכבה" title="הוסף שכבה" onClick={() => { const n = Math.max(0, ...layers.map((item) => Number(item.id.replace('layer-', '')) || 0)) + 1; const layer = { id: `layer-${n}`, name: `שכבה ${n}`, color: LAYER_COLORS[layers.length % LAYER_COLORS.length], visible: true, locked: false, open: true }; setLayers([...layers, layer]); setActiveId(layer.id); onActiveLayer(layer.id) }}>+</button>
          <button className="icon-button" aria-label="מחק שכבה" title="מחק שכבה" disabled={layers.length <= 1 || active.id === 'layer-1'} onClick={() => { setLayers((current) => current.filter((layer) => layer.id !== active.id)); setActiveId('layer-1'); onActiveLayer('layer-1') }}>⌫</button>
        </div>
      </div>
      {editing && <div className="layer-edit-dialog" role="dialog" aria-label={editing.kind === 'layer' ? 'אפשרויות שכבה' : 'שם אובייקט'}>
        <div className="layer-edit-title">{editing.kind === 'layer' ? 'אפשרויות שכבה' : 'שם תת-פריט'}</div>
        <label>שם<input value={editName} onChange={(event) => setEditName(event.target.value)} autoFocus /></label>
        {editing.kind === 'layer' && <label>צבע<input type="color" value={editColor} onChange={(event) => setEditColor(event.target.value)} /></label>}
        <div className="layer-edit-actions"><button className="btn small primary" onClick={saveEditor}>אישור</button><button className="btn small" onClick={() => setEditing(null)}>ביטול</button></div>
      </div>}
    </section>
  )
}
