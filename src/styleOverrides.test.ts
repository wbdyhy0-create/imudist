import { describe, expect, it } from 'vitest'
import { DEFAULT_TEXT_STYLE, type TextFrame } from './document'
import { paragraphOverrides } from './styleOverrides'

const base = { fontFamily: DEFAULT_TEXT_STYLE.fontFamily, fontSize: DEFAULT_TEXT_STYLE.fontSize, weight: 400, italic: false, tracking: 0 }
const frameWith = (style: Record<string, unknown>, extra: Partial<TextFrame> = {}): TextFrame => ({
  ...DEFAULT_TEXT_STYLE,
  id: 'a',
  x: 0,
  y: 0,
  w: 100,
  h: 100,
  text: 'שלום עולם',
  runs: [{ len: 9, style: { ...base, ...style } as never }],
  next: null,
  ...extra,
})

describe('paragraph overrides against a style', () => {
  it('shows nothing for a paragraph that looks as the story does', () => {
    expect(paragraphOverrides(frameWith({}), 0, {})).toEqual({})
  })

  it('flags a size changed where the style sets none', () => {
    expect(paragraphOverrides(frameWith({ fontSize: 22 }), 0, {})).toEqual({ fontSize: 22 })
  })

  it('flags a colour of its own where nothing sets one, and bold', () => {
    expect(paragraphOverrides(frameWith({ color: '#ff0000', weight: 700 }), 0, {})).toEqual({ weight: 700, color: '#ff0000' })
  })

  it('compares with the style when it sets the value', () => {
    expect(paragraphOverrides(frameWith({ fontSize: 22 }), 0, { fontSize: 22 })).toEqual({})
    expect(paragraphOverrides(frameWith({ fontSize: 22 }), 0, { fontSize: 18 })).toEqual({ fontSize: 22 })
  })

  it('flags an indent set on the paragraph, and not a zero', () => {
    const indented = frameWith({}, { paragraphStylePatches: [{ indentRight: 10 }] })
    expect(paragraphOverrides(indented, 0, {})).toEqual({ indentRight: 10 })
    const zero = frameWith({}, { paragraphStylePatches: [{ indentRight: 0 }] })
    expect(paragraphOverrides(zero, 0, {})).toEqual({})
  })
})
