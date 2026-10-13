import { describe, expect, it } from 'vitest'
import { defaultDocSettings, DEFAULT_TEXT_STYLE, type TextFrame } from './document'
import type { ExportContent } from './pdfExport'
import { compilePattern, DEFAULT_FIND_OPTIONS, findMatches, replaceInStory, type FindOptions } from './findReplace'
import { hyphenationPoints, softHyphenOffsets } from './hyphenation'
import { SOFT_HYPHEN, withoutSoftHyphens } from './softHyphens'
import { exportText } from './textExport'

const put = (text: string, points: number[]) => {
  let out = ''
  let last = 0
  for (const point of points) {
    out += text.slice(last, point) + SOFT_HYPHEN
    last = point
  }
  return out + text.slice(last)
}

describe('where a word can be broken', () => {
  it('finds places inside long words, by the rules of English, and none in short ones', () => {
    const text = 'a short way to understand beautiful gardens in the countryside'
    const points = hyphenationPoints(text)
    expect(points.length).toBeGreaterThan(3)
    const hyphenated = put(text, points)
    // the words keep their letters: taking the hyphens out gives the text back
    expect(withoutSoftHyphens(hyphenated)).toBe(text)
    // a place is inside a word, with letters on both sides, at least two before it and three after
    for (const point of points) {
      expect(text[point - 1]).toMatch(/[a-z]/)
      expect(text[point]).toMatch(/[a-z]/)
      const wordStart = text.lastIndexOf(' ', point - 1) + 1
      const wordEnd = text.indexOf(' ', point) < 0 ? text.length : text.indexOf(' ', point)
      expect(point - wordStart).toBeGreaterThanOrEqual(2)
      expect(wordEnd - point).toBeGreaterThanOrEqual(3)
    }
    expect(hyphenated).toContain(`beau${SOFT_HYPHEN}ti${SOFT_HYPHEN}ful`)
  })

  it('leaves words that start with a capital letter, unless asked', () => {
    const text = 'Beautiful Gardens and gardens'
    const without = hyphenationPoints(text)
    expect(put(text, without)).toBe(`Beautiful Gardens and gar${SOFT_HYPHEN}dens`)
    const withCapitals = hyphenationPoints(text, { capitalized: true })
    expect(withCapitals.length).toBeGreaterThan(without.length)
  })

  it('leaves the words the writer has already broken, addresses, and short words', () => {
    expect(hyphenationPoints(`beau${SOFT_HYPHEN}tiful`)).toEqual([])
    expect(hyphenationPoints('see www.example.com or user@example.com or /usr/local/documentation')).toEqual([])
    expect(hyphenationPoints('a few more of them')).toEqual([])
  })

  it('does not touch Hebrew text', () => {
    expect(hyphenationPoints('הספר נקרא בעברית ובאנגלית')).toEqual([])
  })

  it('knows where the soft hyphens of a text are', () => {
    expect(softHyphenOffsets(`a${SOFT_HYPHEN}b${SOFT_HYPHEN}c`)).toEqual([1, 3])
    expect(softHyphenOffsets('abc')).toEqual([])
  })
})

describe('a text with soft hyphens in it', () => {
  const frameOf = (text: string): TextFrame => ({
    ...DEFAULT_TEXT_STYLE,
    id: 'a',
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    text,
    runs: [{ len: text.length, style: { fontFamily: 'Arial', fontSize: 12, weight: 400, italic: false, tracking: 0 } }],
    next: null,
  })
  const matchesOf = (text: string, options: Partial<FindOptions>) => {
    const compiled = compilePattern({ ...DEFAULT_FIND_OPTIONS, ...options })
    if (!compiled || !compiled.ok) throw new Error('no pattern')
    return findMatches(text, compiled)
  }

  it('is found by the word as it is written, hyphens in it or not', () => {
    const text = `a hy${SOFT_HYPHEN}phen${SOFT_HYPHEN}ation test`
    const found = matchesOf(text, { find: 'hyphenation' })
    expect(found).toHaveLength(1)
    expect(text.slice(found[0].start, found[0].end).replace(SOFT_HYPHEN, '').replace(SOFT_HYPHEN, '')).toBe('hyphenation')
    expect(matchesOf(text, { find: 'hyphenation', wholeWord: true })).toHaveLength(1)
  })

  it('is put in by an edit of the story that keeps its runs and notes where they are', () => {
    const base = frameOf('understanding the garden')
    const points = hyphenationPoints(base.text)
    const edited = replaceInStory(base, points.map((at) => ({ start: at, end: at, replacement: SOFT_HYPHEN })))
    expect(edited.text).toBe(put(base.text, points))
    expect(edited.runs.reduce((sum, run) => sum + run.len, 0)).toBe(edited.text.length)
    // and taken out again
    const offsets = softHyphenOffsets(edited.text)
    const back = replaceInStory(edited, offsets.map((at) => ({ start: at, end: at + 1, replacement: '' })))
    expect(back.text).toBe(base.text)
  })

  it('is not in the text that is exported', () => {
    const frame = { ...frameOf(`under${SOFT_HYPHEN}standing`), align: 'left' } as TextFrame
    const content = { doc: defaultDocSettings('t'), frames: [frame], images: [], shapes: [], assets: {}, paragraphStyles: [], sections: [] } as unknown as ExportContent
    for (const format of ['txt', 'html', 'rtf'] as const) {
      const written = exportText(content, format).content
      expect(written).not.toContain(SOFT_HYPHEN)
      expect(written).toContain('understanding')
    }
  })
})
