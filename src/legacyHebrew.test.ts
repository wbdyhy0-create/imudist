import { describe, expect, it } from 'vitest'
import { legacyChar, legacyHebrewPieces, looksLikeLegacyHebrew } from './legacyHebrew'

const whole = (text: string) => legacyHebrewPieces([{ text, style: 'a' }]).map((piece) => piece.text).join('')

describe('Hebrew kept as Windows-1255 letters in visual order', () => {
  it('recognises it, and only it', () => {
    expect(looksLikeLegacyHebrew('úøçåàîå  úîã÷åî  úéáéø')).toBe(true)
    expect(looksLikeLegacyHebrew('à ïîéñ')).toBe(true)
    expect(looksLikeLegacyHebrew('שלום עולם')).toBe(false)
    expect(looksLikeLegacyHebrew('Café été')).toBe(false)
    expect(looksLikeLegacyHebrew('à')).toBe(false)
    expect(looksLikeLegacyHebrew('1234')).toBe(false)
  })

  it('reads the letters and turns the paragraph round', () => {
    expect(whole('à ïîéñ')).toBe('סימן א')
    expect(whole('úøçåàîå  úîã÷åî  úéáéø')).toBe('ריבית  מוקדמת  ומאוחרת')
    expect(whole('ïééòå')).toBe('ועיין')
  })

  it('mirrors brackets back and keeps the digits of a number in order', () => {
    // visual: "(123) ב" - a bracket pair, a number
    expect(whole('á (123)')).toBe('(123) ב')
    expect(whole('á 1,234')).toBe('1,234 ב')
  })

  it('lets every letter keep its own style on the way', () => {
    const out = legacyHebrewPieces([{ text: 'à', style: 'x' }, { text: 'á', style: 'y' }])
    expect(out).toEqual([{ text: 'ב', style: 'y' }, { text: 'א', style: 'x' }])
  })

  it('decodes single characters and leaves the rest', () => {
    expect(legacyChar('à')).toBe('א')
    expect(legacyChar('ú')).toBe('ת')
    expect(legacyChar('a')).toBe('a')
  })
})
