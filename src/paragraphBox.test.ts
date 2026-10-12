import { describe, expect, it } from 'vitest'
import { paragraphBoxStyle, paragraphHasBox, paragraphSidePadding } from './richtext'

describe('a paragraph\'s fill and line', () => {
  it('has a box only with a fill or a line of some width', () => {
    expect(paragraphHasBox(undefined)).toBe(false)
    expect(paragraphHasBox({})).toBe(false)
    expect(paragraphHasBox({ borderColor: '#ff0000' })).toBe(false)
    expect(paragraphHasBox({ background: '#ffff00' })).toBe(true)
    expect(paragraphHasBox({ borderWidth: 1 })).toBe(true)
  })

  it('draws the fill, and the line in black unless told otherwise, scaled with the view', () => {
    expect(paragraphBoxStyle({ background: '#ffff00' }, 2)).toEqual({ backgroundColor: '#ffff00' })
    expect(paragraphBoxStyle({ borderWidth: 1.5 }, 2)).toEqual({ boxShadow: 'inset 0 0 0 3px #000000' })
    expect(paragraphBoxStyle({ borderWidth: 1, borderColor: '#ff0000' }, 1)).toEqual({ boxShadow: 'inset 0 0 0 1px #ff0000' })
    // a hairline keeps its fraction (a CSS border would be rounded to a whole pixel)
    expect(paragraphBoxStyle({ borderWidth: 0.25 }, 1)).toEqual({ boxShadow: 'inset 0 0 0 0.25px #000000' })
  })

  it('keeps the text off the box at the sides, on top of the paragraph\'s own indents', () => {
    expect(paragraphSidePadding({ indentLeft: 10 }, 1)).toEqual({ paddingLeft: '10px' })
    expect(paragraphSidePadding({ background: '#ffff00', indentRight: 5 }, 1)).toEqual({ paddingLeft: '3px', paddingRight: '8px' })
  })
})

describe('the fill and line survive saving and opening the file', () => {
  it('in a paragraph style and in a paragraph\'s own patch, and drop what is invalid', async () => {
    const { DEFAULT_PARAGRAPH_STYLES, DEFAULT_TEXT_STYLE, defaultDocSettings } = await import('./document')
    const { parseDocument, serializeDocument } = await import('./fileFormat')
    const style = { fontFamily: 'Arial', fontSize: 12, weight: 400, italic: false, tracking: 0 }
    const frame = { ...DEFAULT_TEXT_STYLE, id: 'a', x: 0, y: 0, w: 100, h: 100, text: 'א\nב', runs: [{ len: 3, style }], next: null, paragraphStylePatches: [{ background: '#ffff00', borderWidth: 2, borderColor: '#0000ff' }, { background: 'yellow', borderWidth: 0 }] }
    const styles = DEFAULT_PARAGRAPH_STYLES.map((record, index) => (index === 0 ? { ...record, patch: { ...record.patch, background: '#eeeeee', borderWidth: 1, borderColor: '#ff0000' } } : record))
    const content = { doc: defaultDocSettings('x'), frames: [frame], images: [], assets: {}, guides: [], shapes: [], paragraphStyles: styles, parents: [], pageParents: [], sections: [] }
    const back = parseDocument(serializeDocument(content), 'x')
    expect(back.frames[0].paragraphStylePatches?.[0]).toMatchObject({ background: '#ffff00', borderWidth: 2, borderColor: '#0000ff' })
    expect(back.frames[0].paragraphStylePatches?.[1]).toEqual({})
    expect(back.paragraphStyles[0].patch).toMatchObject({ background: '#eeeeee', borderWidth: 1, borderColor: '#ff0000' })
  })
})
