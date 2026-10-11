import { afterEach, describe, expect, it, vi } from 'vitest'
import { OPS } from 'pdfjs-dist'
import { GhostscriptMissingError, pathDataToShapes, pdfOperatorListToShapes, readEpsFile, type SvgPaint } from './importEps'

// the desktop side answers with this code when Ghostscript is not installed
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => {
    throw 'GHOSTSCRIPT_MISSING'
  }),
}))

const paint: SvgPaint = {
  fill: '#336699',
  stroke: '#112233',
  strokeWidth: 2,
  strokeCap: 'round',
  fillOpacity: 1,
  strokeOpacity: 1,
  opacity: 1,
  display: 'inline',
  visibility: 'visible',
}

describe('EPS SVG path conversion', () => {
  it('creates an editable closed shape with fill and stroke', () => {
    const [shape] = pathDataToShapes('M10 20 L30 20 L30 40 L10 40 Z', paint, undefined, () => 'shape-1')

    expect(shape).toMatchObject({ id: 'shape-1', kind: 'path', x: 10, y: 20, w: 20, h: 20, closed: true, fill: '#336699', stroke: '#112233', strokeWidth: 2 })
    expect(shape.geom[0][0]).toEqual([[0, 0], [1, 0], [1, 1], [0, 1]])
  })

  it('preserves cubic Bezier handles as editable path points', () => {
    const [shape] = pathDataToShapes('M0 0 C0 10 10 10 10 0 Z', paint, undefined, () => 'curve')

    expect(shape.geom[0][0]).toEqual([
      { p: [0, 0], ho: [0, 1] },
      { p: [1, 0], hi: [0, 1] },
    ])
  })

  it('applies SVG transforms before normalizing the shape box', () => {
    const [shape] = pathDataToShapes('M0 0 L10 0 L10 5 Z', paint, [2, 0, 0, 3, 100, 200], () => 'scaled')

    expect(shape).toMatchObject({ x: 100, y: 200, w: 20, h: 15, strokeWidth: 2 * Math.sqrt(6) })
  })

  it('extracts independently painted PDF vector paths with their fill color', () => {
    const shapes = pdfOperatorListToShapes(
      [0, 0, 100, 100],
      [OPS.setFillRGBColor, OPS.constructPath],
      [
        ['#336699'],
        [OPS.fill, [Float32Array.of(0, 10, 10, 1, 20, 10, 1, 20, 20, 4)], Float32Array.of(10, 10, 20, 20)],
      ],
      () => 'pdf-shape',
    )

    expect(shapes).toHaveLength(1)
    expect(shapes[0]).toMatchObject({ id: 'pdf-shape', x: 10, y: 80, w: 10, h: 10, fill: '#336699', stroke: null, closed: true })
    expect(shapes[0].geom[0][0]).toEqual([[0, 1], [1, 1], [1, 0]])
  })
})
describe('Ghostscript missing', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('explains the steps and does not show the internal code', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    const error = await readEpsFile(new File(['%!PS-Adobe-3.0'], 'drawing.ps')).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GhostscriptMissingError)
    expect((error as Error).message).toContain('הורדת Ghostscript')
    expect((error as Error).message).not.toContain('GHOSTSCRIPT_MISSING')
  })
})
