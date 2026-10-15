import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultParagraphStyles, defaultTextStyle } from './document'
import { getLastUsedFontFamily, getRecentFontFamilies, RECENT_FONTS, rememberFontFamily } from './fontPreference'

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

describe('recently used fonts', () => {
  it('keeps the fonts that were picked, the latest first, each once', () => {
    mockStorage()
    expect(getRecentFontFamilies()).toEqual([])
    rememberFontFamily('David')
    rememberFontFamily('Arial')
    rememberFontFamily('Miriam')
    rememberFontFamily('David')
    expect(getRecentFontFamilies()).toEqual(['David', 'Miriam', 'Arial'])
  })

  it('keeps at least ten, and no more than its limit', () => {
    mockStorage()
    for (let i = 1; i <= 20; i++) rememberFontFamily(`Font ${i}`)
    const recent = getRecentFontFamilies()
    expect(RECENT_FONTS).toBeGreaterThanOrEqual(10)
    expect(recent).toHaveLength(RECENT_FONTS)
    expect(recent[0]).toBe('Font 20')
    expect(recent[9]).toBe('Font 11')
  })

  it('leaves out an empty name, and reads damaged storage as nothing', () => {
    mockStorage()
    rememberFontFamily('  ')
    expect(getRecentFontFamilies()).toEqual([])
    localStorage.setItem('imudist.recentFontFamilies', '{not json')
    expect(getRecentFontFamilies()).toEqual([])
    localStorage.setItem('imudist.recentFontFamilies', JSON.stringify(['Arial', 3, '', 'Arial', 'David']))
    expect(getRecentFontFamilies()).toEqual(['Arial', 'David'])
  })
})
