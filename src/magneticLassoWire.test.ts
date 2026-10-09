import { describe, expect, it } from 'vitest'
import {
  adjustMagneticPath,
  advanceMagneticTrace,
  anchorMagneticTrace,
  closeMagneticTrace,
  edgeFieldOf,
  liveWirePath,
  mapToSource,
  removeLastMagneticAnchor,
  sourceToMap,
  startMagneticTrace,
  type MagneticEdgeMap,
  type MagneticPoint,
  type MagneticTrace,
} from './magneticLasso'

const SIZE = 240
const CENTER = 120
const RADIUS = 70

/** a light disc on a darker, noisy ground: the kind of edge a photograph has */
function discPicture(noise: number) {
  const rgba = new Uint8ClampedArray(SIZE * SIZE * 4)
  let seed = 12345
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296 - 0.5
  }
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const inside = Math.hypot(x + 0.5 - CENTER, y + 0.5 - CENTER) <= RADIUS
      const base = inside ? 200 : 70 + (x / SIZE) * 25
      const value = Math.max(0, Math.min(255, base + random() * noise))
      const offset = (y * SIZE + x) * 4
      rgba[offset] = value
      rgba[offset + 1] = value
      rgba[offset + 2] = value
      rgba[offset + 3] = 255
    }
  }
  return rgba
}

function mapOf(noise: number): MagneticEdgeMap {
  const picture = discPicture(noise)
  return { width: SIZE, height: SIZE, ...edgeFieldOf(picture, SIZE, SIZE) }
}

const distanceFromDisc = (point: MagneticPoint) => Math.abs(Math.hypot(point.x + 0.5 - CENTER, point.y + 0.5 - CENTER) - RADIUS)
const onCircle = (degrees: number, offset = 0): MagneticPoint => ({
  x: CENTER + (RADIUS + offset) * Math.cos((degrees * Math.PI) / 180),
  y: CENTER + (RADIUS + offset) * Math.sin((degrees * Math.PI) / 180),
})
/** the area of a closed line, by the shoelace formula */
const areaOf = (points: MagneticPoint[]) => {
  let sum = 0
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!
    const next = points[(index + 1) % points.length]!
    sum += point.x * next.y - next.x * point.y
  }
  return Math.abs(sum) / 2
}

describe('the edge field', () => {
  it('puts the crest of an edge on the edge, one pixel thick, and weighs it against the picture', () => {
    const map = mapOf(0)
    // along the row through the middle of the disc the strongest pixel of the ridge is at the border of the disc
    const row = CENTER
    const ridge = map.ridge!
    let strongest = 0
    for (let x = 0; x < SIZE; x += 1) if (ridge[row * SIZE + x]! > ridge[row * SIZE + strongest]!) strongest = x
    expect(Math.abs(strongest + 0.5 - (CENTER - RADIUS))).toBeLessThanOrEqual(1.5)
    expect(map.scale!).toBeGreaterThan(24)
  })

  it('converts between source positions and map pixels without a half-pixel shift', () => {
    expect(mapToSource(0, 100, 200)).toBe(1)
    expect(sourceToMap(1, 100, 200)).toBe(0)
    expect(sourceToMap(mapToSource(37, 1024, 4096), 1024, 4096)).toBeCloseTo(37, 9)
  })
})

describe('the live wire', () => {
  it('follows the bend of an edge instead of cutting across it', () => {
    const map = mapOf(0)
    // a quarter of the circle: the straight line between the ends goes 20 pixels inside the disc
    const from = onCircle(0)
    const to = onCircle(90)
    const path = liveWirePath(map, from, to)
    expect(path.length).toBeGreaterThan(80)
    const worst = Math.max(...path.map(distanceFromDisc))
    expect(worst).toBeLessThanOrEqual(1.6)
    expect(path[path.length - 1]).toEqual({ x: Math.round(to.x), y: Math.round(to.y) })
  })

  it('stays on the edge in a noisy picture', () => {
    const map = mapOf(60)
    const path = liveWirePath(map, onCircle(30), onCircle(120))
    const mean = path.reduce((sum, point) => sum + distanceFromDisc(point), 0) / path.length
    expect(mean).toBeLessThanOrEqual(1.5)
    expect(Math.max(...path.map(distanceFromDisc))).toBeLessThanOrEqual(4)
  })

  it('takes the short way where there is no edge', () => {
    const map = { width: 60, height: 60, strengths: new Uint8Array(3600) }
    const path = liveWirePath(map, { x: 10, y: 10 }, { x: 40, y: 10 })
    expect(path).toHaveLength(30)
    expect(path.every((point) => point.y === 10)).toBe(true)
  })
})

describe('tracing along an edge', () => {
  const options = { radius: 8, autoAnchorAfter: 40, autoAnchorKeep: 8 }

  /** the pointer walks round the disc a few pixels off the edge, the way a hand does */
  function walk(map: MagneticEdgeMap, noise: number) {
    const trace: MagneticTrace = startMagneticTrace(map, onCircle(0, 3), options.radius)
    let seed = 7
    for (let degrees = 2; degrees <= 358; degrees += 2) {
      seed = (seed * 1664525 + 1013904223) >>> 0
      const wobble = ((seed / 4294967296) - 0.5) * 2 * noise
      advanceMagneticTrace(map, trace, onCircle(degrees, wobble), options)
    }
    return trace
  }

  it('closes a selection that matches the disc, though the pointer wobbled by up to four pixels', () => {
    const map = mapOf(30)
    const trace = walk(map, 4)
    anchorMagneticTrace(trace)
    const closed = closeMagneticTrace(map, trace, false)
    expect(closed.length).toBeGreaterThan(300)
    const mean = closed.reduce((sum, point) => sum + distanceFromDisc(point), 0) / closed.length
    expect(mean).toBeLessThanOrEqual(1.3)
    const disc = Math.PI * RADIUS * RADIUS
    expect(Math.abs(areaOf(closed) - disc) / disc).toBeLessThanOrEqual(0.03)
  })

  it('fixes anchors by itself while the pointer follows the edge', () => {
    const map = mapOf(0)
    const trace = walk(map, 2)
    expect(trace.anchorIndices.length).toBeGreaterThan(4)
    // the fixed part ends in an anchor, and the loose wire is short
    expect(trace.anchorIndices[trace.anchorIndices.length - 1]).toBe(trace.points.length - 1)
    expect(trace.tail.length).toBeLessThan(options.autoAnchorAfter + options.autoAnchorKeep + 20)
  })

  it('takes the last anchor back, and gives up when only the start is left', () => {
    const map = mapOf(0)
    const trace = startMagneticTrace(map, onCircle(0), options.radius)
    advanceMagneticTrace(map, trace, onCircle(20), options)
    anchorMagneticTrace(trace)
    advanceMagneticTrace(map, trace, onCircle(40), options)
    anchorMagneticTrace(trace)
    expect(trace.anchorIndices).toHaveLength(3)
    const before = trace.points.length
    expect(removeLastMagneticAnchor(trace)).toBe(true)
    expect(trace.anchorIndices).toHaveLength(2)
    expect(trace.points.length).toBeLessThan(before)
    expect(removeLastMagneticAnchor(trace)).toBe(true)
    expect(trace.points).toHaveLength(1)
    expect(removeLastMagneticAnchor(trace)).toBe(false)
  })
})

describe('the plus and minus brushes on a soft, spotted picture', () => {
  const SIDE = 300
  const MIDDLE = 150
  const EDGE = 90

  /** a shape with a soft edge (about fifteen pixels wide) and dark spots just inside it, on a noisy sky */
  function softPicture() {
    const rgba = new Uint8ClampedArray(SIDE * SIDE * 4)
    let seed = 99
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296 - 0.5
    }
    for (let y = 0; y < SIDE; y += 1) {
      for (let x = 0; x < SIDE; x += 1) {
        const dx = x + 0.5 - MIDDLE
        const dy = y + 0.5 - MIDDLE
        const radius = Math.hypot(dx, dy)
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI
        const sky = 215 - (y / SIDE) * 40
        const inside = 1 / (1 + Math.exp((radius - EDGE) / 3.5))
        let value = sky * (1 - inside) + 130 * inside
        // twelve dark spots, between 10 and 20 pixels inside the edge
        const spotAngle = Math.round(angle / 30) * 30
        const spotX = MIDDLE + (EDGE - 15) * Math.cos((spotAngle * Math.PI) / 180)
        const spotY = MIDDLE + (EDGE - 15) * Math.sin((spotAngle * Math.PI) / 180)
        if (Math.hypot(x + 0.5 - spotX, y + 0.5 - spotY) < 5) value = 35
        value = Math.max(0, Math.min(255, value + random() * 14))
        const offset = (y * SIDE + x) * 4
        rgba[offset] = value
        rgba[offset + 1] = value
        rgba[offset + 2] = value
        rgba[offset + 3] = 255
      }
    }
    return rgba
  }

  const mapOfSoft = (): MagneticEdgeMap => ({ width: SIDE, height: SIDE, ...edgeFieldOf(softPicture(), SIDE, SIDE) })
  const lineAround = (radius: number) => {
    const line: MagneticPoint[] = []
    for (let step = 0; step < 4000; step += 1) {
      const to = { x: Math.round(MIDDLE + radius * Math.cos((step / 4000) * Math.PI * 2)), y: Math.round(MIDDLE + radius * Math.sin((step / 4000) * Math.PI * 2)) }
      const last = line[line.length - 1]
      if (!last || last.x !== to.x || last.y !== to.y) line.push(to)
    }
    return line
  }
  const errors = (line: MagneticPoint[]) => line.map((point) => Math.abs(Math.hypot(point.x + 0.5 - MIDDLE, point.y + 0.5 - MIDDLE) - EDGE))

  it('brings a line that stopped inside the soft edge, short of dark spots, out to the edge with the plus circle', () => {
    const map = mapOfSoft()
    let line = lineAround(EDGE - 14)
    const settled = new Set<number>()
    for (let degrees = 0; degrees <= 363; degrees += 3) {
      const at = EDGE - 14 - 10
      line = adjustMagneticPath(line, { x: MIDDLE + at * Math.cos((degrees * Math.PI) / 180), y: MIDDLE + at * Math.sin((degrees * Math.PI) / 180) }, map, 25, 'expand', settled)
    }
    const off = errors(line)
    expect(off.reduce((sum, value) => sum + value, 0) / off.length).toBeLessThanOrEqual(3)
    expect(Math.max(...off)).toBeLessThanOrEqual(7)
  })

  it('brings a line that is outside the soft edge in with the minus circle', () => {
    const map = mapOfSoft()
    let line = lineAround(EDGE + 14)
    const settled = new Set<number>()
    for (let degrees = 0; degrees <= 363; degrees += 3) {
      const at = EDGE + 14 + 10
      line = adjustMagneticPath(line, { x: MIDDLE + at * Math.cos((degrees * Math.PI) / 180), y: MIDDLE + at * Math.sin((degrees * Math.PI) / 180) }, map, 25, 'contract', settled)
    }
    const off = errors(line)
    expect(off.reduce((sum, value) => sum + value, 0) / off.length).toBeLessThanOrEqual(3)
    expect(Math.max(...off)).toBeLessThanOrEqual(7)
  })
})
