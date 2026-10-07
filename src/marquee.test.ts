import { afterEach, describe, expect, it, vi } from 'vitest'
import { clipCanvasToBoxes } from './marquee'

describe('clipCanvasToBoxes', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('crops the canvas to the part intersecting a page', () => {
    const context = {
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      fill: vi.fn(),
      fillStyle: '',
      globalCompositeOperation: 'source-over',
    }
    const output = { width: 0, height: 0, getContext: vi.fn(() => context) }
    vi.stubGlobal('document', { createElement: vi.fn(() => output) })
    const source = { width: 200, height: 100 } as HTMLCanvasElement

    const result = clipCanvasToBoxes(
      source,
      { left: 0, top: 0, width: 200, height: 100 },
      [{ left: 50, top: 0, width: 100, height: 100 }],
    )

    expect(result.width).toBe(100)
    expect(result.height).toBe(100)
    expect(context.drawImage).toHaveBeenCalledWith(source, 50, 0, 100, 100, 0, 0, 100, 100)
    expect(context.rect).toHaveBeenCalledWith(0, 0, 100, 100)
    expect(context.globalCompositeOperation).toBe('source-over')
  })

  it('keeps separate page regions transparent between pages', () => {
    const context = {
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      fill: vi.fn(),
      fillStyle: '',
      globalCompositeOperation: 'source-over',
    }
    const output = { width: 0, height: 0, getContext: vi.fn(() => context) }
    vi.stubGlobal('document', { createElement: vi.fn(() => output) })
    const source = { width: 300, height: 100 } as HTMLCanvasElement

    clipCanvasToBoxes(
      source,
      { left: 0, top: 0, width: 300, height: 100 },
      [
        { left: 0, top: 0, width: 100, height: 100 },
        { left: 200, top: 0, width: 100, height: 100 },
      ],
    )

    expect(output.width).toBe(300)
    expect(context.rect).toHaveBeenNthCalledWith(1, 0, 0, 100, 100)
    expect(context.rect).toHaveBeenNthCalledWith(2, 200, 0, 100, 100)
    expect(context.fill).toHaveBeenCalledOnce()
  })

  it('rejects selections outside all page regions', () => {
    const source = { width: 200, height: 100 } as HTMLCanvasElement

    expect(() => clipCanvasToBoxes(
      source,
      { left: 0, top: 0, width: 200, height: 100 },
      [{ left: 250, top: 0, width: 100, height: 100 }],
    )).toThrow('the selection does not intersect the page canvas')
  })
})
