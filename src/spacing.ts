/**
 * Distances between objects while one is being moved: the gap to its neighbour on each side is measured and shown, and
 * when it can be made equal to another gap (the other side's, or one that already exists between two other objects) the
 * moved object is held there and the equal gaps are marked as equal.
 */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** A measured gap. axis 'v': a vertical stretch at x = `at` from y = `from` to `to`; axis 'h': a horizontal stretch at y = `at`. */
export interface SpacingMark {
  axis: 'v' | 'h'
  from: number
  to: number
  at: number
  value: number
  /** the same as another gap that is shown with it */
  equal: boolean
}

interface Ax {
  lo: (r: Rect) => number
  hi: (r: Rect) => number
  plo: (r: Rect) => number
  phi: (r: Rect) => number
}
const AX: Record<'v' | 'h', Ax> = {
  v: { lo: (r) => r.y, hi: (r) => r.y + r.h, plo: (r) => r.x, phi: (r) => r.x + r.w },
  h: { lo: (r) => r.x, hi: (r) => r.x + r.w, plo: (r) => r.y, phi: (r) => r.y + r.h },
}

/** two gaps closer than this are the same */
const EPS = 0.01
/** objects closer than this touch: there is no gap to show */
const MIN_GAP = 0.5

interface Gap {
  a: Rect
  b: Rect
  value: number
}

/** The objects in the same row / column as `m`, the nearest one before and after it, and the gaps between the others. */
function surroundings(m: Rect, others: Rect[], ax: Ax) {
  const chain = others.filter((o) => ax.phi(o) > ax.plo(m) + EPS && ax.plo(o) < ax.phi(m) - EPS).sort((p, q) => ax.lo(p) - ax.lo(q))
  let prev: Rect | undefined
  let next: Rect | undefined
  for (const o of chain) {
    if (ax.hi(o) <= ax.lo(m) + EPS) {
      if (!prev || ax.hi(o) > ax.hi(prev)) prev = o
    } else if (ax.lo(o) >= ax.hi(m) - EPS) {
      if (!next || ax.lo(o) < ax.lo(next)) next = o
    }
  }
  // the gap of every object to the nearest one that lies wholly before it (an object that spans several others, like a text
  // frame over the whole page, is never that one, so it does not hide the gaps between the objects on it)
  const gaps: Gap[] = []
  for (const b of chain) {
    let a: Rect | undefined
    for (const o of chain) if (o !== b && ax.hi(o) <= ax.lo(b) - MIN_GAP && (!a || ax.hi(o) > ax.hi(a))) a = o
    if (a) gaps.push({ a, b, value: ax.lo(b) - ax.hi(a) })
  }
  return { prev, next, gaps }
}

/** How far `m` has to move along the axis to make a gap equal to another one; 0 when nothing is within `tol`. */
function snapDelta(m: Rect, others: Rect[], axis: 'v' | 'h', tol: number): number {
  const ax = AX[axis]
  const { prev, next, gaps } = surroundings(m, others, ax)
  const size = ax.hi(m) - ax.lo(m)
  const targets: number[] = []
  if (prev && next) {
    const room = ax.lo(next) - ax.hi(prev) - size
    if (room >= MIN_GAP * 2) targets.push(ax.hi(prev) + room / 2)
  }
  for (const g of gaps) {
    if (prev) targets.push(ax.hi(prev) + g.value)
    if (next) targets.push(ax.lo(next) - size - g.value)
  }
  let best = 0
  let bestAbs = Infinity
  for (const t of targets) {
    if (prev && t < ax.hi(prev) + MIN_GAP) continue
    if (next && t + size > ax.lo(next) - MIN_GAP) continue
    const d = t - ax.lo(m)
    if (Math.abs(d) <= tol && Math.abs(d) < bestAbs) {
      best = d
      bestAbs = Math.abs(d)
    }
  }
  return best
}

/** The gaps to show for `m` along an axis: to its neighbours, and the existing gaps that are the same as one of those. */
function marksFor(m: Rect, others: Rect[], axis: 'v' | 'h'): SpacingMark[] {
  const ax = AX[axis]
  const { prev, next, gaps } = surroundings(m, others, ax)
  const items: Gap[] = []
  if (prev && ax.lo(m) - ax.hi(prev) >= MIN_GAP) items.push({ a: prev, b: m, value: ax.lo(m) - ax.hi(prev) })
  if (next && ax.lo(next) - ax.hi(m) >= MIN_GAP) items.push({ a: m, b: next, value: ax.lo(next) - ax.hi(m) })
  const same = (x: number, y: number) => Math.abs(x - y) < EPS
  const mark = (g: Gap, equal: boolean): SpacingMark => {
    // the stretch is drawn in the middle of where the objects share the same column (or row), preferably along the moved object
    const range = (r: Rect[]) => [Math.max(...r.map(ax.plo)), Math.min(...r.map(ax.phi))]
    let [lo, hi] = range([g.a, g.b, m])
    if (hi <= lo) [lo, hi] = range([g.a, g.b])
    return { axis, from: ax.hi(g.a), to: ax.lo(g.b), at: (lo + hi) / 2, value: g.value, equal }
  }
  const out = items.map((g) => mark(g, items.some((o) => o !== g && same(o.value, g.value)) || gaps.some((o) => same(o.value, g.value))))
  for (const g of gaps) if (items.some((o) => same(o.value, g.value))) out.push(mark(g, true))
  return out
}

/**
 * The gaps around the moved box `m` (in the same coordinates as `others`), and how far `m` should be moved to make its gaps
 * equal to another gap. Only the axes allowed by `snap` are corrected.
 */
export function spacing(m: Rect, others: Rect[], tol: number, snap: { x: boolean; y: boolean }): { dx: number; dy: number; marks: SpacingMark[] } {
  let r = m
  let dx = 0
  let dy = 0
  if (snap.y) {
    dy = snapDelta(r, others, 'v', tol)
    r = { ...r, y: r.y + dy }
  }
  if (snap.x) {
    dx = snapDelta(r, others, 'h', tol)
    r = { ...r, x: r.x + dx }
  }
  return { dx, dy, marks: [...marksFor(r, others, 'v'), ...marksFor(r, others, 'h')] }
}
