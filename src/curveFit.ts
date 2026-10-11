/**
 * Fitting a smooth curve to a hand-drawn stroke (the pencil tool): Schneider's "An Algorithm for Automatically Fitting
 * Digitized Curves" (Graphics Gems, 1990). It finds the FEWEST cubic Bezier segments whose curve stays within `error` of
 * every sampled point, and joins them tangent-continuously, so a bigger `error` gives fewer anchor points — down to just
 * two, one at each end, with a handle each, when the whole stroke fits a single curve.
 */

export interface Vec {
  x: number
  y: number
}

/** an anchor of the fitted path; the handles are offsets from the anchor (the first point has only `ho`, the last only `hi`) */
export interface FittedPoint extends Vec {
  hi?: Vec
  ho?: Vec
}

export type Bezier = [Vec, Vec, Vec, Vec]

const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y })
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y })
const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k })
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y
const length = (a: Vec) => Math.hypot(a.x, a.y)
const unit = (a: Vec): Vec => {
  const l = length(a)
  return l > 1e-12 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 }
}

const b0 = (u: number) => (1 - u) ** 3
const b1 = (u: number) => 3 * u * (1 - u) ** 2
const b2 = (u: number) => 3 * u * u * (1 - u)
const b3 = (u: number) => u ** 3

const at = (b: Bezier, u: number): Vec => add(add(mul(b[0], b0(u)), mul(b[1], b1(u))), add(mul(b[2], b2(u)), mul(b[3], b3(u))))

function chordLengthParameters(points: Vec[]): number[] {
  const u = [0]
  for (let i = 1; i < points.length; i++) u.push(u[i - 1] + length(sub(points[i], points[i - 1])))
  const total = u[u.length - 1] || 1
  return u.map((value) => value / total)
}

/** least-squares curve through `points` with the end tangents fixed: only the two handle lengths are free */
function generateBezier(points: Vec[], u: number[], tangent1: Vec, tangent2: Vec): Bezier {
  const first = points[0]
  const last = points[points.length - 1]
  let c00 = 0
  let c01 = 0
  let c11 = 0
  let x0 = 0
  let x1 = 0
  for (let i = 0; i < points.length; i++) {
    const a0 = mul(tangent1, b1(u[i]))
    const a1 = mul(tangent2, b2(u[i]))
    c00 += dot(a0, a0)
    c01 += dot(a0, a1)
    c11 += dot(a1, a1)
    const rest = sub(points[i], add(mul(first, b0(u[i]) + b1(u[i])), mul(last, b2(u[i]) + b3(u[i]))))
    x0 += dot(a0, rest)
    x1 += dot(a1, rest)
  }
  const det = c00 * c11 - c01 * c01
  const chord = length(sub(last, first))
  let alphaFirst = 0
  let alphaLast = 0
  if (Math.abs(det) > 1e-12) {
    alphaFirst = (x0 * c11 - x1 * c01) / det
    alphaLast = (c00 * x1 - c01 * x0) / det
  }
  const epsilon = 1e-6 * chord
  // a degenerate or backwards solution: fall back to handles a third of the chord long
  if (alphaFirst < epsilon || alphaLast < epsilon) alphaFirst = alphaLast = chord / 3
  return [first, add(first, mul(tangent1, alphaFirst)), add(last, mul(tangent2, alphaLast)), last]
}

/** one Newton-Raphson step moving the parameter `u` to where the curve is closest to `point` */
function refine(b: Bezier, point: Vec, u: number): number {
  const d1 = [sub(b[1], b[0]), sub(b[2], b[1]), sub(b[3], b[2])].map((v) => mul(v, 3))
  const d2 = [sub(d1[1], d1[0]), sub(d1[2], d1[1])].map((v) => mul(v, 2))
  const q = at(b, u)
  const q1 = add(add(mul(d1[0], (1 - u) ** 2), mul(d1[1], 2 * u * (1 - u))), mul(d1[2], u * u))
  const q2 = add(mul(d2[0], 1 - u), mul(d2[1], u))
  const numerator = dot(sub(q, point), q1)
  const denominator = dot(q1, q1) + dot(sub(q, point), q2)
  return Math.abs(denominator) < 1e-12 ? u : u - numerator / denominator
}

function maxDeviation(points: Vec[], b: Bezier, u: number[]): { squared: number; index: number } {
  let squared = 0
  let index = Math.floor(points.length / 2)
  for (let i = 1; i < points.length - 1; i++) {
    const d = sub(at(b, u[i]), points[i])
    const value = dot(d, d)
    if (value >= squared) {
      squared = value
      index = i
    }
  }
  return { squared, index }
}

/** the fewest cubic curves through `points` (an open line) with the tangents given at its two ends, each point within `error` of them */
export function fitCubic(points: Vec[], tangent1: Vec, tangent2: Vec, error: number): Bezier[] {
  const n = points.length
  if (n === 2) {
    const dist = length(sub(points[1], points[0])) / 3
    return [[points[0], add(points[0], mul(tangent1, dist)), add(points[1], mul(tangent2, dist)), points[1]]]
  }
  let u = chordLengthParameters(points)
  let bezier = generateBezier(points, u, tangent1, tangent2)
  let { squared, index } = maxDeviation(points, bezier, u)
  const limit = error * error
  if (squared < limit) return [bezier]
  // close: a few rounds of nudging each sample's parameter onto the curve often make it fit
  if (squared < limit * 16) {
    for (let round = 0; round < 4; round++) {
      u = u.map((value, i) => refine(bezier, points[i], value))
      bezier = generateBezier(points, u, tangent1, tangent2)
      ;({ squared, index } = maxDeviation(points, bezier, u))
      if (squared < limit) return [bezier]
    }
  }
  // no: split where it is worst; both halves share the tangent there so the join stays smooth
  const center = unit(sub(points[index - 1], points[index + 1]))
  return [...fitCubic(points.slice(0, index + 1), tangent1, center, error), ...fitCubic(points.slice(index), mul(center, -1), tangent2, error)]
}

/**
 * The anchors (with handles) of a smooth path through the stroke `raw`, never more than `error` away from any sample.
 * `error === Infinity` forces a single segment: exactly two anchors.
 */
export function fitPath(raw: Vec[], error: number): FittedPoint[] {
  const points: Vec[] = []
  for (const p of raw) if (points.length === 0 || length(sub(p, points[points.length - 1])) > 1e-6) points.push(p)
  if (points.length < 2) return points.map((p) => ({ ...p }))
  // tangents at the ends come from a few samples in, not the very first pair (the pointer's jitter would tilt them)
  const look = Math.min(3, points.length - 1)
  const tangentStart = unit(sub(points[look], points[0]))
  const tangentEnd = unit(sub(points[points.length - 1 - look], points[points.length - 1]))
  const segments = fitCubic(points, tangentStart, tangentEnd, error)
  const out: FittedPoint[] = [{ x: segments[0][0].x, y: segments[0][0].y, ho: sub(segments[0][1], segments[0][0]) }]
  segments.forEach((s, i) => {
    const next = segments[i + 1]
    out.push({ x: s[3].x, y: s[3].y, hi: sub(s[2], s[3]), ...(next ? { ho: sub(next[1], next[0]) } : {}) })
  })
  return out
}
