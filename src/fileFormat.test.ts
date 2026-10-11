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

describe('a shape with a great many points in the file', () => {
  const ring = (n: number): [number, number][] => Array.from({ length: n }, (_, i) => [0.5 + 0.4 * Math.cos((i / n) * Math.PI * 2), 0.5 + 0.4 * Math.sin((i / n) * Math.PI * 2)])
  const reopened = (rings: [number, number][][]) => parseDocument(serializeDocument(contentWith({ kind: 'path', geom: [rings] })), 'points.imudist').shapes[0]!

  it('keeps every point of a ring of 50,000 (more than a ring was once allowed to hold)', () => {
    const shape = reopened([ring(50_000)])
    expect(shape.kind).toBe('path')
    expect(shape.geom?.[0]?.[0]).toHaveLength(50_000)
  })

  it('stays a path with 150,000 points in several rings (more than a shape was once allowed to hold)', () => {
    const shape = reopened([ring(50_000), ring(50_000), ring(50_000)])
    expect(shape.kind).toBe('path')
    expect(shape.geom?.[0]).toHaveLength(3)
  })
})

describe('the depth of a shape in the file', () => {
  it('is kept, with the settings and the link of the sides to their front', () => {
    const content = contentWith({ extrude: { depth: 42, angle: 135, shade: 0.4, sideColor: '#336699' } })
    content.shapes.push({ id: 'side', kind: 'path', x: 0, y: 0, w: 10, h: 10, geom: [[[[0, 0], [1, 0], [1, 1]]]], fill: '#112233', stroke: null, strokeWidth: 0, extrudeOf: 's' } as DocContent['shapes'][number])
    const restored = parseDocument(serializeDocument(content), 'depth.imudist')
    expect(restored.shapes[0]?.extrude).toEqual({ depth: 42, angle: 135, shade: 0.4, sideColor: '#336699' })
    expect(restored.shapes[1]?.extrudeOf).toBe('s')
  })

  it('is dropped when it is not a depth, and the angle is brought into 0…360', () => {
    const none = parseDocument(serializeDocument(contentWith({ extrude: { depth: -5, angle: 10, shade: 0.5 } })), 'depth.imudist')
    expect(none.shapes[0]).not.toHaveProperty('extrude')
    const turned = parseDocument(serializeDocument(contentWith({ extrude: { depth: 10, angle: -90, shade: 5, sideColor: 'not a colour' } })), 'depth.imudist')
    expect(turned.shapes[0]?.extrude).toEqual({ depth: 10, angle: 270, shade: 1 })
  })
})

describe('the isometric plane of a solid in the file', () => {
  it('is kept, and is left out when it is not set', () => {
    for (const plane of ['top', 'left', 'right'] as const) {
      const iso = parseDocument(serializeDocument(contentWith({ extrude: { depth: 30, angle: 30, shade: 0.6, iso: plane } })), 'iso.imudist')
      expect(iso.shapes[0]?.extrude?.iso).toBe(plane)
    }
    const plain = parseDocument(serializeDocument(contentWith({ extrude: { depth: 30, angle: 45, shade: 0.6 } })), 'iso.imudist')
    expect(plain.shapes[0]?.extrude).not.toHaveProperty('iso')
  })

  it('reads the flag of the first version (true) as the plane lying flat', () => {
    const legacy = parseDocument(serializeDocument(contentWith({ extrude: { depth: 30, angle: 270, shade: 0.6, iso: true } })), 'iso.imudist')
    expect(legacy.shapes[0]?.extrude?.iso).toBe('top')
  })
})

describe('the frame of a solid in the file', () => {
  it('is kept with its wall and its roundness, and is left out when it is not set or not a frame', () => {
    const kept = parseDocument(serializeDocument(contentWith({ extrude: { depth: 30, angle: 45, shade: 0.6, frame: { wall: 22, outer: 14, inner: 6 } } })), 'frame.imudist')
    expect(kept.shapes[0]?.extrude?.frame).toEqual({ wall: 22, outer: 14, inner: 6 })
    const none = parseDocument(serializeDocument(contentWith({ extrude: { depth: 30, angle: 45, shade: 0.6 } })), 'frame.imudist')
    expect(none.shapes[0]?.extrude).not.toHaveProperty('frame')
    const bad = parseDocument(serializeDocument(contentWith({ extrude: { depth: 30, angle: 45, shade: 0.6, frame: { wall: -3, outer: 1, inner: 1 } } })), 'frame.imudist')
    expect(bad.shapes[0]?.extrude).not.toHaveProperty('frame')
  })
})

describe('the lean of the front in the file', () => {
  it('is kept, and is left out when it is zero', () => {
    const leaned = parseDocument(serializeDocument(contentWith({ extrude: { depth: 30, angle: 45, shade: 0.6, lean: -18 } })), 'lean.imudist')
    expect(leaned.shapes[0]?.extrude?.lean).toBe(-18)
    const straight = parseDocument(serializeDocument(contentWith({ extrude: { depth: 30, angle: 45, shade: 0.6, lean: 0 } })), 'lean.imudist')
    expect(straight.shapes[0]?.extrude).not.toHaveProperty('lean')
  })
})

describe('the view of a solid in the file', () => {
  it('is kept, within its range, and left out when it is not a view', () => {
    const kept = parseDocument(serializeDocument(contentWith({ extrude: { depth: 30, angle: 45, shade: 0.6, view: { yaw: -25, pitch: 30 } } })), 'view.imudist')
    expect(kept.shapes[0]?.extrude?.view).toEqual({ yaw: -25, pitch: 30 })
    const wild = parseDocument(serializeDocument(contentWith({ extrude: { depth: 30, angle: 45, shade: 0.6, view: { yaw: 400, pitch: 200 } } })), 'view.imudist')
    expect(wild.shapes[0]?.extrude?.view).toEqual({ yaw: 80, pitch: 80 })
    const none = parseDocument(serializeDocument(contentWith({ extrude: { depth: 30, angle: 45, shade: 0.6 } })), 'view.imudist')
    expect(none.shapes[0]?.extrude).not.toHaveProperty('view')
  })
})

describe('the thickness of the sides of a frame in the file', () => {
  it('is kept for the sides that have their own, and left out for the others', () => {
    const kept = parseDocument(serializeDocument(contentWith({ extrude: { depth: 30, angle: 45, shade: 0.6, frame: { wall: 20, outer: 10, inner: 4, bottom: 36, left: 8 } } })), 'walls.imudist')
    expect(kept.shapes[0]?.extrude?.frame).toEqual({ wall: 20, outer: 10, inner: 4, bottom: 36, left: 8 })
    const plain = parseDocument(serializeDocument(contentWith({ extrude: { depth: 30, angle: 45, shade: 0.6, frame: { wall: 20, outer: 10, inner: 4 } } })), 'walls.imudist')
    expect(plain.shapes[0]?.extrude?.frame).toEqual({ wall: 20, outer: 10, inner: 4 })
  })
})

describe('the blur and the brush stroke of a shape in the file', () => {
  it('keep a blur, within range, and drop one that is nothing', () => {
    expect(parseDocument(serializeDocument(contentWith({ blur: 2.5 })), 'blur.imudist').shapes[0]?.blur).toBe(2.5)
    expect(parseDocument(serializeDocument(contentWith({ blur: 5000 })), 'blur.imudist').shapes[0]?.blur).toBe(60)
    expect(parseDocument(serializeDocument(contentWith({ blur: 0 })), 'blur.imudist').shapes[0]).not.toHaveProperty('blur')
    expect(parseDocument(serializeDocument(contentWith({ blur: 'soft' })), 'blur.imudist').shapes[0]).not.toHaveProperty('blur')
  })

  it('bring back the stroke of a path as it was written', () => {
    const geom = [[[[0, 0], [1, 0], [1, 1]]]]
    const brush = { style: 'splatter', size: 22, sharpness: 'soft', points: [[0, 0.5], [0.5, 0.25], [1, 0.5]] }
    const restored = parseDocument(serializeDocument(contentWith({ kind: 'path', geom, brush })), 'brush.imudist')
    expect(restored.shapes[0]?.brush).toEqual(brush)
  })

  it('drop a stroke that cannot be read, and put right a size or a level that is out of range', () => {
    const geom = [[[[0, 0], [1, 0], [1, 1]]]]
    const broken = parseDocument(serializeDocument(contentWith({ kind: 'path', geom, brush: { style: 'round', size: 10, sharpness: 'sharp', points: [[0, 'x']] } })), 'brush.imudist')
    expect(broken.shapes[0]).not.toHaveProperty('brush')
    const odd = parseDocument(serializeDocument(contentWith({ kind: 'path', geom, brush: { style: 'round', size: 9000, sharpness: 'crisp', points: [[0, 0]] } })), 'brush.imudist')
    expect(odd.shapes[0]?.brush).toMatchObject({ size: 120, sharpness: 'medium' })
  })

  it('are not kept on a shape that is not a path', () => {
    const brush = { style: 'round', size: 10, sharpness: 'sharp', points: [[0, 0]] }
    expect(parseDocument(serializeDocument(contentWith({ brush })), 'brush.imudist').shapes[0]).not.toHaveProperty('brush')
  })
})
