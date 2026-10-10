import { describe, expect, it } from 'vitest'
import { adjustMagneticPath, appendMagneticSegment, cleanMagneticPath, edgeStrengthsOf, nearestMagneticEdge, type MagneticPoint } from './magneticLasso'

function verticalEdge(width: number, height: number) {
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      const value = x < width / 2 ? 0 : 255
      rgba[offset] = value
      rgba[offset + 1] = value
      rgba[offset + 2] = value
      rgba[offset + 3] = 255
    }
  }
  return rgba
}

/** a picture 40 by 40 with one clear horizontal edge in row `row` */
function edgeAtRow(row: number) {
  const map = { width: 40, height: 40, strengths: new Uint8Array(40 * 40) }
  for (let x = 1; x < 39; x += 1) map.strengths[row * map.width + x] = 255
  return map
}

/** a closed line round a box, one pixel apart, from the top left corner clockwise on the screen */
function boxLine(left: number, top: number, right: number, bottom: number): MagneticPoint[] {
  const points: MagneticPoint[] = []
  for (let x = left; x < right; x += 1) points.push({ x, y: top })
  for (let y = top; y < bottom; y += 1) points.push({ x: right, y })
  for (let x = right; x > left; x -= 1) points.push({ x, y: bottom })
  for (let y = bottom; y > top; y -= 1) points.push({ x: left, y })
  return points
}

const topOf = (points: MagneticPoint[], x: number) => Math.min(...points.filter((point) => point.x === x).map((point) => point.y))
const bottomOf = (points: MagneticPoint[], x: number) => Math.max(...points.filter((point) => point.x === x).map((point) => point.y))

describe('the plus and minus brushes push the line', () => {
  it('presses the line into the shape as soon as the minus circle, coming from outside, touches it, and stops it on the edge', () => {
    // the shape's top is in row 8, the edge it should have is in row 10
    const line = boxLine(5, 8, 30, 30)
    const pushed = adjustMagneticPath(line, { x: 17, y: 5 }, edgeAtRow(10), 6, 'contract')
    expect(topOf(pushed, 17)).toBe(10)
    // far from the circle the line is where it was
    expect(topOf(pushed, 26)).toBe(8)
    expect(pushed.filter((point) => point.x === 5)).toEqual(line.filter((point) => point.x === 5))
  })

  it('presses the line out of the shape from inside with the plus circle, and stops it on the edge', () => {
    // the shape's top is in row 12, the edge it should have is in row 10
    const line = boxLine(5, 12, 30, 30)
    const pushed = adjustMagneticPath(line, { x: 17, y: 15 }, edgeAtRow(10), 6, 'expand')
    expect(topOf(pushed, 17)).toBe(10)
    expect(topOf(pushed, 26)).toBe(12)
  })

  it('never bends the line round the circle: where there is no edge to go to it stays as it is', () => {
    const line = boxLine(5, 8, 30, 30)
    const flat = { width: 40, height: 40, strengths: new Uint8Array(1600) }
    expect(adjustMagneticPath(line, { x: 17, y: 5 }, flat, 6, 'contract')).toBe(line)
    expect(adjustMagneticPath(boxLine(5, 12, 30, 30), { x: 17, y: 15 }, flat, 6, 'expand')).toEqual(boxLine(5, 12, 30, 30))
  })

  it('goes to an edge that is farther than the circle reaches', () => {
    // the line is in row 8, the edge in row 16: eight pixels, though the circle is only six wide
    const pushed = adjustMagneticPath(boxLine(5, 8, 30, 30), { x: 17, y: 5 }, edgeAtRow(16), 6, 'contract')
    expect(topOf(pushed, 17)).toBe(16)
  })

  it('does nothing when the circle is on the wrong side of the line', () => {
    const line = boxLine(5, 8, 30, 30)
    // the minus circle inside the shape, and the plus circle outside it
    expect(adjustMagneticPath(line, { x: 17, y: 12 }, edgeAtRow(5), 6, 'contract')).toBe(line)
    expect(adjustMagneticPath(line, { x: 17, y: 4 }, edgeAtRow(5), 6, 'expand')).toBe(line)
  })

  it('leaves the line alone when the circle does not reach it', () => {
    const line = boxLine(5, 8, 30, 30)
    expect(adjustMagneticPath(line, { x: 17, y: 0 }, edgeAtRow(10), 5, 'contract')).toBe(line)
  })

  it('holds a line that is on an edge against a light touch, and lets go when pushed hard', () => {
    // the line is on the edge in row 8; the next edge is in row 14
    const map = edgeAtRow(8)
    for (let x = 1; x < 39; x += 1) map.strengths[14 * map.width + x] = 255
    const line = boxLine(5, 8, 30, 30)
    // a touch of one pixel: held
    expect(adjustMagneticPath(line, { x: 17, y: 3 }, map, 6, 'contract')).toBe(line)
    // the circle's centre brought down to the line: it presses the line on to the next edge
    const hard = adjustMagneticPath(line, { x: 17, y: 7 }, map, 8, 'contract')
    expect(topOf(hard, 17)).toBe(14)
  })

  it('works the same for a line drawn the other way round', () => {
    const line = boxLine(5, 8, 30, 30).reverse()
    const pushed = adjustMagneticPath(line, { x: 17, y: 5 }, edgeAtRow(10), 6, 'contract')
    expect(topOf(pushed, 17)).toBe(10)
    const grown = adjustMagneticPath(boxLine(5, 12, 30, 30).reverse(), { x: 17, y: 15 }, edgeAtRow(10), 6, 'expand')
    expect(topOf(grown, 17)).toBe(10)
  })

  it('presses the bottom and the sides of a shape the same way', () => {
    const line = boxLine(5, 8, 30, 30)
    // the minus circle below the shape pushes the bottom up
    const up = adjustMagneticPath(line, { x: 17, y: 33 }, edgeAtRow(27), 6, 'contract')
    expect(bottomOf(up, 17)).toBe(27)
  })
})

describe('sweeping the brush round a whole selection', () => {
  const SIZE = 600
  const ring = () => {
    const map = { width: SIZE, height: SIZE, strengths: new Uint8Array(SIZE * SIZE) }
    for (let step = 0; step < 3600; step += 1) {
      const x = Math.round(300 + 220 * Math.cos((step / 3600) * Math.PI * 2))
      const y = Math.round(300 + 220 * Math.sin((step / 3600) * Math.PI * 2))
      map.strengths[y * SIZE + x] = 255
    }
    return map
  }
  /** a line of neighbouring pixels round the middle, `radius` away, with a corner every `every` degrees */
  const lineAround = (radius: number, every: number) => {
    const line: MagneticPoint[] = []
    for (let degrees = 0; degrees < 360; degrees += every) {
      const to = { x: Math.round(300 + radius * Math.cos((degrees * Math.PI) / 180)), y: Math.round(300 + radius * Math.sin((degrees * Math.PI) / 180)) }
      const last = line[line.length - 1]
      if (!last) line.push(to)
      else {
        const steps = Math.max(Math.abs(to.x - last.x), Math.abs(to.y - last.y))
        for (let step = 1; step <= steps; step += 1) line.push({ x: Math.round(last.x + ((to.x - last.x) * step) / steps), y: Math.round(last.y + ((to.y - last.y) * step) / steps) })
      }
    }
    // ... and closed: the last stretch runs back to where it began
    const first = line[0]!
    const last = line[line.length - 1]!
    const closing = Math.max(Math.abs(first.x - last.x), Math.abs(first.y - last.y))
    for (let step = 1; step < closing; step += 1) line.push({ x: Math.round(last.x + ((first.x - last.x) * step) / closing), y: Math.round(last.y + ((first.y - last.y) * step) / closing) })
    return line
  }
  const sweep = (line: MagneticPoint[], at: number, mode: 'expand' | 'contract') => {
    const map = ring()
    let current = line
    const settled = new Set<number>()
    for (let degrees = 0; degrees <= 363; degrees += 3) {
      const center = { x: 300 + at * Math.cos((degrees * Math.PI) / 180), y: 300 + at * Math.sin((degrees * Math.PI) / 180) }
      current = adjustMagneticPath(current, center, map, 47, mode, settled)
    }
    return current
  }
  const offEdge = (line: MagneticPoint[]) => Math.max(...line.map((point) => Math.abs(Math.hypot(point.x - 300, point.y - 300) - 220)))

  it('brings a line that is too big down on to the edge with the minus circle, and leaves it whole', () => {
    const swept = sweep(lineAround(247, 10), 220 + 27 + 18, 'contract')
    expect(offEdge(swept)).toBeLessThanOrEqual(3)
    expect(new Set(swept.map((point) => point.x + ',' + point.y)).size).toBeGreaterThanOrEqual(swept.length * 0.99)
  })

  it('brings a line that is too small out on to the edge with the plus circle', () => {
    const swept = sweep(lineAround(190, 10), 190 - 18, 'expand')
    expect(offEdge(swept)).toBeLessThanOrEqual(3)
    expect(new Set(swept.map((point) => point.x + ',' + point.y)).size).toBeGreaterThanOrEqual(swept.length * 0.99)
  })

  it('does not shape the line when there is no edge anywhere', () => {
    const flat = { width: SIZE, height: SIZE, strengths: new Uint8Array(SIZE * SIZE) }
    const line = lineAround(250, 10)
    let current = line
    for (let degrees = 0; degrees <= 360; degrees += 3) {
      current = adjustMagneticPath(current, { x: 300 + 268 * Math.cos((degrees * Math.PI) / 180), y: 300 + 268 * Math.sin((degrees * Math.PI) / 180) }, flat, 47, 'contract')
    }
    // with no edge to go to the line may only lose its thorns: it is where it was, to within a few pixels
    const stray = current.map((point) => Math.min(...line.map((other) => Math.hypot(other.x - point.x, other.y - point.y))))
    expect(Math.max(...stray)).toBeLessThanOrEqual(3)
  })
})

describe('magnetic lasso edge detection', () => {
  it('snaps a nearby pointer to a strong image edge', () => {
    const width = 20
    const height = 20
    const map = { width, height, strengths: edgeStrengthsOf(verticalEdge(width, height), width, height) }

    const point = nearestMagneticEdge(map, { x: 7, y: 9 }, 5)

    expect(point.x).toBeGreaterThanOrEqual(8)
    expect(point.x).toBeLessThanOrEqual(11)
    expect(point.y).toBe(9)
  })

  it('follows the strongest nearby edge along a dragged segment', () => {
    const width = 20
    const height = 20
    const map = { width, height, strengths: edgeStrengthsOf(verticalEdge(width, height), width, height) }

    const points = appendMagneticSegment(map, { x: 9, y: 2 }, { x: 9, y: 17 }, 4)

    expect(points.length).toBeGreaterThan(5)
    expect(points.every((point) => point.x >= 8 && point.x <= 11)).toBe(true)
    expect(points[0].y).toBeGreaterThan(2)
    expect(points[points.length - 1].y).toBe(17)
  })

  it('does not magnetize a flat image to nonexistent edges', () => {
    const map = { width: 10, height: 10, strengths: new Uint8Array(100) }

    expect(nearestMagneticEdge(map, { x: 3.5, y: 4.5 }, 4)).toEqual({ x: 3.5, y: 4.5 })
  })
})

describe('cleaning a line after a brush stroke', () => {
  it('takes the small waves out of the places that were settled, and leaves the rest alone', () => {
    const SIZE = 300
    const wavy: MagneticPoint[] = []
    for (let step = 0; step < 4000; step += 1) {
      const radius = 90 + 1.5 * Math.sin((step / 4000) * Math.PI * 2 * 45)
      const point = { x: Math.round(150 + radius * Math.cos((step / 4000) * Math.PI * 2)), y: Math.round(150 + radius * Math.sin((step / 4000) * Math.PI * 2)) }
      const last = wavy[wavy.length - 1]
      if (!last || last.x !== point.x || last.y !== point.y) wavy.push(point)
    }
    const lengthOf = (line: MagneticPoint[]) => line.reduce((sum, point, index) => sum + Math.hypot(line[(index + 1) % line.length]!.x - point.x, line[(index + 1) % line.length]!.y - point.y), 0)
    const settled = new Set(wavy.map((point) => point.y * SIZE + point.x))
    const cleaned = cleanMagneticPath(wavy, settled, SIZE)
    expect(lengthOf(cleaned)).toBeLessThan(lengthOf(wavy) * 0.9)
    // it is still the same circle, to within a pixel or two, and a chain of neighbouring pixels
    const off = cleaned.map((point) => Math.abs(Math.hypot(point.x - 150, point.y - 150) - 90))
    expect(off.reduce((sum, value) => sum + value, 0) / off.length).toBeLessThanOrEqual(1.5)
    for (let index = 0; index < cleaned.length; index += 1) {
      const a = cleaned[index]!
      const b = cleaned[(index + 1) % cleaned.length]!
      expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeLessThanOrEqual(1)
    }
    // nothing settled: nothing is smoothed
    expect(lengthOf(cleanMagneticPath(wavy, new Set(), SIZE))).toBeGreaterThan(lengthOf(wavy) * 0.9)
  })
})

describe('a thorn on the line', () => {
  /** a box with its left side at x=20 and a thorn on that side, pointing out (to the left) `length` pixels at row 30 */
  function boxWithThorn(length: number) {
    const line: MagneticPoint[] = []
    for (let x = 20; x < 60; x += 1) line.push({ x, y: 10 })
    for (let y = 10; y < 50; y += 1) line.push({ x: 60, y })
    for (let x = 60; x > 20; x -= 1) line.push({ x, y: 50 })
    // up the left side, with the thorn: out along a diagonal and back
    for (let y = 50; y > 33; y -= 1) line.push({ x: 20, y })
    for (let step = 1; step <= length; step += 1) line.push({ x: 20 - step, y: 33 - Math.floor(step / 2) })
    for (let step = length; step >= 0; step -= 1) line.push({ x: 20 - step, y: 30 })
    for (let y = 29; y > 10; y -= 1) line.push({ x: 20, y })
    return line
  }
  const edgeAtColumn = (column: number) => {
    const map = { width: 80, height: 70, strengths: new Uint8Array(80 * 70) }
    for (let y = 1; y < 69; y += 1) map.strengths[y * map.width + column] = 255
    return map
  }
  const leftmost = (line: MagneticPoint[]) => Math.min(...line.map((point) => point.x))

  it('is taken into the line by the minus circle that comes up to it from outside', () => {
    const line = boxWithThorn(5)
    expect(leftmost(line)).toBe(15)
    // the circle is outside the box, to the left, and covers the thorn
    const pushed = adjustMagneticPath(line, { x: 12, y: 31 }, edgeAtColumn(20), 8, 'contract', new Set())
    expect(leftmost(pushed)).toBeGreaterThanOrEqual(19)
  })

  it('is taken in even when the picture has no edge there to go to', () => {
    const flat = { width: 80, height: 70, strengths: new Uint8Array(80 * 70) }
    const pushed = adjustMagneticPath(boxWithThorn(5), { x: 12, y: 31 }, flat, 8, 'contract', new Set())
    // five pixels out before, no more than two now (the stroke goes on, and takes the rest in on the next move)
    expect(leftmost(pushed)).toBeGreaterThanOrEqual(18)
  })

  it('is taken in when it lies on the wide hill of a soft edge, where the line would otherwise be left as it is', () => {
    // a soft edge in column 20, about thirteen pixels wide: the thorn's tip is still on its flank
    const map = { width: 80, height: 70, strengths: new Uint8Array(80 * 70), broad: new Uint8Array(80 * 70), broadHill: new Uint8Array(80 * 70), broadScale: 128 }
    for (let y = 1; y < 69; y += 1) {
      for (let x = 1; x < 79; x += 1) {
        const value = Math.max(0, Math.round(128 * (1 - Math.abs(x - 20) / 8)))
        map.broadHill[y * 80 + x] = value
        map.broad[y * 80 + x] = x === 20 ? 128 : Math.round(value * 0.3)
      }
    }
    const pushed = adjustMagneticPath(boxWithThorn(5), { x: 13, y: 31 }, map, 8, 'contract', new Set())
    expect(leftmost(pushed)).toBeGreaterThanOrEqual(18)
  })

  it('does not cut off the corner of a shape', () => {
    const line = boxWithThorn(0)
    const flat = { width: 80, height: 70, strengths: new Uint8Array(80 * 70) }
    // the minus circle comes up to the top left corner from outside
    const pushed = adjustMagneticPath(line, { x: 15, y: 5 }, flat, 8, 'contract', new Set())
    expect(pushed).toBe(line)
  })
})
