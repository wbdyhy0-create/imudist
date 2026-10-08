import { afterEach, describe, expect, it, vi } from 'vitest'
import html2canvas from 'html2canvas'
import { captureElementRegion, clipCanvasToBoxes } from './marquee'

vi.mock('html2canvas', () => ({ default: vi.fn() }))

describe('clipCanvasToBoxes', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('keeps highlighted text while removing capture controls', async () => {
    const matchesSelector = (className: string, selector: string) =>
      selector.split(',').some((part) => className.split(' ').includes(part.trim().slice(1)))
    const highlightedText = {
      className: 'sel',
      classList: { remove: vi.fn() },
      matches: (selector: string) => matchesSelector('sel', selector),
      remove: vi.fn(),
    }
    const handle = {
      className: 'handle',
      classList: { remove: vi.fn() },
      matches: (selector: string) => matchesSelector('handle', selector),
      remove: vi.fn(),
    }
    const guide = { className: 'guide', matches: (selector: string) => matchesSelector('guide', selector), remove: vi.fn() }
    const pageShadow = { className: 'page-shadow', matches: (selector: string) => matchesSelector('page-shadow', selector), remove: vi.fn() }
    const descendants = [highlightedText, handle, guide, pageShadow]
    const clone = {
      classList: { remove: vi.fn() },
      style: {},
      querySelectorAll: vi.fn((selector: string) => descendants.filter((element) => matchesSelector(element.className, selector))),
    }
    const wrapper = { style: {}, appendChild: vi.fn(), remove: vi.fn() }
    const element = { cloneNode: vi.fn(() => clone) } as unknown as HTMLElement
    vi.stubGlobal('document', {
      createElement: vi.fn(() => wrapper),
      body: { appendChild: vi.fn() },
      fonts: { ready: Promise.resolve() },
    })
    vi.mocked(html2canvas).mockResolvedValue({ width: 1, height: 1 } as HTMLCanvasElement)

    await captureElementRegion(
      element,
      { left: 0, top: 0, width: 100, height: 100 },
      { left: 0, top: 0, width: 100, height: 100 },
      1,
    )

    expect(highlightedText.remove).not.toHaveBeenCalled()
    expect(highlightedText.classList.remove).not.toHaveBeenCalled()
    expect(handle.remove).toHaveBeenCalledOnce()
    expect(guide.remove).toHaveBeenCalledOnce()
    expect(pageShadow.remove).toHaveBeenCalledOnce()
    expect(wrapper.remove).toHaveBeenCalledOnce()
  })

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
