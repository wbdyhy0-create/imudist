import { describe, expect, it } from 'vitest'
import { defaultDocSettings, DEFAULT_PARAGRAPH_STYLES } from './document'
import { parseDocument, serializeDocument } from './fileFormat'
import { paragraphListMarker, paragraphListMarkerOffset } from './richtext'

describe('paragraph list markers', () => {
  it('offsets a marker by the extra paragraph gap, not by an entire line height', () => {
    expect(paragraphListMarkerOffset(24, 17)).toBe(7)
    expect(paragraphListMarkerOffset(17, 17)).toBe(0)
  })

  it('creates bullets and numbered markers, continuing only through adjacent numbered paragraphs', () => {
    const patches = [{ listKind: 'number' as const }, { listKind: 'number' as const }, { listKind: 'bullet' as const }, { listKind: 'number' as const }, {}]
    expect(paragraphListMarker(patches, 0)).toBe('.1')
    expect(paragraphListMarker(patches, 1)).toBe('.2')
    expect(paragraphListMarker(patches, 2)).toBe('•')
    expect(paragraphListMarker(patches, 3)).toBe('.1')
    expect(paragraphListMarker(patches, 4)).toBeUndefined()
  })

  it('saves and reloads a paragraph style list kind', () => {
    const content = {
      doc: defaultDocSettings('Lists'), frames: [], images: [], assets: {}, guides: [], shapes: [],
      paragraphStyles: [{ ...DEFAULT_PARAGRAPH_STYLES[0], patch: { ...DEFAULT_PARAGRAPH_STYLES[0].patch, listKind: 'bullet' as const, listGap: 7 } }],
      parents: [], pageParents: [], sections: [],
    }
    const back = parseDocument(serializeDocument(content), 'Lists')
    expect(back.paragraphStyles[0].patch.listKind).toBe('bullet')
    expect(back.paragraphStyles[0].patch.listGap).toBe(7)
  })
})