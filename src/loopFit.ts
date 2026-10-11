import { fitCubic, type Vec } from './curveFit'

/**
 * A closed line made of many short steps (the edge of a traced picture) described by as few points as it can be, with curve handles.
 * The line is cut at its sharp corners; each piece between two corners is fitted with cubic curves (the pencil tool's fitting, see
 * curveFit.ts) that stay within a tolerance of it.
 */

export type Pt = [number, number]

/** a point of the fitted line: handles are offsets from the point (the curve arriving at it, and the one leaving it) */
export interface LoopPoint {
  p: Pt
  hi?: Pt
  ho?: Pt
}

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y })
const unit = (a: Vec): Vec => {
  const size = Math.hypot(a.x, a.y)
  return size > 1e-12 ? { x: a.x / size, y: a.y / size } : { x: 0, y: 0 }
}
const vec = (p: Pt): Vec => ({ x: p[0], y: p[1] })

/** the angle (degrees) the line turns at each point, seen over `reach` steps either side */
function turnings(loop: Pt[], reach: number): number[] {
  const n = loop.length
  return loop.map((p, i) => {
    const a = unit(sub(vec(p), vec(loop[(i - reach + n * 2) % n]!)))
    const b = unit(sub(vec(loop[(i + reach) % n]!), vec(p)))
    return (Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y))) * 180) / Math.PI
  })
}

/**
 * The points (with handles) of a closed line. Where the line turns by more than `cornerDegrees` there is a corner, which stays a
 * point with a sharp turn; between corners the curves stay within `tolerance` of the line. The steps of the line should be about
 * one unit long.
 */
export function fitClosedLoop(loop: Pt[], tolerance: number, cornerDegrees: number): LoopPoint[] {
  const n = loop.length
  if (n < 4) return loop.map((p) => ({ p }))
  const reach = Math.max(2, Math.min(5, Math.floor(n / 8)))
  const turn = turnings(loop, reach)
  // the corners: where the turn is over the limit and is the biggest nearby
  const corners: number[] = []
  for (let i = 0; i < n; i += 1) {
    if (turn[i]! < cornerDegrees) continue
    let biggest = true
    for (let j = 1; j <= reach && biggest; j += 1) {
      if (turn[(i - j + n) % n]! >= turn[i]! || turn[(i + j) % n]! > turn[i]!) biggest = false
    }
    if (biggest) corners.push(i)
  }
  const error = Math.max(1e-3, tolerance)
  const curves: ReturnType<typeof fitCubic> = []
  /** the points of the line from step `from` to step `to` (going round the end of the list when `to` is before `from`) */
  const walk = (from: number, to: number): Vec[] => {
    const points: Vec[] = []
    for (let i = from; ; i += 1) {
      points.push(vec(loop[i % n]!))
      if (i === to || points.length > n + 1) break
    }
    return points
  }
  if (corners.length === 0) {
    // a smooth closed line: one piece that begins and ends at the same point, and goes on smoothly there
    const d = walk(0, n)
    const t1 = unit(sub(vec(loop[1]!), vec(loop[n - 1]!)))
    curves.push(...fitCubic(d, t1, { x: -t1.x, y: -t1.y }, error))
  } else {
    for (let c = 0; c < corners.length; c += 1) {
      const from = corners[c]!
      const next = corners[(c + 1) % corners.length]!
      const to = next > from ? next : next + n
      const d = walk(from, to)
      if (d.length < 2) continue
      const look = Math.min(reach, d.length - 1)
      const t1 = unit(sub(d[look]!, d[0]!))
      const t2 = unit(sub(d[d.length - 1 - look]!, d[d.length - 1]!))
      curves.push(...fitCubic(d, t1, t2, error))
    }
  }
  if (curves.length === 0) return loop.map((p) => ({ p }))
  // the points of the line: where a curve begins, with the handle that leaves it and the one of the curve before that arrives
  const small = 1e-3
  return curves.map((curve, index) => {
    const before = curves[(index - 1 + curves.length) % curves.length]!
    const ho = sub(curve[1], curve[0])
    const hi = sub(before[2], curve[0])
    const out: LoopPoint = { p: [curve[0].x, curve[0].y] }
    if (Math.hypot(hi.x, hi.y) > small) out.hi = [hi.x, hi.y]
    if (Math.hypot(ho.x, ho.y) > small) out.ho = [ho.x, ho.y]
    return out
  })
}
