import type { PathText, ShapeFrame } from './document'
import { shapeToPolygons } from './shapeOps'
import { normalizeRuns } from './story'

/** Text on a path: the outline of a shape as a polyline with lengths, and the parts of it the text runs along. */

export type Pt = [number, number]

export interface RingInfo {
  /** the outline in the shape's own coordinates, clockwise on the screen, without repeating the first point */
  ring: Pt[]
  /** cum[i] = length of the outline up to point i */
  cum: number[]
  total: number
}

/** The default look of new text on a path. */
export const DEFAULT_PATH_TEXT_STYLE = { fontFamily: 'Segoe UI', fontSize: 18, weight: 400, italic: false, tracking: 0 }
export const DEFAULT_PATH_TEXT_COLOR = '#111111'
export const MIN_SPAN = 0.02

const cache = new WeakMap<ShapeFrame, RingInfo | null>()
const mod1 = (v: number) => ((v % 1) + 1) % 1

/** The outline of a shape (its outer edge; a compound shape uses its first piece). Shapes are immutable, so the result is cached. */
export function ringInfo(s: ShapeFrame): RingInfo | null {
  if (cache.has(s)) return cache.get(s) ?? null
  const outer = shapeToPolygons(s)[0]?.[0]
  let info: RingInfo | null = null
  if (outer && outer.length >= 3) {
    let ring: Pt[] = outer.map(([x, y]): Pt => [x - s.x, y - s.y])
    const [f, l] = [ring[0], ring[ring.length - 1]]
    if (f[0] === l[0] && f[1] === l[1]) ring = ring.slice(0, -1)
    // shoelace: with y down a positive sum is clockwise; text outside runs clockwise
    let area = 0
    ring.forEach(([x, y], i) => {
      const [nx, ny] = ring[(i + 1) % ring.length]
      area += x * ny - nx * y
    })
    if (area < 0) ring = ring.reverse()
    const cum: number[] = []
    let total = 0
    ring.forEach((p, i) => {
      cum.push(total)
      const n = ring[(i + 1) % ring.length]
      total += Math.hypot(n[0] - p[0], n[1] - p[1])
    })
    if (total > 0) info = { ring, cum, total }
  }
  cache.set(s, info)
  return info
}

/** The point at a distance along the outline (wraps around). */
export function pointAtDistance(info: RingInfo, d: number): Pt {
  const { ring, cum, total } = info
  const dd = ((d % total) + total) % total
  // the last segment whose start is not after dd
  let lo = 0
  let hi = cum.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (cum[mid] <= dd) lo = mid
    else hi = mid - 1
  }
  const a = ring[lo]
  const b = ring[(lo + 1) % ring.length]
  const segLen = (lo + 1 < cum.length ? cum[lo + 1] : total) - cum[lo]
  const t = segLen > 0 ? (dd - cum[lo]) / segLen : 0
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

/** The point at a position on the outline, 0 … 1. */
export const pointAtFraction = (info: RingInfo, f: number): Pt => pointAtDistance(info, mod1(f) * info.total)

/**
 * The polyline of an arc of the outline: it starts at `startFrac` and covers `lenFrac` of the outline, running clockwise
 * (dir 1) or counter-clockwise (dir -1).
 */
export function arcPoints(info: RingInfo, startFrac: number, lenFrac: number, dir: 1 | -1): Pt[] {
  const { ring, cum, total } = info
  const s0 = mod1(startFrac) * total
  const s1 = s0 + dir * Math.min(1, Math.max(0, lenFrac)) * total
  const [lo, hi] = [Math.min(s0, s1), Math.max(s0, s1)]
  const found: { d: number; p: Pt }[] = [{ d: s0, p: pointAtDistance(info, s0) }]
  for (let k = Math.floor(lo / total); k <= Math.floor(hi / total); k++) {
    ring.forEach((p, i) => {
      const d = cum[i] + k * total
      if (d > lo + 1e-6 && d < hi - 1e-6) found.push({ d, p })
    })
  }
  found.push({ d: s1, p: pointAtDistance(info, s1) })
  found.sort((a, b) => dir * (a.d - b.d))
  return found.map((f) => f.p)
}

/** The nearest point of the outline to `p` (shape coordinates): its distance and its position 0 … 1. */
export function nearestOnRing(info: RingInfo, p: Pt): { dist: number; fraction: number } {
  const { ring, cum, total } = info
  let best = { dist: Infinity, fraction: 0 }
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length]
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
    const len2 = dx * dx + dy * dy
    const t = len2 > 0 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0
    const dist = Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t))
    if (dist < best.dist) best = { dist, fraction: mod1((cum[i] + t * Math.sqrt(len2)) / total) }
  })
  return best
}

/** Is the point inside the outline? */
export function pointInRing(info: RingInfo, p: Pt): boolean {
  const { ring } = info
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Does the text read right to left? Decided by its first letter of a letter script (an empty text: yes, this is a Hebrew program). */
export function isRtlText(text: string): boolean {
  const m = /[A-Za-z\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.exec(text)
  return m ? /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.test(m[0]) : true
}

/**
 * Where the text sits. The path the text is laid on runs clockwise (outside) or counter-clockwise (inside); text that
 * reads left to right starts at the anchor and runs along it, text that reads right to left ends at the anchor (its
 * first letter is on the right) and the path leads up to it.
 */
export function textPlacement(pt: PathText, used: number = pt.span) {
  const rtl = isRtlText(pt.text)
  const dir: 1 | -1 = pt.side === 'inside' ? -1 : 1
  const startFrac = rtl ? pt.anchor - dir * pt.span : pt.anchor
  /** the other end of the text: where it is cut off */
  const endFrac = rtl ? startFrac : pt.anchor + dir * pt.span
  // the middle of the letters themselves (`used` = the part of the outline they really take), not of the room they may use
  const middleFrac = rtl ? pt.anchor - (dir * used) / 2 : pt.anchor + (dir * used) / 2
  return { rtl, dir, startFrac, endFrac, middleFrac }
}

let measureContext: CanvasRenderingContext2D | null | undefined

/** How long the text is when set on one line, points. */
export function textLength(pt: PathText): number {
  if (measureContext === undefined) measureContext = document.createElement('canvas').getContext('2d')
  if (!measureContext || !pt.text) return 0
  let at = 0
  let sum = 0
  for (const r of normalizeRuns(pt.text, pt.runs, pt.style)) {
    measureContext.font = `${r.style.italic ? 'italic ' : ''}${r.style.weight} ${r.style.fontSize}px "${r.style.fontFamily}", "Segoe UI", Arial, sans-serif`
    sum += measureContext.measureText(pt.text.slice(at, at + r.len).replace(/\n/g, ' ')).width
    at += r.len
  }
  return sum
}

/** How much of the outline the letters really take (0 … 1): their length, but never more than the room `span` gives them. */
export const usedSpan = (pt: PathText, info: RingInfo) => (pt.text ? Math.min(pt.span, textLength(pt) / info.total) : pt.span)

/**
 * While the text is dragged along the outline: if its middle gets within `tol` (points) of the shape's vertical or
 * horizontal center line, the position where the middle is exactly on that line, and which line it is; otherwise null.
 */
export function snapTextToCenter(shape: ShapeFrame, info: RingInfo, pt: PathText, anchor: number, tol: number): { anchor: number; axis: 'x' | 'y' } | null {
  const centers = { x: shape.w / 2, y: shape.h / 2 }
  const used = usedSpan(pt, info)
  const middle = (a: number) => pointAtFraction(info, textPlacement({ ...pt, anchor: a }, used).middleFrac)
  let best: { anchor: number; axis: 'x' | 'y'; moved: number } | null = null
  for (const axis of ['x', 'y'] as const) {
    const i = axis === 'x' ? 0 : 1
    const diff = (a: number) => middle(a)[i] - centers[axis]
    // Newton steps on the position of the middle relative to the line
    let a = anchor
    for (let k = 0; k < 8; k++) {
      const g = diff(a)
      const h = 1e-3
      const slope = (diff(a + h) - g) / h
      if (Math.abs(g) < 1e-4 || Math.abs(slope) < 1e-6) break
      a -= g / slope
    }
    if (Math.abs(diff(a)) > 0.05) continue
    // how far along the outline that is (the shortest way round)
    const delta = Math.abs(((a - anchor + 1.5) % 1) - 0.5) * info.total
    if (delta <= tol && (!best || delta < best.moved)) best = { anchor: mod1(a), axis, moved: delta }
  }
  return best ? { anchor: best.anchor, axis: best.axis } : null
}
