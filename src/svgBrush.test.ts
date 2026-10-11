import { describe, expect, it } from 'vitest'
import { flattenOps, parsePathData, parseSvgOutlines, parseTransform } from './svgBrush'

const near = (actual: number, expected: number, digits = 6) => expect(actual).toBeCloseTo(expected, digits)

describe('path data', () => {
  it('is read the same in small and capital letters', () => {
    const absolute = parsePathData('M10 10L60 10L60 40L10 40Z')
    const relative = parsePathData('m10 10l50 0l0 30l-50 0z')
    expect(relative).toEqual(absolute)
  })

  it('takes more pairs after a move as lines, and one command for several sets of numbers', () => {
    expect(parsePathData('M0 0 10 0 10 10')).toEqual([['M', 0, 0], ['L', 10, 0], ['L', 10, 10]])
    expect(parsePathData('M0,0 L1,1 2,2')).toEqual([['M', 0, 0], ['L', 1, 1], ['L', 2, 2]])
  })

  it('reads the lines H and V, both ways', () => {
    expect(parsePathData('M5 5H15V25h-10v-5')).toEqual([['M', 5, 5], ['L', 15, 5], ['L', 15, 25], ['L', 5, 25], ['L', 5, 20]])
  })

  it('makes a smooth curve mirror the handle of the one before', () => {
    const ops = parsePathData('M0 0C0 10 10 10 10 0S20 -10 20 0')
    const second = ops[2]!
    expect(second[0]).toBe('C')
    // the first handle of the second curve is the mirror of (10,10) round (10,0)
    near(second[1] as number, 10)
    near(second[2] as number, -10)
  })

  it('reads an arc whose flags are written without a space between them', () => {
    const ops = parsePathData('M0 0a5 5 0 00 10 0')
    expect(ops.length).toBeGreaterThan(1)
    const last = ops[ops.length - 1]!
    near(last[last.length - 2] as number, 10)
    near(last[last.length - 1] as number, 0)
  })

  it('stops at what it cannot read, and keeps what came before', () => {
    expect(parsePathData('M0 0L10 10 Xjunk')).toEqual([['M', 0, 0], ['L', 10, 10]])
  })

  it('is not made to fail by numbers written like .5 or 1e2 or -.5', () => {
    expect(parsePathData('M.5 1e2L-.5 -1.5')).toEqual([['M', 0.5, 100], ['L', -0.5, -1.5]])
  })
})

describe('a transform', () => {
  it('is the matrix of its steps, the first one outermost', () => {
    const m = parseTransform('translate(10 20) scale(2)')
    // a point is scaled first and then moved
    expect([m[0] * 3 + m[2] * 4 + m[4], m[1] * 3 + m[3] * 4 + m[5]]).toEqual([16, 28])
  })

  it('turns about a point', () => {
    const m = parseTransform('rotate(90 10 10)')
    const [x, y] = [m[0] * 20 + m[2] * 10 + m[4], m[1] * 20 + m[3] * 10 + m[5]]
    near(x, 10)
    near(y, 20)
  })

  it('is nothing when there is none', () => {
    expect(parseTransform(undefined)).toEqual([1, 0, 0, 1, 0, 0])
  })
})

describe('the outlines of a drawing', () => {
  it('are the lines of its shapes, curves sampled, with the transform applied', () => {
    const rings = flattenOps(parsePathData('M0 0L10 0L10 10L0 10Z'), [2, 0, 0, 2, 100, 0])
    expect(rings).toHaveLength(1)
    expect(rings[0]![0]).toEqual([100, 0])
    expect(rings[0]![2]).toEqual([120, 20])
  })

  it('come from paths, rectangles, circles and polygons', () => {
    const text = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 0H10V10H0Z"/><rect x="20" y="0" width="10" height="10"/><circle cx="50" cy="5" r="5"/><polygon points="60,0 70,0 65,10"/></svg>'
    const result = parseSvgOutlines(text)!
    expect(result.groups).toHaveLength(4)
    expect(result.lineOnly).toBe(false)
  })

  it('carry the transform of the group they are in', () => {
    const text = '<svg><g transform="translate(100 0)"><rect x="0" y="0" width="10" height="10"/></g></svg>'
    const ring = parseSvgOutlines(text)!.groups[0]![0]!
    expect(Math.min(...ring.map((p) => p[0]))).toBe(100)
    expect(Math.max(...ring.map((p) => p[0]))).toBe(110)
  })

  it('leave out what is only a definition, a clip or a mask', () => {
    const text = '<svg><defs><path id="a" d="M0 0H10V10Z"/></defs><clipPath id="c"><rect width="5" height="5"/></clipPath><path d="M0 0H20V20H0Z"/></svg>'
    expect(parseSvgOutlines(text)!.groups).toHaveLength(1)
  })

  it('leave out a white ground behind the drawing, and what is hidden', () => {
    const text = '<svg><rect width="100" height="100" fill="#ffffff"/><rect width="10" height="10" style="fill:white"/><path d="M0 0H10V10Z" display="none"/><path d="M0 0H10V10Z" fill="#000"/></svg>'
    expect(parseSvgOutlines(text)!.groups).toHaveLength(1)
  })

  it('keep the holes of a compound path as its other lines', () => {
    const text = '<svg><path d="M0 0H30V30H0Z M10 10H20V20H10Z"/></svg>'
    const groups = parseSvgOutlines(text)!.groups
    expect(groups).toHaveLength(1)
    expect(groups[0]).toHaveLength(2)
  })

  it('are the lines of shapes with no fill when there is nothing else', () => {
    const text = '<svg><path d="M0 0H10V10H0Z" fill="none" stroke="#000"/></svg>'
    const result = parseSvgOutlines(text)!
    expect(result.lineOnly).toBe(true)
    expect(result.groups).toHaveLength(1)
  })

  it('are nothing for a file that is not a drawing', () => {
    expect(parseSvgOutlines('hello')).toBeNull()
    expect(parseSvgOutlines('<svg></svg>')!.groups).toHaveLength(0)
  })
})
