import { describe, expect, it } from 'vitest'
import { parseDocument } from './fileFormat'
import { textDropShadow } from './richtext'
import { dropShadowFilter } from './shadow'

describe('drop shadow filter', () => {
  it('is disabled at zero strength', () => {
    expect(dropShadowFilter(12, -8, 0)).toBeUndefined()
  })

  it('uses the offset and clamps opacity', () => {
    expect(dropShadowFilter(4, -8, 1.5)).toContain('drop-shadow(4px -8px')
    expect(dropShadowFilter(4, -8, 1.5)).toContain('rgba(0, 0, 0, 1)')
    expect(dropShadowFilter(4, -8, 1, 1, '#000000')).toContain('drop-shadow(4px -8px 0px rgba(0, 0, 0, 1)')
    expect(dropShadowFilter(4, -8, 0.5, 1, '#000000')).toContain('1.5652475842498528px rgba(0, 0, 0, 0.5)')
    expect(dropShadowFilter(4, -8, 0.5, 1, '#ff0000')).toContain('rgba(255, 0, 0, 0.5)')
  })

  it('uses the selected color on text glyphs', () => {
    const shadow = textDropShadow({ fontFamily: 'Arial', fontSize: 14, weight: 400, italic: false, tracking: 0, shadowColor: '#888888', shadowOpacity: 0.4 }, 1)
    expect(shadow).toContain('rgba(136, 136, 136, 0.4)')
    expect(shadow).toContain('0px 6px 1.2599999999999998px')
    expect(textDropShadow({ fontFamily: 'Arial', fontSize: 14, weight: 400, italic: false, tracking: 0, shadowOpacity: 1 }, 1)).toContain('0px 6px 0px rgba')
  })

  it('restores shadow settings for text, images, and shapes from a document', () => {
    const restored = parseDocument(JSON.stringify({
      format: 'imudist',
      version: 2,
      settings: {},
      assets: { asset: { dataUrl: 'data:image/png;base64,AAAA', width: 1, height: 1 } },
      frames: [{ id: 'frame', text: 'x', shadowOffsetX: -2, shadowOffsetY: -11, shadowColor: '#8844cc', shadowOpacity: 0.35, runs: [{ len: 1, style: { fontFamily: 'Arial', fontSize: 14, weight: 400, italic: false, tracking: 0, shadowOffsetX: 3, shadowOffsetY: 13, shadowColor: '#22aa44', shadowOpacity: 0.55 } }] }],
      images: [{ id: 'image', assetId: 'asset', x: 0, y: 0, w: 20, h: 20, fit: 'fill', shadowOffsetX: 8, shadowOffsetY: -4, shadowColor: '#aa2211', shadowOpacity: 0.4 }],
      shapes: [{ id: 'shape', kind: 'rect', x: 0, y: 0, w: 20, h: 20, fill: '#ffffff', stroke: '#000000', strokeWidth: 1, shadowOffsetX: -9, shadowOffsetY: 6, shadowColor: '#333333', shadowOpacity: 0.45 }],
    }), 'Shadow test')

    expect(restored.frames[0]).toMatchObject({ shadowOffsetX: -2, shadowOffsetY: -11, shadowColor: '#8844cc' })
    expect(restored.frames[0].runs?.[0].style.shadowOpacity).toBe(0.55)
    expect(restored.frames[0].runs?.[0].style.shadowColor).toBe('#22aa44')
    expect(restored.images[0]).toMatchObject({ shadowOffsetX: 8, shadowOffsetY: -4, shadowColor: '#aa2211', shadowOpacity: 0.4 })
    expect(restored.shapes[0]).toMatchObject({ shadowOffsetX: -9, shadowOffsetY: 6, shadowColor: '#333333', shadowOpacity: 0.45 })
  })

  it('maps legacy vertical offsets to the Y axis', () => {
    const restored = parseDocument(JSON.stringify({ format: 'imudist', version: 2, settings: {}, frames: [{ id: 'frame', text: '', shadowOffset: 12 }], images: [], shapes: [] }), 'Legacy shadow')
    expect(restored.frames[0].shadowOffsetY).toBe(12)
  })
})
