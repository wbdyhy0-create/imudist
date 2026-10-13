import { describe, expect, it } from 'vitest'
import type { CharacterStyleRecord, CharStyle, NestedStyleRule, Run } from './document'
import { DEFAULT_TEXT_STYLE } from './document'
import { applyNestedStyles, detectNestedRules } from './nestedStyles'

const plain: CharStyle = { ...DEFAULT_TEXT_STYLE }
const styled = (id: string): CharStyle => ({ ...DEFAULT_TEXT_STYLE, charStyleId: id })

/** a paragraph whose first characters have the styles given as [length, style id or null] pieces */
const paragraph = (text: string, ...pieces: [number, string | null][]): { text: string; runs: Run[] } => {
  const runs: Run[] = []
  let used = 0
  for (const [len, id] of pieces) {
    runs.push({ len, style: id ? styled(id) : plain })
    used += len
  }
  if (used < text.length) runs.push({ len: text.length - used, style: plain })
  return { text, runs }
}

describe('finding the nested style rules in an example', () => {
  it('reads an opening that ends at a colon as "up to the colon", the colon included when it is styled', () => {
    expect(detectNestedRules([paragraph('שם הספר: בראשית רבה', [8, 'bold'])])).toEqual<NestedStyleRule[]>([
      { styleId: 'bold', unit: 'delimiter', delimiter: ':', count: 1, inclusive: true },
    ])
  })

  it('reads one that stops before the colon as not including it', () => {
    expect(detectNestedRules([paragraph('כותרת: גוף', [5, 'head'])])).toEqual<NestedStyleRule[]>([
      { styleId: 'head', unit: 'delimiter', delimiter: ':', count: 1, inclusive: false },
    ])
  })

  it('counts the delimiters inside the piece', () => {
    // "א, ב, ג" styled up to the second comma
    expect(detectNestedRules([paragraph('א, ב, ג ועוד', [5, 's'])])).toEqual<NestedStyleRule[]>([
      { styleId: 's', unit: 'delimiter', delimiter: ',', count: 2, inclusive: true },
    ])
  })

  it('takes a number of words when no delimiter ends the piece', () => {
    expect(detectNestedRules([paragraph('שלוש המילים הראשונות מודגשות ואחר כך רגיל', [20, 'b'])])).toEqual<NestedStyleRule[]>([
      { styleId: 'b', unit: 'words', count: 3, inclusive: false },
    ])
  })

  it('takes a number of letters when the piece ends in the middle of a word (a drop cap)', () => {
    expect(detectNestedRules([paragraph('בראשית ברא', [1, 'cap'])])).toEqual<NestedStyleRule[]>([
      { styleId: 'cap', unit: 'letters', count: 1, inclusive: false },
    ])
  })

  it('reads several styled pieces one after the other, each starting where the one before stopped', () => {
    const rules = detectNestedRules([paragraph('א. שם: תוכן הפסקה', [2, 'num'], [5, 'name'])])
    expect(rules).toEqual<NestedStyleRule[]>([
      { styleId: 'num', unit: 'delimiter', delimiter: '.', count: 1, inclusive: true },
      { styleId: 'name', unit: 'delimiter', delimiter: ':', count: 1, inclusive: true },
    ])
  })

  it('stops at the first piece that has no character style', () => {
    const rules = detectNestedRules([paragraph('א. ב: ג: ד', [2, 'a'], [3, null], [3, 'c'])])
    expect(rules).toHaveLength(1)
    expect(rules[0].styleId).toBe('a')
  })

  it('goes with what most paragraphs show: a one-word and a three-word heading both end at the colon', () => {
    const rules = detectNestedRules([
      paragraph('כותרת: אחת', [6, 'h']),
      paragraph('כותרת ארוכה יותר: שנייה', [18, 'h']),
      paragraph('שלישית: גוף', [7, 'h']),
    ])
    expect(rules).toEqual<NestedStyleRule[]>([{ styleId: 'h', unit: 'delimiter', delimiter: ':', count: 1, inclusive: true }])
  })

  it('finds nothing in a paragraph that has no character style at its start', () => {
    expect(detectNestedRules([paragraph('בלי עיצוב בכלל')])).toEqual([])
    expect(detectNestedRules([])).toEqual([])
    expect(detectNestedRules([paragraph('', )])).toEqual([])
  })

  it('gives rules that, applied to the example, give back the styling it had', () => {
    const records: CharacterStyleRecord[] = [
      { id: 'num', name: 'מספר', patch: { weight: 700 } },
      { id: 'name', name: 'שם', patch: { italic: true } },
    ]
    const example = paragraph('1. הכותרת: ואחריה הגוף כרגיל', [3, 'num'], [10, 'name'])
    const rules = detectNestedRules([example])
    // the same text without any style: the rules put them back
    const bare: Run[] = [{ len: example.text.length, style: plain }]
    const out = applyNestedStyles(example.text, bare, 0, example.text.length, rules, records, () => plain)
    const ids: (string | undefined)[] = []
    let at = 0
    for (const run of out) {
      for (let i = 0; i < run.len; i++) ids[at++] = run.style.charStyleId
    }
    const expected: (string | undefined)[] = []
    at = 0
    for (const run of example.runs) {
      for (let i = 0; i < run.len; i++) expected[at++] = run.style.charStyleId
    }
    // the space between two pieces may go with either (the rules end a piece at its last word): only the letters are compared
    const letters = [...example.text].map((char, i) => (/\s/.test(char) ? -1 : i)).filter((i) => i >= 0)
    expect(letters.map((i) => ids[i])).toEqual(letters.map((i) => expected[i]))
    expect(letters.filter((i) => i >= 13).every((i) => ids[i] === undefined)).toBe(true)
  })
})
