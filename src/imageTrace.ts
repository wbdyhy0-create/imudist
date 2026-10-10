import type { ImageFit, ImageFrame, PathGeom, PathVertex, ShapeFrame } from './document'

export const MAX_SMOOTH_PASSES = 12

/**
 * Image trace: a picture of a logo (or any drawing of one or two colours) turned into a vector shape. The picture is read as a field of
 * brightness; the line where that field crosses a level is followed (marching squares, with the crossing placed between the pixels, so a
 * soft edge gives a smooth outline), and the line is fitted with curves. What is inside the line is the shape; what is inside a
 * line inside it is a hole (the inside of an O).
 */

export interface TraceOptions {
  /** `dark` traces what is darker than the level, `light` what is lighter */
  trace: 'dark' | 'light'
  /** the brightness (0…255) that separates the shape from its ground */
  level: number
  /** passes of a small blur over the picture before the edge is followed (0…MAX_SMOOTH_PASSES): it takes out the grain of a JPEG */
  smooth: number
  /** outlines enclosing fewer pixels than this are dropped (specks, and the holes of a speck) */
  minArea: number
  /** how far (pixels of the picture) the fitted curve may go from the edge */
  tolerance: number
  /** the turn (degrees) from which a point of the outline is a corner and not a smooth point */
  corner: number
}

export const DEFAULT_TRACE: TraceOptions = { trace: 'dark', level: 128, smooth: 1, minArea: 6, tolerance: 0.6, corner: 55 }

type Pt = [number, number]

/** The brightness of every pixel (0…255), with the see-through ones taken as lying on white. */
export function brightnessField(rgba: ArrayLike<number>, width: number, height: number): Float32Array {
  const field = new Float32Array(width * height)
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const at = pixel * 4
    const alpha = (rgba[at + 3] ?? 255) / 255
    const value = 0.299 * rgba[at]! + 0.587 * rgba[at + 1]! + 0.114 * rgba[at + 2]!
    field[pixel] = value * alpha + 255 * (1 - alpha)
  }
  return field
}

/** The level that best separates the dark from the light of a picture (Otsu's method). */
export function otsuLevel(field: Float32Array): number {
  const histogram = new Float64Array(256)
  for (const value of field) histogram[Math.max(0, Math.min(255, Math.round(value)))]! += 1
  const total = field.length
  let sumAll = 0
  for (let level = 0; level < 256; level += 1) sumAll += level * histogram[level]!
  let weightBelow = 0
  let sumBelow = 0
  let best = 128
  let bestVariance = -1
  for (let level = 0; level < 256; level += 1) {
    weightBelow += histogram[level]!
    if (weightBelow === 0) continue
    const weightAbove = total - weightBelow
    if (weightAbove === 0) break
    sumBelow += level * histogram[level]!
    const meanBelow = sumBelow / weightBelow
    const meanAbove = (sumAll - sumBelow) / weightAbove
    const variance = weightBelow * weightAbove * (meanBelow - meanAbove) ** 2
    if (variance > bestVariance) {
      bestVariance = variance
      best = level
    }
  }
  return Math.max(1, Math.min(254, best))
}

/** What to trace: the one of dark and light that is the smaller part of the picture (the logo; the ground is the larger part). */
export function suggestedTrace(field: Float32Array, level: number): 'dark' | 'light' {
  let dark = 0
  for (const value of field) if (value < level) dark += 1
  return dark <= field.length / 2 ? 'dark' : 'light'
}

/**
 * The colour of what is traced (as #rrggbb): the average of the pixels deep inside it. The edge of a letter is mixed with the paper, so
 * all the pixels of the traced side together would give a paler colour than the ink; the strongest third of them are the ink itself.
 */
export function tracedColor(rgba: ArrayLike<number>, field: Float32Array, level: number, trace: 'dark' | 'light'): string {
  const histogram = new Uint32Array(256)
  let inside = 0
  for (let pixel = 0; pixel < field.length; pixel += 1) {
    const value = field[pixel]!
    if (trace === 'dark' ? value >= level : value <= level) continue
    if ((rgba[pixel * 4 + 3] ?? 255) < 128) continue
    histogram[Math.max(0, Math.min(255, Math.round(value)))]! += 1
    inside += 1
  }
  if (inside === 0) return trace === 'dark' ? '#000000' : '#ffffff'
  // the brightness that has a third of the traced pixels beyond it (towards black for dark ink, towards white for light)
  const wanted = Math.max(1, Math.ceil(inside / 3))
  let taken = 0
  let limit = trace === 'dark' ? 255 : 0
  if (trace === 'dark') {
    for (let value = 0; value < 256; value += 1) {
      taken += histogram[value]!
      if (taken >= wanted) {
        limit = value
        break
      }
    }
  } else {
    for (let value = 255; value >= 0; value -= 1) {
      taken += histogram[value]!
      if (taken >= wanted) {
        limit = value
        break
      }
    }
  }
  let red = 0
  let green = 0
  let blue = 0
  let count = 0
  for (let pixel = 0; pixel < field.length; pixel += 1) {
    const value = Math.round(field[pixel]!)
    if (trace === 'dark' ? value > limit || field[pixel]! >= level : value < limit || field[pixel]! <= level) continue
    if ((rgba[pixel * 4 + 3] ?? 255) < 128) continue
    const at = pixel * 4
    red += rgba[at]!
    green += rgba[at + 1]!
    blue += rgba[at + 2]!
    count += 1
  }
  if (count === 0) return trace === 'dark' ? '#000000' : '#ffffff'
  const hex = (value: number) => Math.round(value / count).toString(16).padStart(2, '0')
  return `#${hex(red)}${hex(green)}${hex(blue)}`
}

/** a few passes of a 3 by 3 blur */
function blurred(field: Float32Array, width: number, height: number, passes: number): Float32Array {
  let source = field
  for (let pass = 0; pass < passes; pass += 1) {
    const across = new Float32Array(source.length)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const at = y * width + x
        across[at] = (source[at - (x > 0 ? 1 : 0)]! + source[at]! * 2 + source[at + (x < width - 1 ? 1 : 0)]!) / 4
      }
    }
    const next = new Float32Array(source.length)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const at = y * width + x
        next[at] = (across[at - (y > 0 ? width : 0)]! + across[at]! * 2 + across[at + (y < height - 1 ? width : 0)]!) / 4
      }
    }
    source = next
  }
  return source
}

/**
 * The outlines of what is on the traced side of `level`: closed lines of points in pixel units (the centre of the first pixel is at
 * 0.5, 0.5). The first of each pair is the outline, in the direction that has the shape on its one side, so outlines of shapes and of
 * holes can be told apart by the sign of their area.
 */
export function contoursOf(field: Float32Array, width: number, height: number, level: number, trace: 'dark' | 'light'): Pt[][] {
  // the picture with a border of ground all round it, so that a shape at the edge of the picture is closed
  const w = width + 2
  const h = height + 2
  const inside = new Float32Array(w * h).fill(-1)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = field[y * width + x]!
      // positive: on the traced side; the size is how far
      const margin = trace === 'dark' ? level - value : value - level
      inside[(y + 1) * w + x + 1] = margin === 0 ? 1e-4 : margin
    }
  }

  // every crossing of the line over an edge between two pixels has a number: the horizontal edges (between a pixel and the one on its right), then the vertical ones
  const horizontal = (x: number, y: number) => (y * w + x) * 2
  const vertical = (x: number, y: number) => (y * w + x) * 2 + 1
  const places = new Map<number, Pt>()
  const next = new Map<number, number>()
  const link = (from: number, to: number) => {
    next.set(from, to)
  }
  const at = (x: number, y: number) => inside[y * w + x]!
  for (let y = 0; y < h - 1; y += 1) {
    for (let x = 0; x < w - 1; x += 1) {
      const a = at(x, y)
      const b = at(x + 1, y)
      const c = at(x + 1, y + 1)
      const d = at(x, y + 1)
      const code = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (c > 0 ? 4 : 0) | (d > 0 ? 8 : 0)
      if (code === 0 || code === 15) continue
      // the places the line crosses the four sides of the cell (pixel centres are the corners; the final unit has pixel centres at +0.5, and the border is one pixel)
      const top = () => {
        const key = horizontal(x, y)
        if (!places.has(key)) places.set(key, [x + a / (a - b) - 0.5, y - 0.5])
        return key
      }
      const right = () => {
        const key = vertical(x + 1, y)
        if (!places.has(key)) places.set(key, [x + 1 - 0.5, y + b / (b - c) - 0.5])
        return key
      }
      const bottom = () => {
        const key = horizontal(x, y + 1)
        if (!places.has(key)) places.set(key, [x + d / (d - c) - 0.5, y + 1 - 0.5])
        return key
      }
      const left = () => {
        const key = vertical(x, y)
        if (!places.has(key)) places.set(key, [x - 0.5, y + a / (a - d) - 0.5])
        return key
      }
      // each segment leaves the shape on the same side of it
      switch (code) {
        case 1: link(left(), top()); break
        case 2: link(top(), right()); break
        case 3: link(left(), right()); break
        case 4: link(right(), bottom()); break
        case 6: link(top(), bottom()); break
        case 7: link(left(), bottom()); break
        case 8: link(bottom(), left()); break
        case 9: link(bottom(), top()); break
        case 11: link(bottom(), right()); break
        case 12: link(right(), left()); break
        case 13: link(right(), top()); break
        case 14: link(top(), left()); break
        case 5:
        case 10: {
          // two opposite corners are in: whether they are joined is told by the middle of the cell
          const middle = (a + b + c + d) / 4
          if (code === 5) {
            if (middle > 0) {
              link(right(), top())
              link(left(), bottom())
            } else {
              link(left(), top())
              link(right(), bottom())
            }
          } else if (middle > 0) {
            link(top(), left())
            link(bottom(), right())
          } else {
            link(top(), right())
            link(bottom(), left())
          }
          break
        }
        default:
          break
      }
    }
  }

  // the segments are followed into closed lines
  const loops: Pt[][] = []
  const done = new Set<number>()
  for (const start of next.keys()) {
    if (done.has(start)) continue
    const loop: Pt[] = []
    let key: number | undefined = start
    while (key !== undefined && !done.has(key)) {
      done.add(key)
      const place = places.get(key)
      if (place) loop.push(place)
      key = next.get(key)
    }
    if (loop.length >= 3) loops.push(loop)
  }
  return loops
}

/** the area of a closed line, signed (the sign tells which way round it goes) */
export function signedArea(loop: Pt[]): number {
  let sum = 0
  for (let index = 0; index < loop.length; index += 1) {
    const [x0, y0] = loop[index]!
    const [x1, y1] = loop[(index + 1) % loop.length]!
    sum += x0 * y1 - x1 * y0
  }
  return sum / 2
}

function contains(loop: Pt[], x: number, y: number): boolean {
  let inside = false
  for (let index = 0, previous = loop.length - 1; index < loop.length; previous = index, index += 1) {
    const [xi, yi] = loop[index]!
    const [xp, yp] = loop[previous]!
    if (yi > y !== yp > y && x < ((xp - xi) * (y - yi)) / (yp - yi) + xi) inside = !inside
  }
  return inside
}

/** a closed line reduced to the points that keep its shape to within `tolerance` (Douglas-Peucker; the line is cut in two at its farthest points) */
function simplifiedLoop(loop: Pt[], tolerance: number): Pt[] {
  if (loop.length <= 6) return loop
  let far = 0
  let farDistance = -1
  for (let index = 1; index < loop.length; index += 1) {
    const distance = Math.hypot(loop[index]![0] - loop[0]![0], loop[index]![1] - loop[0]![1])
    if (distance > farDistance) {
      farDistance = distance
      far = index
    }
  }
  const simplify = (points: Pt[]): Pt[] => {
    const keep = new Uint8Array(points.length)
    keep[0] = 1
    keep[points.length - 1] = 1
    const stack: [number, number][] = [[0, points.length - 1]]
    while (stack.length > 0) {
      const [from, to] = stack.pop()!
      const [ax, ay] = points[from]!
      const [bx, by] = points[to]!
      const span = Math.hypot(bx - ax, by - ay)
      let worst = -1
      let worstDistance = tolerance
      for (let index = from + 1; index < to; index += 1) {
        const [px, py] = points[index]!
        const distance = span === 0 ? Math.hypot(px - ax, py - ay) : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / span
        if (distance > worstDistance) {
          worst = index
          worstDistance = distance
        }
      }
      if (worst >= 0) {
        keep[worst] = 1
        stack.push([from, worst], [worst, to])
      }
    }
    return points.filter((_, index) => keep[index] === 1)
  }
  const first = simplify(loop.slice(0, far + 1))
  const second = simplify([...loop.slice(far), loop[0]!])
  return [...first, ...second.slice(1, -1)]
}

/** The outline as the points of a path: smooth points with handles where the line goes on smoothly, corners where it turns sharply. In pixel units. */
function curveOf(loop: Pt[], cornerDegrees: number): { p: Pt; hi?: Pt; ho?: Pt }[] {
  const count = loop.length
  const cornerCos = Math.cos((cornerDegrees * Math.PI) / 180)
  return loop.map((point, index) => {
    const before = loop[(index - 1 + count) % count]!
    const after = loop[(index + 1) % count]!
    const inX = point[0] - before[0]
    const inY = point[1] - before[1]
    const outX = after[0] - point[0]
    const outY = after[1] - point[1]
    const inLength = Math.hypot(inX, inY)
    const outLength = Math.hypot(outX, outY)
    if (inLength === 0 || outLength === 0) return { p: point }
    // a sharp turn is a corner of the shape and stays one
    const turn = (inX * outX + inY * outY) / (inLength * outLength)
    if (turn < cornerCos) return { p: point }
    // otherwise the curve goes through the point in the direction from the point before it to the point after it
    const directionX = after[0] - before[0]
    const directionY = after[1] - before[1]
    const length = Math.hypot(directionX, directionY) || 1
    const ux = directionX / length
    const uy = directionY / length
    return {
      p: point,
      hi: [-ux * (inLength / 3), -uy * (inLength / 3)],
      ho: [ux * (outLength / 3), uy * (outLength / 3)],
    }
  })
}

export interface TraceResult {
  /** the outline, 0…1 of `box` */
  geom: PathGeom
  /** the box (in pixels of the picture) `geom` is relative to: the whole picture */
  box: { x: number; y: number; w: number; h: number }
  /** how many shapes (outer lines) and holes came out, and how many points the outlines have */
  shapes: number
  holes: number
  points: number
}

/** The picture (as its brightness field) traced into the outline of a vector shape. */
export function traceField(field: Float32Array, width: number, height: number, options: TraceOptions): TraceResult {
  const smoothField = options.smooth > 0 ? blurred(field, width, height, Math.min(MAX_SMOOTH_PASSES, Math.round(options.smooth))) : field
  const loops = contoursOf(smoothField, width, height, options.level, options.trace)
    .map((loop) => ({ loop, area: signedArea(loop) }))
    .filter(({ area }) => Math.abs(area) >= Math.max(0.5, options.minArea))
  // the outlines of shapes go one way round and those of holes the other: the sign that most of the area has is the shapes'
  const positive = loops.filter(({ area }) => area > 0).reduce((sum, { area }) => sum + area, 0)
  const negative = loops.filter(({ area }) => area < 0).reduce((sum, { area }) => sum - area, 0)
  const outerSign = positive >= negative ? 1 : -1
  const outers = loops.filter(({ area }) => Math.sign(area) === outerSign)
  const holes = loops.filter(({ area }) => Math.sign(area) !== outerSign)

  // each hole goes to the smallest shape that has it inside
  const ordered = outers.slice().sort((a, b) => Math.abs(a.area) - Math.abs(b.area))
  const holesOf = new Map<{ loop: Pt[]; area: number }, { loop: Pt[]; area: number }[]>()
  for (const hole of holes) {
    const sample = hole.loop[0]!
    const parent = ordered.find((outer) => Math.abs(outer.area) > Math.abs(hole.area) && contains(outer.loop, sample[0], sample[1]))
    if (!parent) continue
    holesOf.set(parent, [...(holesOf.get(parent) ?? []), hole])
  }

  const box = { x: 0, y: 0, w: width, h: height }
  const toVertices = (loop: Pt[]): PathVertex[] => {
    const fitted = curveOf(simplifiedLoop(loop, options.tolerance), options.corner)
    return fitted.map((vertex) => {
      const p: [number, number] = [vertex.p[0] / width, vertex.p[1] / height]
      if (!vertex.hi && !vertex.ho) return p
      return { p, ...(vertex.hi ? { hi: [vertex.hi[0] / width, vertex.hi[1] / height] as [number, number] } : {}), ...(vertex.ho ? { ho: [vertex.ho[0] / width, vertex.ho[1] / height] as [number, number] } : {}) }
    })
  }
  let points = 0
  const geom: PathGeom = outers.map((outer) => {
    const rings = [toVertices(outer.loop), ...(holesOf.get(outer) ?? []).map((hole) => toVertices(hole.loop))]
    points += rings.reduce((sum, ring) => sum + ring.length, 0)
    return rings
  })
  return { geom, box, shapes: outers.length, holes: [...holesOf.values()].reduce((sum, list) => sum + list.length, 0), points }
}

/**
 * Which part of the picture shows in its frame, and where in the frame it lies (what the frame's "fit" does): the part of the picture
 * to trace (in the picture's own pixels) and the box the traced shape takes (in points from the frame's top left corner).
 */
export function visibleRegion(fit: ImageFit, frameW: number, frameH: number, picW: number, picH: number) {
  const whole = { x: 0, y: 0, w: picW, h: picH }
  if (fit === 'stretch' || picW <= 0 || picH <= 0) return { src: whole, box: { x: 0, y: 0, w: frameW, h: frameH } }
  if (fit === 'fit') {
    const scale = Math.min(frameW / picW, frameH / picH)
    const w = picW * scale
    const h = picH * scale
    return { src: whole, box: { x: (frameW - w) / 2, y: (frameH - h) / 2, w, h } }
  }
  // fill: the picture covers the frame and what goes over its edge is cut off
  const scale = Math.max(frameW / picW, frameH / picH)
  const w = frameW / scale
  const h = frameH / scale
  return { src: { x: (picW - w) / 2, y: (picH - h) / 2, w, h }, box: { x: 0, y: 0, w: frameW, h: frameH } }
}

/**
 * How much the picture is enlarged (or reduced) before it is traced: a small picture is enlarged with the browser's smoothing so that its
 * edges come out as curves and not as steps; a huge one is reduced so that the tracing is quick.
 */
export function workingScale(width: number, height: number): number {
  const longest = Math.max(width, height)
  if (longest <= 0) return 1
  if (longest < 1200) return Math.min(4, 1200 / longest)
  if (longest > 2400) return 2400 / longest
  return 1
}

/** the shape mirrored left to right and/or top to bottom (the handles of a curve with it) */
export function flippedGeom(geom: PathGeom, flipX: boolean, flipY: boolean): PathGeom {
  if (!flipX && !flipY) return geom
  const sx = flipX ? -1 : 1
  const sy = flipY ? -1 : 1
  const point = (p: [number, number]): [number, number] => [flipX ? 1 - p[0] : p[0], flipY ? 1 - p[1] : p[1]]
  const handle = (h: [number, number]): [number, number] => [h[0] * sx, h[1] * sy]
  return geom.map((polygon) =>
    polygon.map((ring) =>
      ring.map((vertex): PathVertex => {
        if (Array.isArray(vertex)) return point(vertex as [number, number])
        const v = vertex as { p: [number, number]; hi?: [number, number]; ho?: [number, number] }
        return { p: point(v.p), ...(v.hi ? { hi: handle(v.hi) } : {}), ...(v.ho ? { ho: handle(v.ho) } : {}) }
      }),
    ),
  )
}

/**
 * The vector shape that stands for a picture: in the place of the picture (or of the part of it that shows), as a shape that is a filled
 * path (with the holes cut out), in front of everything, on the picture's layer, turned and mixed the way the picture was.
 */
export function shapeFromTrace(image: ImageFrame, region: ReturnType<typeof visibleRegion>, result: TraceResult, color: string, id: string, z: number, label?: string): ShapeFrame {
  const shape: ShapeFrame = {
    id,
    kind: 'path',
    x: image.x + region.box.x,
    y: image.y + region.box.y,
    w: Math.max(1, region.box.w),
    h: Math.max(1, region.box.h),
    geom: flippedGeom(result.geom, !!image.flipX, !!image.flipY),
    fill: color,
    stroke: null,
    strokeWidth: 0,
    z,
  }
  if (image.layerId) shape.layerId = image.layerId
  if (image.opacity !== undefined && image.opacity < 1) shape.opacity = image.opacity
  if (image.blendMode) shape.blendMode = image.blendMode
  if (image.rotation) shape.rotation = image.rotation
  if (label) shape.label = label
  return shape
}
