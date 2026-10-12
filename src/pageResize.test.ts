import { describe, expect, it } from 'vitest'
import { defaultDocSettings, withPageSize, type ImageFrame, type ShapeFrame } from './document'
import { applySettings, pageRects, type DocContent } from './pages'

/** two A4 pages with a 15 mm margin; a picture fills the box between the margins of each (the way an imported PDF page is placed) */
const content = (): DocContent => {
  const doc = { ...defaultDocSettings('resize'), pages: 2, primaryTextFrame: false }
  const rects = pageRects(doc)
  const margin = doc.margins.top
  const image = (index: number): ImageFrame => ({
    id: `i${index}`,
    x: rects[index].x + margin,
    y: rects[index].y + margin,
    w: rects[index].w - 2 * margin,
    h: rects[index].h - 2 * margin,
    assetId: 'a',
    fit: 'fit',
  })
  const rule: ShapeFrame = { id: 'rule', kind: 'line', x: rects[0].x + margin, y: rects[0].y + 100, w: rects[0].w - 2 * margin, h: 0, fill: null, stroke: '#000000', strokeWidth: 1 } as ShapeFrame
  return { doc, frames: [], images: [image(0), image(1)], assets: {}, guides: [], shapes: [rule], paragraphStyles: [], parents: [], pageParents: [], sections: [] }
}

describe('changing the size of the pages', () => {
  const a5 = (c: DocContent) => withPageSize(c.doc, 'all', 419.53, 595.28)

  it('takes the pictures of the pages with it: a page of a PDF fills the box between the margins of the smaller page', () => {
    const before = content()
    const next = a5(before)
    const after = applySettings(before, next, true)
    const rects = pageRects(applySettings(before, next, false).doc)
    const margin = next.margins.top
    for (const [index, image] of after.images.entries()) {
      expect(image.x).toBeCloseTo(rects[index].x + margin, 3)
      expect(image.y).toBeCloseTo(rects[index].y + margin, 3)
      expect(image.w).toBeCloseTo(rects[index].w - 2 * margin, 3)
      expect(image.h).toBeCloseTo(rects[index].h - 2 * margin, 3)
    }
  })

  it('leaves the pictures as they are when the option is off, only following their pages', () => {
    const before = content()
    const after = applySettings(before, a5(before), false)
    expect(after.images.map((image) => [image.w, image.h])).toEqual(before.images.map((image) => [image.w, image.h]))
  })

  it('moves a line with it and keeps it a line: no height stays no height', () => {
    const before = content()
    const after = applySettings(before, a5(before), true)
    expect(after.shapes[0].h).toBe(0)
    expect(after.shapes[0].w).toBeGreaterThan(0)
    expect(after.shapes[0].w).toBeLessThan(before.shapes[0].w)
  })

  it('does nothing to objects when neither the size nor the margins change', () => {
    const before = content()
    const after = applySettings(before, { ...before.doc }, true)
    expect(after.images.map((image) => [image.x, image.y, image.w, image.h])).toEqual(before.images.map((image) => [image.x, image.y, image.w, image.h]))
    expect(after.shapes).toEqual(before.shapes)
  })
})
