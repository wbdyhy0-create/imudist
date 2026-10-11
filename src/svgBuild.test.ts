import { describe, expect, it } from 'vitest'
import { boundsOfItems, buildSvg, type SvgItem } from './svgBuild'
import type { ImageFrame, ShapeFrame } from './document'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const shape = (patch: Partial<ShapeFrame>): ShapeFrame => ({ id: 's', kind: 'rect', x: 10, y: 20, w: 100, h: 50, fill: '#ff0000', stroke: null, strokeWidth: 0, ...patch }) as ShapeFrame
const item = (patch: Partial<ShapeFrame>): SvgItem => ({ kind: 'shape', shape: shape(patch) })
const box = { x: 0, y: 0, w: 200, h: 200 }

describe('a page as an SVG file', () => {
  it('is a valid svg at the size of the box, one unit a point', () => {
    const { svg } = buildSvg([item({})], {}, { x: 10, y: 20, w: 100, h: 50 }, 'doc & <1>')
    expect(svg.startsWith('<?xml version="1.0"')).toBe(true)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('width="100" height="50" viewBox="10 20 100 50"')
    expect(svg).toContain('<title>doc &amp; &lt;1&gt;</title>')
  })

  it('draws a rectangle as a path at its place, turned about its own centre', () => {
    const { svg } = buildSvg([item({ rotation: 30 })], {}, box)
    expect(svg).toContain('transform="translate(10 20) rotate(30 50 25)"')
    expect(svg).toMatch(/<path d="M[^"]+" fill="#ff0000" fill-rule="evenodd"\/>/)
  })

  it('keeps the curves of a path, the holes of it, and the stroke', () => {
    const geom = [[[[0, 0], { p: [1, 0], hi: [-0.3, 0], ho: [0.2, 0.3] }, [1, 1], [0, 1]], [[0.3, 0.3], [0.6, 0.3], [0.45, 0.6]]]] as ShapeFrame['geom']
    const { svg } = buildSvg([item({ kind: 'path', geom, stroke: '#0000ff', strokeWidth: 2 })], {}, box)
    expect(svg).toContain('C')
    expect((svg.match(/M/g) ?? []).length).toBeGreaterThanOrEqual(2)
    expect(svg).toContain('stroke="#0000ff" stroke-width="2"')
  })

  it('draws a profiled line as the shape it covers, filled with the line colour', () => {
    const { svg } = buildSvg([item({ kind: 'line', w: 100, h: 0, fill: null, stroke: '#112233', strokeWidth: 10, lineWidths: [1, 0.5, 0] })], {}, box)
    expect(svg).toContain('fill="#112233"')
    expect(svg).not.toContain('stroke="#112233"')
    const dashed = buildSvg([item({ kind: 'line', w: 100, h: 0, fill: null, stroke: '#112233', strokeWidth: 2, strokeDash: 'dashed' })], {}, box).svg
    expect(dashed).toContain('stroke-dasharray="6 4"')
  })

  it('writes gradients, a shadow and the blend mode', () => {
    const { svg } = buildSvg(
      [item({ fillGradient: { type: 'linear', start: '#000000', end: '#ffffff', angle: 90 }, shadowOpacity: 0.5, shadowOffsetX: 3, shadowOffsetY: 4, blendMode: 'multiply', opacity: 0.5 })],
      {},
      box,
    )
    expect(svg).toContain('<linearGradient')
    expect(svg).toContain('fill="url(#gradient')
    expect(svg).toContain('<filter')
    expect(svg).toContain('mix-blend-mode:multiply')
    expect(svg).toContain('opacity="0.5"')
  })

  it('puts a picture in, clipped to its frame, flipped and turned', () => {
    const image: ImageFrame = { id: 'i', x: 5, y: 6, w: 80, h: 40, assetId: 'a', fit: 'fill', flipX: true, rotation: 10 }
    const { svg, notes } = buildSvg([{ kind: 'image', image }], { a: { dataUrl: PNG, width: 2, height: 2 } }, box)
    expect(svg).toContain('<image')
    expect(svg).toContain(PNG)
    expect(svg).toContain('scale(-1 1)')
    expect(svg).toContain('<clipPath')
    expect(notes).toEqual([])
  })

  it('says what it could not draw, and never writes a picture that is not a data address', () => {
    const image: ImageFrame = { id: 'i', x: 0, y: 0, w: 10, h: 10, assetId: 'a', fit: 'fill' }
    const linked = buildSvg([{ kind: 'image', image }, item({ kind: 'table' })], { a: { dataUrl: 'blob:http://x/1', width: 1, height: 1 } }, box)
    expect(linked.svg).not.toContain('<image')
    expect(linked.notes).toContain('תמונה שאינה מוטמעת בקובץ')
    expect(linked.notes).toContain('טבלה')
    // a colour that is not a colour does not get into the file
    expect(buildSvg([item({ fill: 'red" onload="x' })], {}, box).svg).not.toContain('onload')
  })

  it('has the bounds of what is exported, with room for thick lines and shadows', () => {
    expect(boundsOfItems([])).toBeNull()
    const bounds = boundsOfItems([item({ x: 10, y: 10, w: 100, h: 0, kind: 'line', fill: null, stroke: '#000000', strokeWidth: 20 })])!
    expect(bounds.x).toBeCloseTo(0, 5)
    expect(bounds.w).toBeCloseTo(120, 5)
    expect(bounds.h).toBeCloseTo(20, 5)
  })
})

describe('a blurred shape as an SVG file', () => {
  it('gets a Gaussian blur filter in its own space, round the shape with room for the blur', () => {
    const { svg } = buildSvg([item({ blur: 3, w: 100, h: 0 })], {}, box)
    expect(svg).toContain('<feGaussianBlur stdDeviation="3"/>')
    expect(svg).toContain('filterUnits="userSpaceOnUse"')
    // a flat shape is given a region that has a height
    expect(svg).toMatch(/<filter id="blur\d+" filterUnits="userSpaceOnUse" x="-\d+" y="-\d+" width="\d+" height="\d+">/)
    expect(svg).toMatch(/<g filter="url\(#blur\d+\)"><path /)
  })

  it('has none for a shape that is not blurred', () => {
    expect(buildSvg([item({})], {}, box).svg).not.toContain('feGaussianBlur')
  })

  it('has room for the blur in the box the objects fill', () => {
    const plain = boundsOfItems([item({})])!
    const blurred = boundsOfItems([item({ blur: 4 })])!
    expect(blurred.w).toBeGreaterThan(plain.w)
    expect(blurred.x).toBeLessThan(plain.x)
  })
})
