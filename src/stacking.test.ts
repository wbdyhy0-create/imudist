import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAGRAPH_STYLES, defaultDocSettings, type ShapeFrame } from './document'
import { parseDocument, serializeDocument } from './fileFormat'
import type { DocContent } from './pages'
import { arrange, stackOrder } from './stacking'

const rect = (id: string, layerId: string, z: number): ShapeFrame => ({
  id,
  kind: 'rect',
  layerId,
  x: 0,
  y: 0,
  w: 10,
  h: 10,
  fill: '#000000',
  stroke: null,
  strokeWidth: 0,
  z,
})

describe('layer stacking', () => {
  it('paints lower layers behind upper layers regardless of global z', () => {
    const shapes = [rect('upper-back', 'layer-1', 1), rect('lower-front', 'layer-2', 999), rect('upper-front', 'layer-1', 2)]

    expect(stackOrder([], [], shapes, ['layer-1', 'layer-2']).map((item) => item.id)).toEqual(['lower-front', 'upper-back', 'upper-front'])
  })

  it('arranges an object within its own layer without crossing another layer', () => {
    const shapes = [rect('upper', 'layer-1', 0), rect('bottom', 'layer-2', 0), rect('top', 'layer-2', 1)]
    const result = arrange([], [], 'bottom', 'front', shapes, ['layer-1', 'layer-2'])

    expect(result?.shapes.find((shape) => shape.id === 'bottom')?.z).toBeGreaterThan(result?.shapes.find((shape) => shape.id === 'top')?.z ?? -Infinity)
    expect(stackOrder([], [], result?.shapes ?? [], ['layer-1', 'layer-2']).at(-1)?.id).toBe('upper')
  })

  it('persists the front-to-back layer order through document save and reopen', () => {
    const content: DocContent = {
      doc: defaultDocSettings('layers'),
      layerOrder: ['layer-2', 'layer-1'],
      frames: [],
      images: [],
      assets: {},
      guides: [],
      shapes: [rect('back', 'layer-1', 999), rect('front', 'layer-2', 0)],
      paragraphStyles: DEFAULT_PARAGRAPH_STYLES,
      parents: [],
      pageParents: [],
      sections: [],
    }

    const restored = parseDocument(serializeDocument(content), 'layers')

    expect(restored.layerOrder).toEqual(['layer-2', 'layer-1'])
    expect(stackOrder([], [], restored.shapes, restored.layerOrder).map((item) => item.id)).toEqual(['back', 'front'])
  })
})