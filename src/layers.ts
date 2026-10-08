import type { ImageFrame, LayerInfo, ShapeFrame, TextFrame } from './document'

/** The colours a new layer takes in turn (the stripe beside its name in the Layers panel). */
export const LAYER_COLORS = ['#3d8bff', '#ff5c5c', '#00d1b2', '#f5b800', '#a78bfa']

/** The layer every object belongs to when it has no (or an unknown) layer of its own. */
export const DEFAULT_LAYER_ID = 'layer-1'

/** A layer as the panel shows it, every default filled in. */
export interface LayerView {
  id: string
  name: string
  color: string
  hidden: boolean
  locked: boolean
}

/** 'layer-3' -> 3: the number a layer was given when it was made, which its default name and colour follow (not its place in the list, which changes) */
const layerNumber = (id: string, index: number) => {
  const found = /^layer-(\d+)$/.exec(id)
  return found ? Number(found[1]) : index + 1
}

/** Every layer in stacking order, with its name and colour (or the defaults: "שכבה N" and a colour by N), hidden and locked. */
export function layerViewsOf(layerOrder: string[], layers: Record<string, LayerInfo> = {}): LayerView[] {
  const ids = layerOrder.length ? layerOrder : [DEFAULT_LAYER_ID]
  return ids.map((id, index) => {
    const number = layerNumber(id, index)
    const info = layers[id] ?? {}
    return {
      id,
      name: info.name || `שכבה ${number}`,
      color: info.color || LAYER_COLORS[(number - 1 + LAYER_COLORS.length) % LAYER_COLORS.length],
      hidden: info.hidden === true,
      locked: info.locked === true,
    }
  })
}

/** The id of the layer an object is on: its own when that layer exists, otherwise the default one. */
export const layerIdOf = (item: { layerId?: string }, layerOrder: string[]) =>
  item.layerId && layerOrder.includes(item.layerId) ? item.layerId : DEFAULT_LAYER_ID

type Layered = Pick<TextFrame | ImageFrame | ShapeFrame, 'id' | 'layerId' | 'hidden' | 'locked'>

/** Is the object not drawn: hidden itself, or on a hidden layer? */
export function isHiddenItem(item: Layered, views: ReadonlyMap<string, LayerView>, layerOrder: string[]): boolean {
  return item.hidden === true || views.get(layerIdOf(item, layerOrder))?.hidden === true
}

/** Is the object closed to selecting and changing: locked itself, or on a locked layer? */
export function isLockedItem(item: Layered, views: ReadonlyMap<string, LayerView>, layerOrder: string[]): boolean {
  return item.locked === true || views.get(layerIdOf(item, layerOrder))?.locked === true
}

/** The objects, with those on a hidden layer marked hidden themselves: whatever draws them then needs to know one thing only. */
export function markHiddenByLayer<T extends Layered>(items: T[], layerOrder: string[], layers?: Record<string, LayerInfo>): T[] {
  const views = new Map(layerViewsOf(layerOrder, layers).map((view) => [view.id, view]))
  if (![...views.values()].some((view) => view.hidden)) return items
  return items.map((item) => (!item.hidden && isHiddenItem(item, views, layerOrder) ? { ...item, hidden: true as const } : item))
}

/**
 * The first layer where a new object can be made and used: the wanted one, unless it is hidden or locked, then the first
 * layer from the top that is neither. With every layer closed the wanted one is returned, as there is nowhere better.
 */
export function creationLayerOf(wantedId: string, views: LayerView[]): string {
  const usable = (view: LayerView) => !view.hidden && !view.locked
  const wanted = views.find((view) => view.id === wantedId)
  if (!wanted || usable(wanted)) return wantedId
  return views.find(usable)?.id ?? wantedId
}

/** The record of layers after one is changed: an entry with nothing in it is dropped, so a file keeps only what differs from the defaults. */
export function withLayerInfo(layers: Record<string, LayerInfo> = {}, id: string, patch: { name?: string; color?: string; hidden?: boolean; locked?: boolean }): Record<string, LayerInfo> {
  const current = layers[id] ?? {}
  const next: LayerInfo = { ...current }
  if (patch.name !== undefined) {
    if (patch.name) next.name = patch.name
    else delete next.name
  }
  if (patch.color !== undefined) next.color = patch.color
  if (patch.hidden !== undefined) {
    if (patch.hidden) next.hidden = true
    else delete next.hidden
  }
  if (patch.locked !== undefined) {
    if (patch.locked) next.locked = true
    else delete next.locked
  }
  const out = { ...layers }
  if (Object.keys(next).length) out[id] = next
  else delete out[id]
  return out
}

/** The name of a new layer's id: the lowest 'layer-N' that nothing uses yet. */
export function newLayerId(layerOrder: string[]): string {
  const highest = Math.max(0, ...layerOrder.map((id) => Number(/^layer-(\d+)$/.exec(id)?.[1] ?? 0)))
  return `layer-${highest + 1}`
}
