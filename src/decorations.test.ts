import { describe, expect, it } from 'vitest'
import { decorationClass, decorationLine, decorationPatches, decorationVars, decoratedStyles, withDecorations } from './decorations'
import type { ObjectStyleRecord, ParagraphDecoration, ParagraphStyleRecord, TextFrame } from './document'
import { DEFAULT_TEXT_STYLE, defaultDocSettings } from './document'
import { parseDocument, serializeDocument } from './fileFormat'
import type { DocContent } from './pages'

const bar: ObjectStyleRecord = { id: 'bar', name: 'פס', settings: { fill: '#c0392b', radius: 2, opacity: 0.9, shadow: { offsetX: 0, offsetY: 2, color: '#000000', opacity: 0.4 } } }
const arrow: ObjectStyleRecord = { id: 'arrow', name: 'חץ', settings: { stroke: '#223344', strokeWidth: 1.5, arrowStart: 'triangle', arrowEnd: 'triangle' } }
const deco = (extra: Partial<ParagraphDecoration> = {}): ParagraphDecoration => ({ objectStyleId: 'bar', position: 'above', height: 3, gap: 6, length: 0, align: 'start', ...extra })
const styles: ParagraphStyleRecord[] = [
  { id: 'body', name: 'גוף', patch: { fontSize: 14 } },
  { id: 'head', name: 'כותרת', patch: { fontSize: 24, decoration: deco() } },
  { id: 'sub', name: 'תת כותרת', basedOnId: 'head', patch: { fontSize: 18 } },
]
const story = (extra: Partial<TextFrame> = {}): TextFrame => ({ ...DEFAULT_TEXT_STYLE, id: 'a', x: 0, y: 0, w: 200, h: 200, text: 'one\ntwo\nthree', next: null, ...extra }) as TextFrame

describe('the decoration of a paragraph style', () => {
  it('is found for the styles that have one, with the look of its object style', () => {
    const found = decoratedStyles(styles, [bar, arrow])
    expect([...found.keys()].sort()).toEqual(['head', 'sub']) // a style based on a decorated one has it too
    expect(found.get('head')?.look).toBe(bar.settings)
  })

  it('is not there when the object style it names is gone', () => {
    expect(decoratedStyles(styles, [arrow]).size).toBe(0)
    expect(decoratedStyles(styles, []).size).toBe(0)
  })

  it('is written into the patches of the paragraphs that are in the style, and only into those', () => {
    const head = story({ paragraphStyleIds: ['body', 'head', 'sub'] })
    const patches = decorationPatches(head, styles, [bar])!
    expect(patches).toHaveLength(3)
    expect(patches[0]?.decoration).toBeUndefined()
    expect(patches[1]?.decoration).toMatchObject({ objectStyleId: 'bar', position: 'above', look: bar.settings })
    expect(patches[2]?.decoration).toBeDefined()
    // what the paragraph already carried stays
    const own = decorationPatches(story({ paragraphStyleIds: ['body', 'head', 'body'], paragraphStylePatches: [{}, { background: '#ffee99' }, {}] }), styles, [bar])!
    expect(own[1]).toMatchObject({ background: '#ffee99', decoration: { objectStyleId: 'bar' } })
  })

  it('leaves a story without a decorated paragraph alone: the same patches come back', () => {
    const plain = story({ paragraphStyleIds: ['body', 'body', 'body'], paragraphStylePatches: [{}, {}, {}] })
    expect(decorationPatches(plain, styles, [bar])).toBe(plain.paragraphStylePatches)
    const frames = [plain]
    expect(withDecorations(frames, styles, [bar])[0]).toBe(plain)
  })

  it('only copies the first frame of a story, and never changes the saved frame', () => {
    const head = story({ id: 'h', next: 'c', paragraphStyleIds: ['head', 'body', 'body'] })
    const next = story({ id: 'c', text: '', next: null })
    const out = withDecorations([head, next], styles, [bar])
    expect(out[0]).not.toBe(head)
    expect(out[0].paragraphStylePatches?.[0]?.decoration).toBeDefined()
    expect(head.paragraphStylePatches).toBeUndefined()
    expect(out[1]).toBe(next)
  })
})

describe('how a decoration is drawn', () => {
  it('is a bar of the given thickness in the fill, the corners and the shadow of the style', () => {
    const vars = decorationVars({ ...deco({ height: 4, gap: 5 }), look: bar.settings }, 2)!
    expect(vars['--deco-height']).toBe('8px')
    expect(vars['--deco-gap']).toBe('10px')
    expect(vars['--deco-bg']).toBe('#c0392b')
    expect(vars['--deco-radius']).toBe('4px')
    expect(vars['--deco-width']).toBe('auto')
    expect(vars['--deco-shadow']).toContain('rgba(0, 0, 0, 0.4)')
    expect(vars['--deco-opacity']).toBe('0.9')
  })

  it('is a line with its heads when the style was made from a line: the length is the length of the line', () => {
    const vars = decorationVars({ ...deco({ objectStyleId: 'arrow', length: 100, align: 'center' }), look: arrow.settings }, 1)!
    expect(vars['--deco-width']).toBe('100px')
    expect(vars['--deco-bg']).toContain('data:image/svg+xml')
    expect(vars['--deco-ms']).toBe('auto')
    expect(vars['--deco-me']).toBe('auto')
    const line = decorationLine(arrow.settings, 100)
    expect(line.width).toBe(100)
    expect(line.height).toBeGreaterThan(1.5) // the heads are wider than the line
    expect(line.svg).toContain('<path')
  })

  it('is the drawing of the object style when it has one: as wide as asked, in the proportions of the drawing', () => {
    const graphic = { svg: "<svg xmlns='http://www.w3.org/2000/svg' width='300' height='60'><path d='M0 0h300v60z'/></svg>", w: 300, h: 60 }
    const natural = decorationVars({ ...deco(), look: {}, graphic }, 1)!
    expect(natural['--deco-width']).toBe('300px')
    expect(natural['--deco-height']).toBe('auto')
    expect(natural['--deco-ratio']).toBe('300 / 60')
    expect(natural['--deco-bg']).toContain('data:image/svg+xml')
    const asked = decorationVars({ ...deco({ length: 120 }), look: {}, graphic }, 2)!
    expect(asked['--deco-width']).toBe('240px')
    expect(decorationClass({ ...deco(), graphic })).toBe('para-deco-above')
    // the drawing is carried from the object style into the decoration
    const withGraphic: ObjectStyleRecord = { ...bar, graphic }
    expect(decoratedStyles(styles, [withGraphic]).get('head')?.graphic).toBe(graphic)
  })

  it('behind the heading: the fill of the style, or its drawing, over the box of the text, which is as big as the text', () => {
    const behind = { ...deco({ position: 'behind', gap: 5, length: 99, height: 9 }), look: bar.settings }
    const centred = decorationVars(behind, 2, { align: 'center', gapBefore: 4 })!
    expect(centred['--deco-fit']).toBe('fit-content') // as wide as the longest line of the heading
    expect(centred['--deco-ms']).toBe('auto')
    expect(centred['--deco-me']).toBe('auto')
    expect(centred['--deco-pad']).toBe('10px')
    expect(centred['--deco-top']).toBe('8px') // not over the gap that opens the paragraph
    expect(centred['--deco-bg']).toBe('#c0392b')
    expect(centred['--deco-radius']).toBe('4px')
    expect(centred).not.toHaveProperty('--deco-height') // the box is the text's own: no height of its own, nor a length
    // aligned to the start (the right) it stays there; a justified heading is as wide as the column
    expect(decorationVars(behind, 1, { align: 'right' })!['--deco-ms']).toBe('0')
    expect(decorationVars(behind, 1, { align: 'right' })!['--deco-me']).toBe('auto')
    expect(decorationVars(behind, 1, { align: 'left' })!['--deco-ms']).toBe('auto')
    expect(decorationVars(behind, 1, { align: 'left' })!['--deco-me']).toBe('0')
    expect(decorationVars(behind, 1, { align: 'justify' })!['--deco-fit']).toBe('auto')
    // a drawing is stretched over the box: it does not keep its own proportions there
    const graphic = { svg: "<svg xmlns='http://www.w3.org/2000/svg' width='300' height='60' viewBox='0 0 300 60'><path d='M0 0h300v60z'/></svg>", w: 300, h: 60 }
    const drawn = decorationVars({ ...behind, graphic }, 1)!
    const encoded = /data:image\/svg\+xml,([^"]+)/.exec(drawn['--deco-bg'])?.[1] ?? ''
    expect(decodeURIComponent(encoded)).toContain('preserveAspectRatio="none"')
    expect(drawn['--deco-bg']).toContain('100% 100%')
    expect(decorationClass(behind)).toBe('para-deco-behind')
  })

  it('has a class by where it goes, and none without a look', () => {
    expect(decorationClass({ ...deco(), look: bar.settings })).toBe('para-deco-above')
    expect(decorationClass({ ...deco({ position: 'below' }), look: bar.settings })).toBe('para-deco-below')
    expect(decorationClass(deco())).toBeUndefined()
    expect(decorationVars(deco(), 1)).toBeNull()
  })
})

describe('the decoration in the file', () => {
  const content = (paragraphStyles: ParagraphStyleRecord[]): DocContent => ({
    doc: defaultDocSettings('deco'),
    frames: [],
    images: [],
    assets: {},
    guides: [],
    shapes: [],
    paragraphStyles,
    parents: [],
    pageParents: [],
    sections: [],
    objectStyles: [bar],
  })

  it('comes back with the paragraph style', () => {
    const opened = parseDocument(serializeDocument(content(styles)), 'deco.imudist')
    expect(opened.paragraphStyles.find((style) => style.id === 'head')?.patch.decoration).toEqual(deco())
  })

  it('is cleaned: a position it does not know is above, sizes are held in range, and one with no object style is dropped', () => {
    const odd = { id: 'x', name: 'x', patch: { decoration: { objectStyleId: 'bar', position: 'sideways', height: -4, gap: 99999, length: 'long', align: 'diagonal' } } }
    const none = { id: 'y', name: 'y', patch: { decoration: { position: 'above' } } }
    const opened = parseDocument(JSON.stringify({ ...JSON.parse(serializeDocument(content(styles))), paragraphStyles: [odd, none] }), 'deco.imudist')
    const decoration = opened.paragraphStyles.find((style) => style.id === 'x')?.patch.decoration
    expect(decoration).toMatchObject({ objectStyleId: 'bar', position: 'above', height: 0.25, gap: 500, length: 0, align: 'start' })
    expect(opened.paragraphStyles.find((style) => style.id === 'y')?.patch.decoration).toBeUndefined()
  })
})
