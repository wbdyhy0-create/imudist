import { describe, expect, it } from 'vitest'
import type { CharacterStyleRecord, CharStyle, Run } from './document'
import { DEFAULT_TEXT_STYLE } from './document'
import { applyNestedStyles } from './nestedStyles'
import { applyCharacterStyle, normalizeRuns } from './story'
import { paragraphOverrides } from './styleOverrides'
import type { TextFrame } from './document'

const base = { fontFamily: DEFAULT_TEXT_STYLE.fontFamily, fontSize: 14, weight: 400, italic: false, tracking: 0 } as CharStyle
const bold: CharacterStyleRecord = { id: 'bold', name: 'מודגש', patch: { weight: 700 } }
const text = 'one two three four'
const plain: Run[] = [{ len: text.length, style: base }]
const rules = [{ styleId: 'bold', unit: 'words' as const, count: 1, inclusive: false }]
const baseAt = () => ({}) as Partial<CharStyle>

const idsAt = (runs: Run[]) => {
  const out: (string | undefined)[] = []
  for (const run of runs) for (let i = 0; i < run.len; i++) out.push(run.style.charStyleId)
  return out
}

describe('a character style given by hand next to the nested styles', () => {
  it('stays when the nested styles are set again', () => {
    const nested = applyNestedStyles(text, plain, 0, text.length, rules, [bold], baseAt)
    expect(idsAt(nested)[0]).toBe('bold')
    // "three" by hand, with the same style the nested rule uses
    const start = text.indexOf('three')
    const byHand = applyCharacterStyle(nested, start, start + 5, bold, true)
    const again = applyNestedStyles(text, byHand, 0, text.length, rules, [bold], baseAt)
    const ids = idsAt(again)
    expect(ids[0]).toBe('bold') // the nested one
    expect(ids[start]).toBe('bold') // the one by hand
    expect(ids[text.indexOf('two')]).toBeUndefined()
  })

  it('is taken off by the nested rules when it was theirs and no longer is', () => {
    const nested = applyNestedStyles(text, plain, 0, text.length, rules, [bold], baseAt)
    const changed = applyNestedStyles(text, nested, 0, text.length, [], [bold], baseAt, ['bold'])
    expect(idsAt(changed).every((id) => id === undefined)).toBe(true)
  })
})

describe('the outline of a paragraph is part of what it carries', () => {
  it('shows in the overrides against a style that has none', () => {
    const frame = {
      ...DEFAULT_TEXT_STYLE,
      id: 'a',
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      text: 'שלום',
      runs: [{ len: 4, style: { ...base, fontFamily: DEFAULT_TEXT_STYLE.fontFamily, fontSize: DEFAULT_TEXT_STYLE.fontSize, outlineColor: '#6633cc', outlineWidth: 1.5 } }],
      next: null,
    } as TextFrame
    expect(normalizeRuns(frame.text, frame.runs, frame).length).toBe(1)
    expect(paragraphOverrides(frame, 0, {})).toMatchObject({ outlineColor: '#6633cc', outlineWidth: 1.5 })
  })
})

describe('character style against paragraph style', () => {
  it('a setting the character style holds wins over the paragraph style, when the paragraph style is applied or changed', async () => {
    const { applyParagraphLook } = await import('./story')
    const regular: CharacterStyleRecord = { id: 'regular', name: 'רגיל', patch: { weight: 400 } }
    const runs: Run[] = [
      { len: 5, style: { ...base, weight: 400, charStyleId: 'regular' } },
      { len: 5, style: { ...base, weight: 400 } },
    ]
    const out = applyParagraphLook(runs, 0, 10, { weight: 700 }, [regular])
    expect(out[0].style.weight).toBe(400) // the text with the character style keeps what it sets
    expect(out[1].style.weight).toBe(700) // the rest follows the paragraph style
  })
})
