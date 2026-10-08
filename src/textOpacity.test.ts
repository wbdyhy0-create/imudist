import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAGRAPH_STYLES, DEFAULT_TEXT_STYLE, defaultDocSettings, type TextFrame } from './document'
import { parseDocument, serializeDocument } from './fileFormat'
import type { DocContent } from './pages'

describe('text frame opacity', () => {
  it('round-trips opacity while leaving old frames fully opaque by default', () => {
    const frame: TextFrame = {
      ...DEFAULT_TEXT_STYLE,
      id: 'text',
      x: 0,
      y: 0,
      w: 100,
      h: 50,
      text: 'example',
      runs: [],
      next: null,
      opacity: 0.35,
    }
    const content: DocContent = {
      doc: defaultDocSettings('test'),
      frames: [frame],
      images: [],
      assets: {},
      guides: [],
      shapes: [],
      paragraphStyles: DEFAULT_PARAGRAPH_STYLES,
      parents: [],
      pageParents: [],
      sections: [],
    }

    expect(parseDocument(serializeDocument(content), 'test').frames[0].opacity).toBe(0.35)
    const legacy = parseDocument(JSON.stringify({ ...JSON.parse(serializeDocument(content)), frames: [{ ...frame, opacity: undefined }] }), 'test')
    expect(legacy.frames[0].opacity).toBeUndefined()
  })
})
