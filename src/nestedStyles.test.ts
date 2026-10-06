import { describe, expect, it } from 'vitest'
import type { CharacterStyleRecord, CharStyle, NestedStyleRule, Run } from './document'
import { applyNestedStyles, nestedRanges } from './nestedStyles'
import { applyCharacterStyle } from './story'

const base: CharStyle = { fontFamily: 'Narkisim', fontSize: 12, weight: 400, italic: false, tracking: 0 }
const bold: CharacterStyleRecord = { id: 'bold', name: 'מודגש', patch: { weight: 700 } }
const red: CharacterStyleRecord = { id: 'red', name: 'אדום', patch: { color: '#ff0000' } }
const rule = (over: Partial<NestedStyleRule> = {}): NestedStyleRule => ({ styleId: 'bold', unit: 'words', count: 1, inclusive: false, ...over })
const plain = (len: number): Run[] => [{ len, style: base }]
const styleAt = (runs: Run[], offset: number): CharStyle => {
  let pos = 0
  for (const r of runs) {
    pos += r.len
    if (offset < pos) return r.style
  }
  throw new Error('offset outside the runs')
}

describe('where nested rules reach', () => {
  const p = 'בראשית ברא אלהים: את השמים. ואת הארץ'

  it('covers the first words', () => {
    expect(nestedRanges(p, [rule({ count: 1 })])).toEqual([{ start: 0, end: 6, styleId: 'bold' }])
    expect(nestedRanges(p, [rule({ count: 3 })])).toEqual([{ start: 0, end: 17, styleId: 'bold' }]) // a word is what the spaces cut: the colon is part of the third
  })

  it('stops up to a character, with or without the character itself', () => {
    expect(nestedRanges(p, [rule({ unit: 'delimiter', delimiter: ':' })])[0].end).toBe(16)
    expect(nestedRanges(p, [rule({ unit: 'delimiter', delimiter: ':', inclusive: true })])[0].end).toBe(17)
    expect(nestedRanges(p, [rule({ unit: 'delimiter' })])[0].end).toBe(16) // no character given: a colon
  })

  it('counts the second occurrence of a character', () => {
    expect(nestedRanges('א-ב-ג-ד', [rule({ unit: 'delimiter', delimiter: '-', count: 2 })])[0].end).toBe(3)
  })

  it('ends a sentence where its mark is followed by a space or the end', () => {
    expect(nestedRanges('גרסה 1.5 יצאה. עוד משפט', [rule({ unit: 'sentences', inclusive: true })])[0].end).toBe(14)
    expect(nestedRanges('אחד. שניים. שלושה', [rule({ unit: 'sentences', count: 2, inclusive: true })])[0].end).toBe(11)
  })

  it('counts characters', () => {
    expect(nestedRanges('אבגדה', [rule({ unit: 'letters', count: 2 })])).toEqual([{ start: 0, end: 2, styleId: 'bold' }])
  })

  it('starts each rule where the one before it stopped', () => {
    const ranges = nestedRanges(p, [rule({ styleId: 'bold', count: 1 }), rule({ styleId: 'red', unit: 'delimiter', delimiter: ':' })])
    expect(ranges).toEqual([{ start: 0, end: 6, styleId: 'bold' }, { start: 6, end: 16, styleId: 'red' }])
  })

  it('styles nothing for what the paragraph does not have, and stops there', () => {
    expect(nestedRanges('מילה אחת', [rule({ count: 5 })])).toEqual([])
    expect(nestedRanges('בלי נקודתיים', [rule({ unit: 'delimiter' })])).toEqual([])
    expect(nestedRanges('מילה אחת: ועוד', [rule({ count: 9, styleId: 'bold' }), rule({ styleId: 'red' })])).toEqual([])
    expect(nestedRanges('', [rule()])).toEqual([])
  })
})

describe('applying nested styles to a paragraph', () => {
  const text = 'ראשון שני שלישי\nשורה אחרת'

  it('gives the opening its style and leaves the rest of the story alone', () => {
    const runs = applyNestedStyles(text, plain(text.length), 0, 15, [rule({ count: 2 })], [bold, red], () => base)
    expect(styleAt(runs, 2)).toMatchObject({ weight: 700, charStyleId: 'bold' })
    expect(styleAt(runs, 8)).toMatchObject({ weight: 700, charStyleId: 'bold' })
    expect(styleAt(runs, 11)).toEqual(base)
    expect(styleAt(runs, 18)).toEqual(base)
  })

  it('gives the same result when it is run again, and when the text under the rules changed', () => {
    const once = applyNestedStyles(text, plain(text.length), 0, 15, [rule({ count: 1 })], [bold], () => base)
    const twice = applyNestedStyles(text, once, 0, 15, [rule({ count: 1 })], [bold], () => base)
    expect(twice).toEqual(once)
    // the rule now reaches two words: the old reach is not left behind, the new one is set
    const wider = applyNestedStyles(text, once, 0, 15, [rule({ count: 2 })], [bold], () => base)
    expect(styleAt(wider, 8).charStyleId).toBe('bold')
    expect(styleAt(wider, 12)).toEqual(base)
    // and a shorter one lets go of what it no longer reaches
    const narrower = applyNestedStyles(text, wider, 0, 15, [rule({ count: 1 })], [bold], () => base)
    expect(narrower).toEqual(once)
  })

  it('does not take away a character style the user gave by hand', () => {
    const manual = applyCharacterStyle(plain(text.length), 8, 12, red)
    const runs = applyNestedStyles(text, manual, 0, 15, [rule({ count: 1 })], [bold, red], () => base)
    expect(styleAt(runs, 9).charStyleId).toBe('red')
    expect(styleAt(runs, 2).charStyleId).toBe('bold')
  })

  it('skips a rule whose style is gone', () => {
    const runs = applyNestedStyles(text, plain(text.length), 0, 15, [rule({ styleId: 'missing' })], [bold], () => base)
    expect(runs).toEqual(plain(text.length))
  })
})

describe('nested rules in a file', () => {
  it('survive saving and opening, with bad rules dropped', async () => {
    const { DEFAULT_PARAGRAPH_STYLES, defaultDocSettings } = await import('./document')
    const { parseDocument, serializeDocument } = await import('./fileFormat')
    const styles = DEFAULT_PARAGRAPH_STYLES.map((style, index) => (index === 0 ? { ...style, nested: [rule({ count: 2 }), rule({ styleId: 'red', unit: 'delimiter', delimiter: ':', inclusive: true })] } : style))
    const content = { doc: defaultDocSettings('x'), frames: [], images: [], assets: {}, guides: [], shapes: [], paragraphStyles: styles, characterStyles: [bold, red], parents: [], pageParents: [], sections: [] } as never
    const back = parseDocument(serializeDocument(content), 'x')
    expect(back.paragraphStyles[0].nested).toEqual(styles[0].nested)
    expect(back.paragraphStyles[1].nested).toBeUndefined()

    const file = JSON.parse(serializeDocument(content))
    file.paragraphStyles[0].nested = [{ styleId: '', unit: 'words' }, { styleId: 'bold', unit: 'nonsense', count: 9999 }, 5]
    const repaired = parseDocument(JSON.stringify(file), 'x').paragraphStyles[0].nested
    expect(repaired).toEqual([{ styleId: 'bold', unit: 'words', count: 1000, inclusive: false }])
  })
})

describe('taking a rule away', () => {
  it('lets go of what the removed rule styled, when told which styles the old rules used', () => {
    const text = 'ראשון שני שלישי'
    const styled = applyNestedStyles(text, plain(text.length), 0, text.length, [rule({ count: 1 })], [bold], () => base)
    expect(styleAt(styled, 2).charStyleId).toBe('bold')
    const gone = applyNestedStyles(text, styled, 0, text.length, [], [bold], () => base, ['bold'])
    expect(styleAt(gone, 2)).toEqual(base)
    // without that information a paragraph with no rules is left as it is
    expect(applyNestedStyles(text, styled, 0, text.length, [], [bold], () => base)).toBe(styled)
  })
})
