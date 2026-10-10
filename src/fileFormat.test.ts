import { describe, expect, it } from 'vitest'
import { defaultDocSettings } from './document'
import { parseDocument, serializeDocument } from './fileFormat'
import type { DocContent } from './pages'

function contentWith(shapeExtra: Record<string, unknown>): DocContent {
  const doc = defaultDocSettings('blend')
  return {
    doc,
    frames: [],
    images: [],
    assets: {},
    guides: [],
    shapes: [{ id: 's', kind: 'rect', x: 10, y: 10, w: 100, h: 80, fill: '#6699ff', stroke: null, strokeWidth: 0, ...shapeExtra }] as DocContent['shapes'],
    paragraphStyles: [],
    parents: [],
    pageParents: [],
    sections: [],
  }
}

describe('the blend mode of an object in the file', () => {
  it('is kept: multiply and screen come back as they were written', () => {
    const multiply = parseDocument(serializeDocument(contentWith({ blendMode: 'multiply' })), 'blend.imudist')
    expect(multiply.shapes[0]?.blendMode).toBe('multiply')
    const screen = parseDocument(serializeDocument(contentWith({ blendMode: 'screen' })), 'blend.imudist')
    expect(screen.shapes[0]?.blendMode).toBe('screen')
  })

  it('is missing for a normal object, and a mode this version does not know is dropped', () => {
    const plain = parseDocument(serializeDocument(contentWith({})), 'blend.imudist')
    expect(plain.shapes[0]).not.toHaveProperty('blendMode')
    const unknown = parseDocument(serializeDocument(contentWith({ blendMode: 'color-dodge' })), 'blend.imudist')
    expect(unknown.shapes[0]).not.toHaveProperty('blendMode')
  })
})
