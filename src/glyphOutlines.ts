import polygonClipping from 'polygon-clipping'
import type { PathGeom, PathVertex } from './document'
import { glyphIndexLookup } from './fontFiles'

/**
 * The shapes of letters, read from a TrueType font file, and put together as the outline of a vector shape ("Create Outlines").
 *
 * Where each letter stands is not worked out here: the browser has laid the text out (line breaks, Hebrew order, kerning, justified
 * spacing) and `extractGlyphs` (vectorText.ts) asks it for the place of every letter. Here a letter only gets its shape, at the place
 * and size it was given.
 */

/** a point of a contour in font units (y grows upward); `on` is false for the control point of a quadratic curve */
export interface ContourPoint {
  x: number
  y: number
  on: boolean
}

export interface OutlineFont {
  unitsPerEm: number
  /** the glyph the font has for a character (0 = none) */
  glyphIndex: (codePoint: number) => number
  /** how far the pen moves after the glyph, in font units */
  advance: (glyph: number) => number
  /** the contours of a glyph (a composite glyph with its parts put in place); none for a space */
  contours: (glyph: number) => ContourPoint[][]
}

const f2dot14 = (view: DataView, at: number) => view.getInt16(at) / 16384

/** The shapes of the glyphs of a TrueType font file, or null when the file has no outlines that can be read (the CFF kind has none here). */
export function parseOutlineFont(bytes: Uint8Array): OutlineFont | null {
  if (bytes.length < 12) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tables = new Map<string, { offset: number; length: number }>()
  const count = view.getUint16(4)
  for (let i = 0; i < count; i += 1) {
    const record = 12 + i * 16
    if (record + 16 > bytes.length) return null
    const tag = String.fromCharCode(bytes[record]!, bytes[record + 1]!, bytes[record + 2]!, bytes[record + 3]!)
    tables.set(tag, { offset: view.getUint32(record + 8), length: view.getUint32(record + 12) })
  }
  const head = tables.get('head')
  const maxp = tables.get('maxp')
  const hhea = tables.get('hhea')
  const hmtx = tables.get('hmtx')
  const loca = tables.get('loca')
  const glyf = tables.get('glyf')
  if (!head || !maxp || !hhea || !hmtx || !loca || !glyf) return null
  if (head.offset + 54 > bytes.length || maxp.offset + 6 > bytes.length || hhea.offset + 36 > bytes.length) return null
  const unitsPerEm = view.getUint16(head.offset + 18)
  const longLoca = view.getInt16(head.offset + 50) !== 0
  const glyphCount = view.getUint16(maxp.offset + 4)
  const metricCount = view.getUint16(hhea.offset + 34)
  const lookup = glyphIndexLookup(bytes)
  if (!lookup || unitsPerEm <= 0 || glyphCount === 0 || metricCount === 0) return null

  const locaAt = (glyph: number) => (longLoca ? view.getUint32(loca.offset + glyph * 4) : view.getUint16(loca.offset + glyph * 2) * 2)
  const advance = (glyph: number) => {
    const at = hmtx.offset + Math.min(glyph, metricCount - 1) * 4
    return at + 2 <= bytes.length ? view.getUint16(at) : 0
  }

  const read = (glyph: number, depth: number): ContourPoint[][] => {
    if (glyph < 0 || glyph >= glyphCount || depth > 6) return []
    if (loca.offset + (glyph + 2) * (longLoca ? 4 : 2) > bytes.length) return []
    const start = locaAt(glyph)
    const end = locaAt(glyph + 1)
    if (end <= start || glyf.offset + end > bytes.length) return [] // an empty glyph (a space)
    let at = glyf.offset + start
    const contourCount = view.getInt16(at)
    at += 10
    if (contourCount >= 0) {
      const endPoints: number[] = []
      for (let i = 0; i < contourCount; i += 1) {
        endPoints.push(view.getUint16(at))
        at += 2
      }
      const pointCount = contourCount === 0 ? 0 : endPoints[contourCount - 1]! + 1
      at += 2 + view.getUint16(at)
      const flags: number[] = []
      while (flags.length < pointCount) {
        const flag = view.getUint8(at)
        at += 1
        flags.push(flag)
        if (flag & 8) {
          let repeat = view.getUint8(at)
          at += 1
          while (repeat > 0 && flags.length < pointCount) {
            flags.push(flag)
            repeat -= 1
          }
        }
      }
      const xs: number[] = []
      let x = 0
      for (const flag of flags) {
        if (flag & 2) {
          const delta = view.getUint8(at)
          at += 1
          x += flag & 16 ? delta : -delta
        } else if (!(flag & 16)) {
          x += view.getInt16(at)
          at += 2
        }
        xs.push(x)
      }
      const ys: number[] = []
      let y = 0
      for (const flag of flags) {
        if (flag & 4) {
          const delta = view.getUint8(at)
          at += 1
          y += flag & 32 ? delta : -delta
        } else if (!(flag & 32)) {
          y += view.getInt16(at)
          at += 2
        }
        ys.push(y)
      }
      const contours: ContourPoint[][] = []
      let from = 0
      for (const last of endPoints) {
        const contour: ContourPoint[] = []
        for (let i = from; i <= last; i += 1) contour.push({ x: xs[i]!, y: ys[i]!, on: (flags[i]! & 1) === 1 })
        if (contour.length > 0) contours.push(contour)
        from = last + 1
      }
      return contours
    }
    // a composite glyph: other glyphs, each moved (and scaled) into place
    const out: ContourPoint[][] = []
    for (;;) {
      const flags = view.getUint16(at)
      const component = view.getUint16(at + 2)
      at += 4
      let dx: number
      let dy: number
      if (flags & 1) {
        dx = view.getInt16(at)
        dy = view.getInt16(at + 2)
        at += 4
      } else {
        dx = view.getInt8(at)
        dy = view.getInt8(at + 1)
        at += 2
      }
      // the parts that are put in place by matching points (and not by an offset) are left where they are
      if (!(flags & 2)) {
        dx = 0
        dy = 0
      }
      let a = 1
      let b = 0
      let c = 0
      let d = 1
      if (flags & 0x8) {
        a = d = f2dot14(view, at)
        at += 2
      } else if (flags & 0x40) {
        a = f2dot14(view, at)
        d = f2dot14(view, at + 2)
        at += 4
      } else if (flags & 0x80) {
        a = f2dot14(view, at)
        b = f2dot14(view, at + 2)
        c = f2dot14(view, at + 4)
        d = f2dot14(view, at + 6)
        at += 8
      }
      for (const contour of read(component, depth + 1)) {
        out.push(contour.map((point) => ({ x: a * point.x + c * point.y + dx, y: b * point.x + d * point.y + dy, on: point.on })))
      }
      if (!(flags & 0x20)) break
    }
    return out
  }

  return { unitsPerEm, glyphIndex: lookup, advance, contours: (glyph) => read(glyph, 0) }
}

const fontCache = new WeakMap<Uint8Array, OutlineFont | null>()

/** `parseOutlineFont`, once for each font file */
export function outlineFontOf(bytes: Uint8Array): OutlineFont | null {
  if (!fontCache.has(bytes)) fontCache.set(bytes, parseOutlineFont(bytes))
  return fontCache.get(bytes) ?? null
}

type Pt = [number, number]

/** A contour as the points of a closed path: curves are cubic (the quadratic ones of a TrueType font raised), handles as offsets. */
interface Anchor {
  p: Pt
  hi?: Pt
  ho?: Pt
}

interface Ring {
  anchors: Anchor[]
  /** the same contour as a polygon (curves cut into short lines): to tell what holds what */
  flat: Pt[]
  area: number
}

const CURVE_STEPS = 8

/** The contour with an on-curve point between every two off-curve ones, and starting on an on-curve point. */
function onCurveSequence(points: ContourPoint[]): ContourPoint[] {
  const start = points.findIndex((point) => point.on)
  let sequence: ContourPoint[]
  if (start < 0) {
    const first = points[0]!
    const last = points[points.length - 1]!
    sequence = [{ x: (first.x + last.x) / 2, y: (first.y + last.y) / 2, on: true }, ...points]
  } else {
    sequence = [...points.slice(start), ...points.slice(0, start)]
  }
  const out: ContourPoint[] = []
  for (let i = 0; i < sequence.length; i += 1) {
    const current = sequence[i]!
    const next = sequence[(i + 1) % sequence.length]!
    out.push(current)
    if (!current.on && !next.on) out.push({ x: (current.x + next.x) / 2, y: (current.y + next.y) / 2, on: true })
  }
  return out
}

function ringOf(points: ContourPoint[], place: (x: number, y: number) => Pt): Ring | null {
  if (points.length < 2) return null
  const sequence = onCurveSequence(points)
  // the pieces of the path: from one on-curve point to the next, with the control point between them when there is one
  const pieces: { from: Pt; control?: Pt; to: Pt }[] = []
  let i = 0
  while (i < sequence.length) {
    const from = sequence[i]!
    if (!from.on) break
    const after = sequence[(i + 1) % sequence.length]!
    if (after.on) {
      pieces.push({ from: place(from.x, from.y), to: place(after.x, after.y) })
      i += 1
    } else {
      const to = sequence[(i + 2) % sequence.length]!
      pieces.push({ from: place(from.x, from.y), control: place(after.x, after.y), to: place(to.x, to.y) })
      i += 2
    }
  }
  if (pieces.length < 2) return null
  const anchors: Anchor[] = pieces.map((piece) => ({ p: piece.from }))
  const flat: Pt[] = []
  pieces.forEach((piece, index) => {
    flat.push(piece.from)
    if (!piece.control) return
    const [fx, fy] = piece.from
    const [cx, cy] = piece.control
    const [tx, ty] = piece.to
    // a quadratic curve as the cubic that is the same curve
    anchors[index]!.ho = [(2 / 3) * (cx - fx), (2 / 3) * (cy - fy)]
    const next = anchors[(index + 1) % anchors.length]!
    next.hi = [(2 / 3) * (cx - tx), (2 / 3) * (cy - ty)]
    for (let step = 1; step < CURVE_STEPS; step += 1) {
      const t = step / CURVE_STEPS
      const u = 1 - t
      flat.push([u * u * fx + 2 * u * t * cx + t * t * tx, u * u * fy + 2 * u * t * cy + t * t * ty])
    }
  })
  let area = 0
  for (let k = 0; k < flat.length; k += 1) {
    const [x0, y0] = flat[k]!
    const [x1, y1] = flat[(k + 1) % flat.length]!
    area += x0 * y1 - x1 * y0
  }
  return { anchors, flat, area: area / 2 }
}

function inside(ring: Pt[], x: number, y: number): boolean {
  let result = false
  for (let i = 0, previous = ring.length - 1; i < ring.length; previous = i, i += 1) {
    const [xi, yi] = ring[i]!
    const [xp, yp] = ring[previous]!
    if (yi > y !== yp > y && x < ((xp - xi) * (y - yi)) / (yp - yi) + xi) result = !result
  }
  return result
}

const boxOf = (ring: Pt[]) => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of ring) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}

/**
 * The contours of one letter as polygons (an outer ring, then the holes in it). A font fills with the "non-zero" rule and the app with
 * even-odd; they agree unless contours overlap (a letter built of strokes that cross): that letter is then united with
 * `polygon-clipping`, which gives plain lines instead of curves, but the right shape.
 */
function polygonsOfRings(rings: Ring[]): { polygons: (Ring | Pt[])[][]; united: boolean } {
  if (rings.length === 0) return { polygons: [], united: false }
  const order = rings.map((ring, index) => ({ ring, index })).sort((a, b) => Math.abs(b.ring.area) - Math.abs(a.ring.area))
  // what holds each ring: the smallest bigger ring that has its first point inside it
  const parent: number[] = rings.map(() => -1)
  const depth: number[] = rings.map(() => 0)
  const boxes = rings.map((ring) => boxOf(ring.flat))
  for (let a = 0; a < order.length; a += 1) {
    const { ring, index } = order[a]!
    const [px, py] = ring.flat[0]!
    for (let b = a - 1; b >= 0; b -= 1) {
      const candidate = order[b]!
      const box = boxes[candidate.index]!
      if (px < box.minX || px > box.maxX || py < box.minY || py > box.maxY) continue
      if (inside(candidate.ring.flat, px, py)) {
        parent[index] = candidate.index
        depth[index] = depth[candidate.index]! + 1
        break
      }
    }
  }
  // contours that do not behave as outer and hole: a ring inside another that turns the same way (it is not a hole), or two that cross
  let overlapping = false
  for (let i = 0; i < rings.length && !overlapping; i += 1) {
    const p = parent[i]!
    if (p >= 0 && Math.sign(rings[p]!.area) === Math.sign(rings[i]!.area)) overlapping = true
  }
  for (let i = 0; i < rings.length && !overlapping; i += 1) {
    for (let j = i + 1; j < rings.length && !overlapping; j += 1) {
      if (parent[i] === j || parent[j] === i) continue
      const a = boxes[i]!
      const b = boxes[j]!
      if (a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY) continue
      if (rings[i]!.flat.some(([x, y]) => inside(rings[j]!.flat, x, y)) || rings[j]!.flat.some(([x, y]) => inside(rings[i]!.flat, x, y))) overlapping = true
    }
  }
  if (overlapping) {
    // the rings that turn as the biggest one do are the filled parts; the others cut out
    const filledSign = Math.sign(order[0]!.ring.area)
    const filled = rings.filter((ring) => Math.sign(ring.area) === filledSign).map((ring): [Pt[]] => [ring.flat])
    const cut = rings.filter((ring) => Math.sign(ring.area) !== filledSign).map((ring): [Pt[]] => [ring.flat])
    // polygon-clipping takes lines as [x, y] pairs; the types want a tuple of at least one polygon
    const joined = polygonClipping.union(filled[0]!, ...filled.slice(1))
    const result = cut.length > 0 ? polygonClipping.difference(joined, ...cut) : joined
    return { polygons: result.map((polygon) => polygon.map((ring) => ring.slice(0, -1) as Pt[])), united: true }
  }
  const polygons = new Map<number, (Ring | Pt[])[]>()
  for (const { ring, index } of order) {
    if (depth[index]! % 2 === 0) polygons.set(index, [ring])
  }
  for (const { ring, index } of order) {
    if (depth[index]! % 2 === 0) continue
    const outer = polygons.get(parent[index]!)
    if (outer) outer.push(ring)
  }
  return { polygons: [...polygons.values()], united: false }
}

/** One letter to be outlined: where its box starts, the baseline it stands on, the size of its font. */
export interface OutlineLetter {
  font: OutlineFont
  text: string
  /** points */
  x: number
  baseline: number
  size: number
  /** the width of the letter's box, when known: a box wider than the letter has room for tracking, which is on the letter's left in a right-to-left script */
  width?: number
}

export interface OutlineShape {
  /** the box of the outline, in the same points the letters were given in */
  x: number
  y: number
  w: number
  h: number
  /** the outline, 0…1 of the box */
  geom: PathGeom
}

const isRightToLeftScript = (codePoint: number) =>
  (codePoint >= 0x0590 && codePoint <= 0x08ff) || (codePoint >= 0xfb1d && codePoint <= 0xfdff) || (codePoint >= 0xfe70 && codePoint <= 0xfeff)

/** The outline of letters put together as one compound shape (its holes cut out), or null when there is nothing to draw in them. */
export function outlineShapeOf(letters: OutlineLetter[]): OutlineShape | null {
  type Polygon = (Ring | Pt[])[]
  const polygons: Polygon[] = []
  for (const letter of letters) {
    const scale = letter.size / letter.font.unitsPerEm
    let pen = letter.x
    const chars = [...letter.text]
    chars.forEach((char) => {
      const codePoint = char.codePointAt(0)!
      const glyph = letter.font.glyphIndex(codePoint)
      const advance = letter.font.advance(glyph) * scale
      // tracking sits after a letter in the direction of the script: on its left in Hebrew and Arabic
      const room = chars.length === 1 && letter.width !== undefined ? Math.max(0, letter.width - advance) : 0
      const origin = pen + (isRightToLeftScript(codePoint) && room > 0.01 ? room : 0)
      const place = (x: number, y: number): Pt => [origin + x * scale, letter.baseline - y * scale]
      const rings = letter.font
        .contours(glyph)
        .map((contour) => ringOf(contour, place))
        .filter((ring): ring is Ring => ring !== null)
      polygons.push(...polygonsOfRings(rings).polygons)
      pen += advance
    })
  }
  if (polygons.length === 0) return null
  const pointsOf = (ring: Ring | Pt[]) => (Array.isArray(ring) ? ring : ring.flat)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [x, y] of pointsOf(ring)) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  const w = Math.max(0.01, maxX - minX)
  const h = Math.max(0.01, maxY - minY)
  const norm = (x: number, y: number): Pt => [(x - minX) / w, (y - minY) / h]
  const geom: PathGeom = polygons.map((polygon) =>
    polygon.map((ring): PathVertex[] => {
      if (Array.isArray(ring)) return ring.map(([x, y]) => norm(x, y))
      return ring.anchors.map((anchor): PathVertex => {
        const p = norm(anchor.p[0], anchor.p[1])
        if (!anchor.hi && !anchor.ho) return p
        return {
          p,
          ...(anchor.hi ? { hi: [anchor.hi[0] / w, anchor.hi[1] / h] as Pt } : {}),
          ...(anchor.ho ? { ho: [anchor.ho[0] / w, anchor.ho[1] / h] as Pt } : {}),
        }
      })
    }),
  )
  return { x: minX, y: minY, w, h, geom }
}
