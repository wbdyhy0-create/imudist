import { describe, expect, it } from 'vitest'
import type { CharacterStyleRecord, ParagraphStyleRecord, Run, StyleLayerRule, TextFrame } from './document'
import { DEFAULT_TEXT_STYLE, defaultDocSettings } from './document'
import { remapNestedStyles } from './characterStyleTree'
import { parseDocument, serializeDocument } from './fileFormat'
import type { DocContent } from './pages'
import { layerPattern, layerProblem, layerRanges, layerRulesOf, withStyleLayers } from './styleLayers'

const english: CharacterStyleRecord = { id: 'en', name: 'אנגלית', patch: { fontFamily: 'Georgia', italic: true } }
const bold: CharacterStyleRecord = { id: 'bold', name: 'מודגש', patch: { weight: 700 } }
const red: CharacterStyleRecord = { id: 'red', name: 'אדום', patch: { color: '#aa0000' } }
const chars = [english, bold, red]

const layer = (extra: Partial<StyleLayerRule> = {}): StyleLayerRule => ({ styleId: 'en', when: 'latin', ...extra })
const styles = (rules: StyleLayerRule[] | undefined): ParagraphStyleRecord[] => [
  { id: 'body', name: 'גוף', patch: {}, ...(rules ? { layers: rules } : {}) },
  { id: 'child', name: 'ילד', basedOnId: 'body', patch: {} },
  { id: 'own', name: 'עצמאי', basedOnId: 'body', patch: {}, layers: [layer({ when: 'digits', styleId: 'red' })] },
  { id: 'plain', name: 'רגיל', patch: {} },
]
const story = (text: string, extra: Partial<TextFrame> = {}): TextFrame => ({ ...DEFAULT_TEXT_STYLE, id: 'a', x: 0, y: 0, w: 200, h: 200, text, next: null, ...extra }) as TextFrame
const slices = (text: string, ranges: [number, number][]) => ranges.map(([a, b]) => text.slice(a, b))

/** the style of every character of a run list */
const styleOfChar = (runs: Run[], at: number) => {
  let pos = 0
  for (const run of runs) {
    pos += run.len
    if (at < pos) return run.style
  }
  throw new Error('outside')
}

describe('what a layer looks for', () => {
  it('finds a phrase of Latin letters inside Hebrew, spaces and numbers included, punctuation not', () => {
    const text = 'היא אמרה I love you 2 much, ואז הלכה'
    expect(slices(text, layerRanges(text, { when: 'latin' }))).toEqual(['I love you 2 much'])
  })

  it('stops a phrase at a word of another script', () => {
    const text = 'שלום Hello עולם World'
    expect(slices(text, layerRanges(text, { when: 'latin' }))).toEqual(['Hello', 'World'])
  })

  it('finds the Hebrew in an English paragraph, and Arabic, Cyrillic and Greek', () => {
    expect(slices('say שלום now', layerRanges('say שלום now', { when: 'hebrew' }))).toEqual(['שלום'])
    expect(slices('a مرحبا b', layerRanges('a مرحبا b', { when: 'arabic' }))).toEqual(['مرحبا'])
    expect(slices('a Привет мир b', layerRanges('a Привет мир b', { when: 'cyrillic' }))).toEqual(['Привет мир'])
    expect(slices('a γειά σου b', layerRanges('a γειά σου b', { when: 'greek' }))).toEqual(['γειά σου'])
  })

  it('finds numbers with their separators', () => {
    const text = 'בשעה 12:30 ביום 3.5 ו-2024-10-13 או 7'
    expect(slices(text, layerRanges(text, { when: 'digits' }))).toEqual(['12:30', '3.5', '2024-10-13', '7'])
  })

  it('takes the whole paragraph for "all", and nothing from an empty one', () => {
    expect(layerRanges('abc', { when: 'all' })).toEqual([[0, 3]])
    expect(layerRanges('', { when: 'all' })).toEqual([])
    expect(layerRanges('', { when: 'latin' })).toEqual([])
  })

  it('takes a pattern of the users own, and says when it is not valid', () => {
    expect(slices('a1 b22 c', layerRanges('a1 b22 c', { when: 'custom', pattern: '\\d+' }))).toEqual(['1', '22'])
    expect(layerRanges('abc', { when: 'custom', pattern: '(' })).toEqual([])
    expect(layerRanges('abc', { when: 'custom' })).toEqual([])
    expect(layerProblem({ when: 'custom', pattern: '(' })).toBeTruthy()
    expect(layerProblem({ when: 'custom', pattern: '' })).toBeTruthy()
    expect(layerProblem({ when: 'custom', pattern: '\\d+' })).toBeNull()
    expect(layerProblem({ when: 'latin' })).toBeNull()
    expect(layerPattern({ when: 'all' })).toBeNull()
  })

  it('does not loop on a pattern that matches nothing at every place, and stops at a sane number of matches', () => {
    expect(layerRanges('abc', { when: 'custom', pattern: 'x*' })).toEqual([])
    expect(layerRanges('a'.repeat(5000).split('').join(' '), { when: 'custom', pattern: 'a' }).length).toBeLessThanOrEqual(2000)
  })
})

describe('the rules of a paragraph style', () => {
  it('are its own, or else those of the style it is based on', () => {
    const list = styles([layer()])
    expect(layerRulesOf(list, 'body')).toHaveLength(1)
    expect(layerRulesOf(list, 'child')).toBe(list[0].layers) // inherited
    expect(layerRulesOf(list, 'own')[0].when).toBe('digits') // its own replace the inherited ones
    expect(layerRulesOf(list, 'plain')).toEqual([])
    expect(layerRulesOf(list, 'gone')).toEqual([])
  })

  it('survive a loop of "based on"', () => {
    const loop: ParagraphStyleRecord[] = [
      { id: 'x', name: 'x', basedOnId: 'y', patch: {} },
      { id: 'y', name: 'y', basedOnId: 'x', patch: {} },
    ]
    expect(layerRulesOf(loop, 'x')).toEqual([])
  })
})

describe('the layers on a story', () => {
  const text = 'שלום Hello עולם'

  it('give the character style to what is of the kind, over what it has, in the frames that are drawn only', () => {
    const frame = story(text, { paragraphStyleIds: ['body'] })
    const out = withStyleLayers([frame], styles([layer()]), chars)
    expect(out[0]).not.toBe(frame)
    const runs = out[0].runs!
    expect(styleOfChar(runs, 0).fontFamily).toBe(frame.fontFamily)
    expect(styleOfChar(runs, 5)).toMatchObject({ fontFamily: 'Georgia', italic: true })
    expect(styleOfChar(runs, 9)).toMatchObject({ fontFamily: 'Georgia', italic: true })
    expect(styleOfChar(runs, 10).fontFamily).toBe(frame.fontFamily)
    expect(runs.reduce((n, run) => n + run.len, 0)).toBe(text.length)
    // the saved frame is as it was
    expect(frame.runs).toBeUndefined()
  })

  it('leave what the text had alone: the character style it has stays linked, the settings the layer does not name stay', () => {
    const frame = story(text, { paragraphStyleIds: ['body'], runs: [{ len: 5, style: { ...DEFAULT_TEXT_STYLE } }, { len: 5, style: { ...DEFAULT_TEXT_STYLE, charStyleId: 'bold', weight: 700 } }, { len: 5, style: { ...DEFAULT_TEXT_STYLE } }] })
    const runs = withStyleLayers([frame], styles([layer()]), chars)[0].runs!
    expect(styleOfChar(runs, 7)).toMatchObject({ fontFamily: 'Georgia', weight: 700, charStyleId: 'bold' })
  })

  it('come back as the same frames when no layer is in play', () => {
    const frames = [story(text, { paragraphStyleIds: ['plain'] })]
    expect(withStyleLayers(frames, styles([layer()]), chars)).toBe(frames)
    expect(withStyleLayers(frames, styles(undefined), chars)).toBe(frames)
    expect(withStyleLayers(frames, styles([layer()]), [])).toBe(frames)
    const noMatch = [story('שלום עולם', { paragraphStyleIds: ['body'] })]
    expect(withStyleLayers(noMatch, styles([layer()]), chars)).toBe(noMatch)
  })

  it('keep the same runs for the same story, so the layout does not start again', () => {
    const list = styles([layer()])
    const frame = story(text, { paragraphStyleIds: ['body'] })
    const first = withStyleLayers([frame], list, chars)[0].runs
    const second = withStyleLayers([{ ...frame, x: 40 }], list, chars)[0].runs // the frame only moved
    expect(second).toBe(first)
    const edited = withStyleLayers([story(text + '!', { paragraphStyleIds: ['body'] })], list, chars)[0].runs
    expect(edited).not.toBe(first)
  })

  it('give only a part of a match: what already has the character style the rule asks for', () => {
    const frame = story('Hello World', {
      paragraphStyleIds: ['body'],
      runs: [{ len: 6, style: { ...DEFAULT_TEXT_STYLE } }, { len: 5, style: { ...DEFAULT_TEXT_STYLE, charStyleId: 'bold', weight: 700 } }],
    })
    const rules = [layer({ when: 'all', styleId: 'red', onlyWithStyleId: 'bold' })]
    const runs = withStyleLayers([frame], styles(rules), chars)[0].runs!
    expect(styleOfChar(runs, 0).color).toBe(frame.color)
    expect(styleOfChar(runs, 7)).toMatchObject({ color: '#aa0000', weight: 700 })
  })

  it('go by paragraph: a paragraph in another style is not touched, and a based-on style has the layers too', () => {
    const frame = story('one Two\nthree Four\nfive Six', { paragraphStyleIds: ['body', 'plain', 'child'] })
    const runs = withStyleLayers([frame], styles([layer()]), chars)[0].runs!
    expect(styleOfChar(runs, 4).fontFamily).toBe('Georgia') // paragraph 1, in body
    expect(styleOfChar(runs, 8 + 6).fontFamily).toBe(frame.fontFamily) // paragraph 2, in plain
    expect(styleOfChar(runs, 8 + 11 + 6).fontFamily).toBe('Georgia') // paragraph 3, in child (inherits)
  })

  it('apply the rules in order, a later one over an earlier one', () => {
    const frame = story('Hello', { paragraphStyleIds: ['body'] })
    const rules = [layer({ styleId: 'en' }), layer({ styleId: 'red', when: 'all' })]
    const style = styleOfChar(withStyleLayers([frame], styles(rules), chars)[0].runs!, 2)
    expect(style).toMatchObject({ fontFamily: 'Georgia', color: '#aa0000' })
  })

  it('skip a rule whose character style is gone', () => {
    const frame = story(text, { paragraphStyleIds: ['body'] })
    const frames = [frame]
    expect(withStyleLayers(frames, styles([layer({ styleId: 'deleted' })]), chars)).toBe(frames)
  })

  it('use a character style with the settings of the style it is based on', () => {
    const based: CharacterStyleRecord = { id: 'based', name: 'מבוסס', basedOnId: 'en', patch: { color: '#00aa00' } }
    const frame = story(text, { paragraphStyleIds: ['body'] })
    const runs = withStyleLayers([frame], styles([layer({ styleId: 'based' })]), [english, based])[0].runs!
    expect(styleOfChar(runs, 7)).toMatchObject({ fontFamily: 'Georgia', color: '#00aa00' })
  })

  it('only change the first frame of a story', () => {
    const head = story(text, { id: 'h', next: 'c', paragraphStyleIds: ['body'] })
    const tail = story('', { id: 'c', next: null })
    const out = withStyleLayers([head, tail], styles([layer()]), chars)
    expect(out[0].runs).toBeDefined()
    expect(out[1]).toBe(tail)
  })
})

describe('the layers in the file and when styles are merged', () => {
  const content = (paragraphStyles: ParagraphStyleRecord[]): DocContent => ({
    doc: defaultDocSettings('layers'),
    frames: [],
    images: [],
    assets: {},
    guides: [],
    shapes: [],
    paragraphStyles,
    characterStyles: chars,
    parents: [],
    pageParents: [],
    sections: [],
  })

  it('come back with the paragraph style', () => {
    const rules = [layer(), layer({ when: 'custom', pattern: '\d+', styleId: 'red', onlyWithStyleId: 'bold' })]
    const opened = parseDocument(serializeDocument(content(styles(rules))), 'layers.imudist')
    expect(opened.paragraphStyles.find((style) => style.id === 'body')?.layers).toEqual(rules)
    expect(opened.paragraphStyles.find((style) => style.id === 'plain')?.layers).toBeUndefined()
  })

  it('are cleaned: an unknown kind, a custom one with no pattern, one with no style, and more than twenty are dropped', () => {
    const raw = [
      { styleId: 'en', when: 'klingon' },
      { styleId: 'en', when: 'custom', pattern: '   ' },
      { when: 'latin' },
      { styleId: 'en', when: 'latin', pattern: 'ignored' },
      ...Array.from({ length: 30 }, () => ({ styleId: 'red', when: 'digits' })),
    ]
    const file = { ...JSON.parse(serializeDocument(content(styles(undefined)))), paragraphStyles: [{ id: 'x', name: 'x', patch: {}, layers: raw }] }
    const layers = parseDocument(JSON.stringify(file), 'layers.imudist').paragraphStyles[0].layers!
    expect(layers).toHaveLength(20)
    expect(layers[0]).toEqual({ styleId: 'en', when: 'latin' }) // a pattern is kept only for a custom rule
  })

  it('follow the character styles that come in under new ids', () => {
    const list = styles([layer({ onlyWithStyleId: 'bold' })])
    const out = remapNestedStyles(list, new Map([['en', 'en-2'], ['bold', 'bold-2']]))
    expect(out[0].layers).toEqual([{ styleId: 'en-2', when: 'latin', onlyWithStyleId: 'bold-2' }])
    expect(out[3]).toBe(list[3]) // a style with no layers is not copied
  })
})
