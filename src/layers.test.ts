import { describe, expect, it } from 'vitest'
import { defaultDocSettings, defaultParagraphStyles, type ImageFrame, type ParentPage, type ShapeFrame, type TextFrame } from './document'
import { parseDocument, serializeDocument } from './fileFormat'
import { creationLayerOf, isHiddenItem, isLockedItem, LAYER_COLORS, layerViewsOf, markHiddenByLayer, newLayerId, withLayerInfo } from './layers'
import { parentShadowContent, type DocContent } from './pages'

const frame = (id: string, extra: Partial<TextFrame> = {}): TextFrame => ({
  id, x: 10, y: 20, w: 100, h: 40, text: 'שלום', runs: [], next: null, fontFamily: 'Arial', fontSize: 12, weight: 400, italic: false, tracking: 0, align: 'right', color: '#000000', ...extra,
})

describe('layers', () => {
  it('names and colours a layer by its number, not by where it stands in the list', () => {
    const views = layerViewsOf(['layer-3', 'layer-1', 'layer-2'])
    expect(views.map((view) => view.name)).toEqual(['שכבה 3', 'שכבה 1', 'שכבה 2'])
    expect(views.map((view) => view.color)).toEqual([LAYER_COLORS[2], LAYER_COLORS[0], LAYER_COLORS[1]])
    expect(views.every((view) => !view.hidden && !view.locked)).toBe(true)
  })

  it('takes a name, a colour, hidden and locked from the record, and keeps the record free of defaults', () => {
    const layers = withLayerInfo({}, 'layer-2', { name: 'רקע', color: '#112233', hidden: true, locked: true })
    expect(layerViewsOf(['layer-1', 'layer-2'], layers)[1]).toMatchObject({ name: 'רקע', color: '#112233', hidden: true, locked: true })
    const shown = withLayerInfo(withLayerInfo(withLayerInfo(layers, 'layer-2', { hidden: false }), 'layer-2', { locked: false }), 'layer-2', { name: '', color: undefined })
    expect(Object.keys(shown)).toEqual(['layer-2'])
    expect(withLayerInfo({ 'layer-2': { hidden: true } }, 'layer-2', { hidden: false })).toEqual({})
  })

  it('gives a new layer the lowest unused number', () => {
    expect(newLayerId(['layer-1'])).toBe('layer-2')
    expect(newLayerId(['layer-1', 'layer-4', 'layer-2'])).toBe('layer-5')
  })

  it('makes an object hidden or locked by itself or through its layer', () => {
    const order = ['layer-1', 'layer-2']
    const views = new Map(layerViewsOf(order, { 'layer-2': { hidden: true, locked: true } }).map((view) => [view.id, view]))
    expect(isHiddenItem({ id: 'a', layerId: 'layer-2' }, views, order)).toBe(true)
    expect(isLockedItem({ id: 'a', layerId: 'layer-2' }, views, order)).toBe(true)
    expect(isHiddenItem({ id: 'b' }, views, order)).toBe(false)
    expect(isHiddenItem({ id: 'c', hidden: true }, views, order)).toBe(true)
    expect(isLockedItem({ id: 'c', locked: true }, views, order)).toBe(true)
    // an unknown layer counts as the first one
    expect(isHiddenItem({ id: 'd', layerId: 'layer-9' }, views, order)).toBe(false)
  })

  it('makes new objects on the first open layer when the active one is closed', () => {
    const views = layerViewsOf(['layer-3', 'layer-2', 'layer-1'], { 'layer-3': { locked: true }, 'layer-2': { hidden: true } })
    expect(creationLayerOf('layer-3', views)).toBe('layer-1')
    expect(creationLayerOf('layer-1', views)).toBe('layer-1')
    const allClosed = layerViewsOf(['layer-1'], { 'layer-1': { locked: true } })
    expect(creationLayerOf('layer-1', allClosed)).toBe('layer-1')
  })
})

describe('layers in the file', () => {
  it('keeps the names, colours, hidden and locked of layers and objects through save and open', () => {
    const image: ImageFrame = { id: 'i1', x: 0, y: 0, w: 10, h: 10, assetId: 'a1', fit: 'fill', hidden: true, locked: true, label: 'לוגו' }
    const shape: ShapeFrame = { id: 's1', kind: 'rect', x: 0, y: 0, w: 10, h: 10, fill: '#ff0000', stroke: null, strokeWidth: 0, hidden: true, label: 'רקע אדום' }
    const content: DocContent = {
      doc: defaultDocSettings('t'),
      layerOrder: ['layer-2', 'layer-1'],
      layers: { 'layer-2': { name: 'כותרות', color: '#112233', hidden: true }, 'layer-1': { locked: true } },
      frames: [frame('f1', { hidden: true, locked: true, label: 'כותרת ראשית', layerId: 'layer-2' })],
      images: [image],
      assets: { a1: { id: 'a1', name: 'p.png', mime: 'image/png', dataUrl: 'data:image/png;base64,AAAA', w: 10, h: 10 } as never },
      guides: [],
      shapes: [shape],
      paragraphStyles: defaultParagraphStyles(),
      parents: [],
      pageParents: [],
      sections: [],
    }
    const back = parseDocument(serializeDocument(content), 't')
    expect(back.layers).toEqual(content.layers)
    expect(back.frames[0]).toMatchObject({ hidden: true, locked: true, label: 'כותרת ראשית', layerId: 'layer-2' })
    expect(back.images[0]).toMatchObject({ hidden: true, locked: true, label: 'לוגו' })
    expect(back.shapes[0]).toMatchObject({ hidden: true, label: 'רקע אדום' })
  })

  it('drops layer records of layers that do not exist, and invalid ones', () => {
    const content: DocContent = {
      doc: defaultDocSettings('t'), layerOrder: ['layer-1'], frames: [], images: [], assets: {}, guides: [], shapes: [],
      paragraphStyles: defaultParagraphStyles(), parents: [], pageParents: [], sections: [],
    }
    const file = JSON.parse(serializeDocument(content))
    file.layers = { 'layer-1': { name: '  ', color: 'red', hidden: 'yes' }, 'layer-7': { hidden: true } }
    const back = parseDocument(JSON.stringify(file), 't')
    expect(back.layers).toEqual({})
  })
})

describe('layers in the export', () => {
  const doc = { ...defaultDocSettings('t'), pages: 1 }

  it('marks the objects of a hidden layer as hidden, and leaves the others', () => {
    const marked = markHiddenByLayer([frame('a', { layerId: 'layer-2' }), frame('b'), frame('c', { hidden: true })], ['layer-2', 'layer-1'], { 'layer-2': { hidden: true } })
    expect(marked.map((f) => [f.id, f.hidden === true])).toEqual([['a', true], ['b', false], ['c', true]])
    // with no hidden layer the very same list comes back
    const all = [frame('a')]
    expect(markHiddenByLayer(all, ['layer-1'], {})).toBe(all)
  })

  it('leaves the hidden objects of a parent page out of the pages that show it', () => {
    const parent: ParentPage = { id: 'm', prefix: 'A', name: 'm', w: doc.width, h: doc.height, frames: [frame('shown'), frame('gone', { hidden: true })], images: [], shapes: [] }
    const shown = parentShadowContent(doc, [parent], ['m'], [], [])
    expect(shown.frames.map((f) => f.text)).toEqual(['שלום'])
    expect(shown.frames).toHaveLength(1)
  })
})
