import { describe, expect, it } from 'vitest'
import type { ParagraphSequence } from './document'
import { defaultDocSettings } from './document'
import { parseDocument, serializeDocument } from './fileFormat'
import { assignSequence, describeSequence, LEARN_LIMIT, learnSequence, sequencesWithoutStyle, withoutMissingStyles } from './paragraphSequences'
import type { DocContent } from './pages'

const letters = (text: string) => text.split(' ').filter(Boolean)
const paragraphs = (count: number) => Array.from({ length: count }, (_, i) => `פסקה ${i + 1}`)

describe('giving the styles of a sequence by place', () => {
  const sequence = { start: ['H', 'S'], middle: ['A', 'B'], end: ['Z'], skipEmpty: true }

  it('gives the start, then the middle over and over, then the end', () => {
    expect(assignSequence(paragraphs(9), sequence)).toEqual(['H', 'S', 'A', 'B', 'A', 'B', 'A', 'B', 'Z'])
    expect(assignSequence(paragraphs(6), sequence)).toEqual(['H', 'S', 'A', 'B', 'A', 'Z'])
  })

  it('has no repeats to make when only the start and the end fit', () => {
    expect(assignSequence(paragraphs(3), sequence)).toEqual(['H', 'S', 'Z'])
  })

  it('cuts a part that is longer than what there is: the start first', () => {
    expect(assignSequence(paragraphs(2), sequence)).toEqual(['H', 'S'])
    expect(assignSequence(paragraphs(1), sequence)).toEqual(['H'])
    expect(assignSequence([], sequence)).toEqual([])
    expect(assignSequence(paragraphs(3), { ...sequence, end: ['X', 'Y', 'Z'] })).toEqual(['H', 'S', 'Z'])
  })

  it('leaves a paragraph as it is when there is nothing for its place', () => {
    expect(assignSequence(paragraphs(5), { start: ['H'], middle: [], end: ['Z'], skipEmpty: true })).toEqual(['H', undefined, undefined, undefined, 'Z'])
    expect(assignSequence(paragraphs(3), { start: [], middle: [], end: [] })).toEqual([undefined, undefined, undefined])
  })

  it('does not count empty paragraphs, which keep their style', () => {
    const texts = ['כותרת', '', 'גוף', '   ', 'גוף', 'סוף']
    expect(assignSequence(texts, { start: ['H'], middle: ['B'], end: ['Z'], skipEmpty: true })).toEqual(['H', undefined, 'B', undefined, 'B', 'Z'])
    expect(assignSequence(texts, { start: ['H'], middle: ['B'], end: ['Z'], skipEmpty: false })).toEqual(['H', 'B', 'B', 'B', 'B', 'Z'])
  })

  it('counts from one paragraph with a pattern that has one style', () => {
    expect(assignSequence(paragraphs(4), { start: ['H'], middle: ['B'], end: [] })).toEqual(['H', 'B', 'B', 'B'])
  })
})

describe('learning a sequence from an example', () => {
  it('finds the heading, the repeated body and the end', () => {
    expect(learnSequence(letters('H B B B Z'))).toEqual({ start: ['H'], middle: ['B'], end: ['Z'] })
  })

  it('finds a repeating pattern of several styles, and takes the longest stretch', () => {
    expect(learnSequence(letters('A B B C B B C D'))).toEqual({ start: ['A'], middle: ['B', 'B', 'C'], end: ['D'] })
    expect(learnSequence(letters('T S A B A B A B E1 E2'))).toEqual({ start: ['T', 'S'], middle: ['A', 'B'], end: ['E1', 'E2'] })
  })

  it('takes the shortest pattern that makes the stretch', () => {
    expect(learnSequence(letters('X X X X'))).toEqual({ start: [], middle: ['X'], end: [] })
  })

  it('reads a pattern that is shown only once as a start with the last paragraph repeating', () => {
    expect(learnSequence(letters('H S B'))).toEqual({ start: ['H', 'S'], middle: ['B'], end: [] })
    expect(learnSequence(letters('H'))).toEqual({ start: [], middle: ['H'], end: [] })
    expect(learnSequence([])).toEqual({ start: [], middle: [], end: [] })
  })

  it('reproduces the example it was learnt from', () => {
    for (const example of ['H B B B Z', 'A B B C B B C D', 'T S A B A B A B E1 E2', 'X X X X', 'H S B', 'P Q R']) {
      const ids = letters(example)
      const learnt = learnSequence(ids)
      expect(assignSequence(ids.map((_, i) => `פסקה ${i}`), { ...learnt, skipEmpty: true }), example).toEqual(ids)
    }
  })

  it('reads only as many paragraphs as it can search', () => {
    const many = ['H', ...Array.from({ length: 500 }, () => 'B')]
    const learnt = learnSequence(many)
    expect(learnt.start.length + learnt.middle.length + learnt.end.length).toBeLessThanOrEqual(LEARN_LIMIT)
    expect(learnt).toEqual({ start: ['H'], middle: ['B'], end: [] })
  })
})

describe('sequences as data', () => {
  const sequence: ParagraphSequence = { id: 's', name: 'מאמר', start: ['h', 'gone'], middle: ['b'], end: ['z'] }

  it('are written for a person to read', () => {
    const names: Record<string, string> = { h: 'כותרת', b: 'גוף', z: 'חתימה', gone: 'נעלם' }
    expect(describeSequence({ start: ['h'], middle: ['b'], end: ['z'] }, (id) => names[id])).toBe('כותרת › (גוף) ↻ › חתימה')
    expect(describeSequence({ start: [], middle: ['b'], end: [] }, (id) => names[id])).toBe('(גוף) ↻')
    expect(describeSequence({ start: [], middle: [], end: [] }, (id) => names[id])).toBe('')
  })

  it('lose the styles that are gone', () => {
    expect(withoutMissingStyles(sequence, new Set(['h', 'b', 'z']))).toMatchObject({ start: ['h'], middle: ['b'], end: ['z'] })
    const list = [sequence]
    expect(sequencesWithoutStyle(list, 'b')[0].middle).toEqual([])
    expect(sequencesWithoutStyle(list, 'nobody')).toBe(list)
  })

  const content = (sequences?: ParagraphSequence[]): DocContent => ({
    doc: { ...defaultDocSettings('seq'), ...(sequences ? { sequences } : {}) },
    frames: [],
    images: [],
    assets: {},
    guides: [],
    shapes: [],
    paragraphStyles: [{ id: 'body', name: 'גוף', patch: {} }],
    parents: [],
    pageParents: [],
    sections: [],
  })

  it('come back from the file', () => {
    const opened = parseDocument(serializeDocument(content([sequence, { id: 't', name: 'ללא ריקות', start: [], middle: ['b'], end: [], skipEmpty: false }])), 'seq.imudist')
    expect(opened.doc.sequences).toEqual([sequence, { id: 't', name: 'ללא ריקות', start: [], middle: ['b'], end: [], skipEmpty: false }])
    expect(parseDocument(serializeDocument(content()), 'seq.imudist').doc.sequences).toBeUndefined()
  })

  it('are cleaned when a file is read', () => {
    const file = JSON.parse(serializeDocument(content()))
    file.settings.sequences = [
      { id: 'a', name: 'א', start: ['x', 5, '', null], middle: 'oops', end: ['y'] },
      { id: 'a', name: '', start: [], middle: [], end: [] },
      'junk',
      ...Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, name: `n${i}`, start: [], middle: ['b'], end: [] })),
    ]
    const sequences = parseDocument(JSON.stringify(file), 'seq.imudist').doc.sequences!
    expect(sequences).toHaveLength(30)
    expect(sequences[0]).toMatchObject({ id: 'a', start: ['x'], middle: [], end: ['y'] })
    expect(sequences[1].id).not.toBe('a') // a repeated id is made new
  })
})
