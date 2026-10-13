import { afterEach, describe, expect, it } from 'vitest'
import {
  lookTurnedBy,
  cssTextDirection,
  defaultDocSettings,
  defaultParagraphStyles,
  DEFAULT_FOOTNOTE_CONFIG,
  defaultTextStyle,
  startSideOf,
  type TextFrame,
} from './document'
import type { DocContent } from './pages'
import { parseDocument, serializeDocument } from './fileFormat'
import { footnoteTextStyle } from './footnoteLayout'
import { setLanguage } from './i18n'
import { directionFor, placedFromPlainText } from './importText'
import { paragraphSidePadding } from './richtext'
import { createTable, withTableDirection } from './table'
import { styleOf } from './frames'

afterEach(() => setLanguage('he'))

describe('the direction of a paragraph', () => {
  it('reads from the right when nothing says otherwise, and from the left or by its own letter when asked', () => {
    expect(cssTextDirection(undefined)).toEqual({ direction: 'rtl', unicodeBidi: 'normal' })
    expect(cssTextDirection('rtl')).toEqual({ direction: 'rtl', unicodeBidi: 'normal' })
    expect(cssTextDirection('ltr')).toEqual({ direction: 'ltr', unicodeBidi: 'normal' })
    expect(cssTextDirection('auto')).toEqual({ direction: 'rtl', unicodeBidi: 'plaintext' })
  })

  it('starts on the right, or on the left for a paragraph that reads from the left', () => {
    expect(startSideOf(undefined)).toBe('right')
    expect(startSideOf('rtl')).toBe('right')
    expect(startSideOf('auto')).toBe('right')
    expect(startSideOf('ltr')).toBe('left')
  })

  it('turns the side a paragraph is aligned to and set in from with it, and leaves the rest alone', () => {
    expect(lookTurnedBy({ direction: 'ltr' }, { align: 'right' })).toEqual({ align: 'left' })
    expect(lookTurnedBy({ direction: 'rtl' }, { direction: 'ltr', align: 'left' })).toEqual({ align: 'right' })
    expect(lookTurnedBy({ direction: 'ltr' }, { align: 'center' })).toEqual({})
    expect(lookTurnedBy({ direction: 'ltr' }, { align: 'justify' })).toEqual({})
    // it reads that way already
    expect(lookTurnedBy({ direction: 'ltr' }, { direction: 'ltr', align: 'right' })).toEqual({})
    // the automatic one is not known to read any way
    expect(lookTurnedBy({ direction: 'auto' }, { align: 'right' })).toEqual({})
    expect(lookTurnedBy({ direction: 'ltr' }, { direction: 'auto', align: 'right' })).toEqual({})
    // a change that sets the alignment or the indents itself is the user's word
    expect(lookTurnedBy({ direction: 'ltr', align: 'right' }, { align: 'right' })).toEqual({})
    expect(lookTurnedBy({ align: 'left' }, { align: 'right' })).toEqual({})
    expect(lookTurnedBy({ direction: 'ltr', indentLeft: 3 }, { indentRight: 20 })).toEqual({})
  })

  it('turns the indents: the one from the right becomes the one from the left, as the paragraph starts there now', () => {
    expect(lookTurnedBy({ direction: 'ltr' }, { align: 'right', indentRight: 20 })).toEqual({ align: 'left', indentLeft: 20, indentRight: undefined })
    expect(lookTurnedBy({ direction: 'rtl' }, { direction: 'ltr', indentLeft: 12, indentRight: 4 })).toEqual({ indentLeft: 4, indentRight: 12 })
    // no indents: nothing to turn
    expect(lookTurnedBy({ direction: 'ltr' }, { align: 'right' })).toEqual({ align: 'left' })
  })

  it('sets the second line in from the side the paragraph starts on', () => {
    expect(paragraphSidePadding({ secondLineIndent: 10 }, 1)).toEqual({ paddingRight: '10px' })
    expect(paragraphSidePadding({ secondLineIndent: 10, direction: 'ltr' }, 1)).toEqual({ paddingLeft: '10px' })
    // the story's own direction is the one a paragraph without its own has
    expect(paragraphSidePadding({ secondLineIndent: 10 }, 1, 'ltr')).toEqual({ paddingLeft: '10px' })
    expect(paragraphSidePadding({ indentLeft: 4, indentRight: 6, secondLineIndent: 10, direction: 'ltr' }, 2)).toEqual({ paddingLeft: '28px', paddingRight: '12px' })
  })

  it('is part of the style of a story', () => {
    const frame = { align: 'left', direction: 'ltr', fontFamily: 'x', fontSize: 12, weight: 400, italic: false, tracking: 0 } as unknown as TextFrame
    expect(styleOf(frame).direction).toBe('ltr')
  })
})

describe('what a new document starts with in the language of the interface', () => {
  it('reads from the right in Hebrew and Arabic, as it always has', () => {
    for (const language of ['he', 'ar'] as const) {
      setLanguage(language)
      expect(defaultDocSettings('x').binding).toBe('rtl')
      expect(defaultTextStyle().align).toBe('right')
      expect(defaultTextStyle().direction).toBeUndefined()
      expect(defaultParagraphStyles()[0].patch.align).toBe('right')
      expect(defaultParagraphStyles()[0].patch.direction).toBeUndefined()
      expect(defaultDocSettings('x').footnotes).toBeUndefined()
      expect(createTable({ rows: 1, cols: 1, width: 100 }).rtl).toBeUndefined()
    }
  })

  it('reads from the left in English: the binding, the text, the body style, the notes and the tables', () => {
    setLanguage('en')
    expect(defaultDocSettings('x').binding).toBe('ltr')
    expect(defaultTextStyle()).toMatchObject({ align: 'left', direction: 'ltr' })
    expect(defaultParagraphStyles()[0].patch).toMatchObject({ align: 'left', direction: 'ltr' })
    expect(defaultDocSettings('x').footnotes?.dividerAlignment).toBe('left')
    const table = createTable({ rows: 1, cols: 1, width: 100 })
    expect(table.rtl).toBe(false)
    expect(table.style.align).toBe('left')
  })

  it('gives the notes of a story that reads from the left their own side, unless the style of the notes says otherwise', () => {
    expect(footnoteTextStyle(DEFAULT_FOOTNOTE_CONFIG, [], undefined, { direction: 'ltr' })).toMatchObject({ align: 'left', direction: 'ltr' })
    expect(footnoteTextStyle(DEFAULT_FOOTNOTE_CONFIG, [], undefined, undefined)).toMatchObject({ align: 'right' })
    expect(footnoteTextStyle(DEFAULT_FOOTNOTE_CONFIG, [], undefined, { direction: 'rtl' })).toMatchObject({ align: 'right' })
    const styles = [{ id: 'n', name: 'n', patch: { align: 'center' as const } }]
    expect(footnoteTextStyle({ ...DEFAULT_FOOTNOTE_CONFIG, paragraphStyleId: 'n' }, styles, undefined, { direction: 'ltr' }).align).toBe('center')
  })
})

describe('the direction in a file', () => {
  const content = (): DocContent => {
    const frame = {
      ...defaultTextStyle(),
      id: 'f',
      x: 0,
      y: 0,
      w: 200,
      h: 100,
      text: 'Hello\nשלום',
      runs: [{ len: 11, style: { fontFamily: 'Arial', fontSize: 14, weight: 400, italic: false, tracking: 0 } }],
      next: null,
      direction: 'ltr',
      paragraphStylePatches: [{ direction: 'ltr', align: 'left' }, { direction: 'rtl', align: 'right' }],
    } as unknown as TextFrame
    return {
      doc: defaultDocSettings('d'),
      frames: [frame],
      images: [],
      assets: {},
      guides: [],
      shapes: [],
      paragraphStyles: [
        { id: 'body', name: 'Body', patch: { direction: 'ltr', align: 'left' } },
        { id: 'odd', name: 'Odd', patch: { direction: 'sideways' as never } },
      ],
      parents: [],
      pageParents: [],
      sections: [],
    } as unknown as DocContent
  }

  it('comes back on the story, on its paragraphs and in the styles', () => {
    const reopened = parseDocument(serializeDocument(content()), 'd.imudist')
    expect(reopened.frames[0].direction).toBe('ltr')
    expect(reopened.frames[0].paragraphStylePatches?.map((patch) => patch.direction)).toEqual(['ltr', 'rtl'])
    expect(reopened.paragraphStyles.find((style) => style.id === 'body')?.patch.direction).toBe('ltr')
  })

  it('does not keep what is not a direction', () => {
    const reopened = parseDocument(serializeDocument(content()), 'd.imudist')
    expect(reopened.paragraphStyles.find((style) => style.id === 'odd')?.patch.direction).toBeUndefined()
  })
})

describe('the direction of imported text', () => {
  it('is left to right for text in Latin letters, and right to left for Hebrew, for Arabic and for no letters', () => {
    expect(directionFor('Hello world, this is English.')).toBe('ltr')
    expect(directionFor('שלום עולם')).toBe('rtl')
    expect(directionFor('مرحبا')).toBe('rtl')
    expect(directionFor('12345 — 6')).toBe('rtl')
    expect(directionFor('')).toBe('rtl')
    // mostly Hebrew with a name in Latin letters
    expect(directionFor('הספר של Tolkien נקרא בעברית ובאנגלית')).toBe('rtl')
  })

  it('gives a plain text file its direction', () => {
    expect(placedFromPlainText('a.txt', 'Plain English text').style.direction).toBe('ltr')
    expect(placedFromPlainText('b.txt', 'טקסט בעברית').style.direction).toBeUndefined()
  })
})

describe('the direction of a table', () => {
  const table = () => {
    const made = createTable({ rows: 2, cols: 2, width: 100 })
    made.cells[0][0] = { ...made.cells[0][0], align: 'right' }
    made.cells[1][1] = { ...made.cells[1][1], align: 'center' }
    return made
  }

  it('turns the columns and the alignment of the text when it is made to read from the left', () => {
    const turned = withTableDirection(table(), true)
    expect(turned.rtl).toBe(false)
    expect(turned.style.align).toBe('left')
    expect(turned.cells[0][0].align).toBe('left')
    expect(turned.cells[1][1].align).toBe('center')
  })

  it('turns back, and does nothing to a table that reads that way already', () => {
    const turned = withTableDirection(table(), true)
    expect(withTableDirection(turned, true)).toBe(turned)
    const back = withTableDirection(turned, false)
    expect(back.rtl).toBeUndefined()
    expect(back.style.align).toBe('right')
    expect(back.cells[0][0].align).toBe('right')
    const original = table()
    expect(withTableDirection(original, false)).toBe(original)
  })
})
