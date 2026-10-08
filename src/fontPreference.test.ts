import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultParagraphStyles, defaultTextStyle } from './document'
import { getLastUsedFontFamily, rememberFontFamily } from './fontPreference'

function mockStorage() {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('last used font preference', () => {
  it('uses Segoe UI when no preference has been saved', () => {
    mockStorage()
    expect(getLastUsedFontFamily()).toBe('Segoe UI')
  })

  it('remembers a selected font as the default for new text and documents', () => {
    mockStorage()
    rememberFontFamily('David')
    expect(getLastUsedFontFamily()).toBe('David')
    expect(defaultTextStyle().fontFamily).toBe('David')
    expect(defaultParagraphStyles()[0].patch.fontFamily).toBe('David')
  })

  it('starts new documents with only the body paragraph style', () => {
    mockStorage()
    expect(defaultParagraphStyles().map((style) => style.id)).toEqual(['body'])
  })

  it('does not replace a saved preference with an empty value', () => {
    mockStorage()
    rememberFontFamily('Arial')
    rememberFontFamily('  ')
    expect(getLastUsedFontFamily()).toBe('Arial')
  })
})
