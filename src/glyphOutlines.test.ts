import { describe, expect, it } from 'vitest'
import { outlineShapeOf, parseOutlineFont } from './glyphOutlines'

/** a TrueType file made by hand, with just what is needed to read the shapes of a few letters (100 units to the em) */
function buildFont() {
  const bytes: number[] = []
  const u16 = (value: number) => bytes.push((value >> 8) & 255, value & 255)
  const i16 = (value: number) => u16(value & 0xffff)
  const u32 = (value: number) => bytes.push((value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255)

  type Point = [number, number, boolean]
  const simple = (contours: Point[][]) => {
    const out: number[] = []
    const w16 = (value: number) => out.push((value >> 8) & 255, value & 255)
    w16(contours.length)
    for (let i = 0; i < 4; i += 1) w16(0)
    let count = 0
    for (const contour of contours) {
      count += contour.length
      w16(count - 1)
    }
    w16(0) // no instructions
    for (const contour of contours) for (const point of contour) out.push(point[2] ? 1 : 0)
    let last = 0
    for (const contour of contours) for (const point of contour) { w16((point[0] - last) & 0xffff); last = point[0] }
    last = 0
    for (const contour of contours) for (const point of contour) { w16((point[1] - last) & 0xffff); last = point[1] }
    while (out.length % 4) out.push(0)
    return out
  }
  const composite = (parts: { glyph: number; dx: number; dy: number }[]) => {
    const out: number[] = []
    const w16 = (value: number) => out.push((value >> 8) & 255, value & 255)
    w16(0xffff)
    for (let i = 0; i < 4; i += 1) w16(0)
    parts.forEach((part, index) => {
      // words as arguments, and they are offsets; more components follow except after the last
      w16(0x0003 | (index < parts.length - 1 ? 0x20 : 0))
      w16(part.glyph)
      w16(part.dx & 0xffff)
      w16(part.dy & 0xffff)
    })
    while (out.length % 4) out.push(0)
    return out
  }

  const square = (x0: number, y0: number, x1: number, y1: number, clockwise: boolean): Point[] => {
    const points: Point[] = [[x0, y0, true], [x0, y1, true], [x1, y1, true], [x1, y0, true]]
    return clockwise ? points : points.reverse()
  }
  const glyphs: number[][] = [
    [], // 0: nothing
    simple([square(0, 0, 100, 100, true), square(25, 25, 75, 75, false)]), // 1: a square with a square hole
    simple([[[0, 0, true], [50, -20, false], [100, 0, true], [100, 100, true], [0, 100, true]]]), // 2: a square with a curved bottom
    composite([{ glyph: 1, dx: 200, dy: 0 }]), // 3: the first one moved 200 to the right
    simple([square(0, 0, 60, 60, true), square(40, 40, 100, 100, true)]), // 4: two squares that overlap
  ]

  // the tables
  const collect = (write: () => void) => {
    const saved = bytes.splice(0, bytes.length)
    write()
    const made = bytes.splice(0, bytes.length)
    bytes.push(...saved)
    return made
  }
  const head = collect(() => {
    u32(0x00010000)
    u32(0)
    u32(0)
    u32(0x5f0f3cf5)
    u16(0)
    u16(100) // units per em
    for (let i = 0; i < 16; i += 1) bytes.push(0) // created, modified
    for (let i = 0; i < 4; i += 1) u16(0) // box
    u16(0)
    u16(0)
    u16(0)
    i16(1) // long loca
    i16(0)
  })
  const maxp = collect(() => {
    u32(0x00010000)
    u16(glyphs.length)
  })
  const hhea = collect(() => {
    u32(0x00010000)
    for (let i = 0; i < 15; i += 1) u16(0)
    u16(glyphs.length) // numberOfHMetrics, at byte 34
  })
  const hmtx = collect(() => {
    for (let i = 0; i < glyphs.length; i += 1) {
      u16(100)
      i16(0)
    }
  })
  const glyf: number[] = []
  const loca = collect(() => {
    for (const glyph of glyphs) {
      u32(glyf.length)
      glyf.push(...glyph)
    }
    u32(glyf.length)
  })
  // 'A'..'D' (65..68) are the glyphs 1..4, and the Hebrew letter alef is the glyph 1
  const cmap = collect(() => {
    u16(0)
    u16(1)
    u16(3)
    u16(1)
    u32(12)
    // format 4 with three segments
    const segments = 3
    u16(4)
    u16(16 + segments * 8)
    u16(0)
    u16(segments * 2)
    u16(0)
    u16(0)
    u16(0)
    for (const end of [68, 0x5d0, 0xffff]) u16(end)
    u16(0)
    for (const start of [65, 0x5d0, 0xffff]) u16(start)
    for (const delta of [1 - 65, 1 - 0x5d0, 1]) i16(delta)
    for (let i = 0; i < segments; i += 1) u16(0)
  })

  const tables: [string, number[]][] = [['cmap', cmap], ['glyf', glyf], ['head', head], ['hhea', hhea], ['hmtx', hmtx], ['loca', loca], ['maxp', maxp]]
  const out: number[] = []
  const w16 = (value: number) => out.push((value >> 8) & 255, value & 255)
  const w32 = (value: number) => out.push((value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255)
  w32(0x00010000)
  w16(tables.length)
  w16(0)
  w16(0)
  w16(0)
  let offset = 12 + tables.length * 16
  for (const [tag, data] of tables) {
    for (const char of tag) out.push(char.charCodeAt(0))
    w32(0)
    w32(offset)
    w32(data.length)
    offset += data.length + ((4 - (data.length % 4)) % 4)
  }
  for (const [, data] of tables) {
    out.push(...data)
    while (out.length % 4) out.push(0)
  }
  return new Uint8Array(out)
}

const vertexPoint = (vertex: unknown) => (Array.isArray(vertex) ? (vertex as [number, number]) : (vertex as { p: [number, number] }).p)

describe('reading the shapes of letters from a font file', () => {
  const font = parseOutlineFont(buildFont())!

  it('reads the character table, the size and the contours', () => {
    expect(font).not.toBeNull()
    expect(font.unitsPerEm).toBe(100)
    expect(font.glyphIndex(65)).toBe(1)
    expect(font.glyphIndex(0x5d0)).toBe(1)
    expect(font.glyphIndex(90)).toBe(0)
    expect(font.advance(1)).toBe(100)
    expect(font.contours(1)).toHaveLength(2)
    expect(font.contours(0)).toHaveLength(0)
    // the composite letter is the first with all its points moved
    const moved = font.contours(3)
    expect(moved).toHaveLength(2)
    expect(Math.min(...moved.flat().map((point) => point.x))).toBe(200)
  })

  it('has the hole of a letter as a ring inside its polygon, at the place and size asked for', () => {
    const shape = outlineShapeOf([{ font, text: 'A', x: 10, baseline: 50, size: 100 }])!
    expect(shape.x).toBeCloseTo(10, 5)
    expect(shape.y).toBeCloseTo(-50, 5)
    expect(shape.w).toBeCloseTo(100, 5)
    expect(shape.h).toBeCloseTo(100, 5)
    expect(shape.geom).toHaveLength(1)
    expect(shape.geom[0]).toHaveLength(2)
    // the hole is in the middle of the box
    const hole = shape.geom[0]![1]!.map(vertexPoint)
    expect(Math.min(...hole.map((p) => p[0]))).toBeCloseTo(0.25, 5)
    expect(Math.max(...hole.map((p) => p[1]))).toBeCloseTo(0.75, 5)
  })

  it('keeps a curve as a curve, and the letters of a text as separate polygons', () => {
    const shape = outlineShapeOf([
      { font, text: 'B', x: 0, baseline: 100, size: 100 },
      { font, text: 'A', x: 150, baseline: 100, size: 100 },
    ])!
    expect(shape.geom).toHaveLength(2)
    const curved = shape.geom[0]![0]!.some((vertex) => !Array.isArray(vertex) && (vertex.ho || vertex.hi))
    expect(curved).toBe(true)
    // the curve dips 10 units below the baseline of the bottom (a quadratic with its control 20 below)
    expect(shape.h).toBeCloseTo(110, 3)
    expect(shape.w).toBeCloseTo(250, 5)
  })

  it('puts the parts of a composite letter in place', () => {
    const shape = outlineShapeOf([{ font, text: 'C', x: 0, baseline: 100, size: 100 }])!
    expect(shape.x).toBeCloseTo(200, 5)
  })

  it('unites a letter made of contours that overlap, so that the overlap is not a hole', () => {
    const shape = outlineShapeOf([{ font, text: 'D', x: 0, baseline: 100, size: 100 }])!
    expect(shape.geom).toHaveLength(1)
    expect(shape.geom[0]).toHaveLength(1)
    // two overlapping squares are one shape of eight corners
    expect(shape.geom[0]![0]).toHaveLength(8)
  })

  it('lets tracking of a Hebrew letter be on its left, and of a Latin one on its right', () => {
    // the letter's box is 130 wide where the letter itself is 100
    const hebrew = outlineShapeOf([{ font, text: 'א', x: 10, baseline: 100, size: 100, width: 130 }])!
    expect(hebrew.x).toBeCloseTo(40, 5)
    const latin = outlineShapeOf([{ font, text: 'A', x: 10, baseline: 100, size: 100, width: 130 }])!
    expect(latin.x).toBeCloseTo(10, 5)
  })

  it('gives nothing for a text with no shapes in it', () => {
    expect(outlineShapeOf([{ font, text: 'Z', x: 0, baseline: 100, size: 100 }])).toBeNull()
  })
})
