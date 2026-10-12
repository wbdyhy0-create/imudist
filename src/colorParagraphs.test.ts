import { describe, expect, it } from 'vitest'
import type { CharStyle, Run, TextFrame } from './document'
import { DEFAULT_TEXT_STYLE } from './document'
import { colorParagraphs, paragraphColors, textColorUses } from './colorParagraphs'

const look = (color: string): CharStyle => ({ fontFamily: DEFAULT_TEXT_STYLE.fontFamily, fontSize: 14, weight: 400, italic: false, tracking: 0, color })

/** pieces: [text, colour] in order; the frame's own colour is black */
const story = (id: string, pieces: [string, string][]): TextFrame => {
  const runs: Run[] = pieces.map(([text, color]) => ({ len: text.length, style: look(color) }))
  return { ...DEFAULT_TEXT_STYLE, id, x: 0, y: 0, w: 100, h: 100, text: pieces.map(([text]) => text).join(''), runs, color: '#000000', next: null } as TextFrame
}

describe('colours of the paragraphs of a story', () => {
  const frame = story('a', [
    ['Red title\n', '#ff0000'],
    ['plain with a ', '#000000'],
    ['red', '#FF0000'],
    [' word\n', '#000000'],
    ['  \n', '#00ff00'],
    ['last', '#0000ff'],
  ])

  it('counts the letters of each paragraph by colour, spaces and line breaks aside', () => {
    const paragraphs = paragraphColors(frame)
    expect(paragraphs).toHaveLength(4)
    expect(Object.fromEntries(paragraphs[0].counts)).toEqual({ '#ff0000': 8 })
    // the same colour written in capitals is the same colour
    expect(Object.fromEntries(paragraphs[1].counts)).toEqual({ '#000000': 14, '#ff0000': 3 })
    expect(paragraphs[2].counts.size).toBe(0) // only blanks: no colour
    expect(Object.fromEntries(paragraphs[3].counts)).toEqual({ '#0000ff': 4 })
  })

  it('gives the offsets of the paragraphs, line break included', () => {
    const [first, second] = paragraphColors(frame)
    expect([first.start, first.end]).toEqual([0, 10])
    expect(second.start).toBe(10)
    expect(frame.text.slice(second.start, second.end)).toBe('plain with a red word\n')
  })

  it('lists the colours with the paragraphs that are wholly in them and those that are partly', () => {
    const uses = textColorUses([frame])
    const red = uses.find((use) => use.color === '#ff0000')
    expect(red).toEqual({ color: '#ff0000', whole: 1, any: 2 })
    expect(uses.find((use) => use.color === '#000000')).toEqual({ color: '#000000', whole: 0, any: 1 })
    expect(uses.find((use) => use.color === '#00ff00')).toBeUndefined() // the blank paragraph has no colour
  })

  it('finds the paragraphs that are wholly in the colour, or every paragraph with any of it', () => {
    expect(colorParagraphs([frame], '#FF0000', false).map((p) => p.index)).toEqual([0])
    expect(colorParagraphs([frame], '#ff0000', true).map((p) => p.index)).toEqual([0, 1])
    expect(colorParagraphs([frame], '#123456', true)).toEqual([])
  })

  it('uses the colour of the story for text that has none of its own', () => {
    const plain = { ...story('b', [['one\ntwo', '#000000']]), runs: undefined, color: '#336699' } as unknown as TextFrame
    expect(colorParagraphs([plain], '#336699', false).map((p) => p.index)).toEqual([0, 1])
  })
})
