import { describe, expect, it } from 'vitest'
import { parseDocument } from './fileFormat'
import { applyFeatherCanvasMask, featherMaskStyles } from './feather'

describe('feather masks', () => {
  it('fades all four edges for a basic feather', () => {
    const styles = featherMaskStyles({ type: 'basic', radius: 12 }, 200, 100, 2)
    expect(styles.maskImage).toContain('to bottom')
    expect(styles.maskImage).toContain('to left')
    expect(styles.maskImage).toContain('to top')
    expect(styles.maskImage).toContain('to right')
    expect(styles.maskImage).toContain('24px')
    expect(styles.maskComposite).toBe('intersect')
    expect(styles.WebkitMaskComposite).toBe('source-in')
  })

  it('applies only the configured directional edges', () => {
    const styles = featherMaskStyles({ type: 'directional', top: 0, right: 10, bottom: 0, left: 5 }, 200, 100)
    expect(styles.maskImage).toBe('linear-gradient(to left, rgba(0,0,0,0) 0px, rgba(0,0,0,1) 10px), linear-gradient(to right, rgba(0,0,0,0) 0px, rgba(0,0,0,1) 5px)')
    expect(styles.WebkitMaskComposite).toBe('source-in')
  })

  it('preserves the custom gradient mask', () => {
    const styles = featherMaskStyles({
      type: 'gradient',
      x0: 0.5,
      y0: 0,
      x1: 0.5,
      y1: 1,
      points: [{ offset: 0, opacity: 1 }, { offset: 1, opacity: 0 }],
    }, 100, 100)
    expect(styles.maskImage).toMatch(/^linear-gradient\(/)
    expect(styles.maskComposite).toBeUndefined()
  })

  it('composites directional edge fades into canvas content', () => {
    const gradients: { stops: [number, string][] }[] = []
    const context = {
      globalCompositeOperation: 'source-over',
      fillStyle: '',
      save() {},
      restore() {},
      fillRect() {},
      createLinearGradient() {
        const gradient = { stops: [] as [number, string][], addColorStop(offset: number, color: string) { this.stops.push([offset, color]) } }
        gradients.push(gradient)
        return gradient
      },
    } as unknown as CanvasRenderingContext2D

    applyFeatherCanvasMask(context, { type: 'directional', top: 8, right: 0, bottom: 12, left: 0 }, 100, 80, 2)
    expect(gradients).toHaveLength(2)
    expect(gradients[0].stops).toEqual([[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']])
  })

  it('loads basic, directional, and legacy gradient feathers from documents', () => {
    const restored = parseDocument(JSON.stringify({
      format: 'imudist',
      version: 2,
      settings: {},
      assets: { asset: { dataUrl: 'data:image/png;base64,AAAA', width: 1, height: 1 } },
      frames: [{ id: 'frame', text: '', feather: { type: 'basic', radius: 18 } }],
      images: [{ id: 'image', assetId: 'asset', x: 0, y: 0, w: 20, h: 20, fit: 'fill', feather: { type: 'directional', top: 2, right: 4, bottom: 6, left: 8 } }],
      shapes: [{ id: 'shape', kind: 'rect', x: 0, y: 0, w: 20, h: 20, fill: '#ffffff', stroke: null, strokeWidth: 0, feather: { x0: 0, y0: 0, x1: 1, y1: 1, points: [{ offset: 0, opacity: 1 }, { offset: 1, opacity: 0 }] } }],
    }), 'Feather test')

    expect(restored.frames[0].feather).toEqual({ type: 'basic', radius: 18 })
    expect(restored.images[0].feather).toEqual({ type: 'directional', top: 2, right: 4, bottom: 6, left: 8 })
    expect(restored.shapes[0].feather).toMatchObject({ type: 'gradient', x0: 0, x1: 1 })
  })
})
