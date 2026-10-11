import { describe, expect, it } from 'vitest'
import type { ShapeFrame } from './document'
import { arcToCubics, longHex, parseSvgPath, shapeToVector, type PathOp, type VectorShape } from './vectorShapes'

const shape = (over: Partial<ShapeFrame> = {}): ShapeFrame => ({ id: 's', kind: 'rect', x: 100, y: 200, w: 60, h: 40, fill: '#ff0000', stroke: null, strokeWidth: 0, ...over })
const vector = (s: ShapeFrame, pageX = 0, pageY = 0) => shapeToVector(s, pageX, pageY) as VectorShape

const cubicPoint = (from: [number, number], op: Extract<PathOp, { 0: 'C' }>, t: number): [number, number] => {
  const u = 1 - t
  return [u * u * u * from[0] + 3 * u * u * t * op[1] + 3 * u * t * t * op[3] + t * t * t * op[5], u * u * u * from[1] + 3 * u * u * t * op[2] + 3 * u * t * t * op[4] + t * t * t * op[6]]
}

describe('parseSvgPath', () => {
  it('reads lines, horizontal and vertical moves and closing', () => {
    expect(parseSvgPath('M0 0H10V5L0 5Z')).toEqual([['M', 0, 0], ['L', 10, 0], ['L', 10, 5], ['L', 0, 5], ['Z']])
  })

  it('reads a cubic curve and turns a quadratic one into the cubic of the same shape', () => {
    expect(parseSvgPath('M0 0C1 2 3 4 5 6')).toEqual([['M', 0, 0], ['C', 1, 2, 3, 4, 5, 6]])
    const [, quadratic] = parseSvgPath('M0 0Q3 3 6 0')!
    expect(quadratic).toEqual(['C', 2, 2, 4, 2, 6, 0])
  })

  it('takes several sets of numbers after one command', () => {
    expect(parseSvgPath('M0 0L1 1 2 2')).toEqual([['M', 0, 0], ['L', 1, 1], ['L', 2, 2]])
  })

  it('gives nothing for a command it does not know', () => {
    expect(parseSvgPath('M0 0l5 5')).toBeNull()
  })
})

describe('arcToCubics', () => {
  it('draws a half circle as curves that stay on the circle', () => {
    const ops = arcToCubics(0, 50, 50, 50, 0, true, true, 100, 50)
    expect(ops.length).toBe(2)
    let from: [number, number] = [0, 50]
    for (const op of ops) {
      if (op[0] !== 'C') throw new Error('curve expected')
      for (const t of [0.25, 0.5, 0.75]) {
        const [x, y] = cubicPoint(from, op, t)
        expect(Math.hypot(x - 50, y - 50)).toBeCloseTo(50, 1)
      }
      from = [op[5], op[6]]
    }
    expect(from).toEqual([100, 50])
  })

  it('ends exactly where it was told to', () => {
    const ops = arcToCubics(10, 10, 30, 20, 30, false, true, 70, 40)
    const last = ops[ops.length - 1]
    expect(last[0]).toBe('C')
    expect([last[5], last[6]]).toEqual([70, 40])
  })

  it('goes the way the sweep flag says', () => {
    const through = (sweep: boolean) => {
      const [op] = arcToCubics(0, 0, 50, 50, 0, false, sweep, 100, 0)
      return (op as Extract<PathOp, { 0: 'C' }>)[2]
    }
    expect(Math.sign(through(true))).toBe(-Math.sign(through(false)))
  })
})

describe('longHex', () => {
  it('writes a colour the same way whatever it was written as', () => {
    expect(longHex('#FF0000')).toBe('#ff0000')
    expect(longHex('#f00')).toBe('#ff0000')
    expect(longHex('red')).toBeNull()
    expect(longHex(null)).toBeNull()
  })
})

describe('shapeToVector', () => {
  it('puts a rectangle on the page where it is', () => {
    const v = vector(shape(), 20, 50)
    expect(v.fill).toBe('#ff0000')
    expect(v.stroke).toBeNull()
    expect(v.ops[0]).toEqual(['M', 80, 150])
    expect(v.ops.some((op) => op[0] === 'L' && op[1] === 140 && op[2] === 150)).toBe(true)
  })

  it('turns a shape about the centre of its box, clockwise', () => {
    const v = vector(shape({ x: 0, y: 0, w: 100, h: 20, rotation: 90 }))
    // the top-left corner (0,0) goes to the top-right of the turned box: the centre is (50, 10)
    const [, x, y] = v.ops[0] as ['M', number, number]
    expect(x).toBeCloseTo(50 + 10, 9)
    expect(y).toBeCloseTo(10 - 50, 9)
  })

  it('writes an outline with its width, a dash and a cap only for a line', () => {
    const line = vector(shape({ kind: 'line', fill: null, stroke: '#000000', strokeWidth: 2, strokeDash: 'dashed', strokeCap: 'round' }))
    expect(line.fill).toBeNull()
    expect(line.stroke).toBe('#000000')
    expect(line.dash).toEqual([6, 4])
    expect(line.cap).toBe('round')
    const rect = vector(shape({ fill: null, stroke: '#000000', strokeWidth: 2, strokeDash: 'dashed', strokeCap: 'round' }))
    expect(rect.dash).toBeNull()
    expect(rect.cap).toBe('butt')
  })

  it('has no outline for a width of nothing', () => {
    expect(vector(shape({ stroke: '#000000', strokeWidth: 0 })).stroke).toBeNull()
  })

  it('keeps the opacity', () => {
    expect(vector(shape({ opacity: 0.4 })).opacity).toBe(0.4)
  })

  it('draws an ellipse as curves', () => {
    const v = vector(shape({ kind: 'ellipse' }))
    expect(v.ops.filter((op) => op[0] === 'C').length).toBeGreaterThanOrEqual(4)
  })

  it('leaves to the page picture what it cannot draw, and says why', () => {
    expect(shapeToVector(shape({ kind: 'table' }), 0, 0)).toEqual({ reason: 'table' })
    expect(shapeToVector(shape({ shadowOpacity: 0.5 }), 0, 0)).toEqual({ reason: 'shadow' })
    expect(shapeToVector(shape({ fillGradient: { type: 'linear', start: '#000000', end: '#ffffff' } as ShapeFrame['fillGradient'] }), 0, 0)).toEqual({ reason: 'gradient' })
    expect(shapeToVector(shape({ fill: 'red' }), 0, 0)).toEqual({ reason: 'color' })
  })

  it('draws a graphic frame (a placeholder) with its outline only', () => {
    const v = vector(shape({ frame: true, fill: '#ffffff', stroke: '#888888', strokeWidth: 1 }))
    expect(v.fill).toBeNull()
    expect(v.stroke).toBe('#888888')
  })
})

describe('shapes with a blur, and the ends of a drawn path', () => {
  const geom = [[[[0, 0], [1, 0.5], [0, 1]]]] as ShapeFrame['geom']

  it('stay a picture, for the reason of the blur', () => {
    expect(shapeToVector(shape({ blur: 2 }), 0, 0)).toEqual({ reason: 'blur' })
  })

  it('give an open drawn path the ends it has: round unless they were made flat, and then sharp corners', () => {
    const round = vector(shape({ kind: 'path', geom, closed: false, fill: null, stroke: '#000000', strokeWidth: 4 }))
    expect(round.cap).toBe('round')
    expect(round.join).toBe('round')
    const flat = vector(shape({ kind: 'path', geom, closed: false, fill: null, stroke: '#000000', strokeWidth: 4, strokeCap: 'butt' }))
    expect(flat.cap).toBe('butt')
    expect(flat.join).toBe('miter')
  })

  it('keep a plain shape as it was', () => {
    const plain = vector(shape({ stroke: '#000000', strokeWidth: 2 }))
    expect(plain.cap).toBe('butt')
    expect(plain.join).toBe('round')
  })
})
