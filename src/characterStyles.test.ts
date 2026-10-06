import { describe, expect, it } from 'vitest'
import type { CharacterStyleRecord, CharStyle, Run } from './document'
import { applyCharacterStyle, applyParagraphLook, characterStyleIdsIn, charStyleOf, clearCharacterStyle, mergeRuns, updateCharacterStyleRuns } from './story'

const base: CharStyle = { fontFamily: 'Narkisim', fontSize: 12, weight: 400, italic: false, tracking: 0 }
const red: CharacterStyleRecord = { id: 'red', name: 'אדום', patch: { color: '#ff0000', weight: 700 } }
const blue: CharacterStyleRecord = { id: 'blue', name: 'כחול', patch: { color: '#0000ff' } }
const plain = (len: number): Run[] => [{ len, style: base }]
const styleAt = (runs: Run[], offset: number): CharStyle => {
  let pos = 0
  for (const r of runs) {
    pos += r.len
    if (offset < pos) return r.style
  }
  throw new Error('offset outside the runs')
}
const total = (runs: Run[]) => runs.reduce((n, r) => n + r.len, 0)

describe('applying a character style', () => {
  it('writes its settings and its link over the range, leaving the rest as it was', () => {
    const runs = applyCharacterStyle(plain(10), 2, 5, red)
    expect(total(runs)).toBe(10)
    expect(styleAt(runs, 1)).toEqual(base)
    expect(styleAt(runs, 3)).toEqual({ ...base, color: '#ff0000', weight: 700, charStyleId: 'red' })
    expect(styleAt(runs, 7)).toEqual(base)
  })

  it('does not join neighbours that have different styles, even with the same look', () => {
    const twin: CharacterStyleRecord = { id: 'twin', name: 'תאום', patch: { color: '#ff0000', weight: 700 } }
    const runs = applyCharacterStyle(applyCharacterStyle(plain(10), 0, 5, red), 5, 10, twin)
    expect(runs).toHaveLength(2)
    expect(mergeRuns(applyCharacterStyle(plain(4), 0, 4, red))).toHaveLength(1)
  })

  it('keeps the link when a run is copied through charStyleOf, and lists the styles in use', () => {
    const style = styleAt(applyCharacterStyle(plain(4), 0, 4, blue), 0)
    expect(charStyleOf(style).charStyleId).toBe('blue')
    expect(characterStyleIdsIn(applyCharacterStyle(applyCharacterStyle(plain(8), 0, 2, red), 4, 6, blue))).toEqual(new Set(['red', 'blue']))
    expect(characterStyleIdsIn(plain(8)).size).toBe(0)
  })
})

describe('taking a character style off', () => {
  const text = 'אבגד\nהוזח'
  const paragraphLook = (start: number) => (start === 0 ? { ...base, color: '#111111' } : { ...base, color: '#222222' })

  it('puts back what the paragraph says for every setting the style had, and drops the link', () => {
    const styled = applyCharacterStyle(plain(text.length), 1, 3, red)
    const cleared = clearCharacterStyle(text, styled, 0, text.length, [red], paragraphLook)
    expect(styleAt(cleared, 2)).toEqual({ ...base, color: '#111111' })
    expect(styleAt(cleared, 0)).toEqual(base) // text outside the style is not touched
  })

  it('uses the paragraph each piece is in, when a styled stretch crosses a paragraph break', () => {
    const styled = applyCharacterStyle(plain(text.length), 2, 7, red)
    const cleared = clearCharacterStyle(text, styled, 0, text.length, [red], paragraphLook)
    expect(styleAt(cleared, 3).color).toBe('#111111') // still in the first paragraph
    expect(styleAt(cleared, 6).color).toBe('#222222') // in the second
    expect(styleAt(cleared, 6).weight).toBe(base.weight) // the second paragraph says nothing about weight
  })

  it('only touches the range it is given', () => {
    const styled = applyCharacterStyle(plain(text.length), 0, text.length, red)
    const cleared = clearCharacterStyle(text, styled, 0, 3, [red], paragraphLook)
    expect(styleAt(cleared, 1).charStyleId).toBeUndefined()
    expect(styleAt(cleared, 6).charStyleId).toBe('red')
  })

  it('only drops the link of a style that is gone, keeping the look', () => {
    const styled = applyCharacterStyle(plain(4), 0, 4, red)
    const cleared = clearCharacterStyle('אבגד', styled, 0, 4, [], paragraphLook)
    expect(styleAt(cleared, 1)).toEqual({ ...base, color: '#ff0000', weight: 700 })
  })
})

describe('editing a character style', () => {
  const text = 'אבגד\nהוזח'
  const paragraphLook = () => ({ ...base, color: '#111111' })

  it('gives every piece with the style the new settings, and nothing else', () => {
    const styled = applyCharacterStyle(applyCharacterStyle(plain(text.length), 0, 2, red), 6, 8, blue)
    const next = updateCharacterStyleRuns(text, styled, 'red', red.patch, { color: '#00ff00', weight: 700 }, paragraphLook)
    expect(styleAt(next, 1)).toMatchObject({ color: '#00ff00', weight: 700, charStyleId: 'red' })
    expect(styleAt(next, 7)).toMatchObject({ color: '#0000ff', charStyleId: 'blue' })
  })

  it('sends a setting the style no longer holds back to the paragraph look', () => {
    const styled = applyCharacterStyle(plain(text.length), 0, 2, red)
    const next = updateCharacterStyleRuns(text, styled, 'red', red.patch, { color: '#00ff00' }, paragraphLook)
    expect(styleAt(next, 1)).toMatchObject({ color: '#00ff00', weight: 400, charStyleId: 'red' })
  })

  it('leaves the runs alone when no text has the style', () => {
    const runs = plain(4)
    expect(updateCharacterStyleRuns('אבגד', runs, 'red', red.patch, {}, paragraphLook)).toBe(runs)
  })
})

describe('a paragraph style over text that has a character style', () => {
  it('sets its look everywhere except in what the character style owns', () => {
    const styled = applyCharacterStyle(plain(10), 3, 6, red)
    const next = applyParagraphLook(styled, 0, 10, { color: '#222222', fontSize: 14, weight: 400 }, [red])
    expect(styleAt(next, 0)).toMatchObject({ color: '#222222', fontSize: 14, weight: 400 })
    expect(styleAt(next, 4)).toMatchObject({ color: '#ff0000', weight: 700, fontSize: 14, charStyleId: 'red' })
  })

  it('is the plain write when there are no character styles', () => {
    const next = applyParagraphLook(plain(4), 0, 4, { color: '#222222' }, [])
    expect(styleAt(next, 0).color).toBe('#222222')
  })
})

describe('character styles in a file', () => {
  it('survive saving and opening: the styles, and the link on the text that has them', async () => {
    const { DEFAULT_PARAGRAPH_STYLES, DEFAULT_TEXT_STYLE, defaultDocSettings } = await import('./document')
    const { parseDocument, serializeDocument } = await import('./fileFormat')
    const text = 'אבגדהוזח'
    const runs = applyCharacterStyle(plain(text.length), 2, 5, red)
    const frame = { ...DEFAULT_TEXT_STYLE, id: 'a', x: 0, y: 0, w: 100, h: 100, text, runs, next: null }
    const content = { doc: defaultDocSettings('x'), frames: [frame], images: [], assets: {}, guides: [], shapes: [], paragraphStyles: DEFAULT_PARAGRAPH_STYLES, characterStyles: [red, blue], parents: [], pageParents: [], sections: [] } as never
    const back = parseDocument(serializeDocument(content), 'x')
    expect(back.characterStyles).toEqual([red, blue])
    expect(styleAt(back.frames[0].runs, 3)).toMatchObject({ charStyleId: 'red', color: '#ff0000', weight: 700 })
    expect(styleAt(back.frames[0].runs, 0).charStyleId).toBeUndefined()
  })

  it('opens an older file, with no character styles, with none', async () => {
    const { DEFAULT_PARAGRAPH_STYLES, defaultDocSettings } = await import('./document')
    const { parseDocument, serializeDocument } = await import('./fileFormat')
    const content = { doc: defaultDocSettings('x'), frames: [], images: [], assets: {}, guides: [], shapes: [], paragraphStyles: DEFAULT_PARAGRAPH_STYLES, parents: [], pageParents: [], sections: [] } as never
    const file = JSON.parse(serializeDocument(content))
    delete file.characterStyles
    expect(parseDocument(JSON.stringify(file), 'x').characterStyles).toEqual([])
  })

  it('repairs what it cannot trust: duplicate ids, bad settings', async () => {
    const { DEFAULT_PARAGRAPH_STYLES, defaultDocSettings } = await import('./document')
    const { parseDocument, serializeDocument } = await import('./fileFormat')
    const content = { doc: defaultDocSettings('x'), frames: [], images: [], assets: {}, guides: [], shapes: [], paragraphStyles: DEFAULT_PARAGRAPH_STYLES, parents: [], pageParents: [], sections: [] } as never
    const file = JSON.parse(serializeDocument(content))
    file.characterStyles = [{ id: 's', name: 'א', patch: { color: 'red', fontSize: 'big', weight: 700, bogus: 1 } }, { id: 's', name: 'ב', patch: null }, 7]
    const styles = parseDocument(JSON.stringify(file), 'x').characterStyles!
    expect(styles).toHaveLength(2)
    expect(styles[0]).toEqual({ id: 's', name: 'א', patch: { weight: 700 } })
    expect(styles[1].id).not.toBe('s')
    expect(styles[1].patch).toEqual({})
  })
})

describe('baseline shift', () => {
  const raised: CharacterStyleRecord = { id: 'up', name: 'מורם', patch: { baselineShift: 4 } }

  it('is part of a style, keeps text with another shift apart, and travels with the run style', () => {
    const runs = applyCharacterStyle(plain(8), 2, 4, raised)
    expect(styleAt(runs, 3)).toMatchObject({ baselineShift: 4, charStyleId: 'up' })
    expect(charStyleOf(styleAt(runs, 3)).baselineShift).toBe(4)
    const lowered = applyCharacterStyle(applyCharacterStyle(plain(8), 0, 4, raised), 4, 8, { id: 'down', name: 'מונמך', patch: { baselineShift: 4 } })
    expect(lowered).toHaveLength(2) // different style ids stay different runs
  })

  it('goes back to nothing, not to zero, when the style is taken off', () => {
    const text = 'אבגד'
    const styled = applyCharacterStyle(plain(4), 0, 4, raised)
    const cleared = clearCharacterStyle(text, styled, 0, 4, [raised], () => base)
    expect(styleAt(cleared, 1).baselineShift).toBeUndefined()
  })

  it('survives saving and opening, in a style and on a run', async () => {
    const { DEFAULT_PARAGRAPH_STYLES, DEFAULT_TEXT_STYLE, defaultDocSettings } = await import('./document')
    const { parseDocument, serializeDocument } = await import('./fileFormat')
    const text = 'אבגדהוזח'
    const frame = { ...DEFAULT_TEXT_STYLE, id: 'a', x: 0, y: 0, w: 100, h: 100, text, runs: applyCharacterStyle(plain(text.length), 2, 5, raised), next: null }
    const content = { doc: defaultDocSettings('x'), frames: [frame], images: [], assets: {}, guides: [], shapes: [], paragraphStyles: DEFAULT_PARAGRAPH_STYLES, characterStyles: [raised], parents: [], pageParents: [], sections: [] } as never
    const back = parseDocument(serializeDocument(content), 'x')
    expect(back.characterStyles![0].patch).toEqual({ baselineShift: 4 })
    expect(styleAt(back.frames[0].runs, 3).baselineShift).toBe(4)
    expect(styleAt(back.frames[0].runs, 0).baselineShift).toBeUndefined()
  })
})
