import { describe, expect, it } from 'vitest'
import { visualGlyphs } from './pathTextDraw'

const shown = (text: string, rtl: boolean) => visualGlyphs(text, rtl).map((g) => g.text).join('')

describe('the order of the letters of a text on a path', () => {
  it('keeps a left-to-right text as it is', () => {
    expect(shown('abc def', false)).toBe('abc def')
  })

  it('turns a right-to-left text round, so its first letter is the rightmost', () => {
    expect(shown('אבג', true)).toBe('גבא')
    expect(shown('אב גד', true)).toBe('דג בא')
  })

  it('keeps a number or a Latin word inside a Hebrew text in its own order', () => {
    expect(shown('אב 123 גד', true)).toBe('דג 123 בא')
    expect(shown('שלום abc', true)).toBe('abc םולש')
  })

  it('keeps the marks on their letters, and the index of each letter in the text', () => {
    const glyphs = visualGlyphs('בָּא', true)
    expect(glyphs.map((g) => g.text)).toEqual(['א', 'בָּ'])
    expect(glyphs.map((g) => g.index)).toEqual([3, 0])
  })
})
