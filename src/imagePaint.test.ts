import { afterEach, describe, expect, it, vi } from 'vitest'
import { paintImageStroke } from './imagePaint'

describe('paintImageStroke', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('paints a round dab for a click', () => {
    const context = {
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      globalAlpha: 1,
      fillStyle: '',
    }
    const output = { width: 0, height: 0, getContext: vi.fn(() => context) }
    vi.stubGlobal('document', { createElement: vi.fn(() => output) })
    const source = { width: 80, height: 40 } as HTMLCanvasElement

    const result = paintImageStroke(source, [{ x: 12, y: 9 }], 4, '#ab12ef')

    expect(result.width).toBe(80)
    expect(result.height).toBe(40)
    expect(context.drawImage).toHaveBeenCalledWith(source, 0, 0)
    expect(context.arc).toHaveBeenCalledWith(12, 9, 4, 0, Math.PI * 2)
    expect(context.fillStyle).toBe('#ab12ef')
    expect(context.globalAlpha).toBe(1)
    expect(context.fill).toHaveBeenCalledOnce()
  })

  it('strokes a round joined path with the sampled color', () => {
    const context = {
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      globalAlpha: 1,
      lineWidth: 0,
      lineCap: '',
      lineJoin: '',
      strokeStyle: '',
    }
    const output = { width: 0, height: 0, getContext: vi.fn(() => context) }
    vi.stubGlobal('document', { createElement: vi.fn(() => output) })
    const source = { width: 80, height: 40 } as HTMLCanvasElement

    paintImageStroke(source, [{ x: 2, y: 3 }, { x: 10, y: 15 }], 5, '#34cd56', 35)

    expect(context.moveTo).toHaveBeenCalledWith(2, 3)
    expect(context.lineTo).toHaveBeenCalledWith(10, 15)
    expect(context.lineWidth).toBe(10)
    expect(context.lineCap).toBe('round')
    expect(context.lineJoin).toBe('round')
    expect(context.strokeStyle).toBe('#34cd56')
    expect(context.globalAlpha).toBe(0.35)
    expect(context.stroke).toHaveBeenCalledOnce()
  })

  it('allows painting with zero strength', () => {
    const context = {
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      globalAlpha: 1,
      fillStyle: '',
    }
    const output = { width: 0, height: 0, getContext: vi.fn(() => context) }
    vi.stubGlobal('document', { createElement: vi.fn(() => output) })
    const source = { width: 80, height: 40 } as HTMLCanvasElement

    paintImageStroke(source, [{ x: 12, y: 9 }], 4, '#ab12ef', 0)

    expect(context.globalAlpha).toBe(0)
  })

  it('rejects strokes without points', () => {
    const source = { width: 80, height: 40 } as HTMLCanvasElement

    expect(() => paintImageStroke(source, [], 5, '#000000')).toThrow('cannot paint an empty image stroke')
  })
})
