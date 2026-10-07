import { describe, expect, it } from 'vitest'
import type { ShapeFrame } from './document'
import { imageGeometry, splitPathVerticesAt } from './shapes'

describe('picture geometry inside a shape frame', () => {
  const shape: ShapeFrame = {
    id: 'frame',
    kind: 'rect',
    x: 0,
    y: 0,
    w: 400,
    h: 100,
    fill: null,
    stroke: null,
    strokeWidth: 0,
    image: { assetId: 'photo', fit: 'fill' },
  }

  it('stretches fill images to the complete frame without cropping', () => {
    expect(imageGeometry(shape, { width: 200, height: 200 })).toEqual({ x: 0, y: 0, w: 400, h: 100 })
  })

  it('keeps fit images proportional and shows the entire image', () => {
    expect(imageGeometry({ ...shape, image: { assetId: 'photo', fit: 'fit' } }, { width: 200, height: 200 }))
      .toEqual({ x: 150, y: 0, w: 100, h: 100 })
  })
})

describe('scissors path splitting', () => {
  it('opens a closed ring at an anchor and keeps the closing edge in the open path', () => {
    const ring = ['top-left', 'top-right', 'bottom-right', 'bottom-left']

    expect(splitPathVerticesAt(ring, 3, true)).toEqual([['bottom-left', 'top-left', 'top-right', 'bottom-right', 'bottom-left']])
  })

  it('splits an open path at an interior anchor without smoothing or dropping either segment', () => {
    const path = ['bottom-left', 'top-left', 'top-right', 'bottom-right', 'bottom-left']

    expect(splitPathVerticesAt(path, 3, false)).toEqual([
      ['bottom-left', 'top-left', 'top-right', 'bottom-right'],
      ['bottom-right', 'bottom-left'],
    ])
    expect(splitPathVerticesAt(path, 0, false)).toBeNull()
    expect(splitPathVerticesAt(path, path.length - 1, false)).toBeNull()
  })
})
