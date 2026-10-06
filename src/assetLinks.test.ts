import { describe, expect, it } from 'vitest'
import { defaultDocSettings, DEFAULT_PARAGRAPH_STYLES, type Asset, type ImageFrame } from './document'
import { parseDocument, serializeDocument } from './fileFormat'
import type { DocContent } from './pages'

const PREVIEW = 'data:image/webp;base64,AAAA'
const frame = (assetId: string): ImageFrame => ({ id: `f-${assetId}`, x: 0, y: 0, w: 100, h: 50, assetId, fit: 'fill' })

function content(assets: Record<string, Asset>): DocContent {
  return {
    doc: defaultDocSettings('test'),
    frames: [],
    images: Object.keys(assets).map(frame),
    assets,
    guides: [],
    shapes: [],
    paragraphStyles: DEFAULT_PARAGRAPH_STYLES,
    parents: [],
    pageParents: [],
    sections: [],
  }
}

describe('linked pictures in a saved document', () => {
  const linked: Asset = {
    name: 'photo.png',
    mime: 'image/png',
    dataUrl: 'blob:http://localhost/never-saved',
    width: 4000,
    height: 3000,
    link: { path: 'C:\\Pictures\\photo.png', size: 123, mtime: 456, preview: PREVIEW },
  }
  const embedded: Asset = { name: 'logo.png', mime: 'image/png', dataUrl: 'data:image/png;base64,BBBB', width: 10, height: 10 }

  it('saves a link as its path and preview, never the temporary blob URL', () => {
    const saved = JSON.parse(serializeDocument(content({ a: linked, b: embedded })))
    expect(saved.assets.a.dataUrl).toBe(PREVIEW)
    expect(saved.assets.a.link).toEqual({ path: 'C:\\Pictures\\photo.png', size: 123, mtime: 456 })
    expect(saved.assets.b.link).toBeUndefined()
    expect(saved.assets.b.dataUrl).toBe(embedded.dataUrl)
  })

  it('reads a link back with its preview, its real picture type and its size', () => {
    const parsed = parseDocument(serializeDocument(content({ a: linked, b: embedded })), 'test')
    expect(parsed.assets.a).toMatchObject({ mime: 'image/png', width: 4000, height: 3000, dataUrl: PREVIEW, link: linked.link })
    expect(parsed.assets.b.link).toBeUndefined()
  })

  it('ignores a link whose path is not absolute', () => {
    const text = serializeDocument(content({ a: linked })).replace('C:\\\\Pictures\\\\photo.png', '..\\\\photo.png')
    expect(parseDocument(text, 'test').assets.a.link).toBeUndefined()
  })
})

