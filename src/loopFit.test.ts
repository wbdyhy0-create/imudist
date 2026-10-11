import { describe, expect, it } from 'vitest'
import { fitClosedLoop, type LoopPoint, type Pt } from './loopFit'

/** points of a closed line one unit apart: the line is given by a function of the distance along it */
const circle = (radius: number, step = 1): Pt[] => {
  const count = Math.round((2 * Math.PI * radius) / step)
  return Array.from({ length: count }, (_, i) => [radius * Math.cos((i / count) * Math.PI * 2), radius * Math.sin((i / count) * Math.PI * 2)] as Pt)
}

const polygon = (corners: Pt[], step = 1): Pt[] => {
  const out: Pt[] = []
  corners.forEach((a, i) => {
    const b = corners[(i + 1) % corners.length]!
    const steps = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step))
    for (let s = 0; s < steps; s += 1) out.push([a[0] + ((b[0] - a[0]) * s) / steps, a[1] + ((b[1] - a[1]) * s) / steps])
  })
  return out
}

/** the curve made of the fitted points, as a lot of points */
function flatten(points: LoopPoint[]): Pt[] {
  const out: Pt[] = []
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length]!
    const c1: Pt = [a.p[0] + (a.ho?.[0] ?? 0), a.p[1] + (a.ho?.[1] ?? 0)]
    const c2: Pt = [b.p[0] + (b.hi?.[0] ?? 0), b.p[1] + (b.hi?.[1] ?? 0)]
    for (let s = 0; s < 400; s += 1) {
      const t = s / 400
      const u = 1 - t
      out.push([
        u * u * u * a.p[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b.p[0],
        u * u * u * a.p[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b.p[1],
      ])
    }
  })
  return out
}

/** the distance of every point of `line` from the nearest point of `curve` (the biggest) */
function farthest(line: Pt[], curve: Pt[]): number {
  let worst = 0
  for (const [x, y] of line) {
    let best = Infinity
    for (const [cx, cy] of curve) best = Math.min(best, Math.hypot(x - cx, y - cy))
    worst = Math.max(worst, best)
  }
  return worst
}

describe('fitting a closed line with a few curves', () => {
  it('describes a circle with a handful of points, and stays within the tolerance of it', () => {
    const line = circle(60)
    const fitted = fitClosedLoop(line, 0.5, 55)
    // a circle of 377 steps comes out as a few curves
    expect(line.length).toBeGreaterThan(300)
    expect(fitted.length).toBeLessThanOrEqual(8)
    expect(farthest(line, flatten(fitted))).toBeLessThan(0.6)
  })

  it('keeps the corners of a square as corners, and nothing else', () => {
    const line = polygon([[0, 0], [100, 0], [100, 100], [0, 100]])
    const fitted = fitClosedLoop(line, 0.5, 55)
    expect(fitted.length).toBeLessThanOrEqual(6)
    expect(farthest(line, flatten(fitted))).toBeLessThan(0.6)
    // the four corners of the square are points of the line
    for (const corner of [[0, 0], [100, 0], [100, 100], [0, 100]]) {
      expect(fitted.some((point) => Math.hypot(point.p[0] - corner[0]!, point.p[1] - corner[1]!) < 1.5)).toBe(true)
    }
  })

  it('has fewer points the more it is allowed to be off', () => {
    // a wavy closed line: a circle with ripples
    const count = 400
    const line: Pt[] = Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2
      const radius = 50 + 4 * Math.sin(angle * 7)
      return [radius * Math.cos(angle), radius * Math.sin(angle)] as Pt
    })
    const tight = fitClosedLoop(line, 0.2, 80)
    const loose = fitClosedLoop(line, 2, 80)
    expect(loose.length).toBeLessThan(tight.length)
    expect(farthest(line, flatten(loose))).toBeLessThan(2.4)
    expect(farthest(line, flatten(tight))).toBeLessThan(0.3)
  })

  it('does not come apart on a very small or a degenerate line', () => {
    expect(fitClosedLoop([[0, 0], [1, 0], [1, 1]], 0.5, 55)).toHaveLength(3)
    const same: Pt[] = Array.from({ length: 12 }, () => [5, 5] as Pt)
    expect(() => fitClosedLoop(same, 0.5, 55)).not.toThrow()
  })
})
