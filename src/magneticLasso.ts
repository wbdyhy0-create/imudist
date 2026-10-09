export interface MagneticPoint {
  x: number
  y: number
}

export interface MagneticEdgeMap {
  width: number
  height: number
  /** the strength of the edge at every pixel (the size of the colour change), 0-255 */
  strengths: Uint8Array
  /** the same, thinned to the line along the top of every edge, so the wire runs exactly on the edge and not beside it; `strengths` when missing */
  ridge?: Uint8Array
  /** the ridge value that counts as a clear edge (the edges of this picture are measured against it); 255 when missing */
  scale?: number
  /** the ridge of the picture seen from afar (blurred over several pixels): it finds the soft edge of an object, the edge of a blurred photograph, and ignores spots and grain */
  broad?: Uint8Array
  broadScale?: number
  /** the strength of the coarse edge at every pixel, without the thinning: a hill whose top is the middle of a soft edge (on the same scale as `broad`) */
  broadHill?: Uint8Array
}

export type MagneticOperation = 'fill' | 'delete' | 'mask'
export type MagneticAdjustMode = 'expand' | 'contract'

/**
 * The positions of the edge map are pixel numbers: the pixel `i` of the map covers the stretch i to i+1 of it. These two turn a
 * position in the source picture into the (fractional) pixel of the map under it, and the pixel of the map into the centre of its
 * stretch in the source; without the half pixel everything the lasso drew sat up and to the left of the edge it followed.
 */
export const sourceToMap = (value: number, mapSize: number, sourceSize: number) => (value * mapSize) / sourceSize - 0.5
export const mapToSource = (index: number, mapSize: number, sourceSize: number) => ((index + 0.5) * sourceSize) / mapSize

/** a line that is already on an edge this clear (0-1) holds there against a light touch */
const PUSH_EDGE_HOLD = 0.45
/** a sharp edge at least this clear (0-1) is one the line is put exactly on */
const PUSH_EDGE_MIN = 0.35
/** an edge seen from afar at least this clear (0-1) is one the line can be pushed to */
const PUSH_BROAD_MIN = 0.14
/** the most (in pixels) that simplifying the moved stretch of the line may move it */
const PUSH_TOLERANCE = 1.2
/** how many points on each side a pushed point is averaged with, to make the line clean */
const PUSH_SMOOTHING = 6
/** a loop of the line this short (in pixels) that the pushing made is cut out; a longer one is the line itself coming round */
const PUSH_LOOP_LIMIT = 300

/**
 * The plus and minus brushes. They do not shape the line: they move it to the edge it should be on. The minus circle, brought up to
 * the line from outside the shape, sends the touched part of the line inward as soon as it touches, to the first clear edge of the
 * picture it meets; the plus circle, inside the shape, sends it outward the same way. The edge may be as far as two circle radii
 * away. Where there is no clear edge the line stays as it is (it is never bent round the circle). A line that already lies on an
 * edge holds there against a light touch, and goes on to the next edge only when the circle is pushed right up to it. A circle on
 * the other side of the line (the minus circle inside the shape, the plus circle outside it) does nothing.
 */
export function adjustMagneticPath(
  points: MagneticPoint[],
  center: MagneticPoint,
  edgeMap: MagneticEdgeMap,
  radius: number,
  mode: MagneticAdjustMode,
  /** the pixels the line was put on earlier in the same drag (this call adds the ones it settles): they are not pushed again, so a stroke that goes over a place twice does not carry the line on to the next edge */
  settledBefore?: Set<number>,
): MagneticPoint[] {
  const count = points.length
  if (count < 3 || radius <= 0) return points
  let signedArea = 0
  for (let index = 0; index < count; index += 1) {
    const point = points[index]!
    const next = points[(index + 1) % count]!
    signedArea += point.x * next.y - next.x * point.y
  }
  // the way the circle pushes: out of the shape for the plus brush, into it for the minus brush
  const direction = (signedArea >= 0 ? 1 : -1) * (mode === 'expand' ? 1 : -1)
  // the line is a chain of neighbouring pixels, so its direction is taken over a good many of them: the push then follows the shape of
  // the line and not the steps of its pixels
  const span = Math.min(6, Math.floor(count / 2))
  // ... from a smoothed copy of it, so that a step or a ramp left by an earlier push does not turn the direction sideways
  const window = Math.min(8, Math.floor(count / 4))
  const smoothX = new Float32Array(count)
  const smoothY = new Float32Array(count)
  for (let index = 0; index < count; index += 1) {
    let sumX = 0
    let sumY = 0
    for (let offset = -window; offset <= window; offset += 1) {
      const neighbour = points[(index + offset + count * 2) % count]!
      sumX += neighbour.x
      sumY += neighbour.y
    }
    smoothX[index] = sumX / (window * 2 + 1)
    smoothY[index] = sumY / (window * 2 + 1)
  }
  const holdAt = radius * 0.5
  const reach = radius * 2
  const pushed: (MagneticPoint | null)[] = new Array(count).fill(null)
  // the points the circle touches, and of those the ones that have an edge to be on (found now, or held where they are)
  const touched: boolean[] = new Array(count).fill(false)
  const settled: (MagneticPoint | null)[] = new Array(count).fill(null)
  let changed = false
  for (let index = 0; index < count; index += 1) {
    const point = points[index]!
    const fromX = point.x - center.x
    const fromY = point.y - center.y
    const distance = Math.hypot(fromX, fromY)
    if (distance >= radius) continue
    touched[index] = true
    if (settledBefore?.has(point.y * edgeMap.width + point.x)) {
      settled[index] = point
      continue
    }
    const beforeAt = (index - span + count) % count
    const afterAt = (index + span) % count
    const tangentX = smoothX[afterAt]! - smoothX[beforeAt]!
    const tangentY = smoothY[afterAt]! - smoothY[beforeAt]!
    const tangentLength = Math.hypot(tangentX, tangentY)
    if (tangentLength === 0) continue
    const normalX = (tangentY / tangentLength) * direction
    const normalY = (-tangentX / tangentLength) * direction
    // the circle is on the side the line is to be pushed from
    if (fromX * normalX + fromY * normalY <= 0) continue
    // how far into the circle the point is: a line that is on an edge (of the shape: a spot or grain on it does not count) lets go only when
    // the circle is pushed well in
    const onEdge = Math.max(broadEdgenessNear(edgeMap, point.x, point.y), broadEdgenessNear(edgeMap, point.x + normalX, point.y + normalY), broadEdgenessNear(edgeMap, point.x - normalX, point.y - normalY)) >= PUSH_EDGE_HOLD
    if (onEdge && radius - distance <= holdAt) {
      settled[index] = point
      continue
    }

    const found = edgeAlong(edgeMap, point, normalX, normalY, reach, onEdge ? 4 : 2, mode === 'expand')
    if (found < 0) continue
    const moved = {
      x: Math.max(1, Math.min(edgeMap.width - 2, Math.round(point.x + normalX * found * 0.5))),
      y: Math.max(1, Math.min(edgeMap.height - 2, Math.round(point.y + normalY * found * 0.5))),
    }
    pushed[index] = moved
    settled[index] = moved
    changed = true
  }
  // a touched point that found no edge of its own (the line bends there, or turns away from the circle) lies between two that did:
  // it goes on the straight way between them, so the line does not keep a step where the others were moved
  // (the line is a ring: a stretch may run over the place where the list begins)
  const before: number[] = new Array(count).fill(-1)
  const after: number[] = new Array(count).fill(-1)
  let lastSettled = -1
  for (let lap = 0; lap < 2 * count; lap += 1) {
    const index = lap % count
    if (!touched[index]) lastSettled = -1
    else if (settled[index]) lastSettled = index
    before[index] = lastSettled
  }
  lastSettled = -1
  for (let lap = 2 * count - 1; lap >= 0; lap -= 1) {
    const index = lap % count
    if (!touched[index]) lastSettled = -1
    else if (settled[index]) lastSettled = index
    after[index] = lastSettled
  }
  for (let index = 0; index < count; index += 1) {
    if (!touched[index] || settled[index]) continue
    const from = before[index]!
    const to = after[index]!
    if (from < 0 || to < 0 || from === to) continue
    const start = settled[from]!
    const end = settled[to]!
    const share = ((index - from + count) % count) / ((to - from + count) % count)
    pushed[index] = { x: Math.round(start.x + (end.x - start.x) * share), y: Math.round(start.y + (end.y - start.y) * share) }
    changed = true
  }
  if (!changed) return points
  // the places the points were sent to are each found on their own, and an edge found from pixel to pixel is ragged: the line is smoothed over a few
  // neighbours, so that it is the clean line of the edge and not its grain
  const sent = pushed.slice()
  for (let index = 0; index < count; index += 1) {
    if (!sent[index]) continue
    let sumX = 0
    let sumY = 0
    let seen = 0
    for (let offset = -PUSH_SMOOTHING; offset <= PUSH_SMOOTHING; offset += 1) {
      const neighbour = sent[(index + offset + count * 2) % count]
      if (!neighbour) continue
      sumX += neighbour.x
      sumY += neighbour.y
      seen += 1
    }
    if (seen >= PUSH_SMOOTHING + 1) {
      const smoothed = { x: Math.round(sumX / seen), y: Math.round(sumY / seen) }
      pushed[index] = smoothed
      settled[index] = smoothed
    }
  }
  if (settledBefore) {
    for (let index = 0; index < count; index += 1) {
      const place = pushed[index]
      if (place) settledBefore.add(place.y * edgeMap.width + place.x)
      else if (settled[index]) settledBefore.add(settled[index]!.y * edgeMap.width + settled[index]!.x)
    }
  }

  // the moved points are joined again into an unbroken chain of neighbouring pixels; where the chain comes back to a pixel it has
  // just been through (a point pressed out and back) the loop is cut out
  const result: MagneticPoint[] = []
  const placeOf = new Map<number, number>()
  const loopLimit = Math.min(PUSH_LOOP_LIMIT, Math.floor(count / 3))
  const add = (point: MagneticPoint) => {
    const key = point.y * edgeMap.width + point.x
    const earlier = placeOf.get(key)
    if (earlier !== undefined && earlier > 0 && result.length - earlier <= loopLimit) {
      for (let at = earlier + 1; at < result.length; at += 1) placeOf.delete(result[at]!.y * edgeMap.width + result[at]!.x)
      result.length = earlier + 1
      return
    }
    placeOf.set(key, result.length)
    result.push(point)
  }
  const join = (to: MagneticPoint) => {
    const last = result[result.length - 1]
    if (!last) {
      add(to)
      return
    }
    const steps = Math.max(Math.abs(to.x - last.x), Math.abs(to.y - last.y))
    for (let step = 1; step <= steps; step += 1) {
      const point = { x: Math.round(last.x + ((to.x - last.x) * step) / steps), y: Math.round(last.y + ((to.y - last.y) * step) / steps) }
      const previous = result[result.length - 1]!
      if (point.x !== previous.x || point.y !== previous.y) add(point)
    }
  }
  // where the line was moved, the places it was moved to are reduced to the vertices that matter (the little back-and-forth steps of each
  // point finding its own pixel are not part of an edge); the stretches between them are drawn straight
  for (let index = 0; index < count; index += 1) {
    if (!pushed[index]) {
      join(points[index]!)
      continue
    }
    let end = index
    while (end + 1 < count && pushed[end + 1]) end += 1
    const run: MagneticPoint[] = []
    for (let at = index; at <= end; at += 1) run.push(pushed[at]!)
    for (const vertex of simplifiedLine(run, PUSH_TOLERANCE)) join(vertex)
    index = end
  }
  join(result[0]!)
  result.pop()
  // a line must not be pushed out of existence
  return result.length >= 3 && result.length * 3 >= count ? result : points
}

/**
 * The first clear edge a point meets going along (dx, dy), as a number of half pixels from the point (-1: none within `reach`
 * pixels; the first `first` half pixels are not looked at). It is looked for from afar first (the edge of the shape, even a soft one,
 * and not the spots and grain on it: those must not be much weaker than the clearest edge in reach), and then the pixels that are
 * exactly on the edge close to that place are looked for.
 */
export function edgeAlong(map: MagneticEdgeMap, point: MagneticPoint, dx: number, dy: number, reach: number, first: number, farthest = false): number {
  const steps = Math.floor(reach * 2)
  const coarse: number[] = []
  const exact: number[] = []
  for (let step = 0; step <= steps + 1; step += 1) {
    coarse.push(broadEdgenessNear(map, point.x + dx * step * 0.5, point.y + dy * step * 0.5))
    exact.push(edgenessNear(map, point.x + dx * step * 0.5, point.y + dy * step * 0.5))
  }
  const needed = PUSH_BROAD_MIN
  const candidates: number[] = []
  for (let step = first; step <= steps; step += 1) {
    const here = coarse[step]!
    if (here >= needed && here >= coarse[step - 1]! && here >= coarse[step + 1]!) candidates.push(step)
  }
  if (candidates.length === 0) return -1
  // going outward from inside a shape the edge of the shape is the clearest one, with whatever is on the shape before it (a spot, its pattern);
  // going inward from outside it is the first one
  let found = candidates[0]!
  if (farthest) {
    const clearest = Math.max(...candidates.map((step) => coarse[step]!))
    found = candidates.filter((step) => coarse[step]! >= clearest * 0.85).pop()!
  }
  // the edge seen from afar is a stretch rather than a point: its place is the middle of where it is strongest
  let top = coarse[found]!
  for (let step = found; step <= Math.min(steps, found + 12); step += 1) top = Math.max(top, coarse[step]!)
  const along: number[] = []
  for (let step = found; step <= Math.min(steps, found + 12); step += 1) if (coarse[step]! >= top * 0.97) along.push(step)
  found = along[Math.floor(along.length / 2)]!
  if (map.broadHill) {
    // the middle of the hill of the coarse edge round it: the same place from one ray to the next, where the thin crest wanders over the top of the hill
    const hill: number[] = []
    for (let step = Math.max(first, found - 16); step <= Math.min(steps, found + 16); step += 1) {
      const column = Math.round(point.x + dx * step * 0.5)
      const row = Math.round(point.y + dy * step * 0.5)
      hill.push(column < 0 || row < 0 || column >= map.width || row >= map.height ? 0 : map.broadHill[row * map.width + column]!)
    }
    const peak = Math.max(...hill)
    let weight = 0
    let sum = 0
    hill.forEach((value, at) => {
      const share = value - peak * 0.7
      if (share > 0) {
        weight += share
        sum += share * (Math.max(first, found - 16) + at)
      }
    })
    if (weight > 0) found = Math.round(sum / weight)
  }
  // within three pixels of it, the sharpest edge there is
  let sharpest = -1
  for (let step = Math.max(first, found - 6); step <= Math.min(steps, found + 6); step += 1) {
    if (exact[step]! >= PUSH_EDGE_MIN && exact[step]! >= exact[step - 1]! && exact[step]! >= exact[step + 1]! && (sharpest < 0 || exact[step]! > exact[sharpest]!)) sharpest = step
  }
  return sharpest >= 0 ? sharpest : found
}

/**
 * A closed line cleaned when a stroke of the plus or minus brush ends. The places the brush sent the line to were each found on their own,
 * in steps as the circle went by, and the line over a soft edge has small waves where one step ended and the next began: the points the stroke
 * settled (`settled`, as `adjustMagneticPath` filled it) are averaged with their neighbours along the line, and the line is then reduced to the
 * vertices that hold its shape to within `tolerance` pixels and drawn again, straight between them, as a chain of neighbouring pixels.
 */
export function cleanMagneticPath(points: MagneticPoint[], settled: Set<number>, width: number, tolerance = 1.2): MagneticPoint[] {
  const count = points.length
  if (count < 24) return points
  const wanted = points.map((point) => settled.has(point.y * width + point.x))
  const smooth = points.map((point, index) => {
    if (!wanted[index]) return point
    let sumX = 0
    let sumY = 0
    let seen = 0
    for (let offset = -CLEAN_SPAN; offset <= CLEAN_SPAN; offset += 1) {
      const at = (index + offset + count * 2) % count
      if (!wanted[at]) continue
      sumX += points[at]!.x
      sumY += points[at]!.y
      seen += 1
    }
    return seen > CLEAN_SPAN ? { x: Math.round(sumX / seen), y: Math.round(sumY / seen) } : point
  })
  // the stretches that were settled are reduced to their vertices; the rest of the line is kept as it is
  const vertices: MagneticPoint[] = []
  for (let index = 0; index < count; index += 1) {
    if (!wanted[index]) {
      vertices.push(points[index]!)
      continue
    }
    let end = index
    while (end + 1 < count && wanted[end + 1]) end += 1
    vertices.push(...simplifiedLine(smooth.slice(index, end + 1), tolerance))
    index = end
  }
  const result: MagneticPoint[] = []
  // (the last vertex is the first again: the ring is drawn closed, and the duplicate is dropped)
  for (const vertex of [...vertices, vertices[0]!]) {
    const last = result[result.length - 1]
    if (!last) {
      result.push(vertex)
      continue
    }
    const steps = Math.max(Math.abs(vertex.x - last.x), Math.abs(vertex.y - last.y))
    for (let step = 1; step <= steps; step += 1) {
      const point = { x: Math.round(last.x + ((vertex.x - last.x) * step) / steps), y: Math.round(last.y + ((vertex.y - last.y) * step) / steps) }
      const previous = result[result.length - 1]!
      if (point.x !== previous.x || point.y !== previous.y) result.push(point)
    }
  }
  result.pop()
  return result.length >= 3 ? result : points
}

/** how many points on each side a settled point is averaged with when the stroke ends */
const CLEAN_SPAN = 10

/** a line reduced to the vertices that hold its shape to within `tolerance` (Douglas-Peucker); the first and the last are always kept */
function simplifiedLine(line: MagneticPoint[], tolerance: number): MagneticPoint[] {
  if (line.length <= 2) return line
  const keep = new Uint8Array(line.length)
  keep[0] = 1
  keep[line.length - 1] = 1
  const stack: [number, number][] = [[0, line.length - 1]]
  while (stack.length > 0) {
    const [from, to] = stack.pop()!
    const a = line[from]!
    const b = line[to]!
    const span = Math.hypot(b.x - a.x, b.y - a.y)
    let worst = -1
    let worstDistance = tolerance
    for (let at = from + 1; at < to; at += 1) {
      const point = line[at]!
      const distance = span === 0 ? Math.hypot(point.x - a.x, point.y - a.y) : Math.abs((b.x - a.x) * (a.y - point.y) - (a.x - point.x) * (b.y - a.y)) / span
      if (distance > worstDistance) {
        worst = at
        worstDistance = distance
      }
    }
    if (worst >= 0) {
      keep[worst] = 1
      stack.push([from, worst], [worst, to])
    }
  }
  return line.filter((_, at) => keep[at] === 1)
}

/** 0 to 1: the edge at the nearest pixel of a position (0 outside the picture) */
function edgenessNear(map: MagneticEdgeMap, x: number, y: number) {
  const column = Math.round(x)
  const row = Math.round(y)
  if (column < 0 || row < 0 || column >= map.width || row >= map.height) return 0
  return edgenessAt(map, row * map.width + column)
}

/** the same from afar: the edge of the shape, not of the grain and the spots on it (the fine edges when the map has no coarse ones) */
function broadEdgenessNear(map: MagneticEdgeMap, x: number, y: number) {
  if (!map.broad) return edgenessNear(map, x, y)
  const column = Math.round(x)
  const row = Math.round(y)
  if (column < 0 || row < 0 || column >= map.width || row >= map.height) return 0
  return Math.min(1, map.broad[row * map.width + column]! / (map.broadScale ?? 255))
}

/** 0 (flat) to 1 (a clear edge): how much of an edge the map has at that pixel */
function edgenessAt(map: MagneticEdgeMap, index: number) {
  return Math.min(1, (map.ridge ?? map.strengths)[index]! / (map.scale ?? 255))
}

/** the size of the colour change at every pixel (Sobel), without the thinning the lasso itself works with */
export function edgeStrengthsOf(data: ArrayLike<number>, width: number, height: number): Uint8Array {
  const gray = new Float32Array(width * height)
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4
    const alpha = data[offset + 3] / 255
    gray[pixel] = (0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2]) * alpha + 255 * (1 - alpha)
  }

  const strengths = new Uint8Array(width * height)
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const topLeft = gray[(y - 1) * width + x - 1]
      const top = gray[(y - 1) * width + x]
      const topRight = gray[(y - 1) * width + x + 1]
      const left = gray[y * width + x - 1]
      const right = gray[y * width + x + 1]
      const bottomLeft = gray[(y + 1) * width + x - 1]
      const bottom = gray[(y + 1) * width + x]
      const bottomRight = gray[(y + 1) * width + x + 1]
      const horizontal = -topLeft + topRight - 2 * left + 2 * right - bottomLeft + bottomRight
      const vertical = -topLeft - 2 * top - topRight + bottomLeft + 2 * bottom + bottomRight
      strengths[y * width + x] = Math.min(255, Math.round(Math.hypot(horizontal, vertical) / (Math.SQRT2 * 4)))
    }
  }
  return strengths
}

/**
 * What the lasso works with: the picture lightly smoothed (so grain and JPEG noise are not taken for edges), the edge strength
 * of every pixel, and the same thinned to the crest of each edge (a pixel keeps its strength only when no neighbour across the edge is
 * stronger). The wire runs along the crests: that is what puts it on the edge itself instead of somewhere in the blur beside it.
 */
export function edgeFieldOf(
  data: ArrayLike<number>,
  width: number,
  height: number,
): { strengths: Uint8Array; ridge: Uint8Array; scale: number; broad: Uint8Array; broadScale: number; broadHill: Uint8Array } {
  const count = width * height
  const gray = new Float32Array(count)
  for (let pixel = 0; pixel < count; pixel += 1) {
    const offset = pixel * 4
    const alpha = data[offset + 3] / 255
    gray[pixel] = (0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2]) * alpha + 255 * (1 - alpha)
  }
  // a 1-2-1 blur along the rows and then the columns
  const across = new Float32Array(count)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const here = y * width + x
      across[here] = (gray[here - (x > 0 ? 1 : 0)]! + 2 * gray[here]! + gray[here + (x < width - 1 ? 1 : 0)]!) / 4
    }
  }
  const smooth = new Float32Array(count)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const here = y * width + x
      smooth[here] = (across[here - (y > 0 ? width : 0)]! + 2 * across[here]! + across[here + (y < height - 1 ? width : 0)]!) / 4
    }
  }
  const fine = crestsOf(smooth, width, height, 6, 24)
  // the picture blurred over some ten pixels: spots and grain are gone, the edge of a soft shape is left
  const coarse = crestsOf(boxBlur(boxBlur(gray, width, height, COARSE_RADIUS), width, height, COARSE_RADIUS), width, height, 1, 4, true)
  return { strengths: fine.strengths, ridge: fine.ridge, scale: fine.scale, broad: coarse.ridge, broadScale: coarse.scale, broadHill: coarse.hill ?? coarse.ridge }
}

/** the radius (in pixels) of the blur the coarse edges are taken from */
const COARSE_RADIUS = 8

/** a picture blurred over (2 * radius + 1) pixels, both ways */
function boxBlur(source: Float32Array, width: number, height: number, radius: number): Float32Array {
  const across = new Float32Array(source.length)
  const size = radius * 2 + 1
  for (let y = 0; y < height; y += 1) {
    const row = y * width
    let sum = 0
    for (let x = -radius; x <= radius; x += 1) sum += source[row + Math.min(width - 1, Math.max(0, x))]!
    for (let x = 0; x < width; x += 1) {
      across[row + x] = sum / size
      sum += source[row + Math.min(width - 1, x + radius + 1)]! - source[row + Math.max(0, x - radius)]!
    }
  }
  const result = new Float32Array(source.length)
  for (let x = 0; x < width; x += 1) {
    let sum = 0
    for (let y = -radius; y <= radius; y += 1) sum += across[Math.min(height - 1, Math.max(0, y)) * width + x]!
    for (let y = 0; y < height; y += 1) {
      result[y * width + x] = sum / size
      sum += across[Math.min(height - 1, y + radius + 1) * width + x]! - across[Math.max(0, y - radius) * width + x]!
    }
  }
  return result
}

/** the edge strength of every pixel of a (smoothed) picture, and the same thinned to the crest of each edge; `noise` is the smallest crest that counts, `floor` the lowest the clear-edge value may be */
function crestsOf(smooth: Float32Array, width: number, height: number, noise: number, floor: number, normalized = false) {
  const count = width * height
  const magnitude = new Float32Array(count)
  const stepX = new Int8Array(count)
  const stepY = new Int8Array(count)
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const here = y * width + x
      const horizontal = -smooth[here - width - 1]! + smooth[here - width + 1]! - 2 * smooth[here - 1]! + 2 * smooth[here + 1]! - smooth[here + width - 1]! + smooth[here + width + 1]!
      const vertical = -smooth[here - width - 1]! - 2 * smooth[here - width]! - smooth[here - width + 1]! + smooth[here + width - 1]! + 2 * smooth[here + width]! + smooth[here + width + 1]!
      const size = Math.hypot(horizontal, vertical)
      magnitude[here] = size / (Math.SQRT2 * 4)
      if (size > 0) {
        stepX[here] = Math.round(horizontal / size)
        stepY[here] = Math.round(vertical / size)
      }
    }
  }

  const strengths = new Uint8Array(count)
  const ridge = new Uint8Array(count)
  if (normalized) {
    // a weak (coarse) edge is measured on its own: the clear-edge value is found among the crests and made 128, so that weak edges keep their resolution
    let strongest = 0
    for (let here = 0; here < count; here += 1) if (magnitude[here]! > strongest) strongest = magnitude[here]!
    const bins = new Uint32Array(1024)
    const binOf = (size: number) => Math.min(1023, Math.floor((size / Math.max(strongest, 1e-6)) * 1023))
    let crests = 0
    const isCrest = new Uint8Array(count)
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const here = y * width + x
        const along = stepY[here]! * width + stepX[here]!
        if (along !== 0 && magnitude[here]! >= magnitude[here + along]! && magnitude[here]! >= magnitude[here - along]!) {
          isCrest[here] = 1
          if (magnitude[here]! >= noise) {
            bins[binOf(magnitude[here]!)]! += 1
            crests += 1
          }
        }
      }
    }
    let clear = Math.max(noise, floor)
    if (crests > 0) {
      let seen = 0
      for (let bin = 1023; bin >= 0; bin -= 1) {
        seen += bins[bin]!
        if (seen >= crests * 0.04) {
          clear = Math.max(clear, (bin / 1023) * strongest)
          break
        }
      }
    }
    const hill = new Uint8Array(count)
    for (let here = 0; here < count; here += 1) {
      const size = magnitude[here]!
      strengths[here] = Math.min(255, Math.round(size))
      ridge[here] = Math.min(255, Math.round(((isCrest[here] ? size : size * 0.3) / clear) * 128))
      hill[here] = Math.min(255, Math.round((size / clear) * 128))
    }
    return { strengths, ridge, scale: 128, hill }
  }
  const histogram = new Uint32Array(256)
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const here = y * width + x
      const size = magnitude[here]!
      strengths[here] = Math.min(255, Math.round(size))
      const along = stepY[here]! * width + stepX[here]!
      const crest = along !== 0 && size >= magnitude[here + along]! && size >= magnitude[here - along]!
      // what is not on a crest keeps a little, so a gap in an edge does not cut the wire off from it
      ridge[here] = Math.min(255, Math.round(crest ? size : size * 0.3))
      if (crest && ridge[here]! >= noise) histogram[ridge[here]!]! += 1
    }
  }
  // a clear edge is one of the strongest few percent of the crests of this picture
  let total = 0
  for (let value = 0; value < 256; value += 1) total += histogram[value]!
  let scale = 255
  if (total > 0) {
    let seen = 0
    for (let value = 255; value >= noise; value -= 1) {
      seen += histogram[value]!
      if (seen >= total * 0.04) {
        scale = value
        break
      }
    }
  }
  return { strengths, ridge, scale: Math.max(floor, Math.min(255, scale)), hill: undefined as Uint8Array | undefined }
}

/** the edge closest to a point, or the point itself where there is no edge within `radius` */
export function nearestMagneticEdge(map: MagneticEdgeMap, point: MagneticPoint, radius: number): MagneticPoint {
  const centerX = Math.round(point.x)
  const centerY = Math.round(point.y)
  const reach = Math.max(0, Math.ceil(radius))
  let best = { x: centerX, y: centerY }
  let bestScore = -1
  for (let y = Math.max(1, centerY - reach); y <= Math.min(map.height - 2, centerY + reach); y += 1) {
    for (let x = Math.max(1, centerX - reach); x <= Math.min(map.width - 2, centerX + reach); x += 1) {
      const distance = Math.hypot(x - point.x, y - point.y)
      if (distance > radius) continue
      const strength = edgenessAt(map, y * map.width + x)
      const score = strength - (radius > 0 ? (distance / radius) * 0.24 : 0)
      if (score > bestScore) {
        bestScore = score
        best = { x, y }
      }
    }
  }
  return bestScore >= 0.08 ? best : { x: Math.max(0, Math.min(map.width - 1, point.x)), y: Math.max(0, Math.min(map.height - 1, point.y)) }
}

// ── the live wire ──────────────────────────────────────────────────────────────────

/** what a step across a pixel with no edge in it costs, compared to a step along the strongest edge */
const COST_FLOOR = 0.03
/** the most pixels a search looks at before it gives up and draws a straight line */
const WIRE_WORK_LIMIT = 90000
const STEPS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]

class MinHeap {
  private keys = new Float32Array(1024)
  private values = new Int32Array(1024)
  size = 0

  push(key: number, value: number) {
    if (this.size === this.keys.length) {
      const keys = new Float32Array(this.size * 2)
      const values = new Int32Array(this.size * 2)
      keys.set(this.keys)
      values.set(this.values)
      this.keys = keys
      this.values = values
    }
    let child = this.size++
    while (child > 0) {
      const parent = (child - 1) >> 1
      if (this.keys[parent]! <= key) break
      this.keys[child] = this.keys[parent]!
      this.values[child] = this.values[parent]!
      child = parent
    }
    this.keys[child] = key
    this.values[child] = value
  }

  /** the value with the smallest key; its key is left in `lastKey` */
  lastKey = 0
  pop() {
    const value = this.values[0]!
    this.lastKey = this.keys[0]!
    const key = this.keys[--this.size]!
    const last = this.values[this.size]!
    let parent = 0
    for (;;) {
      let child = parent * 2 + 1
      if (child >= this.size) break
      if (child + 1 < this.size && this.keys[child + 1]! < this.keys[child]!) child += 1
      if (this.keys[child]! >= key) break
      this.keys[parent] = this.keys[child]!
      this.values[parent] = this.values[child]!
      parent = child
    }
    this.keys[parent] = key
    this.values[parent] = last
    return value
  }
}

const insideMap = (map: MagneticEdgeMap, point: MagneticPoint) => ({
  x: Math.max(1, Math.min(map.width - 2, Math.round(point.x))),
  y: Math.max(1, Math.min(map.height - 2, Math.round(point.y))),
})

/**
 * The cheapest way from one pixel to another over the edge map, where a step costs little on an edge and much anywhere else
 * (Dijkstra's search, the "live wire" of intelligent scissors): the path follows the edge around bends and corners, and takes the
 * short way where there is none. The result is every pixel after `from`, up to and including `to`.
 */
export function liveWirePath(map: MagneticEdgeMap, from: MagneticPoint, to: MagneticPoint): MagneticPoint[] {
  if (map.width < 3 || map.height < 3) return []
  const start = insideMap(map, from)
  const goal = insideMap(map, to)
  if (start.x === goal.x && start.y === goal.y) return []

  // the search stays near the straight line between the two, which keeps it fast and keeps the wire from wandering off to another edge
  const margin = Math.min(48, Math.max(12, Math.ceil(Math.hypot(goal.x - start.x, goal.y - start.y) * 0.25) + 8))
  const x0 = Math.max(1, Math.min(start.x, goal.x) - margin)
  const x1 = Math.min(map.width - 2, Math.max(start.x, goal.x) + margin)
  const y0 = Math.max(1, Math.min(start.y, goal.y) - margin)
  const y1 = Math.min(map.height - 2, Math.max(start.y, goal.y) + margin)
  const width = x1 - x0 + 1
  const count = width * (y1 - y0 + 1)

  const ridge = map.ridge ?? map.strengths
  const scale = map.scale ?? 255
  const stepCost = new Float32Array(256)
  for (let value = 0; value < 256; value += 1) stepCost[value] = COST_FLOOR + (1 - COST_FLOOR) * (1 - Math.min(1, value / scale)) ** 2

  const best = new Float32Array(count).fill(Infinity)
  const before = new Int32Array(count).fill(-1)
  const heap = new MinHeap()
  const first = (start.y - y0) * width + (start.x - x0)
  const last = (goal.y - y0) * width + (goal.x - x0)
  best[first] = 0
  heap.push(0, first)
  let worked = 0
  while (heap.size > 0) {
    const here = heap.pop()
    if (heap.lastKey > best[here]!) continue
    if (here === last) break
    // over a stretch with no edge to follow the search would go on over the whole window: the straight way is what it would find
    if (++worked > WIRE_WORK_LIMIT) return straightPath(start, goal)
    const hereX = here % width
    const hereY = (here - hereX) / width
    for (const [stepX, stepY] of STEPS) {
      const x = hereX + stepX
      const y = hereY + stepY
      if (x < 0 || y < 0 || x >= width || y >= count / width) continue
      const next = y * width + x
      const cost = heap.lastKey + stepCost[ridge[(y + y0) * map.width + x + x0]!]! * (stepX !== 0 && stepY !== 0 ? Math.SQRT2 : 1)
      if (cost < best[next]!) {
        best[next] = cost
        before[next] = here
        heap.push(cost, next)
      }
    }
  }
  if (before[last] === -1) return []
  const path: MagneticPoint[] = []
  for (let at = last; at !== first && at !== -1; at = before[at]!) path.push({ x: (at % width) + x0, y: Math.floor(at / width) + y0 })
  return path.reverse()
}

function straightPath(from: MagneticPoint, to: MagneticPoint): MagneticPoint[] {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y))
  const path: MagneticPoint[] = []
  for (let step = 1; step <= steps; step += 1) path.push({ x: Math.round(from.x + ((to.x - from.x) * step) / steps), y: Math.round(from.y + ((to.y - from.y) * step) / steps) })
  return path
}

/** the wire from `from` to the edge nearest `to` (the pixels after `from`) */
export function appendMagneticSegment(map: MagneticEdgeMap, from: MagneticPoint, to: MagneticPoint, radius: number): MagneticPoint[] {
  return liveWirePath(map, from, nearestMagneticEdge(map, to, radius))
}

// ── tracing ────────────────────────────────────────────────────────────────────────

/** The line being traced: the part that is fixed (it ends in the last anchor) and the live wire from there to the pointer. */
export interface MagneticTrace {
  points: MagneticPoint[]
  /** the places of the anchors in `points` */
  anchorIndices: number[]
  tail: MagneticPoint[]
}

export interface MagneticTraceOptions {
  /** how far (in map pixels) the pointer snaps to an edge */
  radius: number
  /** a stretch of the wire that stayed the same while the pointer went on this far (map pixels) is fixed by an anchor */
  autoAnchorAfter: number
  /** ... leaving this many pixels of it loose */
  autoAnchorKeep: number
}

export function startMagneticTrace(map: MagneticEdgeMap, pointer: MagneticPoint, radius: number): MagneticTrace {
  return { points: [nearestMagneticEdge(map, pointer, radius)], anchorIndices: [0], tail: [] }
}

const commonPrefix = (a: MagneticPoint[], b: MagneticPoint[]) => {
  let length = 0
  while (length < a.length && length < b.length && a[length]!.x === b[length]!.x && a[length]!.y === b[length]!.y) length += 1
  return length
}

/** Fixed pixels the trace keeps at most; past it the line between the anchors is thinned out. */
const MAX_TRACE_POINTS = 30000

/** the pointer moved: the wire is drawn again from the last anchor to the edge nearest it, and what has stopped changing gets fixed */
export function advanceMagneticTrace(map: MagneticEdgeMap, trace: MagneticTrace, pointer: MagneticPoint, options: MagneticTraceOptions) {
  const last = trace.points[trace.points.length - 1]
  if (!last) return
  const target = nearestMagneticEdge(map, pointer, options.radius)
  const tail = liveWirePath(map, last, target)
  const stable = commonPrefix(trace.tail, tail)
  let fixed = 0
  if (stable >= options.autoAnchorAfter && stable > options.autoAnchorKeep) fixed = stable - options.autoAnchorKeep
  else if (tail.length >= options.autoAnchorAfter * 1.6) fixed = tail.length - options.autoAnchorKeep
  if (fixed > 0) {
    trace.points.push(...tail.slice(0, fixed))
    trace.anchorIndices.push(trace.points.length - 1)
    trace.tail = tail.slice(fixed)
    thinMagneticTrace(trace)
    return
  }
  trace.tail = tail
}

/** the wire as it is now becomes fixed, ending in a new anchor */
export function anchorMagneticTrace(trace: MagneticTrace) {
  if (trace.tail.length === 0) return
  trace.points.push(...trace.tail)
  trace.anchorIndices.push(trace.points.length - 1)
  trace.tail = []
  thinMagneticTrace(trace)
}

/** takes the last anchor back (with the line up to it); false when only the first point is left, which cancels the trace */
export function removeLastMagneticAnchor(trace: MagneticTrace) {
  if (trace.anchorIndices.length <= 1) return false
  trace.anchorIndices.pop()
  trace.points.length = trace.anchorIndices[trace.anchorIndices.length - 1]! + 1
  trace.tail = []
  return true
}

/** the closed line: what was traced (with the wire to the pointer too, when `withTail`), and from its end the wire back to the start */
export function closeMagneticTrace(map: MagneticEdgeMap, trace: MagneticTrace, withTail: boolean): MagneticPoint[] {
  const points = withTail ? [...trace.points, ...trace.tail] : trace.points.slice()
  const first = trace.points[0]
  const last = points[points.length - 1]
  if (!first || !last) return points
  const closing = liveWirePath(map, last, first)
  // the last pixel of the closing wire is the start itself
  return [...points, ...closing.slice(0, -1)]
}

function thinMagneticTrace(trace: MagneticTrace) {
  if (trace.points.length <= MAX_TRACE_POINTS) return
  const keep = new Set(trace.anchorIndices)
  keep.add(0)
  keep.add(trace.points.length - 1)
  const stride = Math.ceil(trace.points.length / Math.max(1, MAX_TRACE_POINTS - keep.size))
  for (let index = 0; index < trace.points.length; index += stride) keep.add(index)
  const indices = [...keep].sort((a, b) => a - b)
  const moved = new Map(indices.map((index, next) => [index, next]))
  trace.anchorIndices = trace.anchorIndices.map((index) => moved.get(index) ?? 0)
  trace.points = indices.map((index) => trace.points[index]!)
}

// ── the picture ────────────────────────────────────────────────────────────────────

export function magneticSelectionCanvas(
  source: HTMLCanvasElement,
  points: MagneticPoint[],
  mapWidth: number,
  mapHeight: number,
  operation: MagneticOperation,
  color = '#000000',
): HTMLCanvasElement {
  if (points.length < 3 || mapWidth <= 0 || mapHeight <= 0) throw new Error('יש לסגור בחירה של שלוש נקודות לפחות.')
  const output = document.createElement('canvas')
  output.width = source.width
  output.height = source.height
  const context = output.getContext('2d')
  if (!context) throw new Error('הדפדפן לא הצליח להכין משטח לעיבוד הבחירה.')
  context.drawImage(source, 0, 0)
  context.beginPath()
  points.forEach((point, index) => {
    const x = mapToSource(point.x, mapWidth, source.width)
    const y = mapToSource(point.y, mapHeight, source.height)
    if (index === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  })
  context.closePath()
  if (operation === 'fill') {
    context.globalCompositeOperation = 'source-over'
    context.fillStyle = color
  } else if (operation === 'delete') {
    context.globalCompositeOperation = 'destination-out'
    context.fillStyle = '#000000'
  } else {
    context.globalCompositeOperation = 'destination-in'
    context.fillStyle = '#ffffff'
  }
  context.fill()
  return output
}

/** the longest side the edge map has; a bigger picture is measured at this size (the selection is still made on the full picture) */
const MAP_SIZE = 2048

export function prepareMagneticEdgeMap(source: HTMLCanvasElement, maxDimension = MAP_SIZE): MagneticEdgeMap {
  const scale = Math.min(1, maxDimension / Math.max(source.width, source.height))
  const width = Math.max(3, Math.round(source.width * scale))
  const height = Math.max(3, Math.round(source.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('הדפדפן לא הצליח להכין משטח לזיהוי קצוות.')
  context.drawImage(source, 0, 0, width, height)
  return { width, height, ...edgeFieldOf(context.getImageData(0, 0, width, height).data, width, height) }
}
