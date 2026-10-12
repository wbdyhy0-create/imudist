import { describe, expect, it } from 'vitest'
import type { ImageFrame, ObjectStyleRecord, ShapeFrame } from './document'
import { defaultDocSettings } from './document'
import { parseDocument, serializeDocument } from './fileFormat'
import { applyToImage, applyToShape, lookOfImage, lookOfShape, objectStyleOverrides, uniqueObjectStyleName, withoutObjectStyle } from './objectStyles'
import type { DocContent } from './pages'

const rect = (extra: Partial<ShapeFrame> = {}): ShapeFrame => ({ id: 's', kind: 'rect', x: 0, y: 0, w: 100, h: 60, fill: '#ff0000', stroke: null, strokeWidth: 0, ...extra }) as ShapeFrame
const line = (extra: Partial<ShapeFrame> = {}): ShapeFrame => ({ id: 'l', kind: 'line', x: 0, y: 0, w: 100, h: 0, fill: null, stroke: '#000000', strokeWidth: 2, ...extra }) as ShapeFrame
const picture = (extra: Partial<ImageFrame> = {}): ImageFrame => ({ id: 'i', x: 0, y: 0, w: 50, h: 50, assetId: 'a', fit: 'fill', ...extra }) as ImageFrame

describe('the look of an object, as a style', () => {
  it('holds fill, line, corners, see-through and shadow of a shape', () => {
    const look = lookOfShape(rect({ stroke: '#112233', strokeWidth: 2, radii: [8, 8, 8, 8], opacity: 0.5, shadowOpacity: 0.4, shadowOffsetX: 2, shadowOffsetY: 5, shadowColor: '#333333' }))
    expect(look).toMatchObject({ fill: '#ff0000', stroke: '#112233', strokeWidth: 2, radius: 8, opacity: 0.5, strokeDash: 'solid' })
    expect(look.shadow).toEqual({ offsetX: 2, offsetY: 5, color: '#333333', opacity: 0.4 })
    expect(look).not.toHaveProperty('arrowStart') // a rectangle has no arrow heads
  })

  it('has arrow heads and a profile for a line, and no fill or corners', () => {
    const look = lookOfShape(line({ arrowEnd: 'triangle', lineWidths: [1, 0.5, 0] }))
    expect(look.arrowEnd).toBe('triangle')
    expect(look.arrowStart).toBeNull()
    expect(look.lineWidths).toEqual([1, 0.5, 0])
    expect(look).not.toHaveProperty('fill')
    expect(look).not.toHaveProperty('radius')
  })

  it('is only opacity, mixing and shadow for a picture', () => {
    expect(Object.keys(lookOfImage(picture({ opacity: 0.8 }))).sort()).toEqual(['blendMode', 'opacity', 'shadow'])
  })
})

describe('giving an object a style', () => {
  it('writes the settings the style holds, and nothing else, and remembers the style', () => {
    const styled = applyToShape(rect({ stroke: '#000000', strokeWidth: 3 }), { fill: '#00ff00', radius: 10, shadow: { offsetX: 0, offsetY: 4, color: '#000000', opacity: 0.3 } }, 'st')
    expect(styled).toMatchObject({ fill: '#00ff00', radii: [10, 10, 10, 10], stroke: '#000000', strokeWidth: 3, objectStyleId: 'st', shadowOpacity: 0.3, shadowOffsetY: 4 })
  })

  it('takes a shadow away with null and plain values away with their defaults', () => {
    const base = rect({ shadowOpacity: 0.5, shadowOffsetX: 1, shadowOffsetY: 2, shadowColor: '#222222', opacity: 0.4, strokeDash: 'dashed' })
    const plain = applyToShape(base, { shadow: null, opacity: 1, strokeDash: 'solid' })
    expect(plain).not.toHaveProperty('shadowOpacity')
    expect(plain).not.toHaveProperty('shadowOffsetX')
    expect(plain).not.toHaveProperty('opacity')
    expect(plain).not.toHaveProperty('strokeDash')
  })

  it('leaves what does not belong to the kind of the object: no fill on a line, no corners on an ellipse', () => {
    const l = applyToShape(line(), { fill: '#ff00ff', stroke: '#336699', arrowEnd: 'stealth' })
    expect(l.fill).toBeNull()
    expect(l.stroke).toBe('#336699')
    expect(l.arrowEnd).toBe('stealth')
    const e = applyToShape(rect({ kind: 'ellipse' }), { radius: 12, fill: '#00ffff' })
    expect(e).not.toHaveProperty('radii')
    expect(e.fill).toBe('#00ffff')
  })

  it('works on a picture: its see-through, mixing and shadow', () => {
    const styled = applyToImage(picture(), { opacity: 0.6, blendMode: 'multiply', shadow: { offsetX: 1, offsetY: 3, color: '#000000', opacity: 0.5 } }, 'st')
    expect(styled).toMatchObject({ opacity: 0.6, blendMode: 'multiply', shadowOpacity: 0.5, objectStyleId: 'st' })
    expect(applyToImage(styled, { blendMode: null, opacity: 1 })).not.toHaveProperty('blendMode')
  })

  it('lets go of the style and keeps the look', () => {
    const styled = applyToShape(rect(), { fill: '#123456' }, 'st')
    const free = withoutObjectStyle(styled)
    expect(free).not.toHaveProperty('objectStyleId')
    expect(free.fill).toBe('#123456')
  })
})

describe('what an object changed on top of its style', () => {
  it('is the settings that differ from what the style says', () => {
    const settings = { fill: '#00ff00', strokeWidth: 2 }
    const styled = applyToShape(rect(), settings, 'st')
    expect(objectStyleOverrides(styled, settings)).toEqual([])
    expect(objectStyleOverrides({ ...styled, fill: '#0000ff' }, settings)).toEqual(['fill'])
  })

  it('does not count the plain value of a setting as a difference from a missing one', () => {
    expect(objectStyleOverrides(rect({ stroke: null, strokeWidth: 0 }), { opacity: 1, strokeDash: 'solid', shadow: null })).toEqual([])
  })
})

describe('names of styles', () => {
  const styles: ObjectStyleRecord[] = [{ id: 'a', name: 'כרטיס', settings: {} }, { id: 'b', name: 'כרטיס 2', settings: {} }]
  it('are never the same as another style', () => {
    expect(uniqueObjectStyleName(styles, 'מסגרת')).toBe('מסגרת')
    expect(uniqueObjectStyleName(styles, 'כרטיס')).toBe('כרטיס 3')
  })
})

describe('object styles in the file', () => {
  const contentWith = (objectStyles: unknown, shapes: ShapeFrame[] = []): DocContent => ({
    doc: defaultDocSettings('styles'),
    frames: [],
    images: [],
    assets: {},
    guides: [],
    shapes,
    paragraphStyles: [],
    parents: [],
    pageParents: [],
    sections: [],
    objectStyles: objectStyles as ObjectStyleRecord[],
  })

  it('come back with their settings, and so does the style an object follows', () => {
    const styles: ObjectStyleRecord[] = [{ id: 'k', name: 'כרטיס', settings: { fill: '#112233', stroke: null, radius: 6, opacity: 0.8, shadow: { offsetX: 1, offsetY: 4, color: '#000000', opacity: 0.35 }, arrowEnd: 'triangle', lineWidths: [1, 0.5, 0] } }]
    const opened = parseDocument(serializeDocument(contentWith(styles, [rect({ objectStyleId: 'k' })])), 'styles.imudist')
    expect(opened.objectStyles).toEqual(styles)
    expect(opened.shapes[0]?.objectStyleId).toBe('k')
  })

  it('drop what is not understood', () => {
    const opened = parseDocument(serializeDocument(contentWith([
      { id: 'x', name: '  ', settings: { fill: 'red', stroke: '#abcdef', strokeWidth: 'thick', strokeCap: 'zigzag', blendMode: 'color-dodge', arrowEnd: 'rocket', shadow: { opacity: 0.2, color: 'blue' } } },
      { id: 'x', name: 'duplicate', settings: {} },
      { name: 'no id', settings: {} },
    ])), 'styles.imudist')
    expect(opened.objectStyles).toHaveLength(1)
    expect(opened.objectStyles?.[0]?.name).toBe('סגנון אובייקט')
    expect(opened.objectStyles?.[0]?.settings).toEqual({ stroke: '#abcdef', shadow: { offsetX: 0, offsetY: 6, color: '#000000', opacity: 0.2 } })
  })
})
