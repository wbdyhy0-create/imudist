import { describe, expect, it } from 'vitest'
import type { ShapeFrame } from './document'
import { autoSideColor, currentLean, DEFAULT_EXTRUDE, DEFAULT_FRAME, extrudeSides, fitWalls, frameLayout, frameMapOf, frameOutline, frameWalls, ISO_LEAN, leanShape, ISO_DEPTH_ANGLE, ISO_SQUASH, isometricShape, MAX_EXTRUDE_POINTS, roundedFrameGeom, paintShapes, shadeSide, solidSpec, syncSolid, turnedSettings, viewShape, viewVector, worldRings } from './extrude'

let counter = 0
const newId = () => `side-${counter++}`

const rect = (extra: Partial<ShapeFrame> = {}): ShapeFrame => ({ id: 'front', kind: 'rect', x: 100, y: 100, w: 100, h: 60, fill: '#2288dd', stroke: null, strokeWidth: 0, z: 5, ...extra })

const box = (shape: ShapeFrame) => ({ x0: shape.x, y0: shape.y, x1: shape.x + shape.w, y1: shape.y + shape.h })

const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
}

function sidesOf(front: ShapeFrame, settings: Partial<typeof DEFAULT_EXTRUDE> = {}) {
  const result = extrudeSides(front, { ...DEFAULT_EXTRUDE, ...settings }, newId, 'group-1')
  if (!('sides' in result)) throw new Error(`no sides: ${result.problem}`)
  return result.sides
}

describe('the outline of a shape for depth', () => {
  it('is the four corners of a rectangle, and turns with the shape', () => {
    expect(worldRings(rect())![0]).toEqual([[100, 100], [200, 100], [200, 160], [100, 160]])
    const turned = worldRings(rect({ rotation: 90 }))![0]!
    // about the centre (150, 130): the 100 × 60 box becomes 60 wide and 100 tall
    const xs = turned.map((p) => Math.round(p[0]))
    const ys = turned.map((p) => Math.round(p[1]))
    expect(Math.min(...xs)).toBe(120)
    expect(Math.max(...xs)).toBe(180)
    expect(Math.min(...ys)).toBe(80)
    expect(Math.max(...ys)).toBe(180)
  })

  it('is nothing for a line, a table or an open path', () => {
    expect(worldRings(rect({ kind: 'line' }))).toBeNull()
    expect(worldRings(rect({ kind: 'table' }))).toBeNull()
    expect(worldRings(rect({ kind: 'path', closed: false, geom: [[[[0, 0], [1, 0], [1, 1]]]] }))).toBeNull()
  })
})

describe('the sides of a shape that has depth', () => {
  it('are the right and the top of a rectangle drawn out up and to the right', () => {
    const sides = sidesOf(rect(), { depth: 20, angle: 45 })
    expect(sides).toHaveLength(2)
    const d = 20 / Math.SQRT2
    const right = sides.find((s) => Math.abs(s.x - 200) < 0.01)!
    const top = sides.find((s) => Math.abs(s.x - 100) < 0.01)!
    expect(right).toBeTruthy()
    expect(top).toBeTruthy()
    expect(box(right).x1).toBeCloseTo(200 + d, 3)
    expect(box(right).y0).toBeCloseTo(100 - d, 3)
    expect(box(right).y1).toBeCloseTo(160, 3)
    expect(box(top).x1).toBeCloseTo(200 + d, 3)
    expect(box(top).y0).toBeCloseTo(100 - d, 3)
  })

  it('are the left and the bottom when the depth goes down and to the left', () => {
    const sides = sidesOf(rect(), { depth: 20, angle: 225 })
    expect(sides).toHaveLength(2)
    const d = 20 / Math.SQRT2
    expect(Math.min(...sides.map((s) => s.x))).toBeCloseTo(100 - d, 3)
    expect(Math.max(...sides.map((s) => s.y + s.h))).toBeCloseTo(160 + d, 3)
  })

  it('are one side only when the depth goes straight up (the sides along it are not seen)', () => {
    const sides = sidesOf(rect(), { depth: 20, angle: 90 })
    expect(sides).toHaveLength(1)
    expect(sides[0]!.y).toBeCloseTo(80, 3)
    expect(sides[0]!.h).toBeCloseTo(20, 3)
  })

  it('are shapes of their own, behind the front, in the group, that point back to it', () => {
    const sides = sidesOf(rect({ layerId: 'layer-2', stroke: '#000000', strokeWidth: 2 }))
    for (const side of sides) {
      expect(side.kind).toBe('path')
      expect(side.extrudeOf).toBe('front')
      expect(side.groupId).toBe('group-1')
      expect(side.layerId).toBe('layer-2')
      expect(side.z).toBeLessThan(5)
      expect(side.stroke).toBe('#000000')
      expect(side.strokeWidth).toBe(2)
      expect(side.geom?.[0]?.[0]?.length).toBe(4)
    }
    expect(new Set(sides.map((s) => s.id)).size).toBe(sides.length)
  })

  it('are none when there is no depth', () => {
    expect(sidesOf(rect(), { depth: 0 })).toHaveLength(0)
  })

  it('are in bands for a curve, with the colour changing round it', () => {
    const sides = sidesOf(rect({ kind: 'ellipse', w: 120, h: 70, fill: '#cc3366' }), { depth: 40, angle: 270 })
    expect(sides.length).toBeGreaterThanOrEqual(4)
    expect(new Set(sides.map((s) => s.fill)).size).toBeGreaterThan(2)
    // all of them are below the ellipse: the depth goes down
    for (const side of sides) expect(side.y + side.h).toBeGreaterThan(100 + 70 - 0.01)
  })

  it('include the walls of a hole, only where they are seen through it', () => {
    const frame = rect({
      kind: 'path',
      x: 100,
      y: 100,
      w: 100,
      h: 100,
      geom: [[
        [[0, 0], [1, 0], [1, 1], [0, 1]],
        [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]],
      ]],
    })
    const sides = sidesOf(frame, { depth: 30, angle: 45 })
    // the right and the top on the outside, the left and the bottom walls of the hole inside
    expect(sides).toHaveLength(4)
    const hole = { x0: 125, y0: 125, x1: 175, y1: 175 }
    const inner = sides.filter((s) => s.x >= hole.x0 - 0.01 && s.x + s.w <= hole.x1 + 0.01 && s.y >= hole.y0 - 0.01 && s.y + s.h <= hole.y1 + 0.01)
    expect(inner).toHaveLength(2)
  })

  it('are refused for a shape that has no outline to draw out, or too many points', () => {
    expect(extrudeSides(rect({ kind: 'line' }), DEFAULT_EXTRUDE, newId)).toEqual({ problem: 'unsupported' })
    const many = Array.from({ length: MAX_EXTRUDE_POINTS + 10 }, (_, i): [number, number] => [0.5 + 0.4 * Math.cos(i), 0.5 + 0.4 * Math.sin(i)])
    expect(extrudeSides(rect({ kind: 'path', geom: [[many]] }), DEFAULT_EXTRUDE, newId)).toEqual({ problem: 'complex' })
  })
})

describe('the colour of a side', () => {
  it('is lighter facing the light and darker away from it', () => {
    const sides = sidesOf(rect({ fill: '#808080' }), { depth: 20, angle: 45, sideColor: '#808080', shade: 1 })
    const top = sides.find((s) => Math.abs(s.x - 100) < 0.01)!
    const right = sides.find((s) => Math.abs(s.x - 200) < 0.01)!
    expect(luminance(top.fill!)).toBeGreaterThan(128)
    expect(luminance(right.fill!)).toBeLessThan(128)
  })

  it('is the same on every side when the shading is off', () => {
    const sides = sidesOf(rect(), { shade: 0, sideColor: '#336699' })
    expect(new Set(sides.map((s) => s.fill))).toEqual(new Set(['#336699']))
  })

  it('is the front colour made darker when none is chosen, and grey when the front has no plain colour', () => {
    expect(autoSideColor('#ffffff')).not.toBe('#ffffff')
    expect(luminance(autoSideColor('#ffffff'))).toBeLessThan(255)
    expect(autoSideColor(null)).toBe('#777777')
    expect(shadeSide('#808080', 0, 1)).toBe('#808080')
  })
})

describe('an isometric solid', () => {
  it('has a square turned into the rhombus of the top of a cube', () => {
    const top = isometricShape(rect({ x: 100, y: 100, w: 100, h: 100 }), 'top')!
    expect(top.kind).toBe('path')
    // a diagonal of 100·√2 across, and a quarter-turn squashed to tan 30° from top to bottom
    expect(top.w).toBeCloseTo(100 * Math.SQRT2, 3)
    expect(top.h).toBeCloseTo(100 * Math.SQRT2 * ISO_SQUASH, 3)
    // the same centre as before
    expect(top.x + top.w / 2).toBeCloseTo(150, 3)
    expect(top.y + top.h / 2).toBeCloseTo(150, 3)
    expect(top.geom?.[0]?.[0]).toHaveLength(4)
  })

  it('turns a circle into an ellipse of the same ratio, and forgets the turn and the corners of the shape', () => {
    const top = isometricShape(rect({ kind: 'ellipse', w: 100, h: 100, rotation: 33, radii: [4, 4, 4, 4] }), 'top')!
    expect(top.h / top.w).toBeCloseTo(ISO_SQUASH, 2)
    expect(top).not.toHaveProperty('rotation')
    expect(top).not.toHaveProperty('radii')
  })

  it('is refused for a shape with no closed outline', () => {
    expect(isometricShape(rect({ kind: 'line' }), 'top')).toBeNull()
  })

  it('has two walls, the left lighter than the right, when its depth goes straight down', () => {
    const top = isometricShape(rect({ x: 100, y: 100, w: 100, h: 100 }), 'top')!
    const sides = sidesOf(top, { depth: 60, angle: 270, sideColor: '#808080', shade: 1 })
    expect(sides).toHaveLength(2)
    const left = sides.find((s) => s.x < top.x + top.w / 2 - 1 && s.x + s.w <= top.x + top.w / 2 + 0.01)!
    const right = sides.find((s) => s.x >= top.x + top.w / 2 - 0.01)!
    expect(left).toBeTruthy()
    expect(right).toBeTruthy()
    expect(luminance(left.fill!)).toBeGreaterThan(luminance(right.fill!))
    // the walls hang down from the lower edges of the top
    expect(Math.max(...sides.map((s) => s.y + s.h))).toBeCloseTo(top.y + top.h + 60, 3)
  })

  it('is described by the ready-made isometric solids: footprint, depth down, and the flag', () => {
    for (const kind of ['isoCube', 'isoBox', 'isoFrame'] as const) {
      const spec = solidSpec(kind)
      expect(spec.iso).toBe('top')
      expect(spec.settings.angle).toBe(270)
      expect(spec.settings.iso).toBe('top')
    }
    for (const kind of ['isoBoxStanding', 'isoFrameStanding'] as const) {
      const spec = solidSpec(kind)
      expect(spec.iso).toBe('left')
      expect(spec.settings.angle).toBe(ISO_DEPTH_ANGLE.left)
    }
  })
})

describe('an isometric solid that stands', () => {
  it('has its width drawn shorter and on a slant of 30° while its height stays upright', () => {
    const left = isometricShape(rect({ x: 100, y: 100, w: 100, h: 60 }), 'left')!
    // the width is cos 30°, the height is the height plus what the slant adds across the width
    expect(left.w).toBeCloseTo(100 * Math.cos((30 * Math.PI) / 180), 3)
    expect(left.h).toBeCloseTo(60 + 100 * 0.5, 3)
    const ring = worldRings(left)![0]!
    // the left edge stands upright, the top edge runs down to the right
    const xs = ring.map((p) => p[0])
    const leftEdge = ring.filter((p) => Math.abs(p[0] - Math.min(...xs)) < 0.001)
    expect(leftEdge).toHaveLength(2)
    const top = ring.filter((p) => p[1] === Math.min(...ring.map((q) => q[1])))
    expect(top).toHaveLength(1)
  })

  it('leans the other way on the right wall plane', () => {
    const left = worldRings(isometricShape(rect({ x: 0, y: 0, w: 100, h: 60 }), 'left')!)![0]!
    const right = worldRings(isometricShape(rect({ x: 0, y: 0, w: 100, h: 60 }), 'right')!)![0]!
    // the first corner (top left) is the highest on the right plane, and the top right corner is the lowest on the left one
    const topLeft = (ring: number[][], pick: 'min' | 'max') => ring[pick === 'min' ? 0 : 1]!
    expect(topLeft(left as number[][], 'min')![1]!).toBeLessThan(topLeft(left as number[][], 'max')![1]!)
    expect(topLeft(right as number[][], 'min')![1]!).toBeGreaterThan(topLeft(right as number[][], 'max')![1]!)
  })

  it('shows the top and the right wall when its depth goes back up and to the right', () => {
    const wall = isometricShape(rect({ x: 100, y: 100, w: 100, h: 60 }), 'left')!
    const sides = sidesOf(wall, { depth: 50, angle: ISO_DEPTH_ANGLE.left })
    expect(sides).toHaveLength(2)
    const d = 50
    // the farthest point is up and to the right by the depth, along 30°
    expect(Math.max(...sides.map((s) => s.x + s.w))).toBeCloseTo(wall.x + wall.w + d * Math.cos((30 * Math.PI) / 180), 3)
    expect(Math.min(...sides.map((s) => s.y))).toBeCloseTo(wall.y - d * Math.sin((30 * Math.PI) / 180), 3)
  })

  it('has a hole whose inner walls are seen through it', () => {
    const frame = rect({ kind: 'path', x: 0, y: 0, w: 130, h: 130, geom: [[[[0, 0], [1, 0], [1, 1], [0, 1]], [[0.22, 0.22], [0.78, 0.22], [0.78, 0.78], [0.22, 0.78]]]] })
    const wall = isometricShape(frame, 'left')!
    expect(sidesOf(wall, { depth: 50, angle: 30 })).toHaveLength(4)
  })
})

describe('moving a shape from one isometric plane to another', () => {
  const flat = rect({ x: 100, y: 100, w: 100, h: 60 })

  it('gives the same outline as laying the flat shape on that plane straight away', () => {
    const top = isometricShape(flat, 'top')!
    const viaTop = isometricShape(top, 'left', 'top')!
    const direct = isometricShape(flat, 'left')!
    expect(viaTop.w).toBeCloseTo(direct.w, 3)
    expect(viaTop.h).toBeCloseTo(direct.h, 3)
    expect(viaTop.x + viaTop.w / 2).toBeCloseTo(direct.x + direct.w / 2, 3)
    expect(viaTop.y + viaTop.h / 2).toBeCloseTo(direct.y + direct.h / 2, 3)
  })

  it('brings a shape back to the flat outline it had', () => {
    for (const plane of ['top', 'left', 'right'] as const) {
      const laid = isometricShape(flat, plane)!
      const back = isometricShape(laid, 'flat', plane)!
      expect(back.w).toBeCloseTo(100, 3)
      expect(back.h).toBeCloseTo(60, 3)
    }
  })
})

describe('a frame with rounded corners', () => {
  it('has the outside and a hole that is the wall in from it', () => {
    const geom = roundedFrameGeom(130, 100, { wall: 20, outer: 0, inner: 0 })
    expect(geom).toHaveLength(1)
    expect(geom[0]).toHaveLength(2)
    const front = rect({ kind: 'path', x: 0, y: 0, w: 130, h: 100, geom })
    const [outer, hole] = worldRings(front)!
    expect(outer).toEqual([[0, 0], [130, 0], [130, 100], [0, 100]])
    expect(hole!.map((p) => p.map(Math.round))).toEqual([[20, 20], [110, 20], [110, 80], [20, 80]])
  })

  it('stays inside its box and holds the wall when the corners are rounded', () => {
    const front = rect({ kind: 'path', x: 10, y: 20, w: 130, h: 130, geom: roundedFrameGeom(130, 130, DEFAULT_FRAME) })
    const [outer, hole] = worldRings(front)!
    const xs = outer!.map((p) => p[0])
    const ys = outer!.map((p) => p[1])
    expect(Math.min(...xs)).toBeCloseTo(10, 3)
    expect(Math.max(...xs)).toBeCloseTo(140, 3)
    expect(Math.min(...ys)).toBeCloseTo(20, 3)
    expect(Math.max(...ys)).toBeCloseTo(150, 3)
    // the hole is the wall in from the outside all round
    const hx = hole!.map((p) => p[0])
    expect(Math.min(...hx)).toBeCloseTo(10 + DEFAULT_FRAME.wall, 3)
    expect(Math.max(...hx)).toBeCloseTo(140 - DEFAULT_FRAME.wall, 3)
    // a rounded corner is drawn with many short edges, not one
    expect(outer!.length).toBeGreaterThan(20)
  })

  it('has no corner pushed outside the box when the radius is larger than the frame can hold', () => {
    const front = rect({ kind: 'path', x: 0, y: 0, w: 80, h: 80, geom: roundedFrameGeom(80, 80, { wall: 10, outer: 500, inner: 500 }) })
    const [outer] = worldRings(front)!
    for (const [x, y] of outer!) {
      expect(x).toBeGreaterThanOrEqual(-0.001)
      expect(x).toBeLessThanOrEqual(80.001)
      expect(y).toBeGreaterThanOrEqual(-0.001)
      expect(y).toBeLessThanOrEqual(80.001)
    }
  })

  it('is drawn out with the outside and the walls of the hole as the sides', () => {
    const front = rect({ kind: 'path', x: 0, y: 0, w: 130, h: 130, geom: roundedFrameGeom(130, 130, DEFAULT_FRAME) })
    const sides = sidesOf(front, { depth: 50, angle: 45 })
    // two flat walls and the bands of the rounded corners on the outside, the same inside
    expect(sides.length).toBeGreaterThan(4)
    for (const side of sides) expect(side.extrudeOf).toBe('front')
  })

  it('is what the ready-made frames start from', () => {
    for (const kind of ['frame', 'isoFrame', 'isoFrameStanding'] as const) {
      const spec = solidSpec(kind)
      expect(spec.front.geom?.[0]).toHaveLength(2)
    }
    expect(solidSpec('frame').settings.frame).toEqual(DEFAULT_FRAME)
  })
})

describe('the lean of the front', () => {
  const flat = rect({ x: 100, y: 100, w: 100, h: 60 })

  it('is nothing for a front that has no settings, and the lean of its plane for an isometric one', () => {
    expect(currentLean(undefined)).toBe(0)
    expect(currentLean({ depth: 10, angle: 45, shade: 0.6 })).toBe(0)
    expect(currentLean({ depth: 10, angle: 30, shade: 0.6, iso: 'left' })).toBe(ISO_LEAN.left)
    expect(currentLean({ depth: 10, angle: 30, shade: 0.6, iso: 'left', lean: 12 })).toBe(12)
  })

  it('slopes the horizontal edges and keeps the width', () => {
    const leaned = leanShape(flat, 0, 20)!
    expect(leaned.w).toBeCloseTo(100, 3)
    expect(leaned.h).toBeCloseTo(60 + 100 * Math.tan((20 * Math.PI) / 180), 3)
    const ring = worldRings(leaned)![0]!
    // the top edge goes down to the right: the top right corner is lower than the top left one
    expect(ring[1]![1]).toBeGreaterThan(ring[0]![1]!)
    expect(ring[1]![1]! - ring[0]![1]!).toBeCloseTo(100 * Math.tan((20 * Math.PI) / 180), 3)
  })

  it('straightens again, back to the flat outline', () => {
    const leaned = leanShape(flat, 0, 25)!
    const straight = leanShape(leaned, 25, 0)!
    expect(straight.w).toBeCloseTo(100, 3)
    expect(straight.h).toBeCloseTo(60, 3)
    expect(straight.y).toBeCloseTo(100, 3)
  })

  it('gives a flat bottom edge when it is straight and the roof is seen when the depth goes up', () => {
    const sides = sidesOf(flat, { depth: 30, angle: 60 })
    // the sides lie above and to the right of the front: the roof (above) and the right wall
    expect(Math.min(...sides.map((s) => s.y))).toBeLessThan(100)
    expect(Math.max(...sides.map((s) => s.y + s.h))).toBeCloseTo(160, 3)
  })
})

describe('leaning a wall of an isometric solid by hand', () => {
  it('gives the width back that the wall had lost, and levels the edges', () => {
    const wall = isometricShape(rect({ x: 0, y: 0, w: 100, h: 60 }), 'left')!
    expect(wall.w).toBeCloseTo(100 * Math.cos((30 * Math.PI) / 180), 3)
    const straight = leanShape(wall, ISO_LEAN.left, 0, true)!
    expect(straight.w).toBeCloseTo(100, 3)
    expect(straight.h).toBeCloseTo(60, 3)
  })
})

describe('a solid seen from a view', () => {
  const flat = rect({ x: 100, y: 100, w: 100, h: 60 })

  it('has its back straight up from the front when it faces the viewer, and to the left or the right when it is turned', () => {
    const [x0, y0] = viewVector(50, { yaw: 0, pitch: 30 })
    expect(x0).toBeCloseTo(0, 6)
    expect(y0).toBeCloseTo(-25, 6)
    const [x1, y1] = viewVector(50, { yaw: -25, pitch: 30 })
    expect(x1).toBeGreaterThan(0)
    expect(y1).toBeLessThan(0)
    // a view from level has no roof: the back goes straight behind the front, to a side only when turned
    expect(viewVector(50, { yaw: 0, pitch: 0 })[1]).toBeCloseTo(0, 6)
  })

  it('is the isometric view at 45° and about 35°: the same slopes and the same direction of the depth', () => {
    const [vx, vy] = viewVector(100, { yaw: 45, pitch: 35.264 })
    // 30° above the horizontal, to the left
    expect(Math.atan2(-vy, vx) * (180 / Math.PI)).toBeCloseTo(150, 1)
    const front = viewShape(flat, undefined, { yaw: 45, pitch: 35.264 })!
    const ring = worldRings(front)![0]!
    // the top edge of the front slopes up to the right by 30°
    const slope = Math.atan2(ring[0]![1] - ring[1]![1], ring[1]![0] - ring[0]![0]) * (180 / Math.PI)
    expect(slope).toBeCloseTo(30, 1)
  })

  it('draws the front narrower when the solid is turned and shorter when it is looked at from above, keeping its middle', () => {
    const front = viewShape(flat, undefined, { yaw: 60, pitch: 0 })!
    expect(front.w).toBeCloseTo(100 * Math.cos((60 * Math.PI) / 180), 3)
    expect(front.h).toBeCloseTo(60 + 100 * Math.sin((60 * Math.PI) / 180) * 0, 3)
    expect(front.x + front.w / 2).toBeCloseTo(150, 3)
    expect(front.y + front.h / 2).toBeCloseTo(130, 3)
    const above = viewShape(flat, undefined, { yaw: 0, pitch: 60 })!
    expect(above.h).toBeCloseTo(60 * Math.cos((60 * Math.PI) / 180), 3)
  })

  it('comes back to the flat outline from any view', () => {
    for (const view of [{ yaw: 30, pitch: 20 }, { yaw: -50, pitch: 60 }, { yaw: 10, pitch: 5 }]) {
      const seen = viewShape(flat, undefined, view)!
      const back = viewShape(seen, view, null)!
      expect(back.w).toBeCloseTo(100, 3)
      expect(back.h).toBeCloseTo(60, 3)
      expect(back.x + back.w / 2).toBeCloseTo(150, 3)
    }
  })

  it('moves from one view to another without the solid jumping, and with the same flat outline', () => {
    const a = viewShape(flat, undefined, { yaw: 20, pitch: 30 })!
    const direct = viewShape(flat, undefined, { yaw: -40, pitch: 45 })!
    const via = viewShape(a, { yaw: 20, pitch: 30 }, { yaw: -40, pitch: 45 })!
    expect(via.w).toBeCloseTo(direct.w, 3)
    expect(via.h).toBeCloseTo(direct.h, 3)
    expect(via.x + via.w / 2).toBeCloseTo(a.x + a.w / 2, 3)
  })

  it('has the sides it shows follow the way it is turned: the right and the roof for one way, the left and the roof for the other', () => {
    const front = viewShape(flat, undefined, { yaw: 0, pitch: 30 })!
    const right = sidesOf(front, { depth: 50, view: { yaw: -30, pitch: 30 } })
    const left = sidesOf(front, { depth: 50, view: { yaw: 30, pitch: 30 } })
    expect(right.length).toBeGreaterThanOrEqual(2)
    expect(left.length).toBeGreaterThanOrEqual(2)
    expect(Math.max(...right.map((side) => side.x + side.w))).toBeGreaterThan(front.x + front.w)
    expect(Math.min(...left.map((side) => side.x))).toBeLessThan(front.x)
  })
})

describe('a solid that is turned on the page', () => {
  it('has its depth go back in the turned direction (clockwise on the page, counter-clockwise in the settings)', () => {
    expect(turnedSettings({ depth: 40, angle: 45, shade: 0.6 }, 90).angle).toBeCloseTo(315, 6)
    expect(turnedSettings({ depth: 40, angle: 45, shade: 0.6 }, -30).angle).toBeCloseTo(75, 6)
    expect(turnedSettings({ depth: 40, angle: 10, shade: 0.6 }, 20).angle).toBeCloseTo(350, 6)
  })

  it('keeps the direction a plane or a view gave the depth, and no longer is a plane or a view', () => {
    const iso = turnedSettings({ depth: 40, angle: 30, shade: 0.6, iso: 'left', lean: 30 }, 30)
    expect(iso.angle).toBeCloseTo(0, 6)
    expect(iso).not.toHaveProperty('iso')
    expect(iso).not.toHaveProperty('lean')
    const [vx, vy] = viewVector(1, { yaw: -25, pitch: 30 })
    const was = (Math.atan2(-vy, vx) * 180) / Math.PI
    const seen = turnedSettings({ depth: 40, angle: 0, shade: 0.6, view: { yaw: -25, pitch: 30 } }, 15)
    expect(seen.angle).toBeCloseTo(was - 15, 1)
    expect(seen).not.toHaveProperty('view')
  })

  it('has sides that match its turned front: the same shapes turned about the middle', () => {
    const front = rect({ x: 100, y: 100, w: 100, h: 60 })
    const settings = { depth: 30, angle: 45, shade: 0.6 }
    const before = sidesOf(front, settings)
    // turned a quarter on the page, about its own middle
    const turned = { ...front, rotation: 90 }
    const after = sidesOf(turned, turnedSettings(settings, 90))
    expect(after).toHaveLength(before.length)
    const farthest = (list: { x: number; w: number }[]) => Math.max(...list.map((s) => s.x + s.w))
    // the box of the turned picture is the turned box of the first
    expect(farthest(after)).not.toBeCloseTo(farthest(before), 0)
  })
})

describe('painting a solid', () => {
  const settings = { depth: 30, angle: 45, shade: 0.6 }
  const solid = (): ShapeFrame[] => {
    const front = rect({ fill: '#2288dd', extrude: settings, groupId: 'g' })
    const sides = sidesOf(front, settings).map((side) => ({ ...side, groupId: 'g' }))
    return [front, ...sides]
  }
  const ids = (list: ShapeFrame[]) => new Set(list.map((shape) => shape.id))

  it('gives the front the colour and shades the sides from it, as when the solid was made', () => {
    const shapes = solid()
    const painted = paintShapes(shapes, ids(shapes), { fill: '#cc2222' }, newId)
    const front = painted.find((shape) => shape.id === 'front')!
    const sides = painted.filter((shape) => shape.extrudeOf === 'front')
    expect(front.fill).toBe('#cc2222')
    expect(sides).toHaveLength(2)
    // not the front's colour, and not one colour for all of them: the way the first sides were
    expect(sides.every((side) => side.fill !== '#cc2222')).toBe(true)
    expect(new Set(sides.map((side) => side.fill)).size).toBe(2)
    // the same shapes, as far as they go
    expect(new Set(sides.map((side) => side.id))).toEqual(new Set(shapes.filter((s) => s.extrudeOf).map((s) => s.id)))
    // and as red as the front is: the red channel is the strongest in every one
    for (const side of sides) expect(parseInt(side.fill!.slice(1, 3), 16)).toBeGreaterThan(parseInt(side.fill!.slice(3, 5), 16))
  })

  it('does the same when only the front is selected', () => {
    const shapes = solid()
    const painted = paintShapes(shapes, new Set(['front']), { fill: '#22aa44' }, newId)
    const sides = painted.filter((shape) => shape.extrudeOf === 'front')
    expect(sides).toHaveLength(2)
    for (const side of sides) expect(parseInt(side.fill!.slice(3, 5), 16)).toBeGreaterThan(parseInt(side.fill!.slice(1, 3), 16))
  })

  it('paints a side that is picked out by itself, and nothing else', () => {
    const shapes = solid()
    const side = shapes.find((shape) => shape.extrudeOf)!
    const painted = paintShapes(shapes, new Set([side.id]), { fill: '#ffff00' }, newId)
    expect(painted.find((shape) => shape.id === side.id)!.fill).toBe('#ffff00')
    expect(painted.find((shape) => shape.id === 'front')!.fill).toBe('#2288dd')
    const others = painted.filter((shape) => shape.extrudeOf && shape.id !== side.id)
    expect(others.map((shape) => shape.fill)).toEqual(shapes.filter((shape) => shape.extrudeOf && shape.id !== side.id).map((shape) => shape.fill))
  })

  it('gives the line and the opacity of the front to the sides too', () => {
    const shapes = solid()
    const painted = paintShapes(shapes, new Set(['front']), { stroke: '#000000', strokeWidth: 2, opacity: 0.5 }, newId)
    for (const side of painted.filter((shape) => shape.extrudeOf === 'front')) {
      expect(side.stroke).toBe('#000000')
      expect(side.strokeWidth).toBe(2)
      expect(side.opacity).toBe(0.5)
    }
  })

  it('leaves shapes that are not solids to be painted as they were', () => {
    const plain = rect({ id: 'plain' })
    const painted = paintShapes([plain], new Set(['plain']), { fill: '#123456' }, newId)
    expect(painted).toHaveLength(1)
    expect(painted[0]!.fill).toBe('#123456')
  })
})

describe('a front that has a gradient', () => {
  const channels = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)] as const
  const gradientFront = (extra: Partial<ShapeFrame> = {}) =>
    rect({ fill: null, fillGradient: { type: 'linear', start: '#ff0000', end: '#0000ff', angle: 0 }, ...extra })

  it('has sides that go on with it: the top one carries the gradient across, the right one is the colour the gradient ends in', () => {
    const sides = sidesOf(gradientFront(), { depth: 20, angle: 45, shade: 0 })
    const top = sides.find((s) => Math.abs(s.x - 100) < 0.01)!
    const right = sides.find((s) => Math.abs(s.x - 200) < 0.01)!
    expect(top.fillGradient).toBeDefined()
    const stops = top.fillGradient!.stops!
    const first = channels(stops[0]!.color)
    const last = channels(stops[stops.length - 1]!.color)
    expect(first[0]).toBeGreaterThan(first[2])
    expect(last[2]).toBeGreaterThan(last[0])
    // the same direction as the front's, along the page
    expect(top.fillGradient!.angle).toBeCloseTo(0, 3)
    const [r, , b] = channels(right.fill!)
    expect(b).toBeGreaterThan(r)
  })

  it('shades the colours of the gradient by the way the sides face the light', () => {
    const flat = sidesOf(gradientFront(), { depth: 20, angle: 45, shade: 0 })
    const shaded = sidesOf(gradientFront(), { depth: 20, angle: 45, shade: 1 })
    const colourOf = (list: ShapeFrame[]) => list.find((s) => Math.abs(s.x - 200) < 0.01)!.fill!
    // the right side faces away from the light: darker when shaded
    const sum = (hex: string) => channels(hex).reduce((a, c) => a + c, 0)
    expect(sum(colourOf(shaded))).toBeLessThan(sum(colourOf(flat)))
  })

  it('has sides of one colour (shaded) when the sides were given a colour of their own', () => {
    const sides = sidesOf(gradientFront(), { depth: 20, angle: 45, sideColor: '#336699', shade: 0.5 })
    for (const side of sides) expect(side.fillGradient).toBeUndefined()
  })

  it('has plain coloured sides for a radial gradient, taken from where the sides are', () => {
    const sides = sidesOf(rect({ fill: null, fillGradient: { type: 'radial', start: '#ffffff', end: '#0000ff' } }), { depth: 20, angle: 45, shade: 0 })
    for (const side of sides) {
      expect(side.fillGradient).toBeUndefined()
      expect(side.fill).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('is kept up to date when it is painted: the new gradient reaches the sides', () => {
    const settings = { depth: 20, angle: 45, shade: 0.6 }
    const front = rect({ fill: '#2288dd', extrude: settings })
    const shapes = [front, ...sidesOf(front, settings)]
    const painted = paintShapes(shapes, new Set(['front']), { fill: null, fillGradient: { type: 'linear', start: '#00ff00', end: '#ff00ff', angle: 0 } }, newId)
    const sides = painted.filter((s) => s.extrudeOf === 'front')
    expect(sides.some((s) => s.fillGradient)).toBe(true)
    expect(sides.every((s) => s.fill !== null)).toBe(true)
  })
})

describe('the thickness of the sides of a frame', () => {
  it('is the wall for every side, and a side has its own when it is given', () => {
    expect(frameWalls({ wall: 20, outer: 0, inner: 0 })).toEqual({ top: 20, right: 20, bottom: 20, left: 20 })
    expect(frameWalls({ wall: 20, outer: 0, inner: 0, bottom: 35, left: 8 })).toEqual({ top: 20, right: 20, bottom: 35, left: 8 })
  })

  it('puts the hole in from each side by the thickness of that side', () => {
    const geom = roundedFrameGeom(200, 100, { wall: 20, outer: 0, inner: 0, top: 10, bottom: 30, left: 40 })
    const front = rect({ kind: 'path', x: 0, y: 0, w: 200, h: 100, geom })
    const [, hole] = worldRings(front)!
    const xs = hole!.map((p) => p[0])
    const ys = hole!.map((p) => p[1])
    expect(Math.min(...xs)).toBeCloseTo(40, 3)
    expect(Math.max(...xs)).toBeCloseTo(180, 3)
    expect(Math.min(...ys)).toBeCloseTo(10, 3)
    expect(Math.max(...ys)).toBeCloseTo(70, 3)
  })

  it('leaves a hole when two opposite walls are too thick for the box, by making both thinner in proportion', () => {
    const walls = fitWalls({ top: 80, bottom: 80, left: 5, right: 5 }, 100, 100)
    expect(walls.top + walls.bottom).toBeLessThanOrEqual(99.001)
    expect(walls.top).toBeCloseTo(walls.bottom, 6)
    expect(walls.left).toBe(5)
  })

  it('is drawn out with the walls of the hole the thickness it has: a thin wall has a thin side', () => {
    const thin = rect({ kind: 'path', x: 0, y: 0, w: 130, h: 130, geom: roundedFrameGeom(130, 130, { wall: 8, outer: 0, inner: 0 }) })
    const thick = rect({ kind: 'path', x: 0, y: 0, w: 130, h: 130, geom: roundedFrameGeom(130, 130, { wall: 40, outer: 0, inner: 0 }) })
    const holeBox = (front: ShapeFrame) => {
      const [, hole] = worldRings(front)!
      return { w: Math.max(...hole!.map((p) => p[0])) - Math.min(...hole!.map((p) => p[0])) }
    }
    expect(holeBox(thin).w).toBeGreaterThan(holeBox(thick).w)
    expect(sidesOf(thin, { depth: 30, angle: 45 }).length).toBeGreaterThanOrEqual(4)
  })
})

describe('keeping a solid whole when its front is changed', () => {
  const frameFront = (): ShapeFrame => {
    const settings = { depth: 40, angle: 45, shade: 0.6, frame: { wall: 20, outer: 16, inner: 8 } }
    return rect({ kind: 'path', x: 0, y: 0, w: 130, h: 130, geom: roundedFrameGeom(130, 130, settings.frame), extrude: settings, groupId: 'g' })
  }
  const solidOf = (front: ShapeFrame): ShapeFrame[] => [front, ...sidesOf(front, front.extrude!).map((side) => ({ ...side, groupId: 'g' }))]

  it('has the sides follow a front that is moved', () => {
    const shapes = solidOf(frameFront())
    const moved = shapes.map((shape) => (shape.id === 'front' ? { ...shape, x: 300, y: 50 } : shape))
    const synced = syncSolid(moved, 'front', newId)
    const sides = synced.filter((shape) => shape.extrudeOf === 'front')
    expect(sides.length).toBe(shapes.length - 1)
    // the sides lie where the front is now, not where it was
    expect(Math.min(...sides.map((side) => side.x))).toBeGreaterThan(250)
    expect(Math.min(...sides.map((side) => side.y))).toBeLessThan(50)
  })

  it('keeps the wall and the roundness of a frame in points when its box is stretched, and the depth as it was', () => {
    const shapes = solidOf(frameFront())
    const wider = shapes.map((shape) => (shape.id === 'front' ? { ...shape, w: 260 } : shape))
    const synced = syncSolid(wider, 'front', newId)
    const front = synced.find((shape) => shape.id === 'front')!
    const [, hole] = worldRings(front)!
    const xs = hole!.map((p) => p[0])
    // the hole is the wall (20) in from each side of the stretched box: not a wall that doubled with it
    expect(Math.min(...xs)).toBeCloseTo(20, 1)
    expect(Math.max(...xs)).toBeCloseTo(240, 1)
    const sides = synced.filter((shape) => shape.extrudeOf === 'front')
    const farthest = Math.max(...sides.map((side) => side.x + side.w))
    // the back is the depth (40 at 45°) from the front's right edge, whatever the width
    expect(farthest).toBeCloseTo(260 + 40 * Math.cos(Math.PI / 4), 0)
  })

  it('uses the same shapes for the sides, as far as they go', () => {
    const shapes = solidOf(frameFront())
    const ids = shapes.filter((shape) => shape.extrudeOf).map((shape) => shape.id)
    const synced = syncSolid(shapes.map((shape) => (shape.id === 'front' ? { ...shape, h: 90 } : shape)), 'front', newId)
    const after = synced.filter((shape) => shape.extrudeOf).map((shape) => shape.id)
    expect(after.filter((id) => ids.includes(id)).length).toBe(Math.min(ids.length, after.length))
  })

  it('leaves a shape that is not a solid alone', () => {
    const plain = [rect({ id: 'plain' })]
    expect(syncSolid(plain, 'plain', newId)).toBe(plain)
  })
})

describe('a frame that is leaned, seen from a view or on a wall', () => {
  const spec = { wall: 20, outer: 12, inner: 6 }
  const flatFrame = (): ShapeFrame => rect({ kind: 'path', x: 0, y: 0, w: 130, h: 100, geom: roundedFrameGeom(130, 100, spec) })
  const withSettings = (shape: ShapeFrame, extrude: Record<string, unknown>): ShapeFrame =>
    ({ ...shape, extrude: { depth: 30, angle: 45, shade: 0.6, frame: spec, ...extrude } as ShapeFrame['extrude'] })
  const leanedFront = (lean: number) => withSettings(leanShape(flatFrame(), 0, lean)!, { lean })
  const viewedFront = (view: { yaw: number; pitch: number }) => withSettings(viewShape(flatFrame(), undefined, view)!, { view })

  it('has a map for every mode that is made from a wall and a roundness, and none for the top of an isometric solid', () => {
    expect(frameMapOf(undefined)).toBeNull()
    expect(frameMapOf({ depth: 1, angle: 0, shade: 0, frame: spec, iso: 'top' })).toBeNull()
    expect(frameMapOf({ depth: 1, angle: 0, shade: 0, frame: spec })).toEqual({ mx: 1, sk: 0, my: 1 })
    expect(frameMapOf({ depth: 1, angle: 0, shade: 0, frame: spec, lean: 20 })!.sk).toBeCloseTo(Math.tan((20 * Math.PI) / 180), 6)
    const wall = frameMapOf({ depth: 1, angle: 30, shade: 0, frame: spec, iso: 'left' })!
    expect(wall.mx).toBeCloseTo(Math.cos((30 * Math.PI) / 180), 6)
    expect(wall.sk).toBeCloseTo(0.5, 6)
    const seen = frameMapOf({ depth: 1, angle: 0, shade: 0, frame: spec, view: { yaw: 30, pitch: 40 } })!
    expect(seen.mx).toBeCloseTo(Math.cos((30 * Math.PI) / 180), 6)
    expect(seen.my).toBeCloseTo(Math.cos((40 * Math.PI) / 180), 6)
  })

  it('finds the flat frame the leaned one was drawn from, and carries points to the page and back', () => {
    const front = leanedFront(15)
    // taller by about what the lean adds across the width (a little less: the rounded corners)
    expect(front.h).toBeGreaterThan(125)
    expect(front.h).toBeLessThan(100 + 130 * Math.tan((15 * Math.PI) / 180))
    const layout = frameLayout(front)!
    expect(layout.flat.w).toBeCloseTo(130, 3)
    expect(layout.flat.h).toBeCloseTo(100, 0)
    const [px, py] = layout.toPage(layout.flat.x + 30, layout.flat.y + 20)
    const [fx, fy] = layout.toFlat(px, py)
    expect(fx).toBeCloseTo(layout.flat.x + 30, 6)
    expect(fy).toBeCloseTo(layout.flat.y + 20, 6)
  })

  it('is made again to the same outline, and for a stretched box with the same walls and lean', () => {
    const front = leanedFront(15)
    const again = frameOutline(front)!
    expect(again.w).toBeCloseTo(front.w, 3)
    expect(again.h).toBeCloseTo(front.h, 0)
    const stretched = syncSolid([{ ...front, w: 260 }], front.id, newId)[0]!
    const layout = frameLayout(stretched)!
    expect(layout.flat.w).toBeCloseTo(260, 3)
    // the box is as tall as it was, so the lean takes more of that height over the greater width: the flat frame is shorter
    expect(layout.flat.h).toBeLessThan(100)
    const [, hole] = worldRings(stretched)!
    // the hole is 20 in from the left side of the frame, as on a frame that is not leaned
    expect(Math.min(...hole!.map((p) => p[0])) - stretched.x).toBeCloseTo(20, 1)
  })

  it('finds the flat frame under the turn of a view, and is made again narrow', () => {
    const view = { yaw: 40, pitch: 20 }
    const front = viewedFront(view)
    expect(front.w).toBeCloseTo(130 * Math.cos((40 * Math.PI) / 180), 3)
    const layout = frameLayout(front)!
    expect(layout.flat.w).toBeCloseTo(130, 3)
    expect(layout.flat.h).toBeCloseTo(100, 0)
    const again = frameOutline(front)!
    expect(again.w).toBeCloseTo(front.w, 3)
    expect(again.h).toBeCloseTo(front.h, 0)
  })

  it('is nothing for a front that is not a frame', () => {
    expect(frameOutline(rect())).toBeNull()
    expect(frameLayout(rect())).toBeNull()
  })
})
